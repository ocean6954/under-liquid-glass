/* On-page diagnostics.
 *
 * The reason this exists rather than a page you deploy next to your app: the
 * things that go wrong are properties of YOUR page — a hero that is not as
 * tall as the backdrop layer, a background that never got painted, an ancestor
 * that kills a sticky layer. A separate diagnostics page cannot see any of
 * them. Import it only while you need it; it is not part of the core bundle.
 *
 *   import { underLiquidGlass } from 'under-liquid-glass'
 *   import { attachDiagnostics } from 'under-liquid-glass/debug'
 *
 *   const glass = underLiquidGlass()
 *   if (import.meta.env.DEV) attachDiagnostics(glass)
 */
import type { UnderLiquidGlassController } from './index'

export interface DiagnosticsOptions {
  /** How often to re-read the measurements, in ms. Default 250. */
  intervalMs?: number
  /** Start with the panel expanded. Default false. */
  open?: boolean
}

const OUTLINE_ATTRIBUTE = 'data-ulg-debug-outline'
const BANDS_ATTRIBUTE = 'data-ulg-debug-bands'

const ROLES = [
  ['scroller', '[data-ulg-scroller]', '#f8fafc'],
  ['surface', '[data-ulg-surface]', '#f59e0b'],
  ['backdrop', '[data-ulg-backdrop]', '#a3e635'],
  ['overlay', '[data-ulg-overlay]', '#f43f5e'],
] as const

function outlineStyles(): string {
  return ROLES.map(
    ([name, selector, colour]) => `
      html[${OUTLINE_ATTRIBUTE}] ${selector} {
        position: relative;
        outline: 1px dashed ${colour};
        outline-offset: -1px;
      }
      html[${OUTLINE_ATTRIBUTE}] ${selector}::before {
        content: "${name}";
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2147483646;
        padding: 2px 5px;
        background: ${colour};
        color: #020617;
        font: 10px/1.4 ui-monospace, monospace;
        pointer-events: none;
      }`,
  ).join('')
}

/* Paints readable words into the two bands.
 *
 * Bar translucency is a user setting, so "the bars look plain" has two very
 * different causes: nothing of the page reaches them, or the device is set to
 * reduce transparency. Nobody can tell those apart by looking. If you can read
 * TOP through the status bar, content is arriving and the rest is the device's
 * business. */
function bandStyles(): string {
  return `
    html[${BANDS_ATTRIBUTE}] [data-ulg-surface]::before,
    html[${BANDS_ATTRIBUTE}] [data-ulg-surface]::after {
      position: absolute;
      left: 0;
      right: 0;
      height: var(--ulg-edge-space);
      z-index: 2147483645;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: repeating-linear-gradient(-45deg, #f43f5e 0 10px, #020617 10px 20px);
      color: #fff;
      font: 700 13px/1 ui-monospace, monospace;
      letter-spacing: 0.35em;
      pointer-events: none;
    }
    html[${BANDS_ATTRIBUTE}] [data-ulg-surface]::before { content: "TOP TOP TOP"; top: 0; }
    html[${BANDS_ATTRIBUTE}] [data-ulg-surface]::after { content: "BOTTOM BOTTOM"; bottom: 0; }
  `
}

function measureProbe(root: ShadowRoot, id: string): number {
  const probe = root.getElementById(id)
  return probe ? probe.getBoundingClientRect().height : 0
}

/* Conditions that do not throw and do not stop the mechanism, but make the
 * page look wrong in ways that read as "the library is broken". */
