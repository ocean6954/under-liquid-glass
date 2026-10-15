# under-liquid-glass

Put content of your choosing behind Safari's Liquid Glass bars.

English · [日本語](./README.ja.md)

The bar areas show whatever document content sits at those coordinates. On an ordinary page you get no say in that — mid-scroll the bars pick up whatever is next to your current position, and at the top or bottom there is nothing there at all. This library hands you that space: the document is held permanently away from its own edges, so the content you put in the bar areas is the content that shows, at every scroll position.

Zero dependencies, framework-agnostic, about 2 kB of JS plus a stylesheet. It engages only on iOS Safari and folds back to an ordinary page anywhere else.

## How it works

Beyond the document's edges there is nothing to be behind the bars, so the bars fall back to their own fill. The edge space (the `edgeSpace` option) is how much taller than the viewport the document is made, half of it above and half below. So:

1. `html` and `body` get `overflow: hidden` — the user cannot scroll the document, but scripts still can. `body` also loses its default margin, so the document is exactly the scroller's size.
2. An inner scroller (`[data-ulg-scroller]`, height `100svh + 2 × edge space`) takes all user scrolling.
3. The surface (`[data-ulg-surface]`) pads content down by one edge space, so your content starts below the bars rather than under them.
4. The runtime pins the document at `scrollY = edge space` and keeps it there. Page content now exists above and below the viewport at all times, and that is what the bars show.

The stylesheet is the single source of truth for whether any of this applies. It engages on touch WebKit only, and the runtime reads the resolved value back rather than testing the condition again.

## Quick start

```sh
npm install under-liquid-glass
```

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<body>
  <div data-ulg-scroller>
    <div data-ulg-backdrop><!-- the page background goes here --></div>
    <div data-ulg-surface>
      <!-- your app -->
    </div>
  </div>
</body>
```

```ts
import 'under-liquid-glass/style.css'
import { underLiquidGlass } from 'under-liquid-glass'

