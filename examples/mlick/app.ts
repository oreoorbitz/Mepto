/**
 * Mepto Mlick — QA page for plugins/mlick.js.
 *
 * Initializes the demo carousels, wires the event log, and exposes the
 * plugin's string commands (mlickPrev/mlickGoTo/mlickAdd/unslick/…) through
 * the API button panel.
 */
import { $ } from '../../src/meptos.ts'
import type { MeptoCollection } from '../../src/types.ts'
import '../../plugins/mlick.js'

// $.fn.mlick is registered by the plugin at runtime; the core types don't
// know about it, so cast through a minimal local interface.
interface MlickCollection extends MeptoCollection {
  mlick(options?: Record<string, unknown>): MlickCollection
  mlick(command: string, ...args: unknown[]): MlickCollection
}

const mlick = (selector: string): MlickCollection => $(selector) as unknown as MlickCollection

// ---------- demo carousels ---------------------------------------------------

mlick('#carousel-basic').mlick({ dots: true })

mlick('#carousel-multi').mlick({ slidesToShow: 3, slidesToScroll: 1, dots: true })

mlick('#carousel-fade').mlick({ fade: true, dots: true })

mlick('#carousel-autoplay').mlick({ autoplay: true, autoplaySpeed: 1500, dots: true })

mlick('#carousel-api').mlick({ dots: true })

// ---------- event log --------------------------------------------------------

const $log = $('#event-log')
const log = (message: string): void => {
  $log.prepend(`<li>${message}</li>`)
  const items = $log.children()
  if (items.length > 30) items.slice(30).remove()
}

$('#carousel-autoplay')
  .on('beforeChange', (_e: unknown, _m: unknown, current: number, next: number) =>
    log(`beforeChange ${current} → ${next}`)
  )
  .on('afterChange', (_e: unknown, _m: unknown, current: number) => log(`afterChange ${current}`))
  .on('swipe', (_e: unknown, _m: unknown, direction: string) => log(`swipe ${direction}`))
  .on('edge', (_e: unknown, _m: unknown, direction: string) => log(`edge ${direction}`))

// ---------- API panel ----------------------------------------------------------

let addedCount = 0

const updateCurrent = (_e: unknown, _m: unknown, current: number): void => {
  $('#api-current').text(String(current))
}
$('#carousel-api').on('afterChange init', updateCurrent)

$('#api-prev').on('click', () => mlick('#carousel-api').mlick('mlickPrev'))
$('#api-next').on('click', () => mlick('#carousel-api').mlick('mlickNext'))
$('#api-goto').on('click', () => mlick('#carousel-api').mlick('mlickGoTo', 0))
$('#api-add').on('click', () => {
  addedCount++
  mlick('#carousel-api').mlick(
    'mlickAdd',
    `<div class="slide"><span>${5 + addedCount}</span></div>`
  )
})
$('#api-remove').on('click', () => {
  const count = $('#carousel-api').find('.mlick-slide:not(.mlick-cloned)').length
  if (count > 1) mlick('#carousel-api').mlick('mlickRemove', count - 1)
})
$('#api-unslick').on('click', () => mlick('#carousel-api').mlick('unmlick'))
$('#api-init').on('click', () => mlick('#carousel-api').mlick({ dots: true }))
