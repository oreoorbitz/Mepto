# Event Listener Performance — Facet 2: Browser Engine Internals (Key Detection Focus)

Source-level evidence for what happens between a physical key press and a JS listener
invocation, and what each layer costs. All code excerpts are from Chromium `main`
(Blink), WebKit `main` (GitHub mirror), and mozilla-central `tip` (hg), accessed
2026-08-12.

---

## 1. Blink input pipeline for a real key press

### 1.1 Browser process

An OS key message is converted to `ui::Event` / `NativeWebKeyboardEvent` in the
browser process. Chromium's own design doc for desktop Chrome UI states the three
stages: OS native event → windowing system converts to platform-independent
`ui::Event` → dispatched to the control expecting it; IME interaction happens at
this stage too [^14^]. The RenderingNG architecture doc describes the
browser→renderer routing: input events come to the browser process and "each event
is routed to [the] render process compositor thread" [^15^].

`RenderWidgetHostImpl::ForwardKeyboardEventWithCommands` is the browser-side funnel
(content/browser/renderer_host/render_widget_host_impl.cc) [^1^]. Notably:

- The browser can consume keys _before_ the renderer ever sees them:
  `KeyPressListenersHandleEvent(key_event)` (browser keypress listeners) and
  `delegate_->PreHandleKeyboardEvent(key_event)` for accelerators. "Tab
  switching/closing accelerators aren't sent to the renderer to avoid a
  hung/malicious renderer from interfering" [^1^].
- If a RawKeyDown was handled by the browser, subsequent Char/KeyUp are suppressed
  (`suppress_events_until_keydown_`) [^1^].

The old (but still accurate on IPC mechanics) "How Chromium Displays Web Pages"
design doc traces the mouse-click path through `RenderWidgetHost` →
`RenderProcessHost::Send` → IPC to renderer main thread; the modern equivalent for
input is `InputRouter` (async, with ACKs) rather than sync IPC — Chromium's OS X
keyboard doc lists as a central design principle that "keyboard events should not
use synchronous IPC calls" [^16^][^17^].

### 1.2 Renderer: compositor thread first, but keys always go to the main thread

In the renderer, `InputHandlerProxy` runs on the compositor thread
(third_party/blink/renderer/platform/widget/input/input_handler_proxy.cc). Its job
is to decide which events can be handled off-main-thread:

- Wheel: if no blocking wheel handler at the point and listener properties are
  passive/none, the event is marked `DID_NOT_HANDLE_NON_BLOCKING` or `DROP_EVENT`
  without blocking the compositor [^2^].
- Touch/wheel with non-passive listeners → forwarded to main thread _blocking_ scroll.
- **Keyboard: always forwarded to the main thread.** `InputHandlerProxy` has no
  key-handling fast path; keys only get _frame attribution_:
  ```cpp
  if (WebInputEvent::IsKeyboardEventType(event.GetType())) {
    // Keyboard events should be dispatched to the focused frame.
    return WebInputEventAttribution(WebInputEventAttribution::kFocusedFrame);
  }
  ```
  [^2^] Key-driven scrolling (arrows/space/PageUp) is therefore main-thread work
  (it happens in default event handlers in Blink's `KeyboardEventManager` /
  `ScrollManager::LogicalScroll`), unlike wheel/touch scrolling which can run on
  the compositor. So a busy main thread delays keydown delivery; the "blocked
  event" console warning machinery only applies to scroll-blocking
  (wheel/touch) events, not keys (§6).

Coalescing: `compositor_event_queue_->CoalesceEvents()` exists for continuous
events (gesture scroll/pinch, mousemove-style streams) [^2^]; discrete key events
are not coalesced. OS auto-repeat generates one RawKeyDown/KeyDown (+Char) per
repeat tick; `KeyboardEvent.repeat` just reflects the `kIsAutoRepeat` modifier bit
(`bool repeat() const { return GetModifiers() & WebInputEvent::kIsAutoRepeat; }`
in keyboard_event.h) [^4^].

### 1.3 Blink main thread: WebKeyboardEvent → KeyboardEvent → dispatch

`EventHandler::KeyEvent` delegates to `KeyboardEventManager::KeyEvent`
(third_party/blink/renderer/core/input/keyboard_event_manager.cc) [^3^][^5^]:

