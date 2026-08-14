## 2. Engine Internals: The Dispatch Machine

Chapter 1 modelled a keystroke as five semantic cost layers: input delivery, path construction, listener lookup, invocation, attribute access. This chapter grounds each layer in source. The established architecture — Blink's `EventDispatcher`, WebKit's `EventDispatcher.cpp`, Gecko's `EventTargetChain` — has been stable since the WebKit/Blink fork; the recent changes are optimizations bolted on (SkipEventCapture, passive interventions) and instrumentation wrapped around it (Event Timing / INP). Stable machine first, then the deltas.

### 2.1 The Blink input pipeline for real keys

#### 2.1.1 Browser process → InputRouter → compositor → main thread

A physical key press enters Chromium as an OS-native message, converted to a platform-independent `ui::Event` / `NativeWebKeyboardEvent` in the browser process; IME interaction happens here too [^14^]. The browser-side funnel, `RenderWidgetHostImpl::ForwardKeyboardEventWithCommands` (content/browser/renderer*host/render_widget_host_impl.cc), is not a passive relay: `KeyPressListenersHandleEvent` serves browser keypress listeners and `delegate*->PreHandleKeyboardEvent`serves accelerators — "Tab switching/closing accelerators aren't sent to the renderer to avoid a hung/malicious renderer from interfering" [^1^]. A browser-consumed RawKeyDown also suppresses its subsequent Char/KeyUp via`suppress*events_until_keydown*` [^1^].

Delivery is asynchronous: the async `InputRouter` with ACKs replaced the old sync-IPC path, per the design principle that "keyboard events should not use synchronous IPC calls" [^16^][^17^]. In the renderer, `InputHandlerProxy` runs on the compositor thread deciding what can be handled off-main-thread — wheel events with passive/no blocking listeners are marked `DID_NOT_HANDLE_NON_BLOCKING` or `DROP_EVENT` without touching the main thread [^2^]. **Keyboard has no such fast path.** The entirety of `InputHandlerProxy`'s keyboard handling is frame attribution:

```cpp
if (WebInputEvent::IsKeyboardEventType(event.GetType())) {
  // Keyboard events should be dispatched to the focused frame.
  return WebInputEventAttribution(WebInputEventAttribution::kFocusedFrame);
}
```

[^2^] Keys are always forwarded to the main thread as blocking input. Consequences: key-driven scrolling (arrows, space, PageUp) is main-thread work inside Blink's `KeyboardEventManager` / `ScrollManager::LogicalScroll` default handlers, unlike compositor-eligible wheel/touch scrolling [^2^]; the "[Violation] non-passive listener" and "input event was delayed" console machinery applies to scroll-blocking wheel/touch only — keys get neither passive defaults nor blocked-event warnings [^9^]; and while `compositor_event_queue_->CoalesceEvents()` merges continuous streams (scroll, pinch, mousemove), discrete key events are **never coalesced and never frame-aligned** (`DeliverInputForBeginFrame` applies to the continuous queue only) [^2^].

#### 2.1.2 Auto-repeat: one full pipeline traversal per tick

OS auto-repeat generates one RawKeyDown/KeyDown (+Char) per tick, with no dedup or throttling in Blink: each repeat is a new `WebKeyboardEvent` carrying the `kIsAutoRepeat` modifier, a new `KeyboardEvent`, a full dispatch [^2^][^4^]. The `repeat` getter is a pure bit test —

```cpp
bool repeat() const { return GetModifiers() & WebInputEvent::kIsAutoRepeat; }
```

[^4^] — the engine hands you the flag to filter repeats with, and nothing else. At a typical OS auto-repeat rate (~25–30 repeats/second, user-configurable) a held key is one complete trip through §2.1–§2.4 per repeat; debouncing belongs in the library.

On the main thread, `EventHandler::KeyEvent` delegates to `KeyboardEventManager::KeyEvent` (core/input/keyboard_event_manager.cc) [^3^][^5^]: resolve the focus target (`EventTargetNodeForDocument`, body/document fallback — re-resolved after keydown before synthesizing keypress, since "Focus may have changed during keydown handling"), fire user-activation notification for non-modifier keys, construct a `KeyboardEvent` per phase, call `node->DispatchEvent(*event)`, and run default handlers (access keys, scroll keys, focus navigation) if not canceled [^3^]. Note the multiplication: a character-producing keystroke is **two full dispatch passes** — keydown via RawKeyDown/KeyDown, keypress via Char — each building an EventPath and walking listeners [^3^].

