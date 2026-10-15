import { computePinTarget, isAtTarget, isPinnableRange } from './pin-math'

export { computePinTarget, isAtTarget, isPinnableRange } from './pin-math'

export type UnderLiquidGlassState = 'inactive' | 'pinned' | 'unlocked'

export interface UnderLiquidGlassOptions {
  /** Edge space in px. Must exceed what the bars cover — measured at 60-120px
   *  on iPhone — with margin to spare. Default 140. A smaller value crops a
   *  background-image on the first or last child less, because their boxes
   *  grow by this much; below about 130 the bands stop being covered. */
  edgeSpace?: number
  /** How long the viewport must stay quiet before concluding that scripted
   *  scrolling is unsupported. Default 500 (covers iOS rotation animation). */
  settleDelayMs?: number
  /** How many times to re-engage after having given up, when the viewport
   *  changes again. Default 3. */
  recoveryLimit?: number
  /** How many self-scheduled re-checks to run while the scroll range is too
   *  small to pin, before giving up. Default 3. */
  rangeRetryLimit?: number
  /** Pass false to keep the page an ordinary document. The stylesheet's
   *  `html, body { overflow: hidden }` applies as soon as the CSS is loaded,
   *  so simply not calling this function leaves a page nothing can scroll
   *  correctly; this sets the fold attribute instead. You can also write
   *  `data-ulg-unlocked` on <html> yourself, which works before any script
   *  runs — the runtime then leaves that attribute alone. Default true. */
  enabled?: boolean
  onStateChange?: (
    state: UnderLiquidGlassState,
    controller: UnderLiquidGlassController,
  ) => void
}

export interface UnderLiquidGlassController {
  readonly state: UnderLiquidGlassState
  /** Effective edge space in px as resolved by the CSS (0 outside the gate). */
  readonly edgeSpacePx: number
  /** The element that receives user scrolling. Point router scroll
   *  restoration, "back to top" buttons etc. at this, not at window. */
  readonly scroller: HTMLElement | null
  /** Scroll the right thing to bring `target` to the top of the visible area.
   *  Handles the coordinate change and the edge space offset for you; falls
   *  back to the document where the mechanism is inactive. */
  scrollTo(target: Element, options?: ScrollToOptions): void
  /** Re-measure and re-pin now (call after large layout changes). */
  refresh(): void
  destroy(): void
}

/** Fired on documentElement whenever the effective edge space flips
 *  (mechanism folded or re-engaged). Fixed-position layers that compensate
 *  their coordinates by the edge space should re-read `edgeSpacePx` on this. */
export const EDGE_SPACE_CHANGE_EVENT = 'ulg:edge-space-change'

const UNLOCKED_ATTRIBUTE = 'data-ulg-unlocked'
const SCROLLER_SELECTOR = '[data-ulg-scroller]'
const BACKDROP_SELECTOR = '[data-ulg-backdrop]'
const OVERLAY_SELECTOR = '[data-ulg-overlay]'
const SURFACE_SELECTOR = '[data-ulg-surface]'
const EDGE_SPACE_PROPERTY = '--ulg-edge-space'
const EDGE_SPACE_CONFIG_PROPERTY = '--ulg-edge-space-config'

const DEFAULT_SETTLE_DELAY_MS = 500
const DEFAULT_RECOVERY_LIMIT = 3
const DEFAULT_RANGE_RETRY_LIMIT = 3

function createInertController(): UnderLiquidGlassController {
  return {
    state: 'inactive',
    edgeSpacePx: 0,
    scroller: null,
    scrollTo(target: Element, options?: ScrollToOptions) {
      target.scrollIntoView(options as ScrollIntoViewOptions)
    },
    refresh() {},
    destroy() {},
  }
}