1. **Focus target resolution**: `node = EventTargetNodeForDocument(document)` —
   the focused element, else body/document fallback. Focus is _re-resolved_ after
   keydown dispatch before synthesizing keypress ("Focus may have changed during
   keydown handling, so refetch node") [^3^].
2. User-activation notification for non-modifier keys [^3^].
3. A `KeyboardEvent` C++ object is created per phase: `kRawKeyDown`/`kKeyDown` →
   "keydown", `kChar` → "keypress", `kKeyUp` → "keyup"
   (`EventTypeForKeyboardEventType`, keyboard_event.cc) [^4^].
4. `node->DispatchEvent(*event)` → `EventDispatcher::DispatchEvent` (§2).
5. If not canceled, default event handlers run (access keys, scroll keys, focus
   navigation — `DefaultNavigationKeyEventHandler`, `DefaultSpaceEventHandler`,
   `DefaultArrowEventHandler` in keyboard_event_manager.cc) [^3^].

So a single physical keystroke producing a character = **two full dispatch passes**
(keydown via RawKeyDown/KeyDown, keypress via Char), each building an EventPath and
walking listeners.

---

## 2. Blink event dispatch machinery: EventDispatcher::Dispatch

Source: third_party/blink/renderer/core/dom/events/event_dispatcher.cc,
event_path.cc, node_event_context.cc, event_target.cc, event_listener_map.cc,
registered_event_listener.{h,cc} [^6^][^7^][^8^][^9^][^10^][^11^].

### 2.1 EventPath construction (per dispatch)

The dispatcher constructor calls `event_->InitEventPath(*node_)` [^6^].
`EventPath::CalculatePath()` walks from the target up to the root, handling
assigned slots and shadow-root retargeting (`GetShadowRootParent` respects
`event.composed`), then materializes a `HeapVector<NodeEventContext>`:

```cpp
// For performance and memory usage reasons we want to store the
// path using as few bytes as possible and with as few allocations
// as possible which is why we gather the data on the stack before
// storing it in a perfectly sized node_event_contexts_ Vector.
HeapVector<Member<Node>, 64> nodes_in_path;
...
node_event_contexts_ = HeapVector<NodeEventContext>(nodes_in_path, ...);
```

[^7^]

Then `CalculateAdjustedTargets()` builds `TreeScopeEventContext` objects per
TreeScope crossed (for shadow-DOM target retargeting) [^7^]. **Cost: O(depth),
one heap-allocated, exactly-sized GC vector per dispatch** (no path cache; the path
is computed fresh for every dispatch because the DOM may have changed between
events).

### 2.2 Capture → target → bubble

`EventDispatcher::Dispatch()` [^6^]:

```cpp
if (DispatchEventLegacyPreActivationBehavior(...) == kContinueDispatching) {
  if (DispatchEventAtCapturing() == kContinueDispatching) {
    DispatchEventAtBubbling();
  }
}
DispatchEventPostProcess(activation_target, ...);
```

- Capture phase walks the path **in reverse**, bubble phase forward; each path
  entry's `NodeEventContext::HandleLocalEvents` sets `event.target`
  (shadow-adjusted), `currentTarget`, `invocationTargetInShadowTree`, then calls
  `node_->HandleLocalEvents(event)` [^8^].
- **Capture-phase skip optimization**: `DispatchEventAtCapturing()` early-returns
  when `!node_->GetDocument().HasCaptureListener()`, gated by
  `RuntimeEnabledFeatures::SkipEventCaptureEnabled()` [^6^]. The feature is
  described as "Improves performance of event dispatching by skipping the capture
  phase if there are no capture listeners registered on the page" and is enabled
  by default [^19^]. Practical effect: on pages with no capturing listeners, a
  keydown costs roughly one traversal of the ancestor chain instead of two.
- `stopPropagation()`/`stopImmediatePropagation()` are checked after _every_ node
  and every listener, so early termination is O(1) to check but the flags are
  re-read constantly.
- After bubbling, `DispatchEventPostProcess` runs **default event handlers in
  bubbling order** (`node_->DefaultEventHandler(*event_)` then each ancestor's
  until handled) for trusted events [^6^]. For keys this is where scroll-on-space,
  accesskey activation, and IME/editor handling hook in.
- Every dispatch also creates a `UIEventTiming` object for the Event Timing API /
  INP (see §7).

### 2.3 Per-node listener lookup: EventTargetData + EventListenerMap

`Node::HandleLocalEvents` early-returns if the node has no `EventTargetData`
(lazily allocated side table — nodes with no listeners cost only one null check)
[^20^]. `EventTarget::FireEventListeners(Event&)`:

```cpp
EventTargetData* d = GetEventTargetData();
if (!d) return DispatchEventResult::kNotCanceled;
EventListenerVector* listeners_vector = d->event_listener_map.Find(event.type());
```

[^9^]

`EventListenerMap` is a **linear vector of (AtomicString type → EventListenerVector)**
pairs — `Find` is a linear scan over _distinct event types registered on that node_
(cheap in practice since per-node type counts are small; AtomicString comparison is
a pointer compare after interning) [^10^].

### 2.4 Firing loop: copy-on-fire snapshot, once, passive, probe

```cpp
// Fire event listeners, creates a copy of EventListenerVector on being called.
bool EventTarget::FireEventListeners(Event& event, EventTargetData* d,
                                     EventListenerVectorSnapshot entry)
```

with

```cpp
using EventListenerVectorSnapshot = HeapVector<Member<RegisteredEventListener>, 1>;
```

[^9^][^18^]. The header states explicitly: "This method makes a copy of the
`EventListenerVector` on invocation to match the HTML spec. Do not try to optimize
it away. The spec snapshots the array at the beginning of a dispatch so that
listeners adding or removing other event listeners during dispatch is done in a
consistent way." [^18^] **Every node that has ≥1 listener for the type pays one
vector clone per dispatch.**

Per listener in the snapshot:

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

[^9^]

- `once: true` is implemented as a **removeEventListener immediately before
  Invoke** — so a once listener costs an extra map scan + vector erase (O(listeners)
  `EraseIf` in `EventListenerMap::Remove` [^10^]) per firing.
- Removed listeners are marked (`SetRemoved()`) so an in-flight snapshot skips
  them; removal compacts the live vector [^10^][^11^].
- Every JS listener invocation is bracketed by `probe::UserCallback` (DevTools
  instrumentation hook) [^9^].
- RegisteredEventListener packs options into bitfields (passive/once/capture/
  removed/etc.) — one GC'd object per (listener, type, capture) registration [^11^].
- `addEventListener` dedups on (callback, capture) only — passive/once/signal
  are ignored for matching, per spec [^10^].

### 2.5 Cost model

For an event bubbling through D ancestors where node i has Lᵢ listeners of the type:

- Path build: O(D) + one GC allocation.
- Per node with listeners: 1 snapshot clone (O(Lᵢ) alloc+copy) + Lᵢ invocations.
- Each invocation: phase check, probe bracket, C++→V8 boundary crossing (§5).
- **Total ≈ O(D) allocation work + Σ Lᵢ boundary crossings.** Depth dominates the
  fixed cost; listener count dominates the variable cost. Deep DOM + a single
  delegated listener at the root pays O(D) path work but only 1 boundary crossing —
  while N listeners scattered through the tree pay N crossings plus N snapshot
  clones. Because keydown fires on the focused element and bubbles to
  document/window, a `document.addEventListener('keydown', …)` delegation listener
  is the fixed O(D)-path + 1-clone + 1-crossing shape.

---

## 3. KeyboardEvent attribute getter internals

Source: third_party/blink/renderer/core/events/keyboard_event.{h,cc} and
ui/events/keycodes/dom/keycode_converter.cc [^4^][^12^].

**`key` and `code` are computed eagerly at event construction, cached in the C++
object, and getters return the cached string:**

```cpp
KeyboardEvent::KeyboardEvent(const WebKeyboardEvent& key, ...)
    : ...
      // TODO(crbug.com/482880): Fix this initialization to lazy initialization.
      code_(FromUtf8(ui::KeycodeConverter::DomCodeToCodeString(
          static_cast<ui::DomCode>(key.dom_code)))),
      key_(FromUtf8(
          ui::KeycodeConverter::DomKeyToKeyString(ui::DomKey(key.dom_key)))),
```

```cpp
const String& code() const { return code_; }
const String& key() const { return key_; }
```

[^4^] So per-access cost is: one V8 attribute-getter callback (C++ boundary
crossing) + returning a reference to the cached `String` (converted/wrapped into a
V8 string — the underlying WTF::String is shared, no re-atomization or table lookup
per read). The mapping work happens once per event:

- `DomCodeToCodeString`: generates runs ("KeyA".."KeyZ", "Digit0..9", "Numpad0..9",
  "F1..F24") arithmetically, else linear scan of the `kDomCodeMappings` table [^12^].
- `DomKeyToKeyString`: dead keys collapse to "Dead", linear scan of
  `kDomKeyMappings`, else UTF-8 encode the character [^12^].

Other cheap getters: `keyCode`/`charCode`/`which` are plain unsigned fields set at
construction (Firefox-matching semantics); `location` from modifier bits;
`repeat` is `modifiers_ & kIsAutoRepeat` — bit test, no allocation [^4^].

**Implication:** reading `event.key`/`event.code` inside a listener is cheap
(post-construction); the per-read cost is the V8 binding getter call itself, so
hoisting `e.key` into a local is still worthwhile in hot paths but the string is
_not_ re-derived per access in Blink.

---

## 4. WebKit & Gecko notes

### WebKit

`Source/WebCore/dom/EventDispatcher.cpp` (WebKit/WebKit GitHub mirror, main) [^13^]:
structure mirrors Blink (common ancestry): `dispatchEventInDOM` walks the EventPath
in reverse for capture then forward for bubble, each `EventContext` calling
`handleLocalEvents`; default handlers run in bubbling order via
`callDefaultEventHandlersInBubblingOrder`. WebKit likewise tracks per-document
listener counts to **skip the capture phase when the document has no capturing
listeners** (`listenerCounts.hasCapturing()`) [^13^].

KeyboardEvent: WebKit also caches strings at construction —
`m_key(key.key()), m_code(key.code())` from `PlatformKeyboardEvent`
(platform-specific `PlatformEventFactory{Mac,Win,Gtk}` map native key codes →
UI Events key/code strings, e.g. the big switch tables reviewed in
bugs.webkit.org #149584) [^13^][^21^]. Same "compute once, read cheaply" shape as
Blink.

### Gecko

`dom/events/EventDispatcher.cpp` (mozilla-central tip) [^22^]: `Dispatch` builds an
`EventTargetChain` of `EventTargetChainItem` objects (a fixed-capacity chain,
`MOZ_CAN_RUN_SCRIPT`-annotated pre/post-handle hooks), with per-item flags like
`MayHaveListenerManager` to skip nodes with no listeners. Gecko's dispatch entry
also creates `PerformanceEventTiming::TryGenerateEventTiming` per event [^22^].

KeyboardEvent getters differ from Blink: **`KeyboardEvent::Key()` /
`KeyboardEvent::Code()` call `WidgetKeyboardEvent::GetDOMKeyName()` /
`GetDOMCodeName()` on each access** (mapping `mKeyNameIndex`/`mCodeNameIndex` enums
through key-name string tables into a caller-provided nsString), rather than
caching strings at construction [^23^]. (ResistFingerprinting can spoof `Code` per
access.) Practically: in Firefox, repeatedly reading `event.key` in a hot loop does
a small amount of extra string work per read compared with Blink/WebKit — another
reason to hoist.

---

## 5. V8 side: anatomy of one listener invocation

Per listener firing, Blink executes (current `main`):

1. `RegisteredEventListener::Callback()` → `EventListener::Invoke` →
   `JSBasedEventListener::Invoke(context, event)` (js_based_event_listener.cc) [^24^]:
   - Bail-out checks: execution terminating, world mismatch.
   - `HandleScope`; `GetListenerObject(currentTarget)` (may compile a lazy
     content-attribute handler).
   - `ScriptState::Scope` (enters the listener's context), `probe::InvokeEventHandler`.
   - Security check `BindingSecurity::ShouldAllowAccessToV8Context`.
   - **Event wrapper**: `js_event = ToV8Traits<Event>::ToV8(script_state_of_event_target, event)`
     [^24^]. Per the V8 Binding Design doc, Blink must return _the same_ JS wrapper
     for a given C++ object per world; the main-world wrapper is cached on
     `ScriptWrappable::main_world_wrapper_`, other worlds in `DOMWrapperMap` [^25^].
     So the first JS listener for an event allocates the JS `KeyboardEvent`
     wrapper; subsequent listeners in the same world hit the wrapper cache — one
     wrapper per event per world, not per listener.
   - `window->SetCurrentEvent(event)` bookkeeping; `v8::TryCatch try_catch(isolate)`
     with `SetVerbose(true)` around the call.
2. `JSEventListener::InvokeInternal` (js*event_listener.cc):
   `event_listener*->InvokeWithoutRunnabilityCheck(event.currentTarget(), &event)`— for a plain function this is a direct`v8::Function::Call`; for an object with
`handleEvent`, `GetEffectiveFunction` does a **property Get("handleEvent") on
   the listener object per invocation** (js_event_listener.cc), i.e. an object
   listener costs an extra V8 property lookup vs. a function listener [^26^].
3. `V8ScriptRunner::CallFunction` (v8_script_runner.cc): recursion-depth check,
   `V8RunMicrotasksScope microtasks_scope(context)` (microtasks checkpoint on
   scope exit for the outermost call), `probe::CallFunction`, then
   `function->Call(isolate, ctx, receiver, argc, argv)` → V8 `Execution::Call`
   [^27^]. A stack crawl from an older revision shows the same spine:
   `EventTarget::FireEventListeners → V8AbstractEventListener::handleEvent →
InvokeEventHandler → V8EventListener::CallListenerFunction →
V8ScriptRunner::CallFunction → v8::Function::Call → Execution::Call` [^28^].

**Why one dispatch with N listeners costs N boundary crossings:** steps 1–2 run
fully per listener — HandleScope, context scope, TryCatch, probe callbacks, and
the `v8::Function::Call` trampoline (which must re-enter JS through the
arguments-adaptor/CEntry path each time). There is no batching; the listener loop
is in C++ (`FireEventListeners`), so control ping-pongs C++→JS→C++ N times.
Attribute reads inside the handler (`e.key`, `e.code`, `e.target`, …) are
additional C++ getter callbacks _from_ JS — cheap individually (cached fields per
§3) but each is a binding call, not a plain JS property load.

---

## 6. Passive listeners & the compositor

Confirmed at source level in `EventTarget::SetDefaultAddEventListenerOptions`
(event_target.cc) [^9^]:

- Scroll-blocking types are exactly `touchstart`, `touchmove`, `wheel`,
  `mousewheel` (`IsScrollBlockingEvent`). **Keyboard events are not in the set** —
  `passive` has no effect on keydown/keyup/keypress, and no passive-forcing
  applies.
- Default passive applies only at "top-level nodes" (window, document,
  documentElement, body): touch listeners default passive since Chrome 56
  (`IsTouchScrollBlockingEvent` + `IsTopLevelNode` → `setPassive(true)`,
  `SetPassiveForcedForDocumentTarget(true)`), wheel/mousewheel likewise (Chrome 73
  per the WICG intervention) [^9^][^29^].
- Non-passive wheel/touch listeners on scroll-blocking events trigger the
  DevTools "[Violation] Added non-passive event listener…" console warning from
  this same function; delayed _blocking_ wheel/touch handling is reported via
  `ReportBlockedEvent` ("Handling of '…' input event was delayed for N ms due to
  main thread being busy") [^9^].
- On the compositor side, `InputHandlerProxy::HandleMouseWheel` consults
  `cc::EventListenerProperties` (kNone/kPassive/kBlocking/kBlockingAndPassive) to
  decide DROP / non-blocking / main-thread-blocking dispatch [^2^]. Key events
  never consult listener properties — they always go to the main thread as
  blocking input.

---

## 7. Per-keystroke latency anatomy

For a real key press, end-to-end latency decomposes as:

1. OS/UI-thread input processing (IME, accelerators) [^14^].
2. Browser-side filtering: `KeyPressListenersHandleEvent`, accelerator
   `PreHandleKeyboardEvent` [^1^].
3. Async IPC to renderer; InputRouter queues; compositor thread receives it but
   keys are not consumable there — immediate forwarding to main thread task queue
   [^2^][^15^]. Unlike continuous input (mousemove/wheel), keydown is **not
   coalesced and not frame-aligned** (frame alignment/`DeliverInputForBeginFrame`
   applies to the continuous compositor queue) [^2^].
4. Wait for main thread availability. **This is the dominant variable term**: input
   tasks are high priority but cannot preempt a running task; a long task or busy
   render loop delays keydown dispatch. (Field evidence: users observe timers and
   postMessage starving under continuous key input when the main thread is
   saturated — Chromium closed one such report as working-as-intended scheduling
   tradeoff [^30^].)
5. `KeyboardEventManager::KeyEvent`: KeyboardEvent construction (key/code string
   mapping), EventPath build, capture+bubble walks, N listener crossings,
   default handlers [^3^][^6^].
6. Instrumentation: `UIEventTiming event_timing(frame, *event_)` in
   `EventDispatcher::Dispatch` records processing start/end for the Event Timing
   API (source of `processingStart`/`processingEnd` and INP); keyboard events are
   always eligible (`IsStandardEventType` includes `IsA<KeyboardEvent>`) [^31^].
   `event.timeStamp` equals the Event Timing `startTime`, so page code can
   correlate [^32^].
7. If the handler prevents default or edits DOM, subsequent style/layout/paint
   work lands on the next frame; visual feedback waits for the rendering pipeline.

Auto-repeat: the OS generates repeats; each repeat is a full pipeline traversal
(new WebKeyboardEvent with `kIsAutoRepeat`, new KeyboardEvent, new dispatch).
Nothing in Blink dedupes or throttles repeats.

---

## 8. Notable commits / bugs / features

- **SkipEventCapture** (Blink runtime feature, enabled by default): skip the whole
  capture-phase walk when the document has no capturing listeners — halves path
  traversals on typical pages [^6^][^19^].
- **EventListenerVectorSnapshot**: copy-on-fire is mandated by spec; Blink comment
  explicitly warns not to optimize it away [^18^]. Cost is per (node × dispatch).
- **crbug.com/1420890**: listener-count runaway hang/crash; Blink now annotates
  crash keys with `listener_count_log2` in `EventListenerMap::Add` when a node's
  vector for one type exceeds 8 entries [^10^].
- **crbug.com/482880** (TODO in source): `key_`/`code_` are eagerly computed in the
  KeyboardEvent constructor with an explicit TODO to make them lazy — i.e., today
  every keydown pays the DomKey/DomCode→string mapping even if JS never reads
  `key`/`code` [^4^].
- **crbug.com/1204523**: Mac keypress-prevented selection sync quirk handled in
  DispatchEventPostProcess [^6^].
- **once implementation**: removal-before-invoke in the firing loop [^9^].
- **AbortSignal removal**: no batch fast path — each listener registered with a
  signal adds a separate abort algorithm that calls plain
  `removeEventListener(type, listener, capture)` (event_target.cc); the
  AbortSignalRegistry tracks (listener → AlgorithmHandle) pairs [^9^]. Spec:
  whatwg/dom#911 / PR #919 [^33^]. So `controller.abort()` for K listeners costs K
  individual removeEventListener scans.
- **WebKit**: EventDispatcher keeps `Document::EventListenerCounts` to skip capture
  when no capturing listeners exist (same optimization, independent implementation)
  [^13^]; IME-handled key events must not run default handlers (WebKit bug 188370,
  regression from EventDispatcher `resetBeforeDispatch`) [^34^].
- Chrome's passive-by-default interventions: touch (M56), wheel/mousewheel document
  level (M73) — WICG/interventions#64 [^29^]; keyboard deliberately untouched.

---

## 9. Actionable implications for library authors

1. **Dispatch fixed cost scales with DOM depth** (EventPath build + per-ancestor
   walk). One delegated `keydown` listener on `document` costs O(depth) path work
   but exactly 1 snapshot clone + 1 JS crossing; sprinkling listeners through the
   tree multiplies crossings and snapshot clones. Prefer delegation for global
   shortcuts.
2. **Avoid registering even one capturing listener anywhere** if you don't need it:
   its presence disables the SkipEventCapture fast path document-wide, adding a
   full extra ancestor walk to _every_ event dispatch on the page [^6^][^19^].
3. **`e.key`/`e.code` are pre-computed; the cost is the binding call, not the
   mapping** (Blink/WebKit). Hoist into a local if read repeatedly (matters more in
   Gecko, where the getter re-maps through name tables per access) [^4^][^23^].
   `e.repeat`/`e.keyCode` are bit/field reads — cheapest possible getters.
4. **`once: true` costs an extra removeEventListener (map scan + vector erase) at
   fire time** — fine for one-shot UI, but not a free optimization for hot paths.
5. **Function listeners beat `{handleEvent}` objects** in Blink: object listeners
   pay a per-invocation `handleEvent` property lookup through V8 [^26^].
6. **Listener bodies run under TryCatch + probe hooks + context scope per call**;
   N listeners = N full C++→JS round trips. Fewer, fatter listeners (a dispatcher
   that switches on `e.code` in JS) beat many tiny native-registered ones at high
   key rates.
7. **Key events are never passive and never compositor-handled**: heavy keydown
   work directly extends input latency; repeated keydowns from auto-repeat each
   cost a full pipeline traversal, so debounce/throttle logic belongs in the
   library (check `e.repeat` to skip repeats) — the engine will not coalesce.
8. **Input latency is dominated by main-thread availability**, not dispatch
   machinery: on a busy main thread, keydown waits. Keeping long tasks off the main
   thread (or using `e.timeStamp` + Event Timing `processingStart` deltas to
   measure handler cost [^31^][^32^]) matters more than micro-optimizing listener
   registration shape.
9. **AbortSignal-based removal is not batched**: aborting a controller removes each
   listener individually; for mass teardown of many listeners it's fine
   ergonomically but has no engine fast path [^9^].
10. **Synthetic `dispatchEvent(new KeyboardEvent(...))` is much cheaper to reason
    about but goes through the same EventDispatcher machinery** (EventPath, clones,
    crossings) minus input-pipeline latency; microbenchmarks of synthetic dispatch
    measure §2/§5 only, not §7.

---

## Sources

[^1^]: chromium — content/browser/renderer_host/render_widget_host_impl.cc (`ForwardKeyboardEventWithCommands`, ~L1737–1850). https://chromium.googlesource.com/chromium/src/+/main/content/browser/renderer_host/render_widget_host_impl.cc (read via https://github.com/chromium/chromium/blob/main/content/browser/renderer_host/render_widget_host_impl.cc). Accessed 2026-08-12.

[^2^]: chromium — third_party/blink/renderer/platform/widget/input/input_handler_proxy.cc (`PerformEventAttribution` ~L998–1043; `HandleMouseWheel` ~L1097–1177; `DispatchQueuedInputEvents`/`CoalesceEvents` ~L677–685). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/widget/input/input_handler_proxy.cc. Accessed 2026-08-12.

[^3^]: chromium — third_party/blink/renderer/core/input/keyboard_event_manager.cc (`KeyboardEventManager::KeyEvent`, L226–417). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/input/keyboard_event_manager.cc. Accessed 2026-08-12.

[^4^]: chromium — third_party/blink/renderer/core/events/keyboard_event.cc and keyboard_event.h (constructor L100–142; getters `key()`/`code()`/`repeat()`). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/events/keyboard_event.cc and .../keyboard_event.h. Accessed 2026-08-12.

[^5^]: chromium — third_party/blink/renderer/core/input/event_handler.cc (`EventHandler::KeyEvent` ~L2429). https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/input/event_handler.cc. Accessed 2026-08-12.

[^6^]: chromium — third_party/blink/renderer/core/dom/events/event_dispatcher.cc (`Dispatch`, `DispatchEventAtCapturing` incl. `HasCaptureListener`/`SkipEventCapture` skip at ~L294–335, `DispatchEventAtBubbling`, `DispatchEventPostProcess`). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/dom/events/event_dispatcher.cc. Accessed 2026-08-12.

[^7^]: chromium — third_party/blink/renderer/core/dom/events/event_path.cc (`EventPath::CalculatePath`, `CalculateAdjustedTargets`, L107–231). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/dom/events/event_path.cc. Accessed 2026-08-12.

[^8^]: chromium — third_party/blink/renderer/core/dom/events/node_event_context.cc (`NodeEventContext::HandleLocalEvents`, L53–63). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/dom/events/node_event_context.cc. Accessed 2026-08-12.

[^9^]: chromium — third_party/blink/renderer/core/dom/events/event_target.cc (`SetDefaultAddEventListenerOptions` L453–518; `AddEventListenerInternal` incl. signal path L583–680; `FireEventListeners` L960–1096). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/dom/events/event_target.cc. Accessed 2026-08-12.

[^10^]: chromium — third_party/blink/renderer/core/dom/events/event_listener_map.cc (`Add`/`Remove`/`Find`, crbug.com/1420890 crash key, L112–206). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/dom/events/event_listener_map.cc. Accessed 2026-08-12.

[^11^]: chromium — third_party/blink/renderer/core/dom/events/registered_event_listener.h / .cc (bitfield options; `ShouldFire`). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/dom/events/registered_event_listener.h. Accessed 2026-08-12.

[^12^]: chromium — ui/events/keycodes/dom/keycode_converter.cc (`DomCodeToCodeString` L319+, `DomKeyToKeyString` L429+). https://github.com/nwjs/chromium.src/blob/main/ui/events/keycodes/dom/keycode_converter.cc (mirror of chromium.googlesource.com/chromium/src/+/main/ui/events/keycodes/dom/keycode_converter.cc). Accessed 2026-08-12.

[^13^]: WebKit — Source/WebCore/dom/EventDispatcher.cpp and Source/WebCore/dom/KeyboardEvent.cpp. https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/EventDispatcher.cpp ; https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/KeyboardEvent.cpp. Accessed 2026-08-12.

[^14^]: chromium docs — "The Life of an Input Event in Desktop Chrome UI", docs/ui/input_event/index.md. https://github.com/chromium/chromium/blob/main/docs/ui/input_event/index.md (canonical: https://chromium.googlesource.com/chromium/src/+/main/docs/ui/input_event/index.md). Accessed 2026-08-12.

[^15^]: Chrome for Developers — "RenderingNG architecture" (input routing: browser → compositor thread → main thread; scroll fast path). https://developer.chrome.com/docs/chromium/renderingng-architecture (source: https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/articles/renderingng-architecture/index.md). Accessed 2026-08-12.

[^16^]: chromium design docs — "How Chromium Displays Web Pages" (Life of a "mouse click" message). https://www.chromium.org/developers/design-documents/displaying-a-web-page-in-chrome/. Accessed 2026-08-12.

[^17^]: chromium design docs — "OS X keyboard handling" ("Keyboard events should not use synchronous IPC calls"; page first, browser second). https://www.chromium.org/developers/os-x-keyboard-handling/. Accessed 2026-08-12.

[^18^]: chromium — third_party/blink/renderer/core/dom/events/event_target.h (`EventListenerVectorSnapshot` = `HeapVector<Member<RegisteredEventListener>, 1>`; "Do not try to optimize it away", ~L384–393). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/dom/events/event_target.h. Accessed 2026-08-12.

[^19^]: niek.github.io Chrome features mirror of Blink runtime_enabled_features — `SkipEventCapture`: "Improves performance of event dispatching by skipping the capture phase if there are no capture listeners registered on the page" (enabled by default). https://niek.github.io/chrome-features/. Accessed 2026-08-12.

[^20^]: chromium — third_party/blink/renderer/core/dom/node.cc (`Node::HandleLocalEvents` ~L3368). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/dom/node.cc. Accessed 2026-08-12.

[^21^]: WebKit bug 149584 — "Implement KeyboardEvent.code from the UI Event spec" (PlatformEventFactoryMac.mm key/code mapping tables). https://www2.webkit.org/show_bug.cgi?id=149584. Accessed 2026-08-12.

[^22^]: mozilla-central — dom/events/EventDispatcher.cpp (`EventDispatcher::Dispatch`, EventTargetChain, `PerformanceEventTiming::TryGenerateEventTiming`). https://hg.mozilla.org/mozilla-central/file/tip/dom/events/EventDispatcher.cpp (browse: https://searchfox.org/mozilla-central/source/dom/events/EventDispatcher.cpp). Accessed 2026-08-12.

[^23^]: mozilla-central — dom/events/KeyboardEvent.cpp (`KeyboardEvent::Key`/`Code` → `GetDOMKeyName`/`GetDOMCodeName` per access; RFP spoofing). https://searchfox.org/mozilla-central/source/dom/events/KeyboardEvent.cpp. Accessed 2026-08-12.

[^24^]: chromium — third_party/blink/renderer/bindings/core/v8/js_based_event_listener.cc (`JSBasedEventListener::Invoke`, L69–201). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/bindings/core/v8/js_based_event_listener.cc. Accessed 2026-08-12.

[^25^]: chromium — "Design of V8 bindings" (V8BindingDesign.md: same wrapper per world; `ScriptWrappable::main_world_wrapper_`, `DOMWrapperMap`). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/bindings/core/v8/V8BindingDesign.md. Accessed 2026-08-12.

[^26^]: chromium — third_party/blink/renderer/bindings/core/v8/js_event_listener.cc (`GetEffectiveFunction` per-invocation `handleEvent` Get; `InvokeInternal`). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/bindings/core/v8/js_event_listener.cc. Accessed 2026-08-12.

[^27^]: chromium — third_party/blink/renderer/bindings/core/v8/v8_script_runner.cc (`V8ScriptRunner::CallFunction` L811+: microtask scope, probes, `function->Call`). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/bindings/core/v8/v8_script_runner.cc. Accessed 2026-08-12.

[^28^]: Exploit-DB 45444 (stack trace showing FireEventListeners → V8AbstractEventListener::handleEvent → InvokeEventHandler → V8EventListener::CallListenerFunction → V8ScriptRunner::CallFunction → v8::Function::Call → Execution::Call). https://www.exploit-db.com/exploits/45444. Accessed 2026-08-12.

[^29^]: WICG/interventions issue #64 — "Default to passive: true on document level wheel/mousewheel event listeners". https://github.com/WICG/interventions/issues/64. Accessed 2026-08-12.

[^30^]: Babylon.js forum thread quoting Chromium issue resolution on input-vs-timer scheduling under main-thread saturation (closed as WAI/intentional). https://forum.babylonjs.com/t/the-latest-version-of-chrome-edge-browser-the-impact-of-keyboard-input-on-timer-tasks/39390. Accessed 2026-08-12.

[^31^]: chromium — third_party/blink/renderer/core/timing/event_timing.cc (`IsStandardEventType` includes KeyboardEvent; `UIEventTiming` created in `EventDispatcher::Dispatch`). https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/timing/event_timing.cc. Accessed 2026-08-12.

[^32^]: Wikimedia Diff — "Tracking down slow event handlers with Event Timing" (processingEnd−processingStart; timeStamp == startTime correlation). https://diff.wikimedia.org/2019/06/19/tracking-down-slow-event-handlers-with-event-timing/. Accessed 2026-08-12.

[^33^]: whatwg/dom issue #911 and PR #919 — AbortSignal in addEventListener. https://github.com/whatwg/dom/issues/911 ; https://github.com/whatwg/dom/pull/919. Accessed 2026-08-12.

[^34^]: WebKit bug 188370 — "Events handled by input method invoke default event handler" (EventDispatcher regression analysis). https://bugs.webkit.org/show_bug.cgi?id=188370. Accessed 2026-08-12.
