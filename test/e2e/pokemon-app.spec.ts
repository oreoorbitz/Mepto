import { test, expect } from '@playwright/test'

/**
 * End-to-end spec for the Mepto Pokémon example app.
 *
 * The app exists to QA `src/ajax.ts`. These tests intercept every PokéAPI call
 * with route fixtures — the real network is never touched. The app fetches the
 * list endpoint on page load, so routes are registered before goto().
 */

const APP = '/examples/pokemon/'

const LIST_FIXTURE = {
  count: 100,
  results: Array.from({ length: 20 }, (_, i) => ({
    name: `poke-${i + 1}`,
    url: `https://pokeapi.co/api/v2/pokemon/${i + 1}/`,
  })),
}

const LIST_PAGE_2 = {
  count: 100,
  results: Array.from({ length: 20 }, (_, i) => ({
    name: `poke-${i + 21}`,
    url: `https://pokeapi.co/api/v2/pokemon/${i + 21}/`,
  })),
}

const PIKACHU = {
  id: 25,
  name: 'pikachu',
  sprites: { front_default: 'https://example.com/pikachu.png' },
  types: [{ type: { name: 'electric' } }],
  stats: [
    { base_stat: 35, stat: { name: 'hp' } },
    { base_stat: 55, stat: { name: 'attack' } },
  ],
}

function teamMember(id: number) {
  return {
    id,
    name: `team-poke-${id}`,
    sprites: { front_default: null },
    types: [{ type: { name: 'normal' } }],
    stats: [],
  }
}

// List endpoint: pathname ends in /pokemon (query string carries limit/offset)
async function mockList(page: import('@playwright/test').Page) {
  await page.route(
    url => url.hostname === 'pokeapi.co' && url.pathname.endsWith('/pokemon'),
    route => {
      const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(offset === 0 ? LIST_FIXTURE : LIST_PAGE_2),
      })
    }
  )
}

// Detail endpoint: /pokemon/<name-or-id>
async function mockDetail(page: import('@playwright/test').Page) {
  await page.route(
    url => url.hostname === 'pokeapi.co' && /\/pokemon\//.test(url.pathname),
    route => {
      const name = route.request().url().split('/pokemon/')[1]
      if (name === 'missingno') {
        route.fulfill({ status: 404, body: 'Not Found' })
      } else if (name === 'pikachu') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PIKACHU),
        })
      } else {
        const id = Number(name)
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(teamMember(Number.isNaN(id) ? 1 : id)),
        })
      }
    }
  )
}

test.beforeEach(async ({ page }) => {
  await mockDetail(page)
  await mockList(page)
  await page.goto(APP)
  // Wait for the initial list fetch to render
  await expect(page.locator('#pokemon-list li')).toHaveCount(20)
})

test.describe('pokemon app — ajax QA', () => {
  test('renders the paginated list on load', async ({ page }) => {
    await expect(page.locator('#pokemon-list .list-item').first()).toHaveText('poke-1')
    await expect(page.locator('#page-info')).toHaveText('1–20 of 100')
    await expect(page.locator('#prev-page')).toBeDisabled()
  })

  test('list fetch serializes limit/offset into the query string', async ({ page }) => {
    const request = page.waitForRequest(
      req => new URL(req.url()).pathname.endsWith('/pokemon') && req.url().includes('offset=20')
    )
    await page.click('#next-page')
    await request
    await expect(page.locator('#pokemon-list .list-item').first()).toHaveText('poke-21')
    await expect(page.locator('#page-info')).toHaveText('21–40 of 100')
    await expect(page.locator('#prev-page')).toBeEnabled()
  })

  test('search renders a pokemon card from JSON', async ({ page }) => {
    await page.fill('#search-input', 'pikachu')
    await page.press('#search-input', 'Enter')
    await expect(page.locator('#pokemon-card')).toBeVisible()
    await expect(page.locator('#card-name')).toHaveText('pikachu')
    await expect(page.locator('#card-id')).toHaveText('#25')
    await expect(page.locator('#card-types .type-badge')).toHaveText('electric')
    await expect(page.locator('#card-stats li').first()).toHaveText('hp: 35')
    await expect(page.locator('#card-sprite')).toHaveAttribute(
      'src',
      'https://example.com/pikachu.png'
    )
  })

  test('clicking a list item fetches that pokemon', async ({ page }) => {
    await page.locator('#pokemon-list .list-item').first().click()
    await expect(page.locator('#pokemon-card')).toBeVisible()
    await expect(page.locator('#card-name')).toHaveText('team-poke-1')
  })

  test('404 from the API shows the error box', async ({ page }) => {
    await page.fill('#search-input', 'missingno')
    await page.press('#search-input', 'Enter')
    await expect(page.locator('#error-box')).toBeVisible()
    await expect(page.locator('#error-message')).toContainText('no Pokémon found')
  })

  test('loading indicator appears during a request and hides after', async ({ page }) => {
    // Delay only the pikachu detail call so we can observe ajaxStart/ajaxStop
    await page.unroute(url => url.hostname === 'pokeapi.co' && /\/pokemon\//.test(url.pathname))
    await page.route(
      url => url.hostname === 'pokeapi.co' && /\/pokemon\//.test(url.pathname),
      async route => {
        await new Promise(r => setTimeout(r, 500))
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PIKACHU),
        })
      }
    )
    await page.fill('#search-input', 'pikachu')
    await page.press('#search-input', 'Enter')
    await expect(page.locator('#loading')).toBeVisible()
    await expect(page.locator('#card-name')).toHaveText('pikachu')
    await expect(page.locator('#loading')).toBeHidden()
    await expect(page.locator('#active-count')).toHaveText('0')
  })

  test('abort button cancels an in-flight request', async ({ page }) => {
    await page.unroute(url => url.hostname === 'pokeapi.co' && /\/pokemon\//.test(url.pathname))
    await page.route(
      url => url.hostname === 'pokeapi.co' && /\/pokemon\//.test(url.pathname),
      async route => {
        await new Promise(r => setTimeout(r, 5000))
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PIKACHU),
        })
      }
    )
    await page.fill('#search-input', 'pikachu')
    await page.press('#search-input', 'Enter')
    await expect(page.locator('#loading')).toBeVisible()
    await page.click('#abort-btn')
    await expect(page.locator('#error-box')).toBeVisible()
    await expect(page.locator('#error-message')).toHaveText('Request aborted.')
    await expect(page.locator('#pokemon-card')).toBeHidden()
  })

  test('random team fires 6 concurrent requests', async ({ page }) => {
    await page.click('#random-team')
    await expect(page.locator('#team-list .team-member')).toHaveCount(6)
    await expect(page.locator('#active-count')).toHaveText('0')
  })
})