### 2.2 The dispatch algorithm's cost structure

#### 2.2.1 EventPath: O(depth), exactly-sized, never cached

`EventDispatcher::DispatchEvent` begins by constructing an `EventDispatcher`, whose constructor calls `event_->InitEventPath(*node_)` [^6^]. `EventPath::CalculatePath()` walks from the target to the root, handling assigned slots and shadow-root retargeting (`GetShadowRootParent` respects `event.composed`), gathering nodes on the stack before materializing the result [^7^]:

```cpp
// For performance and memory usage reasons we want to store the
// path using as few bytes as possible and with as few allocations
// as possible which is why we gather the data on the stack before
// storing it in a perfectly sized node_event_contexts_ Vector.
HeapVector<Member<Node>, 64> nodes_in_path;
...
node_event_contexts_ = HeapVector<NodeEventContext>(nodes_in_path, ...);
```

[^7^] Machine-level reading: a stack-resident `HeapVector<Member<Node>, 64>` accumulates up to 64 pointers inline (typical depths fit without spill); one GC-heap allocation of exactly `depth × sizeof(NodeEventContext)` copies them out; `CalculateAdjustedTargets()` adds `TreeScopeEventContext` objects per TreeScope crossed for shadow retargeting [^7^]. There is **no path cache** — the DOM may have mutated between events, so every dispatch pays O(D) pointer-chasing up the ancestor chain (realistically one cache miss per uncached ancestor), one variable-length heap allocation, and the attendant GC tracing. Depth is the fixed cost of every keydown, paid even when zero listeners exist.

Dispatch proper is the textbook three-phase walk [^6^]:

```cpp
if (DispatchEventLegacyPreActivationBehavior(...) == kContinueDispatching) {
  if (DispatchEventAtCapturing() == kContinueDispatching) {
    DispatchEventAtBubbling();
  }
}
DispatchEventPostProcess(activation_target, ...);
```

Capture walks the path in reverse, bubble forward; each `NodeEventContext::HandleLocalEvents` sets the shadow-adjusted `target`, `currentTarget`, and `invocationTargetInShadowTree` before calling `node_->HandleLocalEvents(event)` [^8^]. `stopPropagation()`/`stopImmediatePropagation()` flags are re-checked after every node and listener — O(1) per check, but constant. After bubbling, `DispatchEventPostProcess` runs default handlers in bubbling order for trusted events — where scroll-on-space, accesskey activation, and editor/IME handling hook in [^6^]. `preventDefault()` is thus cheap for the engine: it sets the cancel bit this stage consults; nothing already delivered is unwound.

#### 2.2.2 SkipEventCapture: one stray listener disables it page-wide

The significant recent change to this architecture is SkipEventCapture, enabled by default: `DispatchEventAtCapturing()` early-returns when `!node_->GetDocument().HasCaptureListener()`, gated by `RuntimeEnabledFeatures::SkipEventCaptureEnabled()` [^6^] — "Improves performance of event dispatching by skipping the capture phase if there are no capture listeners registered on the page" [^19^]. On a listener-free page a keydown costs roughly one ancestor walk instead of two. The predicate is **document-global**: one `addEventListener(type, fn, true)` anywhere — including in a third-party widget you don't control — flips `HasCaptureListener()` and restores the full capture walk for _every_ dispatch on the page. WebKit implements the same optimization independently via per-document `EventListenerCounts` (`listenerCounts.hasCapturing()`); its `EventDispatcher.cpp` otherwise mirrors Blink (common ancestry) — `dispatchEventInDOM` walks the path in reverse for capture, forward for bubble, `callDefaultEventHandlersInBubblingOrder` runs defaults [^13^].

#### 2.2.3 Per-node lookup and the spec-mandated snapshot

