import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8')

/* The stylesheet paints none of the page's own layers.
 *
 * A background on the surface covers the backdrop (same painting step, later
 * in tree order), so the stylesheet must never put one there. The canvas is
 * the page's to paint: a static colour or image on body is a valid choice
 * (measured on iOS 26 — it reaches the bars and does not tint them), so the
 * library must not set one either. */
function declarationsFor(selector: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const found: string[] = []
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const rawSelector = match[1] ?? ''
    const body = match[2] ?? ''
    if (!rawSelector.split(',').some((part: string) => part.trim() === selector)) continue
    for (const declaration of body.split(';')) {
      const property = declaration.split(':')[0]?.trim()
      if (property) found.push(property)
    }
  }
  return found
}

/* The band a first or last child grows into is border area, and
 * background-origin defaults to padding-box: without this declaration a
 * no-repeat cover image is sized and placed against the box without the band
 * and leaves it empty. Colours and gradients hide the omission, which is how
 * it went unnoticed. */
describe('the bands take background images too', () => {
  for (const selector of ['[data-ulg-surface] > :first-child', '[data-ulg-surface] > :last-child']) {
    it(`anchors the background of ${selector} to the border box`, () => {
      expect(declarationsFor(selector)).toContain('background-origin')
    })
  }
})

describe('the stylesheet paints nothing but the layers meant to be seen', () => {
  it('leaves the surface unpainted', () => {
    const painted = declarationsFor('[data-ulg-surface]').filter((property) =>
      property.startsWith('background'),
    )
    expect(painted).toEqual([])
  })

  it('leaves the canvas unpainted', () => {
    for (const selector of ['html', 'body', ':root']) {
      const painted = declarationsFor(selector).filter((property) =>
        property.startsWith('background'),
      )
      expect(painted, selector).toEqual([])
    }
  })

  it('gives the backdrop the geometry a page-wide background needs', () => {
    const declarations = declarationsFor('[data-ulg-backdrop]')
    expect(declarations).toContain('position')
    expect(declarations).toContain('height')
  })
})

/* The document must be exactly the scroller's size. The UA margin on body
 * makes it 16px taller and 16px narrower, so the backdrop stops short of the
 * screen's sides. The reset is scoped to the pinned state; restoring it under
 * [data-ulg-unlocked] instead would override the page's own body margin. */
describe('body adds nothing around the scroller', () => {
  it('drops the body margin while pinned', () => {
    expect(declarationsFor('html:not([data-ulg-unlocked]) body')).toContain('margin')
  })

  it('leaves the margin to the page once folded', () => {
    expect(declarationsFor('html[data-ulg-unlocked] body')).not.toContain('margin')
  })
})
