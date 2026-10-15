/* Assembles the published site into _site/.
 *
 * The page dogfoods the library, so it needs the built dist/ next to it, and
 * it links to the demo and the diagnostics page. Everything is copied rather
 * than referenced across directories so the output can be served from any
 * static host without rewriting paths. */
import { cp, mkdir, rm } from 'node:fs/promises'

const out = new URL('../_site/', import.meta.url)

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

await cp(new URL('../site/', import.meta.url), out, { recursive: true })
await cp(new URL('../dist/', import.meta.url), new URL('dist/', out), { recursive: true })
await cp(new URL('../demo/', import.meta.url), new URL('demo/', out), { recursive: true })
await cp(new URL('../diag.html', import.meta.url), new URL('diag.html', out))

console.log('built _site/')
