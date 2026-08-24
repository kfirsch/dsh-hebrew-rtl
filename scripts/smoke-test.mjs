// Smoke test: load both halves in a minimal fake DOM and assert the two
// behaviours that are easy to break — the dominant-script direction rule and
// the RTL line-navigation swap.
//
// Deliberately dependency-free (`node scripts/smoke-test.mjs`): the client
// bundle is a classic script that self-registers through a global, so it is
// evaluated here with `new Function` against hand-rolled stubs rather than
// through a DOM framework.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

// --- Load the client bundle against stubs -----------------------------------

const blocks = []
let keyHandler = null

function makeStyleEl() {
  return { setAttribute() {}, remove() {}, textContent: '' }
}

globalThis.window = {
  __ModuleLoader__: { load: (m) => (globalThis.__loaded = m) },
  getComputedStyle: () => ({ direction: 'ltr' }),
}
globalThis.document = {
  createElement: makeStyleEl,
  head: { appendChild() {} },
  body: {
    nodeType: 1,
    matches: () => false,
    querySelectorAll: () => blocks,
  },
  addEventListener: (type, fn) => {
    if (type === 'keydown') keyHandler = fn
  },
  removeEventListener() {},
}
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
}
globalThis.requestAnimationFrame = (fn) => fn()

new Function(readFileSync(join(root, 'lib/client.js'), 'utf8'))()

const mod = globalThis.__loaded
check('client registers under the package id', mod.id, 'dsh-hebrew-rtl')
check('client exports apply', Object.keys(mod.factory(() => {})), ['apply'])

// --- Direction rule ---------------------------------------------------------

/** A block element stub that records the inline styles applied to it. */
function block(text) {
  const applied = {}
  return {
    textContent: text,
    matches: () => false,
    closest: () => null,
    style: {
      direction: '',
      setProperty(k, v) {
        applied[k] = v
        if (k === 'direction') this.direction = v
      },
      removeProperty(k) {
        delete applied[k]
        if (k === 'direction') this.direction = ''
      },
    },
    applied,
  }
}

const cases = [
  ['Hebrew dominant', 'היום בדקנו את הפלאגין החדש עם DSH והכול עבד מצוין.', 'rtl'],
  ['Hebrew opening with a Latin name', 'DSH הוא כלי מצוין לעבודה יומיומית.', 'rtl'],
  ['Pure Hebrew', 'זהו משפט בעברית בלבד ללא אנגלית.', 'rtl'],
  ['Latin dominant with one Hebrew word', 'This is a test sentence with שלום in the middle.', 'ltr'],
  ['Opens in Hebrew but Latin dominates', 'שלום everyone, the meeting starts at 10:00 tomorrow.', 'ltr'],
  ['Latin with a Hebrew word mid-sentence', 'Please check that the כותרת appears correctly.', 'ltr'],
  ['No Hebrew at all', 'No Hebrew characters at all in this line.', undefined],

  // Technical Hebrew prose — the case that broke the letter-counting rule.
  // Counted raw, the single URL token contributes 44 Latin letters on its own
  // and flips an otherwise Hebrew paragraph to LTR.
  [
    'Hebrew prose citing URLs and identifiers',
    'בדקתי: משיכת ה-tarball האנונימית מ-codeload מחזירה 404. ההתקנה הצליחה רק כי pnpm נפל חזרה ל-git+https, ולמכונה הזאת יש credential helper מאומת (gh מחובר כ-kfirsch). ה-lockfile מקליט git+https://git@github.com:kfirsch/...#<sha> — לא כתובת tarball.',
    'rtl',
  ],
  ['Hebrew table row naming a package', '| שם החבילה | dsh-hebrew-rtl |', 'rtl'],
  ['Hebrew sentence quoting a command', 'הרצתי npm test על הריפו וקיבלתי 15/15 — הכול עובר.', 'rtl'],

  // The mirror image: dropping code tokens must not drag real English prose
  // to RTL merely because it names two Hebrew fields.
  [
    'English prose naming Hebrew fields',
    'The build failed because the כותרת field and the תיאור field were both empty on submit.',
    'ltr',
  ],
  // Every Hebrew character sits inside a stripped token, so no Hebrew prose
  // remains to speak for the block: leave it to the plaintext heuristic.
  ['English prose with paths and commands', 'The plugin lives in ~/workDir/dsh-plugins and exports apply.', undefined],
]

blocks.push(...cases.map(([, text]) => block(text)))
mod.factory(() => {}).apply({ effect: () => {} })

cases.forEach(([name, , expected], i) => {
  check(`direction: ${name}`, blocks[i].applied.direction, expected)
})

const rtlBlock = blocks[cases.findIndex(([, , d]) => d === 'rtl')]
check('forced blocks isolate their bidi context', rtlBlock.applied['unicode-bidi'], 'isolate')

// --- Cmd+Left / Cmd+Right swap ----------------------------------------------

function field(value, caret) {
  return {
    tagName: 'TEXTAREA',
    value,
    selectionStart: caret,
    selectionEnd: caret,
    selectionDirection: 'none',
    setSelectionRange(start, end, dir) {
      this.range = [start, end, dir]
    },
  }
}

function press(el, key, shiftKey = false) {
  keyHandler({ metaKey: true, altKey: false, ctrlKey: false, shiftKey, key, target: el, preventDefault() {} })
  return el.range
}

const hebrew = 'שלום עולם זהו משפט בעברית'

check('Cmd+Left on an RTL line goes to the visual left (line end)', press(field(hebrew, 5), 'ArrowLeft'), [hebrew.length, hebrew.length, undefined])
check('Cmd+Right on an RTL line goes to the visual right (line start)', press(field(hebrew, 5), 'ArrowRight'), [0, 0, undefined])
check('an LTR line is left untouched', press(field('hello world plain english', 5), 'ArrowLeft'), undefined)
check('Shift extends and keeps a backward selection', press(field(hebrew, 5), 'ArrowRight', true), [0, 5, 'backward'])

// --- Host half --------------------------------------------------------------

const host = await import(join(root, 'lib/index.js'))
check('host half exports apply', typeof host.apply, 'function')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