At each path node, `Node::HandleLocalEvents` early-returns if the node has no `EventTargetData` — a lazily allocated side table, so listener-less nodes cost one null check [^20^]. Otherwise `EventTarget::FireEventListeners` calls `d->event_listener_map.Find(event.type())` [^9^]. `EventListenerMap` is a linear vector of (AtomicString type → EventListenerVector) pairs; `Find` scans the _distinct types registered on that node_ — cheap, since per-node type counts are tiny and AtomicString comparison is a pointer compare after interning [^10^]. Lookup thus scales with distinct types on the node, not listeners page-wide.

The firing loop then pays the spec-mandated copy-on-fire:

```cpp
// Fire event listeners, creates a copy of EventListenerVector on being called.
bool EventTarget::FireEventListeners(Event& event, EventTargetData* d,
                                     EventListenerVectorSnapshot entry)
```

with `using EventListenerVectorSnapshot = HeapVector<Member<RegisteredEventListener>, 1>;` [^9^][^18^]. The header is explicit: "This method makes a copy of the `EventListenerVector` on invocation to match the HTML spec. Do not try to optimize it away." [^18^] Every node with ≥1 listener of the type pays one vector clone per dispatch — inline capacity is 1, so two or more listeners spill to the GC heap.

Per listener in the snapshot [^9^]:

```cpp
if (registered_listener->Removed()) [[unlikely]] continue;
if (event.ImmediatePropagationStopped()) break;
if (!registered_listener->ShouldFire(event)) continue;   // capture/bubble phase filter
EventListener* listener = registered_listener->Callback();
if (registered_listener->Once()) {
  removeEventListener(event.type(), listener, registered_listener->Capture());
}
event.SetHandlingPassive(EventPassiveMode(*registered_listener));
probe::UserCallback probe(context, nullptr, event.type(), false, this);
listener->Invoke(context, &event);
```

Three details matter for hot paths. (1) `ShouldFire` is the per-listener capture/bubble phase filter over bitfield-packed options in `RegisteredEventListener` [^11^] — a wrong-phase listener still occupies the snapshot and pays its checks. (2) `once: true` is removeEventListener _immediately before Invoke_ — an extra `EventListenerMap::Remove` scan + O(listeners) vector erase at fire time [^9^][^10^]. (3) every invocation is bracketed by `probe::UserCallback` DevTools instrumentation [^9^]. Registration-side: `addEventListener` dedups on (callback, capture) only — passive/once/signal are ignored for matching [^10^] — and since crbug.com/1420890, `EventListenerMap::Add` annotates crash keys with `listener_count_log2` past 8 same-type listeners on one node [^10^].

The assembled model for an event bubbling through D ancestors, node i holding Lᵢ listeners of the type: O(D) path build + one GC allocation, plus per node-with-listeners one snapshot clone (O(Lᵢ) alloc+copy), plus ΣLᵢ invocations each crossing into V8. A single delegated `document` keydown listener is the minimal shape: O(D) path + 1 clone + 1 crossing.

### 2.3 KeyboardEvent getter internals

#### 2.3.1 Blink: eager construction, cached reads

Blink computes `key` and `code` **eagerly in the constructor** and caches them [^4^]:

```cpp
KeyboardEvent::KeyboardEvent(const WebKeyboardEvent& key, ...)
    : ...
      // TODO(crbug.com/482880): Fix this initialization to lazy initialization.
      code_(FromUtf8(ui::KeycodeConverter::DomCodeToCodeString(
          static_cast<ui::DomCode>(key.dom_code)))),
      key_(FromUtf8(
          ui::KeycodeConverter::DomKeyToKeyString(ui::DomKey(key.dom_key)))),
```

with trivial getters `const String& code() const { return code_; }` / `key()` [^4^]. The mapping machinery (ui/events/keycodes/dom/keycode_converter.cc) runs once per event: `DomCodeToCodeString` generates runs ("KeyA".."KeyZ", "Digit0..9", "F1..F24") arithmetically, else linearly scans `kDomCodeMappings`; `DomKeyToKeyString` collapses dead keys to "Dead", scans `kDomKeyMappings`, else UTF-8-encodes the character [^12^] — whether or not JS ever reads the strings, hence crbug.com/482880's standing TODO to make it lazy. Per-read cost in a listener is just the V8 attribute-getter callback (a binding call) plus wrapping the cached, shared `WTF::String`: no re-atomization, no table lookup. `keyCode`/`charCode`/`which` are plain unsigned fields set at construction; `location` derives from modifier bits; `repeat` is the bit test above [^4^]. WebKit shares the compute-once shape — `m_key(key.key()), m_code(key.code())` cached from `PlatformKeyboardEvent`, native codes mapped through the `PlatformEventFactory{Mac,Win,Gtk}` tables (WebKit bug 149584) [^13^][^21^].

