// Browser test: load lib/client.js into a real Chrome page built from the
// DOM shapes the DSH web GUI actually renders, and assert where the text
// ends up — the line's direction and which edge it sits against.
//
// The smoke test (scripts/smoke-test.mjs) checks verdicts against stubs. It
// cannot see layout, and every bug this file guards against was a layout bug
// that a verdict test passed: a GenUI step line opening with a Latin word
// rendered LTR because a <span> with `unicode-bidi: plaintext` picked its own
// direction from its first strong character.
//
// Dependency-free: drives headless Chrome with --dump-dom and reads the
// results the page writes into <title>. Set CHROME to override the binary.
// Pass --screenshot to also write scripts/browser-test.png for a visual check.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)
const chrome = CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.log('SKIP  no Chrome/Chromium found (set CHROME=/path/to/chrome)')
  process.exit(0)
}

const client = readFileSync(join(root, 'lib/client.js'), 'utf8')

// Fixtures mirror the real markup (class names carry the CSS-module hash
// prefix the GUI emits; attributes are the stable hooks the plugin uses).
const fixtures = String.raw`
<div data-chat-flow="">

  <!-- User message bubble (ui-chat MessageItem.tsx UserStyleBubble). -->
  <div data-chat-flow-key="u1" class="zgjOKa_userRow" style="display:flex;justify-content:flex-end">
    <div class="zgjOKa_userStack" style="max-width:70%">
      <div id="bubble" class="zgjOKa_bubble" style="white-space:pre-wrap"><span class="zgjOKa_plainRun">RTL test: אני בודק תמיכה מלאה ב-RTL בעברית, אנא הציג כל דוגמה נפרדת עם כותרת ברורה כדי שאוכל לוודא
Hello, world.</span></div>
    </div>
  </div>

  <!-- Assistant markdown message (ui-primitives MarkdownText). -->
  <div data-chat-flow-key="a1">
    <div class="XyZ12a_markdown">
      <h3 id="h-latin">agent-sandbox (SIG Apps)</h3>
      <p id="p-mixed">Rollout: מוסיפים minPodsPerReplicaSet: 2 ל-Argo</p>
      <p id="p-english">This paragraph is entirely English and keeps its own direction.</p>
      <ol id="ol"><li>פריט ראשון</li><li id="li-latin">push</li></ol>
      <pre id="pre"><code>// בדיקת כיוון בעברית
const x = 1</code></pre>
    </div>
  </div>

  <!-- GenUI steps block (dsh-genui GenuiBlock.tsx + advanced.tsx StepsNode). -->
  <div data-chat-flow-key="a2">
    <div class="genui-dom-fence">
      <div class="V1MMBW_block" data-genui="true">
        <div class="V1MMBW_banner" id="genui-title">מינימום אפקטיבי ≥ rollout + 2</div>
        <div class="V1MMBW_col" style="display:flex;flex-direction:column">
          <div class="V1MMBW_reveal">
            <ol class="V1MMBW_steps" id="steps" style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px">
              <li class="V1MMBW_step V1MMBW_stepDone " id="step1" style="position:relative;display:flex;gap:12px;align-items:flex-start">
                <span class="V1MMBW_stepMarker" id="marker1" style="width:24px;height:24px;flex-shrink:0">✓</span>
                <span class="V1MMBW_stepContent" style="display:flex;flex-direction:column">
                  <span class="V1MMBW_stepTitle" id="step1-title"><span>1. Rollout: מוסיפים minPodsPerReplicaSet: 2</span></span>
                  <span class="V1MMBW_stepDesc" id="step1-desc"><span>canonical-revision=canary. minAvailable: 50%, unhealthyPodEvictionPolicy: AlwaysAllow בוחר רק pods עם</span></span>
                </span>
              </li>
              <li class="V1MMBW_step V1MMBW_stepDone " style="position:relative;display:flex;gap:12px;align-items:flex-start">
                <span class="V1MMBW_stepMarker" style="width:24px;height:24px;flex-shrink:0">✓</span>
                <span class="V1MMBW_stepContent" style="display:flex;flex-direction:column">
                  <span class="V1MMBW_stepTitle" id="step2-title"><span>2. ה-PDB הקיים הופך ל-PDB של stable</span></span>
                </span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- An English GenUI block with one Hebrew value: layout stays LTR. -->
  <div data-chat-flow-key="a3">
    <div class="V1MMBW_block" data-genui="true" id="genui-en">
      <div class="V1MMBW_banner">Deployment status for the production cluster this week</div>
      <span id="genui-en-line">Owner: צוות תשתיות</span>
    </div>
  </div>
</div>

<!-- ask_user_question card (ui-user-questions QuestionComposer.tsx). -->
<div class="sV4CTq_frame" data-question-key="q1" id="question">
  <div class="sV4CTq_card">
    <header class="sV4CTq_header" style="display:flex">
      <div class="sV4CTq_headingBlock">
        <div class="sV4CTq_eyebrow">בדיקת תצוגה</div>
        <h2 class="sV4CTq_title" id="q-title">כל הפריטים למעלה מוצגים נכון?</h2>
      </div>
      <div class="sV4CTq_headerActions"><button>x</button></div>
    </header>
    <div class="sV4CTq_body">
      <div class="sV4CTq_options">
        <button class="sV4CTq_option" id="q-option" style="display:flex;gap:8px;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit">
          <span class="sV4CTq_number" id="q-number" style="flex:0 0 20px">1</span>
          <span class="sV4CTq_optionCopy" style="flex:1;min-width:0">
            <span class="sV4CTq_optionLine" style="display:flex;flex-wrap:wrap;gap:2px 6px">
              <span class="sV4CTq_optionLabel" id="q-label">Yes, הכל בסדר</span>
              <span class="sV4CTq_description" id="q-desc">לא נראה שום בעיית תצוגה.</span>
            </span>
          </span>
        </button>
      </div>
    </div>
    <footer class="sV4CTq_footer"><button>Skip this question</button><button>Submit</button></footer>
  </div>
</div>

<!-- Sidebar: out of scope, must stay untouched. -->
<nav id="sidebar"><div id="side-row">Workspace: dsh-hebrew-rtl פרויקט</div></nav>
`

