// Browser test for input fields: load lib/client.js into headless Chrome with
// the field shapes the DSH web GUI renders, drive them with real events, and
// assert the rendered direction.
//
//   - the composer: a Lexical contenteditable whose lines are <p dir="auto">
//     (ui-conversation ComposerContentEditable.tsx, dsh 0.1.7+);
//   - the session rename dialog: an autofocused, prefilled <input>
//     (ui-workspace RenameSession.tsx);
//   - the ask_user_question custom answer: a textarea plus a hidden height
//     mirror sharing one grid cell (ui-user-questions QuestionComposer.tsx).
//
// Dependency-free: headless Chrome with --dump-dom; results come back through
// <title>. Set CHROME to override the binary. Skips when none is found.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const chrome = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean).find((p) => existsSync(p))
if (!chrome) {
  console.log('SKIP  no Chrome/Chromium found (set CHROME=/path/to/chrome)')
  process.exit(0)
}

const client = readFileSync(join(root, 'lib/client.js'), 'utf8')

const fixtures = String.raw`
<!-- Composer: Lexical renders one <p dir="auto"> per line. -->
<div contenteditable="true" role="textbox" data-composer-input id="composer"
     class="Ab12Cd_input" style="width:500px;white-space:pre-wrap">
  <p dir="auto" id="c-mixed"><span>Rollout: מוסיפים שורה</span></p>
  <p dir="auto" id="c-english"><span>plain english line</span></p>
</div>

<!-- Session rename dialog. -->
<input id="rename" class="Ef34Gh_renameInput" value="Rollout: שיחה על canary" style="width:400px">

<!-- An English search box: must stay as it is. -->
<input id="search" type="search" value="kubernetes" style="width:400px">

<!-- ask_user_question custom answer: mirror + textarea in one grid cell. -->
<div class="sV4CTq_field sV4CTq_customInline" style="display:grid;width:400px">
  <div aria-hidden="true" class="sV4CTq_fieldMirror" id="mirror" style="grid-area:1/1;visibility:hidden;white-space:pre-wrap"></div>
  <textarea class="sV4CTq_fieldInput" id="answer" rows="1" style="grid-area:1/1"></textarea>
</div>
`

const probe = String.raw`
function dir(id) { return getComputedStyle(document.getElementById(id)).direction }
function wordLeft(id, word) {
  const walker = document.createTreeWalker(document.getElementById(id), NodeFilter.SHOW_TEXT)
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
return {
  composerMixedDir: dir('c-mixed'),
  composerRolloutRight: wordLeft('c-mixed', 'Rollout') > wordLeft('c-mixed', 'מוסיפים'),
  composerEnglishDir: dir('c-english'),
  composerContentUntouched: document.getElementById('c-mixed').innerHTML === '<span>Rollout: מוסיפים שורה</span>',
  composerTypedDir: dir('c-typed'),
  composerClearedDir: dir('c-english2'),
  renameDir: dir('rename'),
  searchDir: dir('search'),
  answerDir: dir('answer'),
  mirrorDir: dir('mirror'),
  answerClearedDir: window.__answerCleared,
  mirrorClearedDir: window.__mirrorCleared,
}
`

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{font:15px -apple-system,sans-serif;margin:16px}</style>
</head><body>${fixtures}
<script>
window.__ModuleLoader__ = { load: function (m) { window.__mod = m } }
// Headless --dump-dom does not run animation frames; the plugin coalesces
// through requestAnimationFrame, so give it a timer instead.
window.requestAnimationFrame = function (f) { return setTimeout(f, 16) }
</script>
<script>${client}</script>
<script>
window.__mod.factory(function () {}).apply({ effect: function () {} })
var composer = document.getElementById('composer')
// The rename dialog opens prefilled and autofocused: focus, no input event.
document.getElementById('rename').focus()
// Typing into the composer: a new Lexical paragraph, then a line whose Hebrew
// is deleted.
setTimeout(function () {
  var p = document.createElement('p')
  p.dir = 'auto'; p.id = 'c-typed'
  p.innerHTML = '<span>ok, נבדוק</span>'
  composer.appendChild(p)
  var q = document.createElement('p')
  q.dir = 'auto'; q.id = 'c-english2'
  q.innerHTML = '<span>שלום</span>'
  composer.appendChild(q)
}, 20)
setTimeout(function () { document.querySelector('#c-english2 span').textContent = 'hello' }, 60)
// Typing into the custom answer, then clearing it.
var answer = document.getElementById('answer')
var mirror = document.getElementById('mirror')
function type(value) {
  answer.value = value
  mirror.textContent = value + String.fromCharCode(10)
  answer.dispatchEvent(new Event('input', { bubbles: true }))
}
setTimeout(function () { type('Yes, הכל עובד') }, 20)
setTimeout(function () {
  type('all good')
  window.__answerCleared = getComputedStyle(answer).direction
  window.__mirrorCleared = getComputedStyle(mirror).direction
  type('Yes, הכל עובד')
}, 60)
setTimeout(function () { document.title = JSON.stringify((function () { ${probe} })()) }, 150)
</script></body></html>`

const dir = mkdtempSync(join(tmpdir(), 'dsh-hebrew-rtl-fields-'))
const page = join(dir, 'page.html')
writeFileSync(page, html)
const dom = execFileSync(
  chrome,
  ['--headless=new', '--disable-gpu', `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=3000', '--dump-dom', `file://${page}`],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
)
const title = /<title>(.*?)<\/title>/s.exec(dom)?.[1]
if (!title) {
  console.log('FAIL  page produced no results')
  process.exit(1)
}
const r = JSON.parse(title.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

check('composer line opening with Latin, holding Hebrew, is RTL', r.composerMixedDir, 'rtl')
check('…"Rollout" reads first, on the right', r.composerRolloutRight, true)
check('…and its content is not touched (Lexical owns it)', r.composerContentUntouched, true)
check('composer English line keeps dir=auto (LTR)', r.composerEnglishDir, 'ltr')
check('a newly typed composer line with Hebrew is RTL', r.composerTypedDir, 'rtl')
check('a composer line whose Hebrew was deleted is released', r.composerClearedDir, 'ltr')
check('rename dialog prefilled with a Latin-first Hebrew title is RTL on focus', r.renameDir, 'rtl')
check('an English search box is left alone', r.searchDir, 'ltr')
check('custom answer "Yes, הכל עובד" is RTL', r.answerDir, 'rtl')
check('…and its height mirror matches it', r.mirrorDir, 'rtl')
check('clearing the Hebrew releases both together', [r.answerClearedDir, r.mirrorClearedDir], ['ltr', 'ltr'])

console.log(failures === 0 ? '\nAll field checks passed.' : `\n${failures} field check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
