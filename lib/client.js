// dsh-hebrew-rtl — client half.
//
// Correct Hebrew RTL rendering for the DeepSeek Harness web GUI: per-block
// direction chosen by dominant script, bidi-safe input fields, and RTL-aware
// Cmd+Left/Right line navigation.
//
// Scope: Hebrew and Latin only, on purpose. See the note beside HEBREW_G.
//
// Direction rule ("dominant script"):
//
//   For each block element, count Hebrew letters vs Latin letters in its own
//   text and pick the direction of whichever script dominates:
//
//     heb === 0                 -> no override; CSS unicode-bidi:plaintext
//                                  (first-strong-character heuristic) applies.
//     heb  >  lat               -> force direction:rtl  + text-align:right
//     lat  >  heb               -> force direction:ltr  + text-align:left
//     heb === lat  (both > 0)   -> no override; fall back to first-strong.
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
// This bundle is loaded as a classic script (not native ESM) by the client
// module system, which requires it to self-register through the global
// window.__ModuleLoader__.load({ id, factory }) handoff — factory(require)
// returns the module's exports (here, just `apply`). This file is
// hand-written directly in that wire format (no build step).
(function () {
  var CSS = [
    'body :where(p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, span, div):not(input):not(textarea):not([contenteditable]):not([contenteditable] *):not([class*="_NYaKW_"]):not([class*="_NYaKW_"] *) {',
    '  unicode-bidi: plaintext;',
    '}',
    'body :where(p, li, h1, h2, h3, h4, h5, h6, blockquote):not(input):not(textarea):not([contenteditable]):not([contenteditable] *):not([class*="_NYaKW_"]):not([class*="_NYaKW_"] *) {',
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

  // Same block-level selector set the CSS above targets, minus the composer
  // layers and the question custom-answer input/textarea, which are
  // explicitly excluded from this override (see header comment).
  var BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th'
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
    var heb = countMatches(text, HEBREW_G)
    if (heb === 0) return null
    var lat = countMatches(text, LATIN_G)
    if (heb > lat) return 'rtl'
    if (lat > heb) return 'ltr'
    return null
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

    ctx.effect(function () {
      return function () {
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
