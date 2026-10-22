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
// Message roots the scan should find. Empty means "no messages on the page",
// which is how the per-block tests below keep judging blocks individually.
const messages = []

// The stub answers by selector rather than returning one fixed list, because
// the scan now asks two different questions ("which message roots?" and
// "which blocks?") and a stub that ignores the selector silently feeds blocks
// where message roots are expected.
function isMessageSelector(selector) {
  return typeof selector === 'string' && selector.includes('markdown')
}
// Components and line scopes are exercised in a real browser
// (scripts/browser-test.mjs); here they are simply absent from the page.
function isBrowserOnlySelector(selector) {
  return typeof selector === 'string' && (selector.includes('data-genui') || selector.includes('data-question-key'))
}

globalThis.document = {
  createElement: makeStyleEl,
  head: { appendChild() {} },
  body: {
    nodeType: 1,
    matches: () => false,
    closest: () => null,
    querySelectorAll: (selector) =>
      isBrowserOnlySelector(selector) ? [] : isMessageSelector(selector) ? messages : blocks,
  },
  // No composer on the stub page; the browser test covers it.
  querySelectorAll: () => [],
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
function block(text, tagName = 'P') {
  const applied = {}
  return {
    tagName,
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

/** A message root stub holding the blocks the scan should find inside it. */
function message(children) {
  return {
    nodeType: 1,
    tagName: 'DIV',
    matches: () => false,
    closest: () => null,
    querySelectorAll: () => children,
    children,
  }
}

/** Run one message through the scan and return its blocks. */
function scanOneMessage(children) {
  messages.length = 0
  messages.push(message(children))
  blocks.length = 0
  mod.factory(() => {}).apply({ effect: () => {} })
  messages.length = 0
  return children
}

const cases = [
  ['Hebrew dominant', 'היום בדקנו את הפלאגין החדש עם DSH והכול עבד מצוין.', 'rtl'],
  ['Hebrew opening with a Latin name', 'DSH הוא כלי מצוין לעבודה יומיומית.', 'rtl'],
  ['Pure Hebrew', 'זהו משפט בעברית בלבד ללא אנגלית.', 'rtl'],
  ['Latin dominant with one Hebrew word', 'This is a test sentence with שלום in the middle.', 'rtl'],
  ['Opens in Hebrew but Latin dominates', 'שלום everyone, the meeting starts at 10:00 tomorrow.', 'rtl'],
  ['Latin with a Hebrew word mid-sentence', 'Please check that the כותרת appears correctly.', 'rtl'],
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

  // Any Hebrew at all makes the line RTL — including English prose that
  // merely names two Hebrew fields. That is the accepted cost of the rule.
  [
    'English prose naming Hebrew fields',
    'The build failed because the כותרת field and the תיאור field were both empty on submit.',
    'rtl',
  ],
  // The case that motivated the rule: a line opening with a Latin word, with
  // more Latin than Hebrew, that must still read RTL.
  ['Mixed line opening with a Latin word', '1. Rollout: מוסיפים minPodsPerReplicaSet: 2', 'rtl'],
  ['Mixed line with Latin majority', 'canonical-revision=canary. minAvailable: 50%, unhealthyPodEvictionPolicy: AlwaysAllow בוחר רק pods עם', 'rtl'],
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

// --- A table is one directional unit ----------------------------------------
//
// Regression guard for a real misrender: when cells were judged individually,
// a six-row status table got three different verdicts — Hebrew label cells
// went RTL while the `HEAD` and `Commits` cells beside them stayed LTR — so
// the label column changed edges from row to row. The table must decide once.

const tableRows = [
  ['ריפו', 'github.com/kfirsch/dsh-hebrew-rtl (פרטי)'],
  ['HEAD', 'dd27fe00d2cc7e0f9b68c0b3beb36d20c6a41884'],
  ['Commits', '18'],
  ['בדיקות', '20/20'],
  ['plugin_check', '0 שגיאות, 17/20'],
  ['חיווט מקומי', 'link: — עובד, אומת בבוט אמיתי'],
]

// Judged alone, these cells disagree; the selector must not reach them.
const cellVerdicts = tableRows.flat().map((text) => {
  const cell = block(text)
  blocks.length = 0
  blocks.push(cell)
  mod.factory(() => {}).apply({ effect: () => {} })
  return cell.applied.direction
})
check(
  'cells judged alone would disagree (why table-level is needed)',
  new Set(cellVerdicts).size > 1,
  true,
)

// The whole table, judged as one block, gets a single verdict.
const table = block(`המצב הנוכחי ${tableRows.flat().join(' ')}`)
blocks.length = 0
blocks.push(table)
mod.factory(() => {}).apply({ effect: () => {} })
check('a Hebrew status table resolves to one RTL verdict', table.applied.direction, 'rtl')
check('the table isolates its bidi context', table.applied['unicode-bidi'], 'isolate')

// --- A list is one directional unit too -------------------------------------
//
// Same failure one level down, and it shipped because the table fix was not
// generalised. In a Hebrew numbered list, a short all-Latin item ("push") has
// no Hebrew to weigh, so it got no verdict, fell back to the page's LTR, and
// jumped to the opposite margin from its RTL siblings — breaking the numbering
// column. The list must decide once, exactly like the table.

const listItems = ['commit — שני התיקונים', 'בדיקות לשניהם (אין כרגע; זו הסיבה שהבאגים עברו)', 'push']

const itemVerdicts = listItems.map((text) => {
  const item = block(text)
  blocks.length = 0
  blocks.push(item)
  mod.factory(() => {}).apply({ effect: () => {} })
  return item.applied.direction
})
check(
  'items judged alone would disagree (why list-level is needed)',
  new Set(itemVerdicts).size > 1,
  true,
)

const list = block(listItems.join(' '))
blocks.length = 0
blocks.push(list)
mod.factory(() => {}).apply({ effect: () => {} })
check('a Hebrew list resolves to one RTL verdict', list.applied.direction, 'rtl')

// --- Composite parts are never selected directly ----------------------------
//
// The three shipped bugs (table cells, list items, KaTeX spans) were all the
// same mistake: a selector reaching a PART of a composite element. Assert the
// selectors themselves, since a verdict test cannot catch a bad selector.

const source = readFileSync(join(root, 'lib/client.js'), 'utf8')
const blockSelector = /var BLOCK_SELECTOR = '([^']+)'/.exec(source)?.[1] ?? ''
check('block selector targets whole lists, not items', /\bul\b/.test(blockSelector) && !/\bli\b/.test(blockSelector), true)
check('block selector targets whole tables, not cells', /\btable\b/.test(blockSelector) && !/\btd\b/.test(blockSelector), true)
check('plaintext CSS excludes KaTeX subtrees', source.includes(':not(.katex):not(.katex *)'), true)

// --- The message decides; its blocks inherit --------------------------------
//
// A block alone is not always enough context. In a Hebrew answer a heading is
// one line, often entirely Latin, so per-block judging left it LTR beside its
// own RTL body and the document alternated sides heading by heading.

{
  // The reported case: a Hebrew answer about two Kubernetes projects, whose
  // headings are bare project names with no Hebrew in them at all.
  const intro = block('שני פרויקטים שונים לגמרי בשכבה, גם אם שניהם k8s + AI agents:', 'P')
  const headingNoHebrew = block('agent-sandbox (SIG Apps, kubernetes-sigs)', 'H3')
  const body = block('שכבת תשתית/ריצה — CRD בשם Sandbox שמנהל pod יחיד, stateful, עם זהות יציבה.', 'P')
  const headingSomeHebrew = block('kagent (Solo.io, כיום CNCF Sandbox project)', 'H3')
  scanOneMessage([intro, headingNoHebrew, body, headingSomeHebrew])

  check('a Hebrew message resolves its own paragraphs to RTL', body.applied.direction, 'rtl')
  check('an all-Latin heading inherits the message direction', headingNoHebrew.applied.direction, 'rtl')
  check('a mostly-Latin heading inherits it too', headingSomeHebrew.applied.direction, 'rtl')
  check(
    'sibling headings agree with each other',
    headingNoHebrew.applied.direction === headingSomeHebrew.applied.direction,
    true,
  )
}

{
  // A whole paragraph with no Hebrew keeps LTR: it is prose in its own right,
  // and forcing RTL pushes the run to the far margin and migrates its trailing
  // punctuation to the wrong end.
  const heb = block('הנה ההסבר מהתיעוד:', 'P')
  const englishPara = block(
    'The decision engine spawned more pods than the scheduler could bin-pack efficiently, so the volume claims grew past the provisioned baseline.',
    'P',
  )
  scanOneMessage([heb, englishPara])
  check('an all-Latin paragraph opts out and stays LTR', englishPara.applied.direction, undefined)
  check('the Hebrew paragraph beside it is still RTL', heb.applied.direction, 'rtl')
}

{
  // The exception must not decide the rule it is exempt from. Counting that
  // big English paragraph scored hebrew=8 latin=62 and flipped the whole
  // message to LTR — so the message vote skips exactly the blocks that opt out.
  const a = block('הנה ההסבר:', 'P')
  const b = block('זה מה שחשוב לדעת.', 'P')
  const bigEnglish = block(
    'The decision engine spawned significantly more pods than the scheduler could bin-pack efficiently, which caused the persistent volume claims to grow well beyond the provisioned baseline. Because each sandbox retains a stable identity across hibernate and resume cycles, the storage footprint accumulates rather than being reclaimed between runs.',
    'P',
  )
  const heading = block('agent-sandbox', 'H3')
  scanOneMessage([a, b, bigEnglish, heading])
  check('a large English paragraph cannot flip the message', heading.applied.direction, 'rtl')
}

{
  // An English answer quoting Hebrew field names: the line with Hebrew is
  // RTL, but the MESSAGE stays English (dominance), so its Latin heading and
  // its Latin paragraphs keep their own direction.
  const p1 = block('The form has three broken fields.', 'P')
  const p2 = block('The כותרת field, the תיאור field and the שם field all reject valid input.', 'P')
  const heading = block('Broken fields', 'H3')
  scanOneMessage([p1, p2, heading])
  check('a line quoting Hebrew names is RTL (any Hebrew)', p2.applied.direction, 'rtl')
  check('its all-English sibling paragraph is left alone', p1.applied.direction, undefined)
  check('an all-Latin heading of an English message is not dragged to RTL', heading.applied.direction, undefined)
}

// --- A tie resolves to RTL --------------------------------------------------
//
// "Waste (שולי)" — one Latin word, one Hebrew word — used to fall back to
// first-strong and render LTR above an RTL paragraph, leaving the heading
// misaligned with its own body text.

const tie = block('Waste (שולי)')
blocks.length = 0
blocks.push(tie)
mod.factory(() => {}).apply({ effect: () => {} })
check('an even Hebrew/Latin split resolves to RTL', tie.applied.direction, 'rtl')

// --- Cmd+Left / Cmd+Right swap ----------------------------------------------

function field(value, caret) {
  return {
    tagName: 'TEXTAREA',
    matches: () => false,
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
check('a line opening with Latin but holding Hebrew is RTL too', press(field('Rollout: מוסיפים שורה', 3), 'ArrowRight'), [0, 0, undefined])
check('Shift extends and keeps a backward selection', press(field(hebrew, 5), 'ArrowRight', true), [0, 5, 'backward'])

// --- Host half --------------------------------------------------------------

const host = await import(join(root, 'lib/index.js'))
check('host half exports apply', typeof host.apply, 'function')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
