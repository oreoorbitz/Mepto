/**
 * Mepto Todo — a validation tool for the Mepto library.
 *
 * Every feature here exists to exercise a slice of Mepto's real-world API
 * surface. See docs/superpowers/specs/2026-07-21-todo-app-design.md.
 */
import { $ } from '../../src/meptos.ts'

// ---------- types -----------------------------------------------------------

type Filter = 'all' | 'active' | 'completed'

interface Todo {
  id: string
  title: string
  completed: boolean
}

// ---------- state (module-scope, single source of truth) --------------------

let todos: Todo[] = []
let currentFilter: Filter = 'all'
let editingId: string | null = null

// ---------- persistence adapter ---------------------------------------------

const STORAGE_KEY = 'mepto-todos'

function load(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Todo[]) : []
  } catch {
    return []
  }
}

function save(list: Todo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // private mode / quota exceeded — app stays usable, just won't persist
  }
}

function persist(): void {
  save(todos)
}

// ---------- mutations (immutable replace → persist → render) ----------------

function addTodo(title: string): void {
  const trimmed = title.trim()
  if (!trimmed) return
  const todo: Todo = { id: crypto.randomUUID(), title: trimmed, completed: false }
  todos = [...todos, todo]
  persist()
  render()
  $('#new-todo').val('')
}

function toggleTodo(id: string): void {
  todos = todos.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
  persist()
  render()
}

function deleteTodo(id: string): void {
  todos = todos.filter(t => t.id !== id)
  persist()
  render()
}

function editTodo(id: string, title: string): void {
  const trimmed = title.trim()
  if (!trimmed) {
    deleteTodo(id)
    return
  }
  todos = todos.map(t => (t.id === id ? { ...t, title: trimmed } : t))
  persist()
  render()
}

function toggleAll(completed: boolean): void {
  todos = todos.map(t => ({ ...t, completed }))
  persist()
  render()
}

function clearCompleted(): void {
  todos = todos.filter(t => !t.completed)
  persist()
  render()
}

// ---------- filter → URL hash ----------------------------------------------

function parseHash(): Filter {
  if (location.hash === '#/active') return 'active'
  if (location.hash === '#/completed') return 'completed'
  return 'all'
}

// ---------- rendering -------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function byFilter(f: Filter): (t: Todo) => boolean {
  if (f === 'active') return t => !t.completed
  if (f === 'completed') return t => t.completed
  return () => true
}

function template(todo: Todo): string {
  const liClass = todo.completed ? 'completed' : ''
  const checked = todo.completed ? 'checked' : ''
  return `
    <li class="${liClass}" data-id="${todo.id}">
      <div class="view">
        <input class="toggle" type="checkbox" ${checked} />
        <label class="todo-label">${escapeHtml(todo.title)}</label>
        <button class="destroy"></button>
      </div>
      <input class="edit" type="text" value="${escapeAttr(todo.title)}" />
    </li>`
}

function renderCount(): void {
  const remaining = todos.filter(t => !t.completed).length
  $('#todo-count-num').text(String(remaining))
  $('#todo-count-label').text(remaining === 1 ? 'item left' : 'items left')

  // show/hide main + footer depending on whether there are any todos
  const hasTodos = todos.length > 0
  $('#main').css('display', hasTodos ? 'block' : 'none')
  $('#footer').css('display', hasTodos ? 'block' : 'none')

  const allComplete = hasTodos && todos.every(t => t.completed)
  $('#toggle-all').prop('checked', allComplete)

  const hasCompleted = todos.some(t => t.completed)
  $('#clear-completed').css('display', hasCompleted ? 'block' : 'none')
}

function render(): void {
  const $list = $('#todo-list').empty()

  // Build the whole list in a fragment first, then a single DOM write.
  // Probe note: a bare DocumentFragment is not safely handled by $.fn.append
  // (it stringifies to '[object DocumentFragment]'). Wrap in an array so the
  // array branch is taken, which handles nodes correctly.
  const frag = document.createDocumentFragment()

  todos.filter(byFilter(currentFilter)).forEach(todo => {
    const $li = $(template(todo))
    $li.data('todoId', todo.id)
    frag.appendChild($li[0] as Element)
  })

  // Array-wrapped fragment routes through append's array branch (node-aware),
  // not the object branch which stringifies.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  $list.append([frag as unknown as Element])

  // edit-in-place visual state
  if (editingId !== null) {
    const $editing = $('#todo-list li').filter((_, el) => $(el).data('todoId') === editingId)
    $editing.addClass('editing')
    $editing.find('.edit').focus()
  }

  renderCount()
}

// ---------- filter bus via $.Callbacks --------------------------------------

const filterBus = (
  $.Callbacks as unknown as () => {
    add: (fn: (f: Filter) => void) => unknown
    fire: (f: Filter) => unknown
  }
)()

filterBus.add((f: Filter) => {
  currentFilter = f
  $('#filters a').removeClass('selected')
  const href = f === 'all' ? '#/' : `#/${f}`
  $(`#filters a[href="${href}"]`).addClass('selected')
  render()
})

function onHashChange(): void {
  filterBus.fire(parseHash())
}

// ---------- events (all delegation, bound once) -----------------------------

function onSubmit(e: Event): void {
  e.preventDefault()
  addTodo(String($('#new-todo').val()))
}

function onToggleAll(e: Event): void {
  toggleAll((e.target as HTMLInputElement).checked)
}

function onToggle(e: Event): void {
  const $li = $(e.target as Element).closest('li')
  const id = $li.data('todoId') as string
  toggleTodo(id)
}

function onDestroy(e: Event): void {
  const $li = $(e.target as Element).closest('li')
  const id = $li.data('todoId') as string
  deleteTodo(id)
}

function onEditStart(e: Event): void {
  const $li = $(e.target as Element).closest('li')
  editingId = $li.data('todoId') as string
  render()
}

function onEditKey(e: KeyboardEvent): void {
  const $input = $(e.target as Element)
  const $li = $input.closest('li')
  const id = $li.data('todoId') as string
  if (e.key === 'Enter') {
    editingId = null
    editTodo(id, String($input.val()))
  } else if (e.key === 'Escape') {
    editingId = null
    render()
  }
}

function onEditCommit(e: Event): void {
  if (editingId === null) return
  const $input = $(e.target as Element)
  const $li = $input.closest('li')
  const id = $li.data('todoId') as string
  const title = String($input.val())
  editingId = null
  editTodo(id, title)
}

function onClearCompleted(): void {
  clearCompleted()
}

function bind(): void {
  $('#new-todo-form').on('submit', onSubmit)
  $('#toggle-all').on('change', onToggleAll)
  $('#clear-completed').on('click', onClearCompleted)

  // delegated handlers on the parent <ul> — survive full re-renders
  $('#todo-list')
    .on('change', '.toggle', onToggle)
    .on('click', '.destroy', onDestroy)
    .on('dblclick', '.todo-label', onEditStart)
    .on('keydown', '.edit', onEditKey)
    .on('blur', '.edit', onEditCommit)

  $(window).on('hashchange', onHashChange)
}

// ---------- init ------------------------------------------------------------

function init(): void {
  todos = load()
  bind()
  // initial UI state reflects the hash, routed through the same path as hashchange
  filterBus.fire(parseHash())
}

init()