const glass = underLiquidGlass({
  edgeSpace: 140, // must exceed what the bars cover; 60-120px on iPhone
  onStateChange: (state) => console.log(state),
})
```

`viewport-fit=cover` does nothing for the bars in portrait, but it is what lets the page extend past the camera housing in landscape. Keep it.

Call `underLiquidGlass()` once the DOM exists and before anything of yours reads or writes a scroll position. In a framework this is not simply "the first `onMounted`" — children mount before parents — so what matters is ordering against your own scroll code.

## Layout helpers

Mark an element's role and the stylesheet handles its geometry. Each folds back to something sensible where the mechanism is inactive.

| Attribute | What it does |
| --- | --- |
| `data-ulg-scroller` | Takes user scrolling. Required. Point router scroll restoration and "back to top" at `controller.scroller`, not at `window`. |
| `data-ulg-surface` | Holds your content, padded down by one edge space. Required, inside the scroller. |
| `data-ulg-backdrop` | The page background. Sticky against the scrollport, so it covers the bar areas at any scroll position. Direct child of the scroller, before the surface. |
| `data-ulg-overlay` | A full-screen layer on top, same mechanism. Direct child of the scroller, before the surface. Lock scrolling with `touch-action`, not `overflow: hidden`. |

The first and last children of the surface reach into the bar areas automatically — a transparent border grows the box while the content stays put, so the first screen's background is behind the bars without you doing anything. `background-origin` is set with it, so a `background-image` covers the band rather than stopping short of it. The rule reaches direct children only: if you wrap your page in a `<main>`, give that wrapper the background.

### Paint in one place

Everything in the document reaches the bars: they show whatever sits at their coordinates.

- Put the page background on `[data-ulg-backdrop]` — flat colour, gradient, image, video. This is a recommendation, not a requirement: one place takes every kind of background, so turning a colour into a video later does not mean moving it.
- Leave `[data-ulg-surface]` unpainted. A background there covers the backdrop completely.
- A static colour or image on `body` works too. It becomes the canvas, which stays put behind the pinned document and reaches the bars like the backdrop does (measured on iOS 26). It cannot hold elements or video, though, and painted alongside the backdrop it is hidden while pinned and only shows at an edge or after folding back — two places to check when the bars look wrong.
- Section backgrounds are the exception. They are not page-wide, so put them on the sections and they carry into the bars as those sections scroll through.

## Turning it off

Not calling `underLiquidGlass()` does not give you a normal page: the stylesheet's `overflow: hidden` applies as soon as the CSS loads. Use `<html data-ulg-unlocked>` or `underLiquidGlass({ enabled: false })`. The attribute is yours if you write it — the runtime only removes one it set itself.

## API

| Member | Description |
| --- | --- |
| `underLiquidGlass(options?)` | Installs listeners, pins the document, returns a controller. Inert outside the browser, so it is safe in SSR bundles. |
| `options.edgeSpace` | Edge space in px (default 140). Must exceed what the bars cover — 60–120 px measured on iPhone. The first and last children grow by this much, so a smaller value crops a `background-image` on them less. |
| `options.enabled` | `false` keeps the page an ordinary document. |
| `options.settleDelayMs` | Quiet time before concluding scripted scrolling is unsupported (default 500). |
| `options.recoveryLimit` / `options.rangeRetryLimit` | How many times to re-engage, and to re-check a scroll range that looks too small (default 3 each). |
| `options.onStateChange` | `(state, controller)` — `'pinned'`, `'unlocked'` (folded back) or `'inactive'` (gate not matched). |
| `controller.state` / `controller.edgeSpacePx` | Current state and effective edge space. |
| `controller.scroller` | The element that actually scrolls, or `null` when the mechanism is not engaged. Write `controller.scroller ?? window`. |
| `controller.scrollTo(target, options?)` | Bring an element to the top of the visible area, coordinates and edge space handled for you. |
| `controller.refresh()` / `controller.destroy()` | Re-measure and re-pin; remove listeners and restore attributes. |
| `attachDiagnostics(controller)` | From `under-liquid-glass/debug`. See Diagnostics. |
| `EDGE_SPACE_CHANGE_EVENT` | Fired on `document.documentElement` when the effective edge space flips. |

These custom properties are public and resolve correctly whether or not the mechanism is engaged:

| Property | Value |
| --- | --- |
| `--ulg-edge-space` | The effective edge space, `0px` when inactive or folded. Read-only; write `--ulg-edge-space-config`. |
| `--ulg-viewport-height` | `100svh` inside the mechanism, `100dvh` outside. Content that must not be covered by a bar. |
| `--ulg-visible-height` | The visible window, bar areas included. What a full-screen section should be — `100svh` leaves it one bar overlap short. Outside the mechanism both fall back to `100dvh`, which reflows as the browser chrome resizes; clamp with `min(var(--ulg-viewport-height), 100svh)` if that matters. |

## Pitfalls

- Do not move `window.scrollY`. In-page anchors, `scrollIntoView` and focus auto-scrolling all move the document and get cancelled by the pin. Use `controller.scrollTo()` instead.
- `scroll-behavior: smooth` on the document breaks the pin — the scroll becomes asynchronous and the runtime reads it as "scripted scrolling does not work here". The pin scrolls instantly regardless and the runtime warns, but your own `window.scrollTo` calls will still be cancelled mid-flight.
- `position: fixed` is not composited behind the bars, however you size it. Use `data-ulg-overlay` or `data-ulg-backdrop`; both are sticky against the scrollport.
- An ancestor with `overflow: hidden` kills those sticky layers — `body { overflow-x: hidden }` is the usual culprit, and locking the scroller that way collapses a shown overlay.
- `overflow: hidden` on the first or last child of the surface hides everything but its background from the bar area: clipping happens at the padding box, outside the transparent border that makes the band. The colour arrives, the artwork does not. Move the clipping inward.
- Sizing the first or last child needs the border in the sum. With `box-sizing: border-box`, add it back: `min-height: calc(var(--ulg-visible-height) + var(--ulg-edge-space))`.
- Smooth-scrolling libraries need the scroller, and so does your own code. Point the library at `controller.scroller ?? window` — with Lenis that is the `wrapper` option, reported working but not tested here. Anything reading `window.scrollY` or `offsetTop` breaks; use `getBoundingClientRect()` against the scroller.
- Viewport-anchored coordinates shift by the edge space. Subscribe to `EDGE_SPACE_CHANGE_EVENT` and offset by `edgeSpacePx`.
- The top bar area cannot be measured. `env(safe-area-inset-top)` reads 0 under Safari's own UI, and `100lvh − 100svh` covers only the address bar's expansion — measured at 40, 94 and 199 px on one iPhone depending on the bar state and which end the address bar sits. This is why the edge space is generous rather than exact. The other three insets do work, and are what keeps content clear of the camera housing in landscape.
- The stylesheet is the mechanism, not a theme. It sets geometry and paints nothing.

## Known limits

iPad matches the gate, so the mechanism engages there, but none of it has been verified on one. Keyboard interaction needs care rather than being handled for you.

## When it works but you can't see it

Bar translucency is a user setting. If one device shows opaque bars while others are fine, check Reduce Transparency, Increase Contrast, and the Liquid Glass appearance setting. Note that iOS 26 Safari ignores `theme-color` — bar tint comes from the content behind the bar.

## Diagnostics

When something looks wrong, attach the diagnostics to your own page:

```ts
import { attachDiagnostics } from 'under-liquid-glass/debug'
if (import.meta.env.DEV) attachDiagnostics(glass)
```

A panel appears with your device's measurements, and it names the conditions that make a page look broken without breaking it — a scroller that is no longer a scroll container, a surface painted over the backdrop, a sticky layer in the wrong place. It can outline every element the library knows about and paint readable words into the bar areas: if you can read TOP through the status bar, content is arriving and any remaining plainness is the device's transparency setting. Separate entry point, so none of it reaches your production bundle. `attachDiagnostics` returns a function that removes it.

`diag.html` also ships in the package for when you cannot run your own build on the device: `cp node_modules/under-liquid-glass/diag.html public/`.

## Trade-offs

You gain edge-to-edge visuals on iOS Safari. You give up the collapsing address bar in portrait, take on a document structure the whole page must follow, and depend on undocumented Safari compositing that may change in any iOS release. If "the bars pick up my body background colour" is enough, you don't need this.

## License

MIT
