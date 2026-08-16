/**
 * Mepto Pokémon — a validation tool for Mepto's AJAX module.
 *
 * Every feature here exists to exercise a slice of `src/ajax.ts` against the
 * public PokéAPI: $.ajax with data serialization, $.getJSON, error/abort
 * paths, and the global ajaxStart/ajaxStop events plus the $.active counter.
 */
import { $ } from '../../src/meptos.ts'

// ---------- types -----------------------------------------------------------

interface PokemonListEntry {
  name: string
  url: string
}

interface PokemonListResponse {
  count: number
  results: PokemonListEntry[]
}

interface Pokemon {
  id: number
  name: string
  sprites: { front_default: string | null }
  types: { type: { name: string } }[]
  stats: { base_stat: number; stat: { name: string } }[]
}

// ---------- constants & state -----------------------------------------------

const API = 'https://pokeapi.co/api/v2'
const PAGE_SIZE = 20
const MAX_ID = 1010

let offset = 0
let totalCount = 0
let currentXhr: XMLHttpRequest | null = null

// ---------- error / loading UI ----------------------------------------------

function showError(message: string): void {
  $('#error-message').text(message)
  $('#error-box').removeClass('hidden')
}

function clearError(): void {
  $('#error-box').addClass('hidden')
  $('#error-message').text('')
}

function ajaxFailed(context: string) {
  return (xhr: XMLHttpRequest, type: string): void => {
    if (type === 'abort') showError('Request aborted.')
    else if (xhr.status === 404) showError(`${context}: no Pokémon found.`)
    else showError(`${context}: request failed (${type}).`)
  }
}

// ---------- single Pokémon (search / list click) ----------------------------

function renderCard(p: Pokemon): void {
  $('#card-name').text(p.name)
  $('#card-id').text(`#${p.id}`)
  $('#card-sprite').attr('src', p.sprites.front_default || '')

  // One DOM write per group instead of per-item appends
  $('#card-types').html(p.types.map(t => `<span class="type-badge">${t.type.name}</span>`).join(''))
  $('#card-stats').html(p.stats.map(s => `<li>${s.stat.name}: ${s.base_stat}</li>`).join(''))

  $('#pokemon-card').removeClass('hidden')
}

function fetchPokemon(nameOrId: string): void {
  clearError()
  currentXhr = $.ajax({
    url: `${API}/pokemon/${encodeURIComponent(nameOrId.toLowerCase())}`,
    dataType: 'json',
    success: data => renderCard(data as Pokemon),
    error: ajaxFailed(`"${nameOrId}"`),
  })
}

// ---------- paginated list ---------------------------------------------------

function renderList(data: PokemonListResponse): void {
  totalCount = data.count
  // Single DOM write for the whole page of rows
  $('#pokemon-list').html(
    data.results
      .map(
        entry =>
          `<li><button type="button" class="list-item" data-name="${entry.name}">${entry.name}</button></li>`
      )
      .join('')
  )
  $('#page-info').text(`${offset + 1}–${offset + data.results.length} of ${totalCount}`)
  $('#prev-page').prop('disabled', offset === 0)
}

function fetchList(): void {
  clearError()
  currentXhr = $.ajax({
    url: `${API}/pokemon`,
    data: { limit: PAGE_SIZE, offset },
    dataType: 'json',
    success: data => renderList(data as PokemonListResponse),
    error: ajaxFailed('list'),
  })
}

// ---------- random team (concurrent requests) --------------------------------

function buildRandomTeam(): void {
  clearError()
  const $teamList = $('#team-list').empty()
  const ids = new Set<number>()
  while (ids.size < 6) ids.add(1 + Math.floor(Math.random() * MAX_ID))
  // 6 async callbacks each append one row — progressive display vs single batched
  // write (fragment + one html) is a tradeoff at N=6 the per-append cost is
  // negligible and batching would delay first paint. renderList() above does
  // use the batched single-html path for the paginated 20-row list (Kimi §2.4).
  ids.forEach(id => {
    $.getJSON(`${API}/pokemon/${id}`, undefined, data => {
      const p = data as Pokemon
      $teamList.append($('<li class="team-member"></li>').text(`#${p.id} ${p.name}`))
    })
  })
}

// ---------- events ------------------------------------------------------------

$('#search-form').on('submit', (e: Event) => {
  e.preventDefault()
  const query = String($('#search-input').val() || '').trim()
  if (query) fetchPokemon(query)
})

$('#abort-btn').on('click', () => {
  if (currentXhr) currentXhr.abort()
})

$('#pokemon-list').on('click', '.list-item', function (this: HTMLElement) {
  fetchPokemon($(this).attr('data-name') || '')
})

$('#prev-page').on('click', () => {
  offset = Math.max(0, offset - PAGE_SIZE)
  fetchList()
})

$('#next-page').on('click', () => {
  if (offset + PAGE_SIZE < totalCount) {
    offset += PAGE_SIZE
    fetchList()
  }
})

$('#random-team').on('click', buildRandomTeam)

// Global AJAX events drive the loading indicator and the live $.active counter.
$(document).on('ajaxStart', () => $('#loading').removeClass('hidden'))
$(document).on('ajaxStop', () => $('#loading').addClass('hidden'))
// ajaxComplete fires before ajaxStop decrements $.active, so defer the read
// past the synchronous completion chain.
$(document).on('ajaxSend ajaxComplete', () => {
  setTimeout(() => $('#active-count').text(String($.active)), 0)
})

// ---------- init ---------------------------------------------------------------

fetchList()