#### 2.3.2 Gecko: re-mapped per access

Gecko differs materially: `KeyboardEvent::Key()` / `KeyboardEvent::Code()` call `WidgetKeyboardEvent::GetDOMKeyName()` / `GetDOMCodeName()` **on each access**, mapping `mKeyNameIndex`/`mCodeNameIndex` through key-name string tables into a caller-provided nsString rather than caching (ResistFingerprinting can spoof `Code` per access) [^23^]. Its dispatch core (`dom/events/EventDispatcher.cpp`) builds an `EventTargetChain` of fixed-capacity `EventTargetChainItem` objects with per-item `MayHaveListenerManager` flags to skip listener-less nodes [^22^]. In Firefox, repeated `event.key` reads in a hot loop do real string work per read: hoist `e.key` into a local — near-free in Blink/WebKit, a genuine win in Gecko.

| Layer                         | Blink (Chromium)                                                          | WebKit                                                 | Gecko                                             |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| Path structure                | `HeapVector<NodeEventContext>`, exactly-sized, rebuilt per dispatch [^7^] | EventPath, mirrors Blink [^13^]                        | `EventTargetChain` of fixed-capacity items [^22^] |
| Capture-skip                  | `HasCaptureListener()` + SkipEventCapture, default-on [^6^][^19^]         | `Document::EventListenerCounts::hasCapturing()` [^13^] | per-item `MayHaveListenerManager` skip [^22^]     |
| Listener snapshot             | copy-on-fire `EventListenerVectorSnapshot` per node [^18^]                | equivalent (shared ancestry) [^13^]                    | chain items + listener manager                    |
| `key`/`code`                  | eager at construction, cached [^4^]                                       | eager at construction, cached [^13^]                   | table-mapped per getter call [^23^]               |
| Key fast path off main thread | none; keys always main-thread [^2^]                                       | —                                                      | —                                                 |

### 2.4 V8 invocation anatomy

Per listener firing, Blink executes the full `JSBasedEventListener::Invoke` spine (bindings/core/v8/js*based_event_listener.cc): bail-out checks (execution terminating, world mismatch); `HandleScope`; `GetListenerObject(currentTarget)` (may lazily compile a content-attribute handler); `ScriptState::Scope` entering the listener's context; `probe::InvokeEventHandler`; the `BindingSecurity::ShouldAllowAccessToV8Context` check; event wrapper materialization via `ToV8Traits<Event>::ToV8` [^24^]. Per the V8 Binding Design doc, a C++ object exposes *the same* JS wrapper per world — cached on `ScriptWrappable::main_world_wrapper*`for the main world, in`DOMWrapperMap`otherwise [^25^] — so the first listener allocates the JS`KeyboardEvent`wrapper and same-world successors hit the cache: one wrapper per event per world, not per listener. Then`window->SetCurrentEvent(event)`bookkeeping and a`v8::TryCatch`with`SetVerbose(true)` around the call [^24^].

`JSEventListener::InvokeInternal` (js_event_listener.cc) resolves the callable: a plain function is a direct `v8::Function::Call`, but an object listener goes through `GetEffectiveFunction`, a **property Get("handleEvent") per invocation** [^26^]. `V8ScriptRunner::CallFunction` (v8_script_runner.cc) adds a recursion-depth check, a `V8RunMicrotasksScope` (microtask checkpoint on scope exit for the outermost call), `probe::CallFunction`, and `function->Call` → V8 `Execution::Call` [^27^]; an older stack crawl shows the identical spine — `FireEventListeners → V8AbstractEventListener::handleEvent → InvokeEventHandler → V8EventListener::CallListenerFunction → V8ScriptRunner::CallFunction → v8::Function::Call → Execution::Call` [^28^].

