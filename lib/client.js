// dsh-hebrew-rtl — client half.
//
// Baseline: give every block element the Unicode Bidi "plaintext" treatment,
// which picks a block's direction from its first strong directional character
// (UAX#9 P2/P3) instead of inheriting the page's LTR direction, and align text
// to the start edge of whatever direction that yields.
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
    // Composer (InputBar). The visible glyphs render in a `.backdrop` layer
    // while the real <textarea> stays invisible and owns only the caret; a
    // hidden `.mirror` layer supplies sizing. All three MUST share identical
    // bidi metrics or their pixel alignment breaks (backdrop/caret drift,
    // mismatched wrapping), so plaintext goes on all three identically —
    // never on the textarea alone.
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
    // Same two-layer architecture as the composer, so both layers MUST get
    // identical bidi metrics or their computed heights diverge and the field
    // mis-sizes.
    '[class*="fieldInput"],',
    '[class*="fieldMirror"] {',
    '  unicode-bidi: plaintext !important;',
    '  text-align: start !important;',
    '}',
  ].join('\n')

  function apply(ctx) {
    var styleEl = document.createElement('style')
    styleEl.setAttribute('data-plugin', 'dsh-hebrew-rtl')
    styleEl.textContent = CSS
    document.head.appendChild(styleEl)

    ctx.effect(function () {
      return function () {
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