export function underLiquidGlass(
  options: UnderLiquidGlassOptions = {},
): UnderLiquidGlassController {
  // SSR safety: importing this module never touches the DOM; calling it
  // outside a browser yields an inert controller instead of crashing.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return createInertController()
  }

  const settleDelayMs = options.settleDelayMs ?? DEFAULT_SETTLE_DELAY_MS
  const recoveryLimit = options.recoveryLimit ?? DEFAULT_RECOVERY_LIMIT
  const rangeRetryLimit = options.rangeRetryLimit ?? DEFAULT_RANGE_RETRY_LIMIT

  const root = document.documentElement

  // Ownership: only an attribute this runtime set may be removed again. A
  // page that declares data-ulg-unlocked itself (in the HTML, or from SSR)
  // is stating a preference, and destroy() must not quietly undo it.
  let ownsUnlockedAttribute = false

  function setUnlocked(unlocked: boolean): void {
    if (unlocked) {
      if (root.hasAttribute(UNLOCKED_ATTRIBUTE)) return
      root.setAttribute(UNLOCKED_ATTRIBUTE, '')
      ownsUnlockedAttribute = true
      return
    }
    if (!ownsUnlockedAttribute) return
    root.removeAttribute(UNLOCKED_ATTRIBUTE)
    ownsUnlockedAttribute = false
  }

  if (options.enabled === false) {
    setUnlocked(true)
    // Built before the callback runs: onStateChange receives the controller,
    // and on this path it fires synchronously, before the caller's own
    // variable could have been assigned.
    const disabled: UnderLiquidGlassController = {
      ...createInertController(),
      state: 'unlocked',
      destroy() {
        setUnlocked(false)
      },
    }
    options.onStateChange?.('unlocked', disabled)
    return disabled
  }

  const scroller = document.querySelector<HTMLElement>(SCROLLER_SELECTOR)
  if (!scroller) {
    throw new Error(
      `under-liquid-glass: no ${SCROLLER_SELECTOR} element found. ` +
        'The page needs <div data-ulg-scroller><div data-ulg-surface>…</div></div> ' +
        'directly under <body> — see the README for the DOM contract.',
    )
  }
  if (!scroller.querySelector(SURFACE_SELECTOR)) {
    throw new Error(
      `under-liquid-glass: ${SCROLLER_SELECTOR} has no ${SURFACE_SELECTOR} child. ` +
        'The surface owns the edge-space padding and the background that shows behind the bars.',
    )
  }

  // Both layers are optional, so a misplaced one warns instead of throwing —
  // but it does need saying, because the failure is quiet. Anywhere but a
  // direct child of the scroller, the sticky position is confined and the top
  // edge band stays empty until you scroll.
  for (const [selector, where] of [
    [BACKDROP_SELECTOR, `before ${SURFACE_SELECTOR}`],
    [OVERLAY_SELECTOR, `before ${SURFACE_SELECTOR}`],
  ] as const) {
    const layer: HTMLElement | null = scroller.querySelector(selector)
    if (layer && layer.parentElement !== scroller) {
      console.warn(
        `under-liquid-glass: ${selector} must be a direct child of ` +
          `${SCROLLER_SELECTOR}, ${where}. Where it is now it cannot cover ` +
          'the top edge band.',
      )
    }
  }

  // Worth saying out loud: the symptom is the mechanism quietly folding, and
  // nothing about it points at the page's own CSS.
  if (getComputedStyle(root).scrollBehavior === 'smooth') {
    console.warn(
      'under-liquid-glass: `scroll-behavior: smooth` is set on the document. ' +
        'The pin scrolls instantly regardless, but any of your own ' +
        'window.scrollTo calls will animate and be cancelled mid-flight.',
    )
  }

  // The document's height has to be the scroller's height, or the pin lands
  // somewhere else. What breaks it is not a wrapper element as such — an empty
  // <div id="app"> is harmless — but anything between <body> and the scroller
  // that adds height of its own. `#app { min-height: 100vh }` from a framework
  // template is the usual one, and the symptom is judder rather than anything
  // that points at the DOM.
  requestAnimationFrame(() => {
    const extra = root.scrollHeight - scroller.offsetHeight
    if (Math.abs(extra) > 1) {
      console.warn(
        `under-liquid-glass: the document is ${Math.round(extra)}px taller than ` +
          `${SCROLLER_SELECTOR}, so the pin will not land where the stylesheet ` +
          'expects. Something between <body> and the scroller is adding height — ' +
          'a wrapper with min-height, padding or margin is the usual cause.',
      )
    }
  })

  if (options.edgeSpace !== undefined) {
    // Input only: the effective value is resolved by the stylesheet inside
    // the environment gate. Never write --ulg-edge-space itself from JS.
    root.style.setProperty(EDGE_SPACE_CONFIG_PROPERTY, `${options.edgeSpace}px`)
  }

  // getComputedStyle forces a style recalc and viewport changes arrive in
  // bursts (rotation), so the resolved value is cached between changes.
  let cachedEdgeSpacePx: number | null = null

  function refreshEdgeSpacePx(): number {
    const raw = getComputedStyle(root).getPropertyValue(EDGE_SPACE_PROPERTY).trim()
    cachedEdgeSpacePx = Number.parseFloat(raw) || 0
    return cachedEdgeSpacePx
  }

  function edgeSpacePx(): number {
    return cachedEdgeSpacePx ?? refreshEdgeSpacePx()
  }

  let state: UnderLiquidGlassState = 'inactive'

  function setState(nextState: UnderLiquidGlassState): void {
    if (nextState === state) return
    state = nextState
    options.onStateChange?.(nextState, controller)
  }

  function notifyEdgeSpaceChanged(): void {
    // Next frame, so subscribers reading layout do not re-enter this one.
    requestAnimationFrame(() => {
      refreshEdgeSpacePx()
      root.dispatchEvent(new Event(EDGE_SPACE_CHANGE_EVENT))
    })
  }

  // The scroll range is defined by the scroller's fixed height, so it only
  // needs re-reading when the viewport changes — reading scrollHeight on
  // every scroll event would force layout continuously.
  let maxScrollPx = 0

  function measureViewport(): void {
    refreshEdgeSpacePx()
    maxScrollPx = Math.max(0, root.scrollHeight - root.clientHeight)
  }

  let hasGivenUp = false
  let recoveries = 0
  let rangeRetries = 0

  function giveUp(): void {
    hasGivenUp = true
    setUnlocked(true)
    notifyEdgeSpaceChanged()
    setState('unlocked')
  }

  function reEngage(): void {
    hasGivenUp = false
    setUnlocked(false)
    notifyEdgeSpaceChanged()
  }

  type AttemptResult = 'ok' | 'range' | 'unsupported'

  function attemptPin(): AttemptResult {
    if (!isPinnableRange(maxScrollPx)) return 'range'
    const target = computePinTarget(edgeSpacePx(), maxScrollPx)
    if (!isAtTarget(window.scrollY, target)) {
      // behavior: 'instant' rather than the two-argument form, which inherits
      // the page's scroll-behavior. Under `scroll-behavior: smooth` the scroll
      // is asynchronous, so the check below sees the old position, reads it as
      // "scripted scrolling does not work here", and folds the mechanism.
      window.scrollTo({ top: target, left: 0, behavior: 'instant' })
    }
    return isAtTarget(window.scrollY, target) ? 'ok' : 'unsupported'
  }

  // A failure right after a viewport change often just means the numbers
  // were stale; measure once and retry before believing it.
  function runPinAttempt(): AttemptResult {
    const result = attemptPin()
    if (result === 'ok') return result
    measureViewport()
    return attemptPin()
  }

  let settleTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleSettleJudgement(): void {
    if (settleTimer !== null) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      settleTimer = null
      measureViewport()
      pinDocument(true)
    }, settleDelayMs)
  }

  // canConclude is true only after the viewport has been quiet for
  // settleDelayMs; every other call just corrects the position. iOS ignores
  // scripted scrolls during rotation, keyboard animation and momentum, and
  // concluding "unsupported" from one of those moments would fold the
  // mechanism for no reason.
  function pinDocument(canConclude = false): void {
    // Whether the mechanism applies at all is the stylesheet's decision.
    if (hasGivenUp || edgeSpacePx() <= 0) {
      if (!hasGivenUp) setState('inactive')
      return
    }
    try {
      const result = runPinAttempt()
      if (result === 'ok') {
        recoveries = 0
        setState('pinned')
        return
      }
      if (!canConclude) return
      if (result === 'range') {
        // "Too small to pin" is usually a measurement taken mid-change, not
        // a missing capability. Look again a few times before giving up.
        rangeRetries += 1
        if (rangeRetries > rangeRetryLimit) giveUp()
        else scheduleSettleJudgement()
        return
      }
      giveUp()
    } catch {
      if (canConclude) giveUp()
    }
  }

  // Rotation and pinch fire scroll in bursts; correct once per frame, and
  // leave the document alone while the user is pinch-zoomed (the correction
  // would feel like the page fighting their fingers).
  let frameHandle = 0

  function pinOnNextFrame(): void {
    if (frameHandle !== 0 || hasGivenUp || edgeSpacePx() <= 0) return
    if ((window.visualViewport?.scale ?? 1) > 1) return
    frameHandle = requestAnimationFrame(() => {
      frameHandle = 0
      pinDocument()
    })
  }

  let followUpHandle = 0

  function cancelFollowUps(): void {
    if (followUpHandle !== 0) {
      cancelAnimationFrame(followUpHandle)
      followUpHandle = 0
    }
    if (settleTimer !== null) {
      clearTimeout(settleTimer)
      settleTimer = null
    }
  }

  function remeasureAndPin(): void {
    measureViewport()
    // Having given up is not forever: a viewport change may mean the
    // blocking condition (rotation, keyboard) is gone. Re-engage with a
    // limit so a genuinely unsupported environment is not fought endlessly.
    if (hasGivenUp && recoveries < recoveryLimit) {
      recoveries += 1
      reEngage()
      measureViewport()
    }
    pinDocument()
    cancelFollowUps()
    // Track the immediate reflow, then judge only once things settle.
    followUpHandle = requestAnimationFrame(() => {
      followUpHandle = requestAnimationFrame(() => {
        followUpHandle = 0
        measureViewport()
        pinDocument()
      })
    })
    rangeRetries = 0
    scheduleSettleJudgement()
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) remeasureAndPin()
  }

  window.addEventListener('resize', remeasureAndPin)
  window.addEventListener('orientationchange', remeasureAndPin)
  // Coming back from the back/forward cache runs no load handler, and Safari
  // restores the scroll positions itself — including the pin offset, which it
  // then applies on top of the padding. Re-pin against a fresh measurement.
  window.addEventListener('pageshow', onPageShow)
  // Status-bar taps, focus scrolling and hash navigation move the document
  // without firing resize; watching scroll directly is the last resort.
  // Note this also cancels legitimate browser-driven scrolls — pages with
  // text inputs need care, see the README.
  window.addEventListener('scroll', pinOnNextFrame, { passive: true })
  window.visualViewport?.addEventListener('resize', pinOnNextFrame)
  window.visualViewport?.addEventListener('scroll', pinOnNextFrame)

  remeasureAndPin()

  let destroyed = false

  const controller: UnderLiquidGlassController = {
    get state() {
      return state
    },
    get edgeSpacePx() {
      return edgeSpacePx()
    },
    get scroller() {
      // Null unless the mechanism is engaged: elsewhere this element is not a
      // scroll container, and scrolling it does nothing. `controller.scroller
      // ?? window` then picks the right target in both cases.
      return edgeSpacePx() > 0 ? scroller : null
    },
    scrollTo(target: Element, scrollOptions?: ScrollToOptions) {
      const active = edgeSpacePx() > 0
      if (!active) {
        target.scrollIntoView(scrollOptions as ScrollIntoViewOptions)
        return
      }
      // The scroller's scrollport starts one edge space above the content
      // edge, so an element placed at scrollTop 0 would sit behind the top
      // bar. Subtracting the edge space is the step people forget, and the
      // symptom — an anchor landing under the bar — reads as "it did not
      // work" rather than as an offset.
      const box = target.getBoundingClientRect()
      const frame = scroller.getBoundingClientRect()
      scroller.scrollTo({
        ...scrollOptions,
        top: box.top - frame.top + scroller.scrollTop - edgeSpacePx(),
      })
    },
    refresh() {
      if (destroyed) return
      remeasureAndPin()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      window.removeEventListener('resize', remeasureAndPin)
      window.removeEventListener('orientationchange', remeasureAndPin)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('scroll', pinOnNextFrame)
      window.visualViewport?.removeEventListener('resize', pinOnNextFrame)
      window.visualViewport?.removeEventListener('scroll', pinOnNextFrame)
      if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
      cancelFollowUps()
      setUnlocked(false)
      root.style.removeProperty(EDGE_SPACE_CONFIG_PROPERTY)
      setState('inactive')
    },
  }

  return controller
}
