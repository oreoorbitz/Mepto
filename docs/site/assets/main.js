/* global $ */

// All interactivity on this page is written with Mepto itself — the docs
// dogfood the library. `$` is the global exposed by assets/meptos.umd.cjs.

$(() => {
  const $window = $(window)
  const $sidebar = $('#sidebar')
  const $backToTop = $('#back-to-top')
  const $links = $sidebar.find('a[href^="#"]')

  // NOTE: read the window scroll position from the root element, not
  // $(window).scrollTop() — this page has elements with id="scrollTop" /
  // id="scrollLeft", which become named window properties and trip the
  // `'scrollTop' in window` check inside Mepto's getter.
  const scrollY = () => $(document.documentElement).scrollTop()

  // Sidebar ids contain `$` (e.g. `#$.ajax`), which is not a valid CSS
  // selector, so resolve targets by id instead of $('' + href).
  const targetFor = link => document.getElementById(link.getAttribute('href').slice(1))

  const setActive = link => {
    $links.removeClass('active')
    $(link).addClass('active')
  }

  // --- mobile sidebar toggle ---
  $('#menu-toggle').on('click', () => {
    $sidebar.toggleClass('open')
  })

  // --- smooth-scroll sidebar anchor clicks ---
  $links.on('click', e => {
    e.preventDefault()
    const link = e.currentTarget
    const target = targetFor(link)
    if (!target) return
    window.scrollTo({ top: $(target).offset().top - 16, behavior: 'smooth' })
    history.replaceState(null, '', link.getAttribute('href'))
    $sidebar.removeClass('open')
    setActive(link)
  })

  // --- scroll-spy (rAF-throttled) ---
  // Heading offsets are cached and re-measured on resize instead of reading
  // layout on every scroll frame.
  let positions = []
  const measure = () => {
    positions = []
    $links.each((_index, link) => {
      const target = targetFor(link)
      if (target) positions.push({ link, top: $(target).offset().top })
    })
    positions.sort((a, b) => a.top - b.top)
  }

  let ticking = false
  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      const y = scrollY() + 80
      let current = null
      for (let i = 0; i < positions.length; i++) {
        if (positions[i].top <= y) current = positions[i]
        else break
      }
      if (current) setActive(current.link)
      $backToTop.toggleClass('visible', scrollY() > 400)
    })
  }

  // --- back to top ---
  $backToTop.on('click', e => {
    e.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    history.replaceState(null, '', '#top')
  })

  measure()
  $window.on('scroll', onScroll)
  // Resize can fire 100s of times during a drag; coalesce to one rAF like scroll (Kimi §5: batch reads, avoid thrash)
  let resizeTicking = false
  $window.on('resize', () => {
    if (resizeTicking) return
    resizeTicking = true
    requestAnimationFrame(() => {
      resizeTicking = false
      measure()
      onScroll()
    })
  })
  onScroll()
})