// Probes run after the plugin has scanned. Each returns a JSON-able value.
const probe = String.raw`
function el(id) { return document.getElementById(id) }
function dir(id) { return getComputedStyle(el(id)).direction }
/** Left edge of a word inside an element, in px. */
function wordLeft(id, word) {
  const walker = document.createTreeWalker(el(id), NodeFilter.SHOW_TEXT)
  let t
  while ((t = walker.nextNode())) {
    const i = t.nodeValue.indexOf(word)
    if (i < 0) continue
    const r = document.createRange()
    r.setStart(t, i); r.setEnd(t, i + word.length)
    return Math.round(r.getBoundingClientRect().left)
  }
  return null
}
/** Gap between the element's right edge and its rightmost glyph on line 1. */
function rightGap(id) {
  const box = el(id).getBoundingClientRect()
  const r = document.createRange()
  r.selectNodeContents(el(id))
  const rects = [...r.getClientRects()]
  const right = Math.max(...rects.map((q) => q.right))
  return Math.round(box.right - right)
}
function x(id) { return Math.round(el(id).getBoundingClientRect().left) }
const results = {
  stepTitleDir: dir('step1-title'),
  stepTitleNumberRightOfHebrew: wordLeft('step1-title', '1.') > wordLeft('step1-title', 'מוסיפים'),
  stepTitleRolloutRightOfHebrew: wordLeft('step1-title', 'Rollout') > wordLeft('step1-title', 'מוסיפים'),
  stepTitleFlushRight: rightGap('step1-title') <= 2,
  stepDescDir: dir('step1-desc'),
  stepDescFlushRight: rightGap('step1-desc') <= 2,
  step2Dir: dir('step2-title'),
  lateLineDir: dir('late-line'),
  genuiEnLineDir: window.__early,
  releasedDir: dir('genui-en-line'),
  releasedMark: el('genui-en-line').getAttribute('data-hebrew-rtl'),
  markerRightOfText: x('marker1') > x('step1-title'),
  genuiBlockDir: getComputedStyle(document.querySelector('[data-genui]')).direction,
  genuiEnBlockDir: dir('genui-en'),
  bubbleDir: dir('bubble'),
  bubbleFirstLineFlushRight: rightGap('bubble') <= 2,
  pMixedDir: dir('p-mixed'),
  hLatinDir: dir('h-latin'),
  pEnglishDir: dir('p-english'),
  liLatinDir: dir('li-latin'),
  preDir: dir('pre'),
  questionDir: dir('question'),
  questionNumberRightOfLabel: x('q-number') > x('q-label'),
  questionLabelDir: dir('q-label'),
  questionYesRightOfHebrew: wordLeft('q-label', 'Yes') > wordLeft('q-label', 'הכל'),
  sidebarDir: dir('side-row'),
}
document.title = JSON.stringify(results)
`

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{width:900px;font:15px -apple-system,sans-serif;margin:16px;color:#ddd;background:#1b1b1d}</style>
</head><body>${fixtures}
<script>
window.__ModuleLoader__ = { load: function (m) { window.__mod = m } }
// Headless --dump-dom does not run animation frames; the plugin coalesces
// re-scans through requestAnimationFrame, so give it a timer instead.
window.requestAnimationFrame = function (f) { return setTimeout(f, 16) }
</script>
<script>${client}</script>
<script>
window.__mod.factory(function () {}).apply({ effect: function () {} })
// Streaming: after the first pass, a new row arrives and an existing line
// loses its Hebrew. Both must be picked up by the incremental re-scan.
setTimeout(function () { window.__early = getComputedStyle(document.getElementById('genui-en-line')).direction }, 20)
setTimeout(function () {
  var row = document.createElement('div')
  row.setAttribute('data-chat-flow-key', 'late')
  row.innerHTML = '<div data-genui="true"><span id="late-line" style="display:block">Status: הפריסה הושלמה</span></div>'
  document.querySelector('[data-chat-flow]').appendChild(row)
  document.getElementById('genui-en-line').textContent = 'Owner: platform team'
}, 30)
setTimeout(function () { ${probe} }, 150)
</script></body></html>`

const dir = mkdtempSync(join(tmpdir(), 'dsh-hebrew-rtl-'))
const page = join(dir, 'page.html')
writeFileSync(page, html)

const common = ['--headless=new', '--disable-gpu', `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=3000']
const dom = execFileSync(chrome, [...common, '--dump-dom', `file://${page}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const title = /<title>(.*?)<\/title>/s.exec(dom)?.[1]
if (!title) {
  console.log('FAIL  page produced no results')
  process.exit(1)
}
const r = JSON.parse(title.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))

if (process.argv.includes('--screenshot')) {
  const out = join(root, 'scripts/browser-test.png')
  execFileSync(chrome, [...common, `--screenshot=${out}`, '--window-size=960,1000', `file://${page}`], { stdio: 'ignore' })
  console.log(`wrote ${out}`)
}

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

// The reported screenshot: GenUI steps whose lines open with Latin words.
check('GenUI step title opening with "1. Rollout:" is RTL', r.stepTitleDir, 'rtl')
check('…its number sits at the right, before the Hebrew', r.stepTitleNumberRightOfHebrew, true)
check('…"Rollout" reads first, to the right of the Hebrew', r.stepTitleRolloutRightOfHebrew, true)
check('…and the line is flush right', r.stepTitleFlushRight, true)
check('GenUI step description with a Latin majority is RTL', r.stepDescDir, 'rtl')
check('…and flush right', r.stepDescFlushRight, true)
check('a streamed-in row with a Latin-first Hebrew line is RTL', r.lateLineDir, 'rtl')
check('GenUI step opening with Hebrew is RTL', r.step2Dir, 'rtl')
check('a line whose Hebrew was streamed away is released', [r.releasedDir, r.releasedMark], ['ltr', null])
check('a Hebrew GenUI block is laid out RTL', r.genuiBlockDir, 'rtl')
check('…so the step marker sits on the right of its text', r.markerRightOfText, true)
check('an English GenUI block keeps its LTR layout', r.genuiEnBlockDir, 'ltr')
check('…but its one Hebrew line is still RTL', r.genuiEnLineDir, 'rtl')

// Issue #1: the user's own bubble and the question card.
check('user bubble opening with Latin, Hebrew inside, is RTL', r.bubbleDir, 'rtl')
check('…and its first line is flush right', r.bubbleFirstLineFlushRight, true)
check('question card with Hebrew content is laid out RTL', r.questionDir, 'rtl')
check('…its option number sits on the right', r.questionNumberRightOfLabel, true)
check('…an option label opening with "Yes," is RTL', r.questionLabelDir, 'rtl')
check('…and "Yes" reads first, on the right', r.questionYesRightOfHebrew, true)

// Markdown blocks.
check('markdown paragraph opening with Latin is RTL', r.pMixedDir, 'rtl')
check('an all-Latin heading in a Hebrew message follows it', r.hLatinDir, 'rtl')
check('an all-English paragraph keeps its own direction', r.pEnglishDir, 'ltr')
check('an all-Latin list item follows its Hebrew list', r.liLatinDir, 'rtl')
check('a code block stays LTR even with Hebrew in it', r.preDir, 'ltr')

// Out of scope.
check('the sidebar is left untouched', r.sidebarDir, 'ltr')

console.log(failures === 0 ? '\nAll browser checks passed.' : `\n${failures} browser check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