function isPainted(style: CSSStyleDeclaration): boolean {
  return (
    style.backgroundImage !== 'none' ||
    (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent')
  )
}

function findProblems(
  controller: UnderLiquidGlassController,
  numbers: { lvh: number; svh: number },
): string[] {
  const problems: string[] = []
  const scroller = document.querySelector<HTMLElement>('[data-ulg-scroller]')
  const surface = document.querySelector<HTMLElement>('[data-ulg-surface]')
  const backdrop = document.querySelector<HTMLElement>('[data-ulg-backdrop]')
  const overlay = document.querySelector<HTMLElement>('[data-ulg-overlay]')

  // Only worth reporting where the mechanism is meant to be running: on a
  // desktop browser there are no bars, and no overlap is the correct answer.
  if (controller.edgeSpacePx > 0 && numbers.lvh - numbers.svh <= 0) {
    problems.push('100lvh − 100svh is 0: this device leaves no room behind the bars at all.')
  }

  if (controller.edgeSpacePx > 0 && scroller) {
    const overflowY = getComputedStyle(scroller).overflowY
    if (overflowY !== 'auto' && overflowY !== 'scroll' && (backdrop || overlay)) {
      problems.push(
        `The scroller's overflow-y is "${overflowY}", so it is not a scroll container and ` +
          'the sticky backdrop/overlay layers collapse. Lock scrolling with touch-action instead.',
      )
    }
  }

  if (controller.edgeSpacePx > 0 && surface && !backdrop) {
    const style = getComputedStyle(surface)
    const painted =
      style.backgroundImage !== 'none' ||
      (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent')
    if (!painted) {
      problems.push(
        'Nothing is painted on the surface and there is no backdrop layer, so the bar areas ' +
          'fall back to the body background — the mechanism works but you cannot see it.',
      )
    }
  }

  if (backdrop && surface) {
    if (isPainted(getComputedStyle(surface))) {
      problems.push(
        'The surface has a background and there is a backdrop layer. The surface ' +
          'paints later in tree order, so it covers the backdrop entirely — the ' +
          'backdrop is there, just hidden. Pick one of the two.',
      )
    }
  }

  // The canvas colour is laid over the bars as a translucent film, so a body
  // background chosen as a "fallback" tints every bar whatever is behind it.
  if (controller.edgeSpacePx > 0) {
    const canvas = getComputedStyle(document.documentElement).backgroundColor
    const bodyColour = getComputedStyle(document.body).backgroundColor
    const painted = [canvas, bodyColour].filter(
      (colour) => colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent',
    )
    if (painted.length > 0 && surface) {
      const surfaceColour = getComputedStyle(surface).backgroundColor
      if (
        surfaceColour !== 'rgba(0, 0, 0, 0)' &&
        surfaceColour !== 'transparent' &&
        !painted.includes(surfaceColour)
      ) {
        problems.push(
          `The canvas (${painted[0]}) differs from the surface (${surfaceColour}). ` +
            'The canvas colour is laid over the bars as a translucent film, so the ' +
            'bars will read as a blend of the two rather than as your page.',
        )
      }
    }
  }

  // Clipping happens at the padding box, so the transparent border that makes
  // the band is outside it: the background reaches the band, the children do
  // not. The symptom is "the colour arrives, the artwork does not".
  const surfaceChildren = surface ? [surface.firstElementChild, surface.lastElementChild] : []
  for (const child of surfaceChildren) {
    if (!(child instanceof HTMLElement)) continue
    const overflow = getComputedStyle(child).overflow
    if (controller.edgeSpacePx > 0 && overflow !== 'visible') {
      problems.push(
        `<${child.tagName.toLowerCase()}> is the first or last child of the surface and ` +
          `has overflow: ${overflow}. Its background reaches the bar area but its ` +
          'contents are clipped away. Move the clipping to an inner element.',
      )
      break
    }
  }

  // A wrapper with no background of its own means the rule that extends the
  // first child into the band has nothing to paint with.
  const firstChild = surface?.firstElementChild
  if (controller.edgeSpacePx > 0 && firstChild instanceof HTMLElement) {
    const wrapperPainted = isPainted(getComputedStyle(firstChild))
    const inner = firstChild.firstElementChild
    if (!wrapperPainted && inner instanceof HTMLElement && isPainted(getComputedStyle(inner))) {
      problems.push(
        `The surface's first child (<${firstChild.tagName.toLowerCase()}>) has no ` +
          'background, but its own first child does. Only direct children of the ' +
          'surface reach into the bar area — move the background out to the wrapper.',
      )
    }
  }

  // position: fixed is never composited behind the bars, so a full-screen
  // fixed layer leaves a seam at each bar.
  if (controller.edgeSpacePx > 0) {
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (element.hasAttribute('data-ulg-overlay')) continue
      const style = getComputedStyle(element)
      if (style.position !== 'fixed' || !isPainted(style)) continue
      const box = element.getBoundingClientRect()
      if (box.width >= window.innerWidth * 0.9 && box.height >= window.innerHeight * 0.9) {
        problems.push(
          `A full-screen position: fixed layer (<${element.tagName.toLowerCase()}>) will ` +
            'not be composited behind the bars, whatever you size it to. Use ' +
            'data-ulg-overlay or data-ulg-backdrop.',
        )
        break
      }
    }
  }

  for (const [name, element] of [['backdrop', backdrop], ['overlay', overlay]] as const) {
    if (!element || !scroller) continue
    if (element.parentElement !== scroller) {
      problems.push(`The ${name} layer is not a direct child of the scroller; its sticky position is confined.`)
      continue
    }
    if (getComputedStyle(element).position === 'static') {
      problems.push(`The ${name} layer is position: static — the stylesheet is probably not loaded.`)
    }
  }

  return problems
}

export function attachDiagnostics(
  controller: UnderLiquidGlassController,
  options: DiagnosticsOptions = {},
): () => void {
  if (typeof document === 'undefined') return () => {}

  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px/1.5 ui-monospace,monospace'
  const root = host.attachShadow({ mode: 'open' })

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; font: inherit; }
      .shell {
        background: rgba(2, 6, 23, 0.92);
        color: #eef1fa;
        border: 1px solid rgba(238, 241, 250, 0.24);
        border-radius: 10px;
        font: 11px/1.6 ui-monospace, SFMono-Regular, monospace;
        max-width: min(21rem, calc(100vw - 16px));
        overflow: hidden;
      }
      summary { padding: 7px 10px; cursor: pointer; list-style: none; color: #5ce1c8; }
      summary::-webkit-details-marker { display: none; }
      .body { padding: 0 10px 10px; }
      dl { display: grid; grid-template-columns: 1fr auto; gap: 0 10px; margin: 0; }
      dt { color: #8b95b4; white-space: nowrap; }
      dd { margin: 0; text-align: right; }
      .problems { margin-top: 8px; display: grid; gap: 6px; }
      .problem {
        padding: 6px 8px;
        border-radius: 6px;
        background: rgba(244, 63, 94, 0.16);
        border: 1px solid rgba(244, 63, 94, 0.5);
        color: #ffd7de;
        line-height: 1.45;
      }
      button {
        margin-top: 8px;
        width: 100%;
        padding: 6px;
        border-radius: 6px;
        border: 1px solid rgba(238, 241, 250, 0.24);
        background: none;
        color: inherit;
        cursor: pointer;
      }
      .probe { position: absolute; top: -9999px; width: 1px; }
    </style>
    <div id="p-lvh" class="probe" style="height:100lvh"></div>
    <div id="p-svh" class="probe" style="height:100svh"></div>
    <div id="p-sat" class="probe" style="height:env(safe-area-inset-top)"></div>
    <div id="p-sab" class="probe" style="height:env(safe-area-inset-bottom)"></div>
    <div id="p-sal" class="probe" style="height:env(safe-area-inset-left)"></div>
    <div id="p-sar" class="probe" style="height:env(safe-area-inset-right)"></div>
    <details class="shell" ${options.open ? 'open' : ''}>
      <summary id="summary">under-liquid-glass</summary>
      <div class="body">
        <dl>
          <dt>state</dt><dd id="v-state">—</dd>
          <dt>edgeSpacePx</dt><dd id="v-edge">—</dd>
          <dt>scrollY / target</dt><dd id="v-pin">—</dd>
          <dt>clientHeight / lvh / svh</dt><dd id="v-heights">—</dd>
          <dt>bar overlap</dt><dd id="v-overlap">—</dd>
          <dt>safe-area t/b/l/r</dt><dd id="v-safe">—</dd>
          <dt>address bar</dt><dd id="v-layout">—</dd>
        </dl>
        <div class="problems" id="problems"></div>
        <button type="button" id="outline">Outline the roles</button>
        <button type="button" id="bands">Label the bar areas</button>
      </div>
    </details>
  `

  const style = document.createElement('style')
  style.textContent = outlineStyles() + bandStyles()
  document.head.append(style)
  document.body.append(host)

  const find = (id: string) => root.getElementById(id) as HTMLElement

  const outlineButton = find('outline')
  outlineButton.addEventListener('click', () => {
    const on = document.documentElement.toggleAttribute(OUTLINE_ATTRIBUTE)
    outlineButton.textContent = on ? 'Hide the roles' : 'Outline the roles'
  })

  const bandsButton = find('bands')
  bandsButton.addEventListener('click', () => {
    const on = document.documentElement.toggleAttribute(BANDS_ATTRIBUTE)
    bandsButton.textContent = on ? 'Hide the bar labels' : 'Label the bar areas'
  })

  const round = (value: number) => Math.round(value * 10) / 10

  function update(): void {
    const lvh = measureProbe(root, 'p-lvh')
    const svh = measureProbe(root, 'p-svh')
    const clientHeight = document.documentElement.clientHeight
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - clientHeight)
    const target = Math.min(controller.edgeSpacePx, maxScroll / 2)

    find('v-state').textContent = controller.state
    find('v-edge').textContent = `${round(controller.edgeSpacePx)}px`
    find('v-pin').textContent = `${round(window.scrollY)} / ${round(target)}`
    find('v-heights').textContent = `${round(clientHeight)} / ${round(lvh)} / ${round(svh)}`
    find('v-overlap').textContent = `${round(lvh - svh)}px`
    find('v-safe').textContent = [
      measureProbe(root, 'p-sat'),
      measureProbe(root, 'p-sab'),
      measureProbe(root, 'p-sal'),
      measureProbe(root, 'p-sar'),
    ]
      .map(round)
      .join(' / ')
    // screen.height − 100lvh is ~105 with the address bar at the bottom and
    // ~0 with it at the top; compare against a threshold, not 0.
    find('v-layout').textContent = window.screen.height - lvh > 40 ? 'bottom' : 'top'

    const problems = findProblems(controller, { lvh, svh })
    if (corrections > 20) {
      problems.push(
        `The document has been moved and re-pinned ${corrections} times. Something ` +
          'is scrolling the window — an in-page anchor, focus handling, or a scroll ' +
          'library pointed at the window instead of controller.scroller.',
      )
    }
    find('summary').textContent = problems.length
      ? `under-liquid-glass — ${problems.length} problem${problems.length > 1 ? 's' : ''}`
      : 'under-liquid-glass'
    find('problems').innerHTML = problems
      .map((problem) => `<p class="problem">${problem}</p>`)
      .join('')
  }

  // Something outside the library moving the document shows up as the pin
  // correcting it over and over. One correction is normal; a stream of them
  // means an anchor, a scroll library or focus handling is fighting the pin.
  let corrections = 0
  let lastScrollY = window.scrollY
  const watchScroll = () => {
    if (controller.edgeSpacePx > 0 && Math.abs(window.scrollY - lastScrollY) > 1) {
      corrections += 1
    }
    lastScrollY = window.scrollY
  }
  window.addEventListener('scroll', watchScroll, { passive: true })

  update()
  const timer = setInterval(update, options.intervalMs ?? 250)

  return () => {
    clearInterval(timer)
    window.removeEventListener('scroll', watchScroll)
    document.documentElement.removeAttribute(OUTLINE_ATTRIBUTE)
    document.documentElement.removeAttribute(BANDS_ATTRIBUTE)
    style.remove()
    host.remove()
  }
}
