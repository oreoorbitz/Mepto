/*
 * mlick — a carousel plugin for Mepto
 *
 * Ported from slick 1.8.1 by Ken Wheeler (MIT license)
 *   Website: http://kenwheeler.github.io
 *   Docs:    http://kenwheeler.github.io/slick
 *   Repo:    http://github.com/kenwheeler/slick
 *
 * Differences from upstream slick:
 *   - runs on Mepto instead of jQuery
 *   - distributed as an ES module; registers $.fn.mlick
 *   - all classes, namespaces, ids and commands renamed slick-* -> mlick-*
 *   - evergreen browsers only (no vendor-prefixed visibility API)
 */
import $ from '../src/meptos'
;(function ($) {
  'use strict'
  let Mlick = window.Mlick || {}

  Mlick = (function () {
    let instanceUid = 0

    function Mlick(element, settings) {
      const _ = this
      let dataSettings

      _.defaults = {
        accessibility: true,
        adaptiveHeight: false,
        appendArrows: $(element),
        appendDots: $(element),
        arrows: true,
        asNavFor: null,
        prevArrow:
          '<button class="mlick-prev" aria-label="Previous" type="button">Previous</button>',
        nextArrow: '<button class="mlick-next" aria-label="Next" type="button">Next</button>',
        autoplay: false,
        autoplaySpeed: 3000,
        centerMode: false,
        centerPadding: '50px',
        cssEase: 'ease',
        customPaging: function (slider, i) {
          return $('<button type="button"></button>').text(i + 1)
        },
        dots: false,
        dotsClass: 'mlick-dots',
        draggable: true,
        easing: 'linear',
        edgeFriction: 0.35,
        fade: false,
        focusOnSelect: false,
        focusOnChange: false,
        infinite: true,
        initialSlide: 0,
        lazyLoad: 'ondemand',
        mobileFirst: false,
        pauseOnHover: true,
        pauseOnFocus: true,
        pauseOnDotsHover: false,
        respondTo: 'window',
        responsive: null,
        rows: 1,
        rtl: false,
        slide: '',
        slidesPerRow: 1,
        slidesToShow: 1,
        slidesToScroll: 1,
        speed: 500,
        swipe: true,
        swipeToSlide: false,
        touchMove: true,
        touchThreshold: 5,
        useCSS: true,
        useTransform: true,
        variableWidth: false,
        vertical: false,
        verticalSwiping: false,
        waitForAnimate: true,
        zIndex: 1000,
      }

      _.initials = {
        animating: false,
        dragging: false,
        autoPlayTimer: null,
        currentDirection: 0,
        currentLeft: null,
        currentSlide: 0,
        direction: 1,
        $dots: null,
        listWidth: null,
        listHeight: null,
        loadIndex: 0,
        $nextArrow: null,
        $prevArrow: null,
        scrolling: false,
        slideCount: null,
        slideWidth: null,
        $slideTrack: null,
        $slides: null,
        sliding: false,
        slideOffset: 0,
        swipeLeft: null,
        swiping: false,
        $list: null,
        touchObject: {},
        transformsEnabled: false,
        unmlicked: false,
      }

      $.extend(_, _.initials)

      _.activeBreakpoint = null
      _.animType = null
      _.animProp = null
      _.breakpoints = []
      _.breakpointSettings = []
      _.cssTransitions = false
      _.focussed = false
      _.interrupted = false
      _.hidden = 'hidden'
      _.paused = true
      _.positionProp = null
      _.respondTo = null
      _.rowCount = 1
      _.shouldClick = true
      _.$slider = $(element)
      _.$slidesCache = null
      _.transformType = null
      _.transitionType = null
      _.visibilityChange = 'visibilitychange'
      _.windowWidth = 0
      _.windowTimer = null

      dataSettings = $(element).data('mlick') || {}

      _.options = $.extend({}, _.defaults, settings, dataSettings)

      _.currentSlide = _.options.initialSlide

      _.originalSettings = _.options

      _.autoPlay = _.autoPlay.bind(_)
      _.autoPlayClear = _.autoPlayClear.bind(_)
      _.autoPlayIterator = _.autoPlayIterator.bind(_)
      _.changeSlide = _.changeSlide.bind(_)
      _.clickHandler = _.clickHandler.bind(_)
      _.selectHandler = _.selectHandler.bind(_)
      _.setPosition = _.setPosition.bind(_)
      _.swipeHandler = _.swipeHandler.bind(_)
      _.keyHandler = _.keyHandler.bind(_)

      _.instanceUid = instanceUid++

      // A simple way to check for HTML strings
      // Strict HTML recognition (must start with <)
      // Extracted from jQuery v1.11 source
      _.htmlExpr = /^(?:\s*(<[\w\W]+>)[^>]*)$/

      _.registerBreakpoints()
      _.init(true)
    }

    return Mlick
  })()

  Mlick.prototype.activateADA = function () {
    const _ = this

    _.$slideTrack
      .find('.mlick-active')
      .attrs.set({
        'aria-hidden': 'false',
        tabindex: '0',
      })
      .find('a, input, button, select')
      .attrs.set({
        tabindex: '0',
      })
  }

  Mlick.prototype.addSlide = Mlick.prototype.mlickAdd = function (markup, index, addBefore) {
    const _ = this

    if (typeof index === 'boolean') {
      addBefore = index
      index = null
    } else if (index < 0 || index >= _.slideCount) {
      return false
    }

    _.unload()

    if (typeof index === 'number') {
      if (index === 0 && _.$slides.length === 0) {
        $(markup).appendTo(_.$slideTrack)
      } else if (addBefore) {
        $(markup).insertBefore(_.$slides.eq(index))
      } else {
        $(markup).insertAfter(_.$slides.eq(index))
      }
    } else {
      if (addBefore === true) {
        $(markup).prependTo(_.$slideTrack)
      } else {
        $(markup).appendTo(_.$slideTrack)
      }
    }

    _.$slides = _.$slideTrack.children(this.options.slide)

    _.$slideTrack.children(this.options.slide).detach()

    _.$slideTrack.append(_.$slides)

    _.$slides.each((index, element) => {
      element.dataset.mlickIndex = index
    })

    _.$slidesCache = _.$slides

    _.reinit()
  }

  Mlick.prototype.animateHeight = function () {
    const _ = this
    if (
      _.options.slidesToShow === 1 &&
      _.options.adaptiveHeight === true &&
      _.options.vertical === false
    ) {
      const targetHeight = _.$slides.eq(_.currentSlide).outerHeight(true)
      _.$list.animate(
        {
          height: targetHeight,
        },
        _.options.speed
      )
    }
  }

  Mlick.prototype.animateSlide = function (targetLeft, callback) {
    const animProps = {}
    const _ = this

    _.animateHeight()

    if (_.options.rtl === true && _.options.vertical === false) {
      targetLeft = -targetLeft
    }
    if (_.transformsEnabled === false) {
      if (_.options.vertical === false) {
        _.$slideTrack.animate(
          {
            left: targetLeft,
          },
          _.options.speed,
          _.options.easing,
          callback
        )
      } else {
        _.$slideTrack.animate(
          {
            top: targetLeft,
          },
          _.options.speed,
          _.options.easing,
          callback
        )
      }
    } else {
      if (_.cssTransitions === false) {
        if (_.options.rtl === true) {
          _.currentLeft = -_.currentLeft
        }
        $({
          animStart: _.currentLeft,
        }).animate(
          {
            animStart: targetLeft,
          },
          {
            duration: _.options.speed,
            easing: _.options.easing,
            step: function (now) {
              now = Math.ceil(now)
              if (_.options.vertical === false) {
                animProps[_.animType] = `translate(${now}px, 0)`
                _.$slideTrack.css(animProps)
              } else {
                animProps[_.animType] = `translate(0, ${now}px)`
                _.$slideTrack.css(animProps)
              }
            },
            complete: function () {
              if (callback) {
                callback.call()
              }
            },
          }
        )
      } else {
        _.applyTransition()
        targetLeft = Math.ceil(targetLeft)

        if (_.options.vertical === false) {
          animProps[_.animType] = `translate3d(${targetLeft}px, 0, 0)`
        } else {
          animProps[_.animType] = `translate3d(0, ${targetLeft}px, 0)`
        }
        _.$slideTrack.css(animProps)

        if (callback) {
          setTimeout(() => {
            _.disableTransition()

            callback.call()
          }, _.options.speed)
        }
      }
    }
  }

  Mlick.prototype.getNavTarget = function () {
    const _ = this
    let asNavFor = _.options.asNavFor

    if (asNavFor && asNavFor !== null) {
      asNavFor = $(asNavFor).not(_.$slider)
    }

    return asNavFor
  }

  Mlick.prototype.asNavFor = function (index) {
    const _ = this
    const asNavFor = _.getNavTarget()

    if (asNavFor !== null && typeof asNavFor === 'object') {
      asNavFor.each(function () {
        const target = $(this).mlick('getMlick')
        if (!target.unmlicked) {
          target.slideHandler(index, true)
        }
      })
    }
  }

  Mlick.prototype.applyTransition = function (slide) {
    const _ = this
    const transition = {}

    if (_.options.fade === false) {
      transition[_.transitionType] = `${_.transformType} ${_.options.speed}ms ${_.options.cssEase}`
    } else {
      transition[_.transitionType] = `opacity ${_.options.speed}ms ${_.options.cssEase}`
    }

    if (_.options.fade === false) {
      _.$slideTrack.css(transition)
    } else {
      _.$slides.eq(slide).css(transition)
    }
  }

  Mlick.prototype.autoPlay = function () {
    const _ = this

    _.autoPlayClear()

    if (_.slideCount > _.options.slidesToShow) {
      _.autoPlayTimer = setInterval(_.autoPlayIterator, _.options.autoplaySpeed)
    }
  }

  Mlick.prototype.autoPlayClear = function () {
    const _ = this

    if (_.autoPlayTimer) {
      clearInterval(_.autoPlayTimer)
    }
  }

  Mlick.prototype.autoPlayIterator = function () {
    const _ = this
    let slideTo = _.currentSlide + _.options.slidesToScroll

    if (!_.paused && !_.interrupted && !_.focussed) {
      if (_.options.infinite === false) {
        if (_.direction === 1 && _.currentSlide + 1 === _.slideCount - 1) {
          _.direction = 0
        } else if (_.direction === 0) {
          slideTo = _.currentSlide - _.options.slidesToScroll

          if (_.currentSlide - 1 === 0) {
            _.direction = 1
          }
        }
      }

      _.slideHandler(slideTo)
    }
  }

  Mlick.prototype.buildArrows = function () {
    const _ = this

    if (_.options.arrows === true) {
      _.$prevArrow = $(_.options.prevArrow).classList.add('mlick-arrow')
      _.$nextArrow = $(_.options.nextArrow).classList.add('mlick-arrow')

      if (_.slideCount > _.options.slidesToShow) {
        _.$prevArrow.classList.remove('mlick-hidden').attrs.remove('aria-hidden tabindex')
        _.$nextArrow.classList.remove('mlick-hidden').attrs.remove('aria-hidden tabindex')

        if (_.htmlExpr.test(_.options.prevArrow)) {
          _.$prevArrow.prependTo(_.options.appendArrows)
        }

        if (_.htmlExpr.test(_.options.nextArrow)) {
          _.$nextArrow.appendTo(_.options.appendArrows)
        }

        if (_.options.infinite !== true) {
          _.$prevArrow.classList.add('mlick-disabled').attrs.set('aria-disabled', 'true')
        }
      } else {
        _.$prevArrow
          .add(_.$nextArrow)

          .classList.add('mlick-hidden')
          .attrs.set({
            'aria-disabled': 'true',
            tabindex: '-1',
          })
      }
    }
  }

  Mlick.prototype.buildDots = function () {
    const _ = this
    let i
    let dot

    if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {
      _.$slider.classList.add('mlick-dotted')

      dot = $('<ul></ul>').classList.add(_.options.dotsClass)

      for (i = 0; i <= _.getDotCount(); i += 1) {
        dot.append($('<li></li>').append(_.options.customPaging.call(this, _, i)))
      }

      _.$dots = dot.appendTo(_.options.appendDots)

      _.$dots.find('li').first().classList.add('mlick-active')
    }
  }

  Mlick.prototype.buildOut = function () {
    const _ = this

    _.$slides = _.$slider
      .children(`${_.options.slide}:not(.mlick-cloned)`)
      .classList.add('mlick-slide')

    _.slideCount = _.$slides.length

    _.$slides.each((index, element) => {
      element.dataset.mlickIndex = index
      $(element).data('originalStyling', element.getAttribute('style') || '')
    })

    _.$slider.classList.add('mlick-slider')

    _.$slideTrack =
      _.slideCount === 0
        ? $('<div class="mlick-track"></div>').appendTo(_.$slider)
        : _.$slides.wrapAll('<div class="mlick-track"></div>').parent()

    _.$list = _.$slideTrack.wrap('<div class="mlick-list"></div>').parent()
    _.$slideTrack.css('opacity', 0)

    if (_.options.centerMode === true || _.options.swipeToSlide === true) {
      _.options.slidesToScroll = 1
    }

    $('img[data-lazy]', _.$slider).not('[src]').classList.add('mlick-loading')

    _.setupInfinite()

    _.buildArrows()

    _.buildDots()

    _.updateDots()

    _.setSlideClasses(typeof _.currentSlide === 'number' ? _.currentSlide : 0)

    if (_.options.draggable === true) {
      _.$list.classList.add('draggable')
    }
  }

  Mlick.prototype.buildRows = function () {
    const _ = this
    let a
    let b
    let c
    let leafSlides
    let newSlides
    let numOfSlides
    let originalSlides
    let slidesPerSection

    newSlides = document.createDocumentFragment()
    originalSlides = _.$slider.children()
    leafSlides = []

    if (_.options.rows > 0) {
      slidesPerSection = _.options.slidesPerRow * _.options.rows
      numOfSlides = Math.ceil(originalSlides.length / slidesPerSection)

      for (a = 0; a < numOfSlides; a++) {
        const slide = document.createElement('div')
        for (b = 0; b < _.options.rows; b++) {
          const row = document.createElement('div')
          for (c = 0; c < _.options.slidesPerRow; c++) {
            const target = a * slidesPerSection + (b * _.options.slidesPerRow + c)
            const leaf = originalSlides.get(target)
            if (leaf) {
              row.appendChild(leaf)
              leafSlides.push(leaf)
            }
          }
          slide.appendChild(row)
        }
        newSlides.appendChild(slide)
      }

      _.$slider.empty().append(newSlides)
      $(leafSlides).css({
        width: `${100 / _.options.slidesPerRow}%`,
        display: 'inline-block',
      })
    }
  }

  Mlick.prototype.checkResponsive = function (initial, forceUpdate) {
    const _ = this
    const sliderWidth = _.$slider.width()
    const windowWidth = window.innerWidth || $(window).width()

    const respondToWidth = {
      window: () => windowWidth,
      slider: () => sliderWidth,
      min: () => Math.min(windowWidth, sliderWidth),
    }[_.respondTo]?.()

    if (!_.options.responsive || !_.options.responsive.length || _.options.responsive === null) {
      return
    }

    // The smallest/largest matching breakpoint wins; iteration keeps the last
    // match, mirroring the original for...in accumulation.
    const mobileFirst = _.originalSettings.mobileFirst
    const matches = bp => (mobileFirst === false ? respondToWidth < bp : respondToWidth > bp)
    let targetBreakpoint = null
    for (const bp of Object.values(_.breakpoints)) {
      if (matches(bp)) {
        targetBreakpoint = bp
      }
    }

    // Applies the breakpoint's settings (or tears the carousel down for the
    // 'unmlick' sentinel) and refreshes.
    const applySettings = bp => {
      _.activeBreakpoint = bp
      if (_.breakpointSettings[bp] === 'unmlick') {
        _.unmlick(bp)
        return
      }
      _.options = $.extend({}, _.originalSettings, _.breakpointSettings[bp])
      if (initial === true) {
        _.currentSlide = _.options.initialSlide
      }
      _.refresh(initial)
    }

    let triggerBreakpoint = false

    if (targetBreakpoint !== null) {
      // Activate on a changed breakpoint, or re-apply when forced.
      if (targetBreakpoint !== _.activeBreakpoint || forceUpdate) {
        applySettings(targetBreakpoint)
        triggerBreakpoint = targetBreakpoint
      }
    } else if (_.activeBreakpoint !== null) {
      // No matching breakpoint: restore the original settings.
      _.activeBreakpoint = null
      _.options = _.originalSettings
      if (initial === true) {
        _.currentSlide = _.options.initialSlide
      }
      _.refresh(initial)
      triggerBreakpoint = targetBreakpoint
    }

    // only trigger breakpoints during an actual break. not on initialize.
    if (!initial && triggerBreakpoint !== false) {
      _.$slider.trigger('breakpoint', [_, triggerBreakpoint])
    }
  }

  Mlick.prototype.changeSlide = function (event, dontAnimate) {
    const _ = this
    let $target = $(event.currentTarget)
    let indexOffset
    let slideOffset
    let unevenOffset

    // If target is a link, prevent default action.
    if ($target.is('a')) {
      event.preventDefault()
    }

    // If target is not the <li> element (ie: a child), find the <li>.
    if (!$target.is('li')) {
      $target = $target.closest('li')
    }

    unevenOffset = _.slideCount % _.options.slidesToScroll !== 0
    indexOffset = unevenOffset ? 0 : (_.slideCount - _.currentSlide) % _.options.slidesToScroll

    switch (event.data.message) {
      case 'previous':
        slideOffset =
          indexOffset === 0 ? _.options.slidesToScroll : _.options.slidesToShow - indexOffset
        if (_.slideCount > _.options.slidesToShow) {
          _.slideHandler(_.currentSlide - slideOffset, false, dontAnimate)
        }
        break

      case 'next':
        slideOffset = indexOffset === 0 ? _.options.slidesToScroll : indexOffset
        if (_.slideCount > _.options.slidesToShow) {
          _.slideHandler(_.currentSlide + slideOffset, false, dontAnimate)
        }
        break

      case 'index': {
        const index =
          event.data.index === 0
            ? 0
            : event.data.index || $target.index() * _.options.slidesToScroll

        _.slideHandler(_.checkNavigable(index), false, dontAnimate)
        $target.children().trigger('focus')
        break
      }

      default:
        return
    }
  }

  Mlick.prototype.checkNavigable = function (index) {
    const _ = this
    let navigables
    let prevNavigable

    navigables = _.getNavigableIndexes()
    prevNavigable = 0
    if (index > navigables[navigables.length - 1]) {
      index = navigables[navigables.length - 1]
    } else {
      for (const n in navigables) {
        if (index < navigables[n]) {
          index = prevNavigable
          break
        }
        prevNavigable = navigables[n]
      }
    }

    return index
  }

  Mlick.prototype.cleanUpEvents = function () {
    const _ = this

    if (_.options.dots && _.$dots !== null) {
      $('li', _.$dots)
        .off('click.mlick', _.changeSlide)
        .off('mouseenter.mlick', _.interrupt.bind(_, true))
        .off('mouseleave.mlick', _.interrupt.bind(_, false))

      if (_.options.accessibility === true) {
        _.$dots.off('keydown.mlick', _.keyHandler)
      }
    }

    _.$slider.off('focus.mlick blur.mlick')

    if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {
      _.$prevArrow && _.$prevArrow.off('click.mlick', _.changeSlide)
      _.$nextArrow && _.$nextArrow.off('click.mlick', _.changeSlide)

      if (_.options.accessibility === true) {
        _.$prevArrow && _.$prevArrow.off('keydown.mlick', _.keyHandler)
        _.$nextArrow && _.$nextArrow.off('keydown.mlick', _.keyHandler)
      }
    }

    _.$list.off('touchstart.mlick mousedown.mlick', _.swipeHandler)
    _.$list.off('touchmove.mlick mousemove.mlick', _.swipeHandler)
    _.$list.off('touchend.mlick mouseup.mlick', _.swipeHandler)
    _.$list.off('touchcancel.mlick mouseleave.mlick', _.swipeHandler)

    _.$list.off('click.mlick', _.clickHandler)

    $(document).off(_.visibilityChange, _.visibility)

    _.cleanUpSlideEvents()

    if (_.options.accessibility === true) {
      _.$list.off('keydown.mlick', _.keyHandler)
    }

    if (_.options.focusOnSelect === true) {
      $(_.$slideTrack).children().off('click.mlick', _.selectHandler)
    }

    $(window).off(`orientationchange.mlick.mlick-${_.instanceUid}`, _.orientationChange)

    $(window).off(`resize.mlick.mlick-${_.instanceUid}`, _.resize)

    $(":not([draggable='true'])", _.$slideTrack).off('dragstart', _.preventDefault)

    $(window).off(`load.mlick.mlick-${_.instanceUid}`, _.setPosition)
  }

  Mlick.prototype.cleanUpSlideEvents = function () {
    const _ = this

    _.$list.off('mouseenter.mlick', _.interrupt.bind(_, true))
    _.$list.off('mouseleave.mlick', _.interrupt.bind(_, false))
  }

  Mlick.prototype.cleanUpRows = function () {
    const _ = this
    let originalSlides

    if (_.options.rows > 0) {
      originalSlides = _.$slides.children().children()
      originalSlides.attrs.remove('style')
      _.$slider.empty().append(originalSlides)
    }
  }

  Mlick.prototype.clickHandler = function (event) {
    const _ = this

    if (_.shouldClick === false) {
      event.stopImmediatePropagation()
      event.stopPropagation()
      event.preventDefault()
    }
  }

  Mlick.prototype.destroy = function (refresh) {
    const _ = this

    _.autoPlayClear()

    _.touchObject = {}

    _.cleanUpEvents()

    $('.mlick-cloned', _.$slider).detach()

    if (_.$dots) {
      _.$dots.remove()
    }

    if (_.$prevArrow && _.$prevArrow.length) {
      _.$prevArrow.classList
        .remove('mlick-disabled mlick-arrow mlick-hidden')
        .attrs.remove('aria-hidden aria-disabled tabindex')
        .css('display', '')

      if (_.htmlExpr.test(_.options.prevArrow)) {
        _.$prevArrow.remove()
      }
    }

    if (_.$nextArrow && _.$nextArrow.length) {
      _.$nextArrow.classList
        .remove('mlick-disabled mlick-arrow mlick-hidden')
        .attrs.remove('aria-hidden aria-disabled tabindex')
        .css('display', '')

      if (_.htmlExpr.test(_.options.nextArrow)) {
        _.$nextArrow.remove()
      }
    }

    if (_.$slides) {
      _.$slides.classList
        .remove('mlick-slide mlick-active mlick-center mlick-visible mlick-current')
        .attrs.remove('aria-hidden')
        .attrs.remove('data-mlick-index')
        .each(function () {
          this.setAttribute('style', $(this).data('originalStyling'))
        })

      _.$slideTrack.children(this.options.slide).detach()

      _.$slideTrack.detach()

      _.$list.detach()

      _.$slider.append(_.$slides)
    }

    _.cleanUpRows()

    _.$slider.classList.remove('mlick-slider')
    _.$slider.classList.remove('mlick-initialized')
    _.$slider.classList.remove('mlick-dotted')

    _.unmlicked = true

    if (!refresh) {
      _.$slider.trigger('destroy', [_])
    }
  }

  Mlick.prototype.disableTransition = function (slide) {
    const _ = this
    const transition = {}

    transition[_.transitionType] = ''

    if (_.options.fade === false) {
      _.$slideTrack.css(transition)
    } else {
      _.$slides.eq(slide).css(transition)
    }
  }

  Mlick.prototype.fadeSlide = function (slideIndex, callback) {
    const _ = this

    if (_.cssTransitions === false) {
      _.$slides.eq(slideIndex).css({
        zIndex: _.options.zIndex,
      })

      _.$slides.eq(slideIndex).animate(
        {
          opacity: 1,
        },
        _.options.speed,
        _.options.easing,
        callback
      )
    } else {
      _.applyTransition(slideIndex)

      _.$slides.eq(slideIndex).css({
        opacity: 1,
        zIndex: _.options.zIndex,
      })

      if (callback) {
        setTimeout(() => {
          _.disableTransition(slideIndex)

          callback.call()
        }, _.options.speed)
      }
    }
  }

  Mlick.prototype.fadeSlideOut = function (slideIndex) {
    const _ = this

    if (_.cssTransitions === false) {
      _.$slides.eq(slideIndex).animate(
        {
          opacity: 0,
          zIndex: _.options.zIndex - 2,
        },
        _.options.speed,
        _.options.easing
      )
    } else {
      _.applyTransition(slideIndex)

      _.$slides.eq(slideIndex).css({
        opacity: 0,
        zIndex: _.options.zIndex - 2,
      })
    }
  }

  Mlick.prototype.filterSlides = Mlick.prototype.mlickFilter = function (filter) {
    const _ = this

    if (filter !== null) {
      _.$slidesCache = _.$slides

      _.unload()

      _.$slideTrack.children(this.options.slide).detach()

      _.$slidesCache.filter(filter).appendTo(_.$slideTrack)

      _.reinit()
    }
  }

  Mlick.prototype.focusHandler = function () {
    const _ = this

    // If any child element receives focus within the slider we need to pause the autoplay
    _.$slider
      .off('focus.mlick blur.mlick')
      .on('focus.mlick', '*', function (event) {
        const $sf = $(this)

        setTimeout(() => {
          if (_.options.pauseOnFocus) {
            if ($sf.is(':focus')) {
              _.focussed = true
              _.autoPlay()
            }
          }
        }, 0)
      })
      .on('blur.mlick', '*', function (event) {
        const $sf = $(this)

        // When a blur occurs on any elements within the slider we become unfocused
        if (_.options.pauseOnFocus) {
          _.focussed = false
          _.autoPlay()
        }
      })
  }

  Mlick.prototype.getCurrent = Mlick.prototype.mlickCurrentSlide = function () {
    const _ = this
    return _.currentSlide
  }

  Mlick.prototype.getDotCount = function () {
    const _ = this

    let breakPoint = 0
    let counter = 0
    let pagerQty = 0

    if (_.options.infinite === true) {
      if (_.slideCount <= _.options.slidesToShow) {
        ++pagerQty
      } else {
        while (breakPoint < _.slideCount) {
          ++pagerQty
          breakPoint = counter + _.options.slidesToScroll
          counter +=
            _.options.slidesToScroll <= _.options.slidesToShow
              ? _.options.slidesToScroll
              : _.options.slidesToShow
        }
      }
    } else if (_.options.centerMode === true) {
      pagerQty = _.slideCount
    } else if (!_.options.asNavFor) {
      pagerQty = 1 + Math.ceil((_.slideCount - _.options.slidesToShow) / _.options.slidesToScroll)
    } else {
      while (breakPoint < _.slideCount) {
        ++pagerQty
        breakPoint = counter + _.options.slidesToScroll
        counter +=
          _.options.slidesToScroll <= _.options.slidesToShow
            ? _.options.slidesToScroll
            : _.options.slidesToShow
      }
    }

    return pagerQty - 1
  }

  Mlick.prototype.getLeft = function (slideIndex) {
    const _ = this
    let targetLeft
    let verticalHeight = 0
    let verticalOffset = 0
    let targetSlide
    let coef

    _.slideOffset = 0
    // perf: only read slide outerHeight (a forced layout) when the vertical
    // math actually consumes it. In horizontal mode `verticalHeight` never
    // feeds the returned value, so the read was pure layout thrash — and
    // getLeft runs on every swipe move and animation frame.
    if (_.options.vertical === true) {
      verticalHeight = _.$slides.first().outerHeight(true)
    }

    if (_.options.infinite === true) {
      if (_.slideCount > _.options.slidesToShow) {
        _.slideOffset = _.slideWidth * _.options.slidesToShow * -1
        coef = -1

        if (_.options.vertical === true && _.options.centerMode === true) {
          if (_.options.slidesToShow === 2) {
            coef = -1.5
          } else if (_.options.slidesToShow === 1) {
            coef = -2
          }
        }
        verticalOffset = verticalHeight * _.options.slidesToShow * coef
      }
      if (_.slideCount % _.options.slidesToScroll !== 0) {
        if (
          slideIndex + _.options.slidesToScroll > _.slideCount &&
          _.slideCount > _.options.slidesToShow
        ) {
          if (slideIndex > _.slideCount) {
            _.slideOffset =
              (_.options.slidesToShow - (slideIndex - _.slideCount)) * _.slideWidth * -1
            verticalOffset =
              (_.options.slidesToShow - (slideIndex - _.slideCount)) * verticalHeight * -1
          } else {
            _.slideOffset = (_.slideCount % _.options.slidesToScroll) * _.slideWidth * -1
            verticalOffset = (_.slideCount % _.options.slidesToScroll) * verticalHeight * -1
          }
        }
      }
    } else {
      if (slideIndex + _.options.slidesToShow > _.slideCount) {
        _.slideOffset = (slideIndex + _.options.slidesToShow - _.slideCount) * _.slideWidth
        verticalOffset = (slideIndex + _.options.slidesToShow - _.slideCount) * verticalHeight
      }
    }

    if (_.slideCount <= _.options.slidesToShow) {
      _.slideOffset = 0
      verticalOffset = 0
    }

    if (_.options.centerMode === true && _.slideCount <= _.options.slidesToShow) {
      _.slideOffset =
        (_.slideWidth * Math.floor(_.options.slidesToShow)) / 2 - (_.slideWidth * _.slideCount) / 2
    } else if (_.options.centerMode === true && _.options.infinite === true) {
      _.slideOffset += _.slideWidth * Math.floor(_.options.slidesToShow / 2) - _.slideWidth
    } else if (_.options.centerMode === true) {
      _.slideOffset = 0
      _.slideOffset += _.slideWidth * Math.floor(_.options.slidesToShow / 2)
    }

    if (_.options.vertical === false) {
      targetLeft = slideIndex * _.slideWidth * -1 + _.slideOffset
    } else {
      targetLeft = slideIndex * verticalHeight * -1 + verticalOffset
    }

    if (_.options.variableWidth === true) {
      if (_.slideCount <= _.options.slidesToShow || _.options.infinite === false) {
        targetSlide = _.$slideTrack.children('.mlick-slide').eq(slideIndex)
      } else {
        targetSlide = _.$slideTrack.children('.mlick-slide').eq(slideIndex + _.options.slidesToShow)
      }

      if (_.options.rtl === true) {
        if (targetSlide[0]) {
          targetLeft =
            (_.$slideTrack.width() - targetSlide[0].offsetLeft - targetSlide.width()) * -1
        } else {
          targetLeft = 0
        }
      } else {
        targetLeft = targetSlide[0] ? targetSlide[0].offsetLeft * -1 : 0
      }

      if (_.options.centerMode === true) {
        if (_.slideCount <= _.options.slidesToShow || _.options.infinite === false) {
          targetSlide = _.$slideTrack.children('.mlick-slide').eq(slideIndex)
        } else {
          targetSlide = _.$slideTrack
            .children('.mlick-slide')
            .eq(slideIndex + _.options.slidesToShow + 1)
        }

        if (_.options.rtl === true) {
          if (targetSlide[0]) {
            targetLeft =
              (_.$slideTrack.width() - targetSlide[0].offsetLeft - targetSlide.width()) * -1
          } else {
            targetLeft = 0
          }
        } else {
          targetLeft = targetSlide[0] ? targetSlide[0].offsetLeft * -1 : 0
        }

        targetLeft += (_.$list.width() - targetSlide.outerWidth()) / 2
      }
    }

    return targetLeft
  }

  Mlick.prototype.getOption = Mlick.prototype.mlickGetOption = function (option) {
    const _ = this

    return _.options[option]
  }

  Mlick.prototype.getNavigableIndexes = function () {
    const _ = this
    let breakPoint = 0
    let counter = 0
    const indexes = []
    let max

    if (_.options.infinite === false) {
      max = _.slideCount
    } else {
      breakPoint = _.options.slidesToScroll * -1
      counter = _.options.slidesToScroll * -1
      max = _.slideCount * 2
    }

    while (breakPoint < max) {
      indexes.push(breakPoint)
      breakPoint = counter + _.options.slidesToScroll
      counter +=
        _.options.slidesToScroll <= _.options.slidesToShow
          ? _.options.slidesToScroll
          : _.options.slidesToShow
    }

    return indexes
  }

  Mlick.prototype.getMlick = function () {
    return this
  }

  Mlick.prototype.getSlideCount = function () {
    const _ = this
    let slidesTraversed
    let swipedSlide
    let swipeTarget
    let centerOffset

    centerOffset = _.options.centerMode === true ? Math.floor(_.$list.width() / 2) : 0
    swipeTarget = _.swipeLeft * -1 + centerOffset

    if (_.options.swipeToSlide === true) {
      _.$slideTrack.find('.mlick-slide').each((index, slide) => {
        let slideOuterWidth
        let slideOffset
        let slideRightBoundary
        slideOuterWidth = $(slide).outerWidth()
        slideOffset = slide.offsetLeft
        if (_.options.centerMode !== true) {
          slideOffset += slideOuterWidth / 2
        }

        slideRightBoundary = slideOffset + slideOuterWidth

        if (swipeTarget < slideRightBoundary) {
          swipedSlide = slide
          return false
        }
      })

      slidesTraversed = Math.abs(swipedSlide.dataset.mlickIndex - _.currentSlide) || 1

      return slidesTraversed
    } else {
      return _.options.slidesToScroll
    }
  }

  Mlick.prototype.goTo = Mlick.prototype.mlickGoTo = function (slide, dontAnimate) {
    const _ = this

    _.changeSlide(
      {
        data: {
          message: 'index',
          index: parseInt(slide),
        },
      },
      dontAnimate
    )
  }

  Mlick.prototype.init = function (creation) {
    const _ = this

    if (!_.$slider.classList.contains('mlick-initialized')) {
      _.$slider.classList.add('mlick-initialized')

      _.buildRows()
      _.buildOut()
      _.setProps()
      _.startLoad()
      _.loadSlider()
      _.initializeEvents()
      _.updateArrows()
      _.updateDots()
      _.checkResponsive(true)
      _.focusHandler()
    }

    if (creation) {
      _.$slider.trigger('init', [_])
    }

    if (_.options.accessibility === true) {
      _.initADA()
    }

    if (_.options.autoplay) {
      _.paused = false
      _.autoPlay()
    }
  }

  Mlick.prototype.initADA = function () {
    const _ = this
    const numDotGroups = Math.ceil(_.slideCount / _.options.slidesToScroll)
    const tabControlIndexes = _.getNavigableIndexes().filter(val => {
      return val >= 0 && val < _.slideCount
    })

    _.$slides
      .add(_.$slideTrack.find('.mlick-cloned'))
      .attrs.set({
        'aria-hidden': 'true',
        tabindex: '-1',
      })
      .find('a, input, button, select')
      .attrs.set({
        tabindex: '-1',
      })

    if (_.$dots !== null) {
      _.$slides.not(_.$slideTrack.find('.mlick-cloned')).each(function (i) {
        const slideControlIndex = tabControlIndexes.indexOf(i)

        $(this).attrs.set({
          role: 'tabpanel',
          id: `mlick-slide${_.instanceUid}${i}`,
          tabindex: -1,
        })

        if (slideControlIndex !== -1) {
          const ariaButtonControl = `mlick-slide-control${_.instanceUid}${slideControlIndex}`
          if ($(`#${ariaButtonControl}`).length) {
            $(this).attrs.set({
              'aria-describedby': ariaButtonControl,
            })
          }
        }
      })

      _.$dots.attrs
        .set('role', 'tablist')
        .find('li')
        .each(function (i) {
          const mappedSlideIndex = tabControlIndexes[i]

          $(this).attrs.set({
            role: 'presentation',
          })

          $(this)
            .find('button')
            .first()
            .attrs.set({
              role: 'tab',
              id: `mlick-slide-control${_.instanceUid}${i}`,
              'aria-controls': `mlick-slide${_.instanceUid}${mappedSlideIndex}`,
              'aria-label': `${i + 1} / ${numDotGroups}`,
              'aria-selected': null,
              tabindex: '-1',
            })
        })
        .eq(_.currentSlide)
        .find('button')
        .attrs.set({
          'aria-selected': 'true',
          tabindex: '0',
        })
    }

    for (let i = _.currentSlide, max = i + _.options.slidesToShow; i < max; i++) {
      if (_.options.focusOnChange) {
        _.$slides.eq(i).attrs.set({ tabindex: '0' })
      } else {
        _.$slides.eq(i).attrs.remove('tabindex')
      }
    }

    _.activateADA()
  }

  Mlick.prototype.initArrowEvents = function () {
    const _ = this

    if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {
      _.$prevArrow.off('click.mlick').on(
        'click.mlick',
        {
          message: 'previous',
        },
        _.changeSlide
      )
      _.$nextArrow.off('click.mlick').on(
        'click.mlick',
        {
          message: 'next',
        },
        _.changeSlide
      )

      if (_.options.accessibility === true) {
        _.$prevArrow.on('keydown.mlick', _.keyHandler)
        _.$nextArrow.on('keydown.mlick', _.keyHandler)
      }
    }
  }

  Mlick.prototype.initDotEvents = function () {
    const _ = this

    if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {
      $('li', _.$dots).on(
        'click.mlick',
        {
          message: 'index',
        },
        _.changeSlide
      )

      if (_.options.accessibility === true) {
        _.$dots.on('keydown.mlick', _.keyHandler)
      }
    }

    if (
      _.options.dots === true &&
      _.options.pauseOnDotsHover === true &&
      _.slideCount > _.options.slidesToShow
    ) {
      $('li', _.$dots)
        .on('mouseenter.mlick', _.interrupt.bind(_, true))
        .on('mouseleave.mlick', _.interrupt.bind(_, false))
    }
  }

  Mlick.prototype.initSlideEvents = function () {
    const _ = this

    if (_.options.pauseOnHover) {
      _.$list.on('mouseenter.mlick', _.interrupt.bind(_, true))
      _.$list.on('mouseleave.mlick', _.interrupt.bind(_, false))
    }
  }

  Mlick.prototype.initializeEvents = function () {
    const _ = this

    _.initArrowEvents()

    _.initDotEvents()
    _.initSlideEvents()

    _.$list.on(
      'touchstart.mlick mousedown.mlick',
      {
        action: 'start',
      },
      _.swipeHandler
    )
    _.$list.on(
      'touchmove.mlick mousemove.mlick',
      {
        action: 'move',
      },
      _.swipeHandler
    )
    _.$list.on(
      'touchend.mlick mouseup.mlick',
      {
        action: 'end',
      },
      _.swipeHandler
    )
    _.$list.on(
      'touchcancel.mlick mouseleave.mlick',
      {
        action: 'end',
      },
      _.swipeHandler
    )

    _.$list.on('click.mlick', _.clickHandler)

    $(document).on(_.visibilityChange, _.visibility.bind(_))

    if (_.options.accessibility === true) {
      _.$list.on('keydown.mlick', _.keyHandler)
    }

    if (_.options.focusOnSelect === true) {
      $(_.$slideTrack).children().on('click.mlick', _.selectHandler)
    }

    $(window).on(`orientationchange.mlick.mlick-${_.instanceUid}`, _.orientationChange.bind(_))

    $(window).on(`resize.mlick.mlick-${_.instanceUid}`, _.resize.bind(_))

    $(":not([draggable='true'])", _.$slideTrack).on('dragstart', _.preventDefault)

    $(window).on(`load.mlick.mlick-${_.instanceUid}`, _.setPosition)
    $(_.setPosition)
  }

  Mlick.prototype.initUI = function () {
    const _ = this

    if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {
      _.$prevArrow.show()
      _.$nextArrow.show()
    }

    if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {
      _.$dots.show()
    }
  }

  Mlick.prototype.keyHandler = function (event) {
    const _ = this
    //Dont slide if the cursor is inside the form fields and arrow keys are pressed
    if (!event.target.tagName.match('TEXTAREA|INPUT|SELECT')) {
      if (event.keyCode === 37 && _.options.accessibility === true) {
        _.changeSlide({
          data: {
            message: _.options.rtl === true ? 'next' : 'previous',
          },
        })
      } else if (event.keyCode === 39 && _.options.accessibility === true) {
        _.changeSlide({
          data: {
            message: _.options.rtl === true ? 'previous' : 'next',
          },
        })
      }
    }
  }

  Mlick.prototype.lazyLoad = function () {
    const _ = this
    let loadRange
    let cloneRange
    let rangeStart
    let rangeEnd

    function loadImages(imagesScope) {
      $('img[data-lazy]', imagesScope).each(function () {
        const image = $(this)
        const imageSource = this.getAttribute('data-lazy')
        const imageSrcSet = this.getAttribute('data-srcset')
        const imageSizes = this.getAttribute('data-sizes') || _.$slider.attrs.get('data-sizes')
        const imageToLoad = document.createElement('img')

        imageToLoad.onload = function () {
          image.animate({ opacity: 0 }, 100, () => {
            if (imageSrcSet) {
              image.attrs.set('srcset', imageSrcSet)

              if (imageSizes) {
                image.attrs.set('sizes', imageSizes)
              }
            }

            image.attrs.set('src', imageSource).animate({ opacity: 1 }, 200, () => {
              image.attrs
                .remove('data-lazy data-srcset data-sizes')
                .classList.remove('mlick-loading')
            })
            _.$slider.trigger('lazyLoaded', [_, image, imageSource])
          })
        }

        imageToLoad.onerror = function () {
          image
            .removeAttr('data-lazy')
            .classList.remove('mlick-loading')
            .classList.add('mlick-lazyload-error')

          _.$slider.trigger('lazyLoadError', [_, image, imageSource])
        }

        imageToLoad.src = imageSource
      })
    }

    if (_.options.centerMode === true) {
      if (_.options.infinite === true) {
        rangeStart = _.currentSlide + (_.options.slidesToShow / 2 + 1)
        rangeEnd = rangeStart + _.options.slidesToShow + 2
      } else {
        rangeStart = Math.max(0, _.currentSlide - (_.options.slidesToShow / 2 + 1))
        rangeEnd = 2 + (_.options.slidesToShow / 2 + 1) + _.currentSlide
      }
    } else {
      rangeStart = _.options.infinite ? _.options.slidesToShow + _.currentSlide : _.currentSlide
      rangeEnd = Math.ceil(rangeStart + _.options.slidesToShow)
      if (_.options.fade === true) {
        if (rangeStart > 0) rangeStart--
        if (rangeEnd <= _.slideCount) rangeEnd++
      }
    }

    loadRange = _.$slider.find('.mlick-slide').slice(rangeStart, rangeEnd)

    if (_.options.lazyLoad === 'anticipated') {
      let prevSlide = rangeStart - 1
      let nextSlide = rangeEnd
      const $slides = _.$slider.find('.mlick-slide')

      for (let i = 0; i < _.options.slidesToScroll; i++) {
        if (prevSlide < 0) prevSlide = _.slideCount - 1
        loadRange = loadRange.add($slides.eq(prevSlide))
        loadRange = loadRange.add($slides.eq(nextSlide))
        prevSlide--
        nextSlide++
      }
    }

    loadImages(loadRange)

    if (_.slideCount <= _.options.slidesToShow) {
      cloneRange = _.$slider.find('.mlick-slide')
      loadImages(cloneRange)
    } else if (_.currentSlide >= _.slideCount - _.options.slidesToShow) {
      cloneRange = _.$slider.find('.mlick-cloned').slice(0, _.options.slidesToShow)
      loadImages(cloneRange)
    } else if (_.currentSlide === 0) {
      cloneRange = _.$slider.find('.mlick-cloned').slice(_.options.slidesToShow * -1)
      loadImages(cloneRange)
    }
  }

  Mlick.prototype.loadSlider = function () {
    const _ = this

    _.setPosition()

    _.$slideTrack.css({
      opacity: '1',
    })

    _.$slider.classList.remove('mlick-loading')

    _.initUI()

    if (_.options.lazyLoad === 'progressive') {
      _.progressiveLazyLoad()
    }
  }

  Mlick.prototype.next = Mlick.prototype.mlickNext = function () {
    const _ = this

    _.changeSlide({
      data: {
        message: 'next',
      },
    })
  }

  Mlick.prototype.orientationChange = function () {
    const _ = this

    _.checkResponsive()
    _.setPosition()
  }

  Mlick.prototype.pause = Mlick.prototype.mlickPause = function () {
    const _ = this

    _.autoPlayClear()
    _.paused = true
  }

  Mlick.prototype.play = Mlick.prototype.mlickPlay = function () {
    const _ = this

    _.autoPlay()
    _.options.autoplay = true
    _.paused = false
    _.focussed = false
    _.interrupted = false
  }

  Mlick.prototype.postSlide = function (index) {
    const _ = this

    if (!_.unmlicked) {
      _.$slider.trigger('afterChange', [_, index])

      _.animating = false

      if (_.slideCount > _.options.slidesToShow) {
        _.setPosition()
      }

      _.swipeLeft = null

      if (_.options.autoplay) {
        _.autoPlay()
      }

      if (_.options.accessibility === true) {
        _.initADA()

        if (_.options.focusOnChange) {
          const $currentSlide = $(_.$slides.get(_.currentSlide))
          $currentSlide.attrs.set('tabindex', 0).trigger('focus')
        }
      }
    }
  }

  Mlick.prototype.prev = Mlick.prototype.mlickPrev = function () {
    const _ = this

    _.changeSlide({
      data: {
        message: 'previous',
      },
    })
  }

  Mlick.prototype.preventDefault = function (event) {
    event.preventDefault()
  }

  Mlick.prototype.progressiveLazyLoad = function (tryCount) {
    tryCount = tryCount || 1

    const _ = this
    const $imgsToLoad = $('img[data-lazy]', _.$slider)
    let image
    let imageSource
    let imageSrcSet
    let imageSizes
    let imageToLoad

    if ($imgsToLoad.length) {
      image = $imgsToLoad.first()
      imageSource = image.attrs.get('data-lazy')
      imageSrcSet = image.attrs.get('data-srcset')
      imageSizes = image.attrs.get('data-sizes') || _.$slider.attrs.get('data-sizes')
      imageToLoad = document.createElement('img')

      imageToLoad.onload = function () {
        if (imageSrcSet) {
          image.attrs.set('srcset', imageSrcSet)

          if (imageSizes) {
            image.attrs.set('sizes', imageSizes)
          }
        }

        image.attrs
          .set('src', imageSource)
          .attrs.remove('data-lazy data-srcset data-sizes')
          .classList.remove('mlick-loading')

        if (_.options.adaptiveHeight === true) {
          _.setPosition()
        }

        _.$slider.trigger('lazyLoaded', [_, image, imageSource])
        _.progressiveLazyLoad()
      }

      imageToLoad.onerror = function () {
        if (tryCount < 3) {
          /**
           * try to load the image 3 times,
           * leave a slight delay so we don't get
           * servers blocking the request.
           */
          setTimeout(() => {
            _.progressiveLazyLoad(tryCount + 1)
          }, 500)
        } else {
          image.attrs
            .remove('data-lazy')
            .classList.remove('mlick-loading')
            .classList.add('mlick-lazyload-error')

          _.$slider.trigger('lazyLoadError', [_, image, imageSource])

          _.progressiveLazyLoad()
        }
      }

      imageToLoad.src = imageSource
    } else {
      _.$slider.trigger('allImagesLoaded', [_])
    }
  }

  Mlick.prototype.refresh = function (initializing) {
    const _ = this
    let currentSlide
    let lastVisibleIndex

    lastVisibleIndex = _.slideCount - _.options.slidesToShow

    // in non-infinite sliders, we don't want to go past the
    // last visible index.
    if (!_.options.infinite && _.currentSlide > lastVisibleIndex) {
      _.currentSlide = lastVisibleIndex
    }

    // if less slides than to show, go to start.
    if (_.slideCount <= _.options.slidesToShow) {
      _.currentSlide = 0
    }

    currentSlide = _.currentSlide

    _.destroy(true)

    $.extend(_, _.initials, { currentSlide: currentSlide })

    _.init()

    if (!initializing) {
      _.changeSlide(
        {
          data: {
            message: 'index',
            index: currentSlide,
          },
        },
        false
      )
    }
  }

  Mlick.prototype.registerBreakpoints = function () {
    const _ = this
    let breakpoint
    let currentBreakpoint
    let l
    const responsiveSettings = _.options.responsive || null

    if (Array.isArray(responsiveSettings) && responsiveSettings.length) {
      _.respondTo = _.options.respondTo || 'window'

      for (breakpoint in responsiveSettings) {
        l = _.breakpoints.length - 1

        if (responsiveSettings.hasOwnProperty(breakpoint)) {
          currentBreakpoint = responsiveSettings[breakpoint].breakpoint

          // loop through the breakpoints and cut out any existing
          // ones with the same breakpoint number, we don't want dupes.
          while (l >= 0) {
            if (_.breakpoints[l] && _.breakpoints[l] === currentBreakpoint) {
              _.breakpoints.splice(l, 1)
            }
            l--
          }

          _.breakpoints.push(currentBreakpoint)
          _.breakpointSettings[currentBreakpoint] = responsiveSettings[breakpoint].settings
        }
      }

      _.breakpoints.sort((a, b) => {
        return _.options.mobileFirst ? a - b : b - a
      })
    }
  }

  Mlick.prototype.reinit = function () {
    const _ = this

    _.$slides = _.$slideTrack.children(_.options.slide).classList.add('mlick-slide')

    _.slideCount = _.$slides.length

    if (_.currentSlide >= _.slideCount && _.currentSlide !== 0) {
      _.currentSlide = _.currentSlide - _.options.slidesToScroll
    }

    if (_.slideCount <= _.options.slidesToShow) {
      _.currentSlide = 0
    }

    _.registerBreakpoints()

    _.setProps()
    _.setupInfinite()
    _.buildArrows()
    _.updateArrows()
    _.initArrowEvents()
    _.buildDots()
    _.updateDots()
    _.initDotEvents()
    _.cleanUpSlideEvents()
    _.initSlideEvents()

    _.checkResponsive(false, true)

    if (_.options.focusOnSelect === true) {
      $(_.$slideTrack).children().on('click.mlick', _.selectHandler)
    }

    _.setSlideClasses(typeof _.currentSlide === 'number' ? _.currentSlide : 0)

    _.setPosition()
    _.focusHandler()

    _.paused = !_.options.autoplay
    _.autoPlay()

    _.$slider.trigger('reInit', [_])
  }

  Mlick.prototype.resize = function () {
    const _ = this

    if ($(window).width() !== _.windowWidth) {
      clearTimeout(_.windowDelay)
      _.windowDelay = window.setTimeout(() => {
        _.windowWidth = $(window).width()
        _.checkResponsive()
        if (!_.unmlicked) {
          _.setPosition()
        }
      }, 50)
    }
  }

  Mlick.prototype.removeSlide = Mlick.prototype.mlickRemove = function (
    index,
    removeBefore,
    removeAll
  ) {
    const _ = this

    if (typeof index === 'boolean') {
      removeBefore = index
      index = removeBefore === true ? 0 : _.slideCount - 1
    } else {
      index = removeBefore === true ? --index : index
    }

    if (_.slideCount < 1 || index < 0 || index > _.slideCount - 1) {
      return false
    }

    _.unload()

    if (removeAll === true) {
      _.$slideTrack.children().remove()
    } else {
      _.$slideTrack.children(this.options.slide).eq(index).remove()
    }

    _.$slides = _.$slideTrack.children(this.options.slide)

    _.$slideTrack.children(this.options.slide).detach()

    _.$slideTrack.append(_.$slides)

    _.$slidesCache = _.$slides

    _.reinit()
  }

  Mlick.prototype.setCSS = function (position) {
    const _ = this
    let positionProps = {}
    let x
    let y

    if (_.options.rtl === true) {
      position = -position
    }
    x = _.positionProp == 'left' ? `${Math.ceil(position)}px` : '0'
    y = _.positionProp == 'top' ? `${Math.ceil(position)}px` : '0'

    positionProps[_.positionProp] = position

    if (_.transformsEnabled === false) {
      _.$slideTrack.css(positionProps)
    } else {
      positionProps = {}
      if (_.cssTransitions === false) {
        positionProps[_.animType] = `translate(${x}, ${y})`
        _.$slideTrack.css(positionProps)
      } else {
        positionProps[_.animType] = `translate3d(${x}, ${y}, 0)`
        _.$slideTrack.css(positionProps)
      }
    }
  }

  Mlick.prototype.setDimensions = function () {
    const _ = this
    const firstSlide = _.$slides.first()
    const trackSlides = _.$slideTrack.children('.mlick-slide')

    if (_.options.vertical === false) {
      if (_.options.centerMode === true) {
        _.$list.css({
          padding: `0px ${_.options.centerPadding}`,
        })
      }
    } else {
      _.$list.height(firstSlide.outerHeight(true) * _.options.slidesToShow)
      if (_.options.centerMode === true) {
        _.$list.css({
          padding: `${_.options.centerPadding} 0px`,
        })
      }
    }

    _.listWidth = _.$list.width()
    _.listHeight = _.$list.height()

    if (_.options.vertical === false && _.options.variableWidth === false) {
      _.slideWidth = Math.ceil(_.listWidth / _.options.slidesToShow)
      _.$slideTrack.width(Math.ceil(_.slideWidth * trackSlides.length))
    } else if (_.options.variableWidth === true) {
      _.$slideTrack.width(5000 * _.slideCount)
    } else {
      _.slideWidth = Math.ceil(_.listWidth)
      _.$slideTrack.height(Math.ceil(firstSlide.outerHeight(true) * trackSlides.length))
    }

    // perf: the margin offset is only consumed when variableWidth is false, so
    // only pay the two layout reads (outerWidth + width) in that branch.
    if (_.options.variableWidth === false) {
      const offset = firstSlide.outerWidth(true) - firstSlide.width()
      trackSlides.width(_.slideWidth - offset)
    }
  }

  Mlick.prototype.setFade = function () {
    const _ = this
    let targetLeft

    _.$slides.each((index, element) => {
      targetLeft = _.slideWidth * index * -1
      if (_.options.rtl === true) {
        $(element).css({
          position: 'relative',
          right: targetLeft,
          top: '0',
          zIndex: _.options.zIndex - 2,
          opacity: '0',
        })
      } else {
        $(element).css({
          position: 'relative',
          left: targetLeft,
          top: '0',
          zIndex: _.options.zIndex - 2,
          opacity: '0',
        })
      }
    })

    _.$slides.eq(_.currentSlide).css({
      zIndex: _.options.zIndex - 1,
      opacity: '1',
    })
  }

  Mlick.prototype.setHeight = function () {
    const _ = this

    if (
      _.options.slidesToShow === 1 &&
      _.options.adaptiveHeight === true &&
      _.options.vertical === false
    ) {
      const targetHeight = _.$slides.eq(_.currentSlide).outerHeight(true)
      _.$list.css('height', `${targetHeight}px`)
    }
  }

  Mlick.prototype.setOption = Mlick.prototype.mlickSetOption = function () {
    /**
     * accepts arguments in format of:
     *
     *  - for changing a single option's value:
     *     .mlick("setOption", option, value, refresh )
     *
     *  - for changing a set of responsive options:
     *     .mlick("setOption", 'responsive', [{}, ...], refresh )
     *
     *  - for updating multiple values at once (not responsive)
     *     .mlick("setOption", { 'option': value, ... }, refresh )
     */

    const _ = this
    let l
    let item
    let option
    let value
    let refresh = false
    let type

    if ($.isPlainObject(arguments[0])) {
      option = arguments[0]
      refresh = arguments[1]
      type = 'multiple'
    } else if (typeof arguments[0] === 'string') {
      option = arguments[0]
      value = arguments[1]
      refresh = arguments[2]

      if (arguments[0] === 'responsive' && Array.isArray(arguments[1])) {
        type = 'responsive'
      } else if (typeof arguments[1] !== 'undefined') {
        type = 'single'
      }
    }

    if (type === 'single') {
      _.options[option] = value
    } else if (type === 'multiple') {
      $.each(option, (opt, val) => {
        _.options[opt] = val
      })
    } else if (type === 'responsive') {
      for (item in value) {
        if (!Array.isArray(_.options.responsive)) {
          _.options.responsive = [value[item]]
        } else {
          l = _.options.responsive.length - 1

          // loop through the responsive object and splice out duplicates.
          while (l >= 0) {
            if (_.options.responsive[l].breakpoint === value[item].breakpoint) {
              _.options.responsive.splice(l, 1)
            }

            l--
          }

          _.options.responsive.push(value[item])
        }
      }
    }

    if (refresh) {
      _.unload()
      _.reinit()
    }
  }

  Mlick.prototype.setPosition = function () {
    const _ = this

    _.setDimensions()

    _.setHeight()

    if (_.options.fade === false) {
      _.setCSS(_.getLeft(_.currentSlide))
    } else {
      _.setFade()
    }

    _.$slider.trigger('setPosition', [_])
  }

  Mlick.prototype.setProps = function () {
    const _ = this
    const bodyStyle = document.body.style

    _.positionProp = _.options.vertical === true ? 'top' : 'left'

    if (_.positionProp === 'top') {
      _.$slider.classList.add('mlick-vertical')
    } else {
      _.$slider.classList.remove('mlick-vertical')
    }

    if (bodyStyle.transition !== undefined) {
      if (_.options.useCSS === true) {
        _.cssTransitions = true
      }
    }

    if (_.options.fade) {
      if (typeof _.options.zIndex === 'number') {
        if (_.options.zIndex < 3) {
          _.options.zIndex = 3
        }
      } else {
        _.options.zIndex = _.defaults.zIndex
      }
    }

    if (bodyStyle.transform !== undefined) {
      _.animType = 'transform'
      _.transformType = 'transform'
      _.transitionType = 'transition'
    }
    _.transformsEnabled = _.options.useTransform && _.animType !== null && _.animType !== false
  }

  Mlick.prototype.setSlideClasses = function (index) {
    const _ = this
    let centerOffset
    let allSlides
    let indexOffset
    let remainder

    allSlides = _.$slider
      .find('.mlick-slide')
      .classList.remove('mlick-active mlick-center mlick-current')
      .attr('aria-hidden', 'true')

    _.$slides.eq(index).classList.add('mlick-current')

    if (_.options.centerMode === true) {
      let evenCoef

      if (_.options.slidesToShow >= _.$slides.length) {
        evenCoef = -1
        centerOffset = _.options.slidesToShow = _.$slides.length
      } else {
        evenCoef = _.options.slidesToShow % 2 === 0 ? 1 : 0
        centerOffset = Math.floor(_.options.slidesToShow / 2)
      }

      if (_.options.infinite === true) {
        if (index >= centerOffset && index <= _.slideCount - 1 - centerOffset) {
          _.$slides
            .slice(index - centerOffset + evenCoef, index + centerOffset + 1)
            .classList.add('mlick-active')
            .attr('aria-hidden', 'false')
        } else {
          indexOffset = _.options.slidesToShow + index
          allSlides
            .slice(indexOffset - centerOffset + 1 + evenCoef, indexOffset + centerOffset + 2)
            .classList.add('mlick-active')
            .attr('aria-hidden', 'false')
        }

        if (index === 0) {
          allSlides.eq(_.options.slidesToShow + _.slideCount + 1).classList.add('mlick-center')
        } else if (index === _.slideCount - 1) {
          allSlides.eq(_.options.slidesToShow).classList.add('mlick-center')
        }
      }

      _.$slides.eq(index).classList.add('mlick-center')
    } else {
      if (index >= 0 && index <= _.slideCount - _.options.slidesToShow) {
        _.$slides
          .slice(index, index + _.options.slidesToShow)
          .classList.add('mlick-active')
          .attr('aria-hidden', 'false')
      } else if (allSlides.length <= _.options.slidesToShow) {
        allSlides.classList.add('mlick-active').attr('aria-hidden', 'false')
      } else {
        remainder = _.slideCount % _.options.slidesToShow
        indexOffset = _.options.infinite === true ? _.options.slidesToShow + index : index

        if (
          _.options.slidesToShow == _.options.slidesToScroll &&
          _.slideCount - index < _.options.slidesToShow
        ) {
          allSlides
            .slice(indexOffset - (_.options.slidesToShow - remainder), indexOffset + remainder)
            .classList.add('mlick-active')
            .attr('aria-hidden', 'false')
        } else {
          allSlides
            .slice(indexOffset, indexOffset + _.options.slidesToShow)
            .classList.add('mlick-active')
            .attr('aria-hidden', 'false')
        }
      }
    }

    if (_.options.lazyLoad === 'ondemand' || _.options.lazyLoad === 'anticipated') {
      _.lazyLoad()
    }
  }

  Mlick.prototype.setupInfinite = function () {
    const _ = this
    let i
    let slideIndex
    let infiniteCount

    if (_.options.fade === true) {
      _.options.centerMode = false
    }

    if (_.options.infinite === true && _.options.fade === false) {
      slideIndex = null

      if (_.slideCount > _.options.slidesToShow) {
        if (_.options.centerMode === true) {
          infiniteCount = _.options.slidesToShow + 1
        } else {
          infiniteCount = _.options.slidesToShow
        }

        for (i = _.slideCount; i > _.slideCount - infiniteCount; i -= 1) {
          slideIndex = i - 1
          $(_.$slides[slideIndex])
            .clone(true)
            .attrs.remove('id')
            .attrs.set('data-mlick-index', slideIndex - _.slideCount)
            .prependTo(_.$slideTrack)
            .classList.add('mlick-cloned')
        }
        for (i = 0; i < infiniteCount + _.slideCount; i += 1) {
          slideIndex = i
          $(_.$slides[slideIndex])
            .clone(true)
            .attrs.remove('id')
            .attrs.set('data-mlick-index', slideIndex + _.slideCount)
            .appendTo(_.$slideTrack)
            .classList.add('mlick-cloned')
        }
        _.$slideTrack
          .find('.mlick-cloned')
          .find('[id]')
          .each(function () {
            this.removeAttribute('id')
          })
      }
    }
  }

  Mlick.prototype.interrupt = function (toggle) {
    const _ = this

    if (!toggle) {
      _.autoPlay()
    }
    _.interrupted = toggle
  }

  Mlick.prototype.selectHandler = function (event) {
    const _ = this

    const targetElement = $(event.target).is('.mlick-slide')
      ? $(event.target)
      : $(event.target).parents('.mlick-slide')

    let index = parseInt(targetElement.attrs.get('data-mlick-index'))

    if (!index) index = 0

    if (_.slideCount <= _.options.slidesToShow) {
      _.slideHandler(index, false, true)
      return
    }

    _.slideHandler(index)
  }

  Mlick.prototype.slideHandler = function (index, sync, dontAnimate) {
    const _ = this

    sync = sync || false

    if (_.animating === true && _.options.waitForAnimate === true) {
      return
    }

    if (_.options.fade === true && _.currentSlide === index) {
      return
    }

    if (sync === false) {
      _.asNavFor(index)
    }

    // Shared tail: animate to `left` (unless dontAnimate or too few slides),
    // then settle on `target`. Used by both the out-of-bounds clamp and the
    // normal path.
    const finish = (target, left) => {
      if (dontAnimate !== true && _.slideCount > _.options.slidesToShow) {
        _.animateSlide(left, () => {
          _.postSlide(target)
        })
      } else {
        _.postSlide(target)
      }
    }

    let targetSlide = index
    const targetLeft = _.getLeft(targetSlide)
    const slideLeft = _.getLeft(_.currentSlide)

    _.currentLeft = _.swipeLeft === null ? slideLeft : _.swipeLeft

    // Non-infinite out-of-bounds: clamp back to the current slide. The upper
    // bound differs between centerMode and the default layout.
    if (_.options.infinite === false) {
      const upperBound =
        _.options.centerMode === true
          ? _.slideCount - _.options.slidesToScroll
          : _.getDotCount() * _.options.slidesToScroll

      if (index < 0 || index > upperBound) {
        if (_.options.fade === false) {
          targetSlide = _.currentSlide
          finish(targetSlide, slideLeft)
        }
        return
      }
    }

    if (_.options.autoplay) {
      clearInterval(_.autoPlayTimer)
    }

    // Normalize the requested slide into the wrapped animSlide index.
    let animSlide
    const remainder = _.slideCount % _.options.slidesToScroll
    if (targetSlide < 0) {
      animSlide = remainder !== 0 ? _.slideCount - remainder : _.slideCount + targetSlide
    } else if (targetSlide >= _.slideCount) {
      animSlide = remainder !== 0 ? 0 : targetSlide - _.slideCount
    } else {
      animSlide = targetSlide
    }

    _.animating = true

    _.$slider.trigger('beforeChange', [_, _.currentSlide, animSlide])

    const oldSlide = _.currentSlide
    _.currentSlide = animSlide

    _.setSlideClasses(_.currentSlide)

    if (_.options.asNavFor) {
      let navTarget = _.getNavTarget()
      navTarget = navTarget.mlick('getMlick')

      if (navTarget.slideCount <= navTarget.options.slidesToShow) {
        navTarget.setSlideClasses(_.currentSlide)
      }
    }

    _.updateDots()
    _.updateArrows()

    if (_.options.fade === true) {
      if (dontAnimate !== true) {
        _.fadeSlideOut(oldSlide)

        _.fadeSlide(animSlide, () => {
          _.postSlide(animSlide)
        })
      } else {
        _.postSlide(animSlide)
      }
      _.animateHeight()
      return
    }

    finish(animSlide, targetLeft)
  }

  Mlick.prototype.startLoad = function () {
    const _ = this

    if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {
      _.$prevArrow.hide()
      _.$nextArrow.hide()
    }

    if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {
      _.$dots.hide()
    }

    _.$slider.classList.add('mlick-loading')
  }

  Mlick.prototype.swipeDirection = function () {
    let xDist
    let yDist
    let r
    let swipeAngle
    const _ = this

    xDist = _.touchObject.startX - _.touchObject.curX
    yDist = _.touchObject.startY - _.touchObject.curY
    r = Math.atan2(yDist, xDist)

    swipeAngle = Math.round((r * 180) / Math.PI)
    if (swipeAngle < 0) {
      swipeAngle = 360 - Math.abs(swipeAngle)
    }

    if (swipeAngle <= 45 && swipeAngle >= 0) {
      return _.options.rtl === false ? 'left' : 'right'
    }
    if (swipeAngle <= 360 && swipeAngle >= 315) {
      return _.options.rtl === false ? 'left' : 'right'
    }
    if (swipeAngle >= 135 && swipeAngle <= 225) {
      return _.options.rtl === false ? 'right' : 'left'
    }
    if (_.options.verticalSwiping === true) {
      if (swipeAngle >= 35 && swipeAngle <= 135) {
        return 'down'
      } else {
        return 'up'
      }
    }

    return 'vertical'
  }

  Mlick.prototype.swipeEnd = function (event) {
    const _ = this
    let slideCount
    let direction

    _.dragging = false
    _.swiping = false

    if (_.scrolling) {
      _.scrolling = false
      return false
    }

    _.interrupted = false
    _.shouldClick = _.touchObject.swipeLength > 10 ? false : true

    if (_.touchObject.curX === undefined) {
      return false
    }

    if (_.touchObject.edgeHit === true) {
      _.$slider.trigger('edge', [_, _.swipeDirection()])
    }

    if (_.touchObject.swipeLength >= _.touchObject.minSwipe) {
      direction = _.swipeDirection()

      switch (direction) {
        case 'left':
        case 'down':
          slideCount = _.options.swipeToSlide
            ? _.checkNavigable(_.currentSlide + _.getSlideCount())
            : _.currentSlide + _.getSlideCount()

          _.currentDirection = 0

          break

        case 'right':
        case 'up':
          slideCount = _.options.swipeToSlide
            ? _.checkNavigable(_.currentSlide - _.getSlideCount())
            : _.currentSlide - _.getSlideCount()

          _.currentDirection = 1

          break

        default:
      }

      if (direction != 'vertical') {
        _.slideHandler(slideCount)
        _.touchObject = {}
        _.$slider.trigger('swipe', [_, direction])
      }
    } else {
      if (_.touchObject.startX !== _.touchObject.curX) {
        _.slideHandler(_.currentSlide)
        _.touchObject = {}
      }
    }
  }

  Mlick.prototype.swipeHandler = function (event) {
    const _ = this

    if (_.options.swipe === false || ('ontouchend' in document && _.options.swipe === false)) {
      return
    } else if (_.options.draggable === false && event.type.indexOf('mouse') !== -1) {
      return
    }

    const swipeTouches = event.touches || (event.originalEvent && event.originalEvent.touches)
    _.touchObject.fingerCount = swipeTouches ? swipeTouches.length : 1

    _.touchObject.minSwipe = _.listWidth / _.options.touchThreshold

    if (_.options.verticalSwiping === true) {
      _.touchObject.minSwipe = _.listHeight / _.options.touchThreshold
    }

    switch (event.data.action) {
      case 'start':
        _.swipeStart(event)
        break

      case 'move':
        _.swipeMove(event)
        break

      case 'end':
        _.swipeEnd(event)
        break
    }
  }

  Mlick.prototype.swipeMove = function (event) {
    const _ = this
    const edgeWasHit = false
    let curLeft
    let swipeDirection
    let swipeLength
    let positionOffset
    let touches
    let verticalSwipeLength

    touches = event.touches || (event.originalEvent && event.originalEvent.touches) || undefined

    if (!_.dragging || _.scrolling || (touches && touches.length !== 1)) {
      return false
    }

    curLeft = _.getLeft(_.currentSlide)

    _.touchObject.curX = touches !== undefined ? touches[0].pageX : event.clientX
    _.touchObject.curY = touches !== undefined ? touches[0].pageY : event.clientY

    // perf: |d| — curX/curY/startX/startY are integers from pointer events, so
    // Math.round(Math.sqrt(Math.pow(d, 2))) is exactly Math.abs(d). Runs on
    // every pointermove during a drag.
    _.touchObject.swipeLength = Math.abs(_.touchObject.curX - _.touchObject.startX)

    verticalSwipeLength = Math.abs(_.touchObject.curY - _.touchObject.startY)

    if (!_.options.verticalSwiping && !_.swiping && verticalSwipeLength > 4) {
      _.scrolling = true
      return false
    }

    if (_.options.verticalSwiping === true) {
      _.touchObject.swipeLength = verticalSwipeLength
    }

    swipeDirection = _.swipeDirection()

    if (_.touchObject.swipeLength > 4) {
      _.swiping = true
      event.preventDefault()
    }

    positionOffset =
      (_.options.rtl === false ? 1 : -1) * (_.touchObject.curX > _.touchObject.startX ? 1 : -1)
    if (_.options.verticalSwiping === true) {
      positionOffset = _.touchObject.curY > _.touchObject.startY ? 1 : -1
    }

    swipeLength = _.touchObject.swipeLength

    _.touchObject.edgeHit = false

    if (_.options.infinite === false) {
      if (
        (_.currentSlide === 0 && swipeDirection === 'right') ||
        (_.currentSlide >= _.getDotCount() && swipeDirection === 'left')
      ) {
        swipeLength = _.touchObject.swipeLength * _.options.edgeFriction
        _.touchObject.edgeHit = true
      }
    }

    if (_.options.vertical === false) {
      _.swipeLeft = curLeft + swipeLength * positionOffset
    } else {
      // perf: use the cached list height (kept current by setDimensions on
      // init/resize/setPosition) instead of forcing a layout read per move.
      _.swipeLeft = curLeft + swipeLength * (_.listHeight / _.listWidth) * positionOffset
    }
    if (_.options.verticalSwiping === true) {
      _.swipeLeft = curLeft + swipeLength * positionOffset
    }

    if (_.options.fade === true || _.options.touchMove === false) {
      return false
    }

    if (_.animating === true) {
      _.swipeLeft = null
      return false
    }

    _.setCSS(_.swipeLeft)
  }

  Mlick.prototype.swipeStart = function (event) {
    const _ = this
    let touches

    _.interrupted = true

    if (_.touchObject.fingerCount !== 1 || _.slideCount <= _.options.slidesToShow) {
      _.touchObject = {}
      return false
    }

    const startTouches = event.touches || (event.originalEvent && event.originalEvent.touches)
    if (startTouches && startTouches.length) {
      touches = startTouches[0]
    }

    _.touchObject.startX = _.touchObject.curX =
      touches !== undefined ? touches.pageX : event.clientX
    _.touchObject.startY = _.touchObject.curY =
      touches !== undefined ? touches.pageY : event.clientY

    _.dragging = true
  }

  Mlick.prototype.unfilterSlides = Mlick.prototype.mlickUnfilter = function () {
    const _ = this

    if (_.$slidesCache !== null) {
      _.unload()

      _.$slideTrack.children(this.options.slide).detach()

      _.$slidesCache.appendTo(_.$slideTrack)

      _.reinit()
    }
  }

  Mlick.prototype.unload = function () {
    const _ = this

    $('.mlick-cloned', _.$slider).remove()

    if (_.$dots) {
      _.$dots.remove()
    }

    if (_.$prevArrow && _.htmlExpr.test(_.options.prevArrow)) {
      _.$prevArrow.remove()
    }

    if (_.$nextArrow && _.htmlExpr.test(_.options.nextArrow)) {
      _.$nextArrow.remove()
    }

    _.$slides.classList
      .remove('mlick-slide mlick-active mlick-visible mlick-current')
      .attrs.set('aria-hidden', 'true')
      .css('width', '')
  }

  Mlick.prototype.unmlick = function (fromBreakpoint) {
    const _ = this
    _.$slider.trigger('unmlick', [_, fromBreakpoint])
    _.destroy()
  }

  Mlick.prototype.updateArrows = function () {
    const _ = this
    let centerOffset

    centerOffset = Math.floor(_.options.slidesToShow / 2)

    if (_.options.arrows === true && _.slideCount > _.options.slidesToShow && !_.options.infinite) {
      _.$prevArrow.classList.remove('mlick-disabled').attrs.set('aria-disabled', 'false')
      _.$nextArrow.classList.remove('mlick-disabled').attrs.set('aria-disabled', 'false')

      if (_.currentSlide === 0) {
        _.$prevArrow.classList.add('mlick-disabled').attrs.set('aria-disabled', 'true')
        _.$nextArrow.classList.remove('mlick-disabled').attrs.set('aria-disabled', 'false')
      } else if (
        _.currentSlide >= _.slideCount - _.options.slidesToShow &&
        _.options.centerMode === false
      ) {
        _.$nextArrow.classList.add('mlick-disabled').attrs.set('aria-disabled', 'true')
        _.$prevArrow.classList.remove('mlick-disabled').attrs.set('aria-disabled', 'false')
      } else if (_.currentSlide >= _.slideCount - 1 && _.options.centerMode === true) {
        _.$nextArrow.classList.add('mlick-disabled').attrs.set('aria-disabled', 'true')
        _.$prevArrow.classList.remove('mlick-disabled').attrs.set('aria-disabled', 'false')
      }
    }
  }

  Mlick.prototype.updateDots = function () {
    const _ = this

    if (_.$dots !== null) {
      _.$dots.find('li').classList.remove('mlick-active')

      _.$dots
        .find('li')
        .eq(Math.floor(_.currentSlide / _.options.slidesToScroll))
        .classList.add('mlick-active')
    }
  }

  Mlick.prototype.visibility = function () {
    const _ = this

    if (_.options.autoplay) {
      if (document[_.hidden]) {
        _.interrupted = true
      } else {
        _.interrupted = false
      }
    }
  }

  $.fn.mlick = function () {
    const _ = this
    const opt = arguments[0]
    const args = Array.prototype.slice.call(arguments, 1)
    const l = _.length
    let i
    let ret
    for (i = 0; i < l; i++) {
      if (typeof opt == 'object' || typeof opt == 'undefined') _[i].mlick = new Mlick(_[i], opt)
      else ret = _[i].mlick[opt].apply(_[i].mlick, args)
      if (typeof ret != 'undefined') return ret
    }
    return _
  }
})($)
