/* Loads every page's module script in a DOM-less sandbox and reports what it
 * would throw. It catches the failure this project keeps producing: a piece of
 * code is deleted, something that used it is left behind, and the page ends up
 * "subtly wrong" rather than obviously broken.
 *
 * Everything DOM-shaped is stubbed, so a page that runs to the end here has no
 * missing references, no syntax errors and no bad imports. It says nothing
 * about whether the page looks right. */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import vm from 'node:vm'

const root = fileURLToPath(new URL('../_site/', import.meta.url))

function pages(directory) {
  const found = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) found.push(...pages(path))
    else if (entry.endsWith('.html')) found.push(path)
  }
  return found
}

/* A stub that answers anything: property access, calls, `new`, iteration.
 * Real behaviour is irrelevant — we only care whether the code can run. */
function stub() {
  const target = function () {}
  return new Proxy(target, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => 0
      if (key === Symbol.iterator) return function* () {}
      if (key === 'then') return undefined
      if (key === 'length') return 0
      return stub()
    },
    set: () => true,
    has: () => true,
    apply: () => stub(),
    construct: () => stub(),
  })
}

let failures = 0

for (const page of pages(root)) {
  const html = readFileSync(page, 'utf8')
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)
  if (!script) continue

  const name = relative(root, page)
  // Imports resolve against the built dist/, which the sandbox cannot load,
  // so they are replaced with stubs of the same names.
  const body = script[1].replace(
    /import\s*\{([^}]*)\}\s*from\s*'[^']*'/g,
    (_, names) => names.split(',').map((n) => `const ${n.trim()} = __stub()`).join('; '),
  )

  // getElementById answers only for ids the page actually has. Without this,
  // a reference to an element that was deleted from the markup sails through
  // the stub and the page still breaks in a browser.
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
  const documentStub = new Proxy(stub(), {
    get(_, key) {
      if (key === 'getElementById') {
        return (id) => {
          if (ids.has(id)) return stub()
          throw new Error(`document.getElementById('${id}') is null — no such id in the markup`)
        }
      }
      return stub()
    },
  })

  const sandbox = {
    __stub: stub,
    window: stub(),
    document: documentStub,
    location: { search: '' },
    navigator: stub(),
    screen: { height: 844, width: 390 },
    console,
    URLSearchParams,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    setInterval: () => 0,
    setTimeout: () => 0,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => 0,
    addEventListener: () => {},
  }
  sandbox.globalThis = sandbox

  try {
    vm.runInNewContext(body, vm.createContext(sandbox), { filename: name })
    console.log(`  ok    ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL  ${name}\n        ${error.message}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} page(s) would throw.`)
  process.exit(1)
}