Hence N listeners = N boundary crossings with no possible batching: every step above runs per listener — HandleScope, context scope, security check, TryCatch, probes, the CEntry trampoline — and since the listener loop lives in C++ (`FireEventListeners`), control ping-pongs C++→JS→C++ N times per dispatch. Fewer, fatter listeners that switch on `e.code` in JS amortize this; many tiny natively-registered ones do not. Attribute reads inside the handler are further binding callbacks _from_ JS into C++ — individually cheap (cached fields, §2.3) but never plain JS property loads. Teardown has the same shape: `AbortSignal` removal has no batch fast path — each signal-registered listener adds a separate abort algorithm calling plain `removeEventListener`, tracked as (listener → AlgorithmHandle) pairs in the AbortSignalRegistry (spec: whatwg/dom#911 / PR #919), so `controller.abort()` over K listeners costs K individual map scans [^9^][^33^].

### 2.5 Where per-keystroke latency actually lives

End-to-end, a real key press decomposes into: OS/UI-thread processing (IME, accelerators) [^14^]; browser-side filtering [^1^]; async IPC through InputRouter to the compositor thread, which forwards keys straight to the main-thread task queue [^2^][^15^]; **waiting for main-thread availability** — the dominant variable term: input tasks are high-priority but cannot preempt a running task, and timers/postMessage visibly starve under continuous key input on a saturated main thread (Chromium closed one such report as an intentional scheduling tradeoff [^30^]); then `KeyboardEventManager` construction + dispatch per §2.2–2.4 [^3^][^6^]; then any style/layout/paint fallout on the next frame. Synthetic `dispatchEvent(new KeyboardEvent(...))` skips the pipeline stages but traverses identical dispatch machinery — its microbenchmarks measure §2.2/§2.4 only.

Every dispatch is instrumented: `EventDispatcher::Dispatch` constructs a `UIEventTiming event_timing(frame, *event_)` recording processing start/end for the Event Timing API — the source of `processingStart`/`processingEnd` and INP — and keyboard events are always eligible (`IsStandardEventType` includes `IsA<KeyboardEvent>`) [^31^]. `event.timeStamp` equals the Event Timing `startTime`, so page code can correlate its own measurements with the engine's [^32^]; Gecko mirrors this via `PerformanceEventTiming::TryGenerateEventTiming` per event [^22^].

| Change                                                  | Where                                                       | Effect                                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| SkipEventCapture (default-on)                           | `DispatchEventAtCapturing`, event_dispatcher.cc [^6^][^19^] | Skips capture walk when document has no capturing listeners; one stray capture listener disables it page-wide |
| crbug.com/482880 (TODO)                                 | KeyboardEvent ctor [^4^]                                    | `key_`/`code_` eager; every keydown pays the mapping even if unread                                           |
| crbug.com/1420890                                       | `EventListenerMap::Add` [^10^]                              | `listener_count_log2` crash keys past 8 same-type listeners/node                                              |
| Passive-by-default interventions (M56 touch, M73 wheel) | `SetDefaultAddEventListenerOptions` [^9^][^29^]             | Keyboard deliberately excluded; `passive` is a no-op on key events                                            |
| WebKit bug 188370                                       | EventDispatcher `resetBeforeDispatch` [^34^]                | IME-handled keys must not run default handlers                                                                |

This architecture yields testable predictions for Chapter 3. (1) Dispatch cost should scale with DOM **depth**, not with the listener's position in the path — a delegated `document` listener pays O(D) path work regardless of tree shape. (2) Capture and bubble dispatch should cost the same on a page with any capturing listener, and drop ~one traversal when the document has none (SkipEventCapture). (3) Repeated `e.key`/`e.code` reads should be near-free in Blink/WebKit (binding call only) but measurably costlier per read in Gecko. (4) `{handleEvent}` object listeners should be slightly, consistently slower than plain functions (the per-invocation Get). (5) `preventDefault()` should be near-free — a flag set, nothing unwound. (6) Listener-count scaling should be strictly linear in boundary crossings, and synthetic-dispatch benchmarks should undershoot real-key latency by exactly the input-pipeline and main-thread-wait terms.
