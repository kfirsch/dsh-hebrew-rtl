// dsh-hebrew-rtl — client half.
//
// Correct Hebrew RTL rendering for the DeepSeek Harness web GUI: per-block
// direction chosen by dominant script, bidi-safe input fields, and RTL-aware
// Cmd+Left/Right line navigation.
//
// Scope: Hebrew and Latin only, on purpose. See the note beside HEBREW_G.
//
// Direction rule ("dominant script", counted over prose words):
//
//   For each block element: drop code-like tokens from its text, then count
//   Hebrew-majority words against Latin-majority words in what remains and
//   pick the direction of whichever dominates:
//
//     heb === 0                 -> no override; CSS unicode-bidi:plaintext
//                                  (first-strong-character heuristic) applies.
//     heb  >  lat               -> force direction:rtl  + text-align:right
//     lat  >  heb               -> force direction:ltr  + text-align:left
//     heb === lat  (both > 0)   -> no override; fall back to first-strong.
//
//   Two refinements over the naive "count letters across the raw string",
//   both driven by real misrenders in technical Hebrew prose:
//
//   1. Code tokens do not vote. A single URL or commit sha can outweigh a
//      whole Hebrew paragraph — "git+https://git@github.com:kfirsch/...#<sha>"
//      alone contributes 44 Latin letters, and a 40-char sha likewise. Such a
//      block is Hebrew prose that merely *cites* an identifier, so identifiers
//      are stripped before counting. They are still laid out normally; they
//      just no longer decide the paragraph's direction.
//   2. Words are the unit, not letters. Otherwise a 3-letter Hebrew word is
//      outvoted by "credential", which says nothing about which language the
//      sentence is written in.
//
//   Forced blocks use unicode-bidi:isolate, so the Unicode Bidi algorithm
//   still lays out the minority-script runs correctly *inside* the chosen
//   paragraph direction — an English sentence containing one Hebrew word
//   stays LTR with the Hebrew word rendered in place, and a Hebrew sentence
//   containing an English product name stays RTL with the name in place.
//
//   Why not plaintext alone: plaintext picks direction from the block's FIRST
//   strong-directional character, so "DSH הוא כלי מצוין ..." (a Hebrew
//   sentence opening with a Latin product name, or with "1." / an emoji)
//   renders LTR and reads garbled. Why not "any Hebrew -> RTL": that flipped
//   Latin-dominant sentences containing a single Hebrew word to RTL, which
//   reversed their English runs ("...in the middle שלום This is a test
//   sentence with"). Dominance fixes both directions of that mistake.
//
// Composer (InputBar): styling UNCHANGED and excluded from the direction
//   override per explicit instruction — it keeps plain first-strong plaintext
//   behavior. The visible glyphs render in a separate `.backdrop` layer while
//   the real <textarea> stays invisible and owns only the caret; a hidden
//   `.mirror` layer supplies sizing. All three MUST share identical bidi
//   metrics or their pixel alignment breaks (backdrop/caret drift, mismatched
//   wrapping), so unicode-bidi:plaintext is applied to all three identically,
//   never to the textarea alone.
//
// ask_user_question custom-answer field (QuestionComposer AnswerField): also
//   a two-layer mirror+textarea stack, treated exactly like the composer.
//   Everything else in the question dialog (title,
//   detail, eyebrow, option labels/descriptions/badges) is regular block text
//   and DOES get the override, same as chat messages.
//
// Caret navigation fix: in a text field, Cmd+Left / Cmd+Right are
//   *logical* in every browser — Left always goes to the line's logical start
//   and Right to its logical end. On an RTL line the logical start is on the
//   visual RIGHT, so the keys feel inverted: pressing Left jumps the caret to
//   the far right of the text. `swapLineKeysOnRtl` below intercepts those two
//   chords only when the caret's current line is RTL, and swaps them so the
//   arrow points where the caret actually moves. Shift-extension and
//   selection direction are preserved.
//
// This bundle is loaded as a classic script (not native ESM) by the client
// module system, which requires it to self-register through the global
// window.__ModuleLoader__.load({ id, factory }) handoff — factory(require)
// returns the module's exports (here, just `apply`). This file is
// hand-written directly in that wire format (no build step).
(function () {
  var CSS = [
    // `td`/`th` and `li` are absent on purpose. `unicode-bidi: plaintext`
    // makes an element pick its own direction from its first strong character,
    // so applying it to a PART of a composite re-creates exactly the
    // disagreement the whole-element rules below exist to prevent: cells must
    // inherit the table's direction and items the list's, not derive their own.
    //
    // `.katex` and everything under it is excluded for the same reason, one
    // level finer. KaTeX renders a formula as hundreds of nested <span>s whose
    // horizontal positions it computes itself; giving each one plaintext makes
    // every span re-derive a direction, which tears the formula apart —
    // "(idle + rightsizing)" and "$870/month" came out reordered into
    // nonsense. KaTeX already handles bidi internally.
    'body :where(p, h1, h2, h3, h4, h5, h6, blockquote, span, div):not(input):not(textarea):not([contenteditable]):not([contenteditable] *):not([class*="_NYaKW_"]):not([class*="_NYaKW_"] *):not(.katex):not(.katex *) {',
    '  unicode-bidi: plaintext;',
    '}',
    // Parts of a composite align to whatever direction the whole resolved to,
    // rather than to a hard-coded edge. A table or list with no Hebrew keeps
    // the page default; one with Hebrew gets its direction from the JS rule.
    'table td, table th,',
    'ul li, ol li {',
    '  text-align: start;',
    '}',
    'body :where(p, h1, h2, h3, h4, h5, h6, blockquote):not(input):not(textarea):not([contenteditable]):not([contenteditable] *):not([class*="_NYaKW_"]):not([class*="_NYaKW_"] *) {',
    '  text-align: start;',
    '}',
    '[data-input-scroll] textarea,',
    '[data-input-backdrop],',
    '[data-input-mirror] {',
    '  unicode-bidi: plaintext !important;',
    '}',
    // ask_user_question custom-answer field (QuestionComposer AnswerField).
    //
    // The CSS-module classes are `fieldInput` (the textarea) and `fieldMirror`
    // (the hidden height ruler), emitted hashed (e.g. `sV4CTq_fieldInput`)
    // inside `customInline` / `customBlock` wrappers — so they are matched by
    // substring, which keeps working when the hash changes. Without this rule
    // the field gets no bidi treatment at all: the textarea is excluded from
    // the generic block rule by `:not(textarea)` and keeps the page's
    // inherited `direction: ltr`, which makes Hebrew typed there run
    // left-to-right.
    //
    // Same two-layer architecture as the composer (a mirror div and a
    // textarea sharing one grid cell), so both layers MUST get identical bidi
    // metrics or their computed heights diverge and the field mis-sizes.
    '[class*="fieldInput"],',
    '[class*="fieldMirror"] {',
    '  unicode-bidi: plaintext !important;',
    '  text-align: start !important;',
    '}',
  ].join('\n')

  // Hebrew block (U+0590-U+05FF) plus the Alphabetic Presentation Forms
  // Hebrew subset (U+FB1D-U+FB4F, ligatures/presentation variants).
  //
  // Scope note: this plugin is deliberately Hebrew-only. A generalisation to
  // every RTL script (Arabic, Persian, Syriac, Thaana, N'Ko, Adlam...) was
  // written and reverted — it is a straightforward change on the detection
  // side, but it cannot be validated without a reader of those languages, and
  // shipping direction handling nobody can proof-read is worse than not
  // shipping it. Hence the package name says `hebrew`.
  var HEBREW_G = /[\u0590-\u05FF\uFB1D-\uFB4F]/g
  // Latin letters, including the Latin-1/Extended-A/B accented ranges so a
  // French or German sentence counts as Latin rather than as "no script".
  var LATIN_G = /[A-Za-z\u00C0-\u024F]/g
  // Single-character forms, used for the first-strong scan in the caret fix.
  var HEBREW_ONE = /[\u0590-\u05FF\uFB1D-\uFB4F]/
  var LATIN_ONE = /[A-Za-z\u00C0-\u024F]/

  // Code-like tokens, removed before counting so they cannot outvote the
  // prose around them. Each alternative, in order:
  //   1. a URL;
  //   2. a Latin word joined to something by . _ / : + @ # - — this catches
  //      `git+https`, `dsh-hebrew-rtl`, `node_modules/foo`, `a4c1025..0141a30`,
  //      `github.com:kfirsch/...#<sha>` and bare file paths;
  //   3. a hex run of 6+ (commit shas);
  //   4. `15/15`-style ratios;
  //   5. a dotted identifier such as `README.md` or `example.com`.
  // Deliberately conservative: an ordinary Latin word standing alone is NOT
  // matched, so genuine English prose still counts in full.
  var CODEISH_G =
    /https?:\/\/\S+|[A-Za-z][\w.]*(?:[._/:+@#-][\w.<>@:/+-]+)+|\b[0-9a-f]{6,}\b|\b\d+\/\d+\b|\b[\w-]+\.[\w-]{2,}\b/g

  // Word separators: whitespace plus the punctuation that can sit between two
  // words without belonging to either. Hyphen is included because Hebrew glues
  // prefixes onto Latin words with it (`ה-tarball`), and those must split into
  // one Hebrew part and one Latin part rather than counting as a single word.
  var WORD_SPLIT_G = /[\s,.;:!?()"'[\]{}\u2014\u2013|\u2192-]+/

  // Same block-level selector set the CSS above targets, minus the composer
  // layers and the question custom-answer input/textarea, which are
  // explicitly excluded from this override (see header comment).
  //
  // COMPOSITE ELEMENTS ARE JUDGED WHOLE, NEVER BY THEIR PARTS. The same bug
  // was shipped three times before the pattern was named, so it is stated
  // once here:
  //
  //   `table`, not `td, th` — judging cells separately gave a six-row table
  //   three verdicts: a Hebrew label cell went RTL while the `HEAD` and
  //   `Commits` cells beside it stayed LTR, so the label column flipped edges
  //   row to row. Column ORDER is a property of the table, not the cell, so
  //   per-cell directions also fight the column order itself.
  //
  //   `ul, ol`, not `li` — identical failure one level down. In a Hebrew
  //   numbered list, a short all-Latin item ("push") has no Hebrew to weigh,
  //   so it got no verdict, fell back to the page's LTR, and jumped to the
  //   opposite margin from its RTL siblings, breaking the numbering column.
  //   A list is one directional unit; its items are parts of it.
  //
  //   `.katex` is excluded outright (see the CSS above) — a formula is a
  //   composite whose parts are positioned spans, and KaTeX owns its own bidi.
  //
  // In every case each part still lays out its own content correctly, because
  // the forced block carries `unicode-bidi: isolate`.
  var BLOCK_SELECTOR = 'p, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, table'
  var EXCLUDE_SELECTOR =
    'input, textarea, [contenteditable], [contenteditable] *, ' +
    '[class*="_NYaKW_"], [class*="_NYaKW_"] *, ' +
    '[data-input-scroll], [data-input-scroll] *, ' +
    '[data-input-backdrop], [data-input-backdrop] *, ' +
    '[data-input-mirror], [data-input-mirror] *, ' +
    '[class*="fieldInput"], [class*="fieldMirror"]'

  function isExcluded(el) {
    return el.matches(EXCLUDE_SELECTOR) || el.closest(EXCLUDE_SELECTOR) !== null
  }

  function countMatches(text, re) {
    var m = text.match(re)
    return m ? m.length : 0
  }

  /** 'rtl' | 'ltr' | null (null = leave the plaintext heuristic in charge). */
  function dominantDirection(text) {
    if (!text) return null
    // Cheap bail-out before any allocation: no Hebrew, nothing to decide.
    if (countMatches(text, HEBREW_G) === 0) return null

    var words = text.replace(CODEISH_G, ' ').split(WORD_SPLIT_G)
    var heb = 0
    var lat = 0
    for (var i = 0; i < words.length; i++) {
      var word = words[i]
      if (!word) continue
      // A word votes for the script most of its letters belong to; one with
      // neither (a bare number, an emoji) does not vote at all.
      var h = countMatches(word, HEBREW_G)
      var l = countMatches(word, LATIN_G)
      if (h > l) heb++
      else if (l > h) lat++
    }

    // Every Hebrew character sat inside a stripped code token: not Hebrew
    // prose, so leave it to plaintext.
    if (heb === 0) return null
    // A tie resolves to RTL, not to the first-strong fallback. Once a block
    // carries as much Hebrew prose as Latin, it is Hebrew text that quotes
    // English rather than the reverse — and first-strong decided such blocks
    // by whichever word happened to come first, so a heading like
    // "Waste (שולי)" rendered LTR while the Hebrew paragraph beneath it
    // rendered RTL, leaving the pair misaligned.
    if (lat > heb) return 'ltr'
    return 'rtl'
  }

  function applyBlockDirection(el) {
    if (isExcluded(el)) return
    var dir = dominantDirection(el.textContent || '')
    if (dir === null) {
      if (el.style.direction) {
        el.style.removeProperty('direction')
        el.style.removeProperty('text-align')
        el.style.removeProperty('unicode-bidi')
      }
      return
    }
    el.style.setProperty('direction', dir, 'important')
    el.style.setProperty('text-align', dir === 'rtl' ? 'right' : 'left', 'important')
    el.style.setProperty('unicode-bidi', 'isolate', 'important')
  }

  function scan(root) {
    if (root.nodeType !== 1) return
    if (root.matches && root.matches(BLOCK_SELECTOR)) applyBlockDirection(root)
    var nodes = root.querySelectorAll ? root.querySelectorAll(BLOCK_SELECTOR) : []
    for (var i = 0; i < nodes.length; i++) applyBlockDirection(nodes[i])
  }

  // --- Cmd+Left / Cmd+Right on RTL lines ------------------------------------

  function isTextField(el) {
    if (!el) return false
    var tag = el.tagName
    if (tag === 'TEXTAREA') return true
    if (tag !== 'INPUT') return false
    var type = (el.type || 'text').toLowerCase()
    return type === 'text' || type === 'search' || type === 'url' || type === 'email'
  }

  /** Direction of one line: first strong character, else the computed value. */
  function lineDirection(el, line) {
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i)
      if (HEBREW_ONE.test(ch)) return 'rtl'
      if (LATIN_ONE.test(ch)) return 'ltr'
    }
    try {
      return window.getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr'
    } catch (err) {
      return 'ltr'
    }
  }

  function swapLineKeysOnRtl(e) {
    if (!e.metaKey || e.altKey || e.ctrlKey) return
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    var el = e.target
    if (!isTextField(el)) return
    var value = el.value
    if (typeof value !== 'string') return

    // The caret end that moves: with Shift the far end of the selection,
    // otherwise the collapsed caret itself.
    var moving = e.shiftKey
      ? (el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd)
      : el.selectionStart
    if (moving === null || moving === undefined) return

    var lineStart = value.lastIndexOf('\n', moving - 1) + 1
    var lineEnd = value.indexOf('\n', moving)
    if (lineEnd === -1) lineEnd = value.length

    if (lineDirection(el, value.slice(lineStart, lineEnd)) !== 'rtl') return

    // On an RTL line the visual right edge is the logical start: make the
    // arrow key point at where the caret visually ends up.
    var target = e.key === 'ArrowRight' ? lineStart : lineEnd
    e.preventDefault()

    if (e.shiftKey) {
      var anchor = el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart
      if (target < anchor) el.setSelectionRange(target, anchor, 'backward')
      else el.setSelectionRange(anchor, target, 'forward')
    } else {
      el.setSelectionRange(target, target)
    }
  }

  function apply(ctx) {
    var styleEl = document.createElement('style')
    styleEl.setAttribute('data-plugin', 'dsh-hebrew-rtl')
    styleEl.textContent = CSS
    document.head.appendChild(styleEl)

    // Initial pass over whatever is already rendered.
    scan(document.body)

    // Chat messages and question dialogs stream/mutate text after mount, so
    // keep re-scanning as the DOM changes. Debounced via rAF coalescing to
    // avoid re-running the full scan on every single text-node mutation
    // during streaming.
    var pending = false
    function flush() {
      pending = false
      scan(document.body)
    }
    var observer = new MutationObserver(function (mutations) {
      // Cheap bail-out: ignore mutations entirely inside excluded subtrees
      // (e.g. keystroke-by-keystroke composer/input updates) so streaming
      // chat text is the only thing driving re-scans.
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target
        var el = target.nodeType === 1 ? target : target.parentElement
        if (el && isExcluded(el)) continue
        if (!pending) {
          pending = true
          requestAnimationFrame(flush)
        }
        break
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    // Capture phase so the swap wins over any app-level key handling.
    document.addEventListener('keydown', swapLineKeysOnRtl, true)

    ctx.effect(function () {
      return function () {
        document.removeEventListener('keydown', swapLineKeysOnRtl, true)
        observer.disconnect()
        styleEl.remove()
      }
    })
  }

  window.__ModuleLoader__.load({
    id: 'dsh-hebrew-rtl',
    factory: function (require) {
      return { apply: apply }
    },
  })
})()
