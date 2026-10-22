// dsh-hebrew-rtl — client half.
//
// Correct Hebrew RTL rendering for the DeepSeek Harness web GUI: per-block
// direction chosen by dominant script, bidi-safe input fields, and RTL-aware
// Cmd+Left/Right line navigation.
//
// Scope: Hebrew and Latin only, on purpose. See the note beside HEBREW_G.
//
// Direction rule — a line with any Hebrew in it is RTL:
//
//   A block (p, ul/ol, h1-h6, blockquote, table) or a line of text outside
//   one (a GenUI step, a question option, the user's own message bubble)
//   that contains even one Hebrew letter is forced to direction:rtl. A block
//   with no Hebrew is left alone, except a heading, which follows its
//   message (see "Message-level direction" below).
//
//   This replaced "dominant script" (count Hebrew words against Latin words)
//   at the block level, because mixed technical Hebrew is the normal case,
//   not the edge case: "Rollout: מוסיפים minPodsPerReplicaSet: 2" has more
//   Latin than Hebrew and came out LTR, and so did every similar line. The
//   accepted cost is the old v1 failure: an English sentence carrying one
//   Hebrew word is now RTL too.
//
// Dominance ("dominant script", counted over prose words) still decides two
// things that are not a line of text: the direction of a whole message,
// which only all-Latin headings inherit, and the layout direction of a
// component (a question card, a GenUI block), which decides which side its
// markers, numbers and buttons sit on:
//
//     heb === 0                 -> no override.
//     heb  >  lat               -> rtl
//     lat  >  heb               -> ltr
//     heb === lat  (both > 0)   -> rtl
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
//   still lays out the Latin runs correctly *inside* the RTL paragraph — a
//   Hebrew sentence containing an English product name stays RTL with the
//   name in place and unreversed.
//
//   Why not plaintext alone: plaintext picks direction from the block's FIRST
//   strong-directional character, so "DSH הוא כלי מצוין ..." (a Hebrew
//   sentence opening with a Latin product name, or with "1." / an emoji)
//   renders LTR and reads garbled.
//
// Lines outside blocks: GenUI components, question cards and the user's
//   message bubble put their text in plain <span>/<div> elements, which the
//   plaintext CSS rule below makes pick their own direction from their first
//   strong character — so "1. Rollout: מוסיפים ..." came out LTR even inside
//   an RTL list. `scanLines` walks the text nodes of those surfaces and forces
//   RTL on the element that lays out each Hebrew line (and on the inline
//   elements between it and the text, which would otherwise re-isolate the
//   run as LTR). Scoped to the conversation, question cards and GenUI; the
//   sidebars are deliberately untouched.
//
// Input fields (see "Input fields" near the end): the same rule — a field
//   with any Hebrew in it is RTL. Text inputs and textareas (session rename,
//   the ask_user_question custom answer) are forced as a whole; the composer,
//   a Lexical contenteditable since dsh 0.1.7, per paragraph. The question
//   custom-answer textarea and its hidden height mirror are always styled
//   together, or their wrapped heights diverge.
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
    // Composer (Lexical contenteditable, dsh 0.1.7+): each line is a <p> with
    // dir="auto"; start-alignment lets it sit on the side its direction
    // resolves to. RTL for any Hebrew is applied per paragraph in JS.
    '[data-composer-input] > p {',
    '  text-align: start;',
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
    // Components whose layout resolved to RTL (see scanComponents). GenUI
    // positions a few decorations with physical `left` offsets and left-aligns
    // its table headers; mirror those so markers, rails and headers follow
    // the text to the right. Class names are CSS-module hashed, so they are
    // matched by suffix: a step's class attribute always carries "<hash>_step "
    // (the step class is followed by a space in GenUI's template) and a list
    // item's is exactly "<hash>_li".
    '[data-hebrew-rtl="rtl"] [class*="_step "]::before {',
    '  left: auto !important;',
    '  right: 11px !important;',
    '}',
    '[data-hebrew-rtl="rtl"] [class$="_li"] {',
    '  padding-left: 4px !important;',
    '  padding-right: 16px !important;',
    '}',
    '[data-hebrew-rtl="rtl"] [class$="_li"]::before {',
    '  left: auto !important;',
    '  right: 2px !important;',
    '}',
    '[data-hebrew-rtl="rtl"] th:not([class*="Num"]),',
    '[data-hebrew-rtl="rtl"] th:not([class*="Num"]) [class*="_thSort"] {',
    '  text-align: right !important;',
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

  // One rendered assistant message. `MarkdownText` wraps every message in a
  // single `css.markdown` div (packages/client/ui-primitives/src/markdown/
  // MarkdownText.tsx), emitted with a CSS-module hash, so it is matched by
  // substring like the other module classes.
  var MESSAGE_SELECTOR = '[class*="markdown"]'

  // Blocks that are prose in their own right. A heading is deliberately NOT
  // here: it is one line labelling the body beneath it, so it follows the
  // message even when entirely Latin.
  var PARAGRAPH_TAGS = /^(P|LI|UL|OL|BLOCKQUOTE|TABLE)$/
  var EXCLUDE_SELECTOR =
    'input, textarea, [contenteditable], [contenteditable] *, ' +
    '[class*="_NYaKW_"], [class*="_NYaKW_"] *, ' +
    '[data-composer-input], [data-composer-input] *, ' +
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

  // --- Message-level direction ------------------------------------------------
  //
  // A block on its own is not always enough context. In a Hebrew answer, a
  // heading is one line — often entirely Latin ("agent-sandbox (SIG Apps,
  // kubernetes-sigs)") — so per-block judging left it LTR beside its own RTL
  // body, and a document came out alternating sides heading by heading.
  //
  // So the message decides, and its blocks inherit. What the message vote
  // reads is the part that speaks the message's own language: everything
  // EXCEPT the two kinds of block that opt out of inheriting anyway — a whole
  // paragraph with no Hebrew at all, and code. Counting those would let the
  // exception decide the rule it is exempt from: a short Hebrew answer quoting
  // one large English paragraph scored hebrew=8 latin=62 and flipped the whole
  // message to LTR.
  //
  // Rejected alternative: "3+ Hebrew words anywhere means the answer is in
  // Hebrew". It is right about Hebrew answers and wrong about English ones —
  // "The כותרת field, the תיאור field and the שם field all reject input"
  // scores 3 Hebrew words against 17 Latin, and a threshold would flip that
  // English sentence to RTL. That is the "any Hebrew forces RTL" bug with a
  // number attached. Dominance stays symmetric in both directions.

  /** A whole paragraph-like block carrying no Hebrew opts out of the message. */
  function isAllLatinParagraph(el) {
    return PARAGRAPH_TAGS.test(el.tagName) && countMatches(el.textContent || '', HEBREW_G) === 0
  }

  /** Concatenate the blocks of a message that vote on its direction. */
  function messageVotingText(root) {
    var parts = []
    var nodes = root.querySelectorAll(BLOCK_SELECTOR)
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      if (isExcluded(el) || isAllLatinParagraph(el)) continue
      parts.push(el.textContent || '')
    }
    return parts.join(' ')
  }

  /**
   * Direction for one message root, or null when it has no Hebrew prose.
   *
   * Blocks vote first: the message is Hebrew when more of its prose blocks
   * (paragraphs, lists, tables, quotes — not headings) carry Hebrew than do
   * not. Mixed technical Hebrew is mostly Latin words, so a word count read a
   * Hebrew answer full of identifiers as English and left its Latin headings
   * LTR. Only a tie in blocks falls back to the word count.
   */
  function messageDirection(root) {
    var nodes = root.querySelectorAll(BLOCK_SELECTOR)
    var heb = 0
    var lat = 0
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      if (!PARAGRAPH_TAGS.test(el.tagName) || isExcluded(el)) continue
      // A list or table nested in another counts once, through its parent.
      var parent = el.parentElement
      if (parent && parent.closest && parent.closest(COMPOSITE_SELECTOR) !== null) continue
      if (hasHebrew(el.textContent || '')) heb++
      else lat++
    }
    if (heb > lat) return 'rtl'
    if (lat > heb) return heb === 0 ? null : 'ltr'
    return dominantDirection(messageVotingText(root))
  }

  function hasHebrew(text) {
    return !!text && HEBREW_ONE.test(text)
  }

  // Marker attribute for every element this plugin forces. Lets the CSS above
  // mirror component decorations, and lets a later scan find and release an
  // element whose Hebrew is gone.
  var MARK = 'data-hebrew-rtl'

  function setMark(el, value) {
    if (!el.setAttribute) return
    if (value === null) {
      if (el.hasAttribute && el.hasAttribute(MARK)) el.removeAttribute(MARK)
    } else if (!el.getAttribute || el.getAttribute(MARK) !== value) {
      el.setAttribute(MARK, value)
    }
  }

  function setDirection(el, dir) {
    if (dir === null) {
      if (el.style.direction) {
        el.style.removeProperty('direction')
        el.style.removeProperty('text-align')
        el.style.removeProperty('unicode-bidi')
      }
      setMark(el, null)
      return
    }
    el.style.setProperty('direction', dir, 'important')
    el.style.setProperty('text-align', dir === 'rtl' ? 'right' : 'left', 'important')
    el.style.setProperty('unicode-bidi', 'isolate', 'important')
    setMark(el, dir)
  }

  // Whole composites that a block inside them follows when it has no Hebrew
  // of its own (a Latin <p> inside a Hebrew list item or table cell).
  var COMPOSITE_SELECTOR = 'ul, ol, table, blockquote'

  /**
   * Decide one block: any Hebrew in it means RTL. A block with no Hebrew is
   * left alone, except a heading in a Hebrew message (it labels the RTL body
   * beneath it) and a block inside a Hebrew composite (it is part of it).
   */
  function blockDirection(el, inherited) {
    if (hasHebrew(el.textContent || '')) return 'rtl'
    if (inherited === 'rtl' && !PARAGRAPH_TAGS.test(el.tagName)) return 'rtl'
    var parent = el.parentElement
    var composite = parent && parent.closest ? parent.closest(COMPOSITE_SELECTOR) : null
    if (composite !== null && composite !== undefined && hasHebrew(composite.textContent || '')) return 'rtl'
    return null
  }

  function applyBlockDirection(el, inherited) {
    if (isExcluded(el)) return
    setDirection(el, blockDirection(el, inherited))
  }

  function scanMessage(root) {
    var inherited = messageDirection(root)
    if (root.matches(BLOCK_SELECTOR)) applyBlockDirection(root, inherited)
    var nodes = root.querySelectorAll(BLOCK_SELECTOR)
    for (var i = 0; i < nodes.length; i++) applyBlockDirection(nodes[i], inherited)
  }

  // --- Components ---------------------------------------------------------------
  //
  // A question card or a GenUI block is laid out by its own `direction`: which
  // side the option numbers, step markers, table columns and buttons sit on.
  // That is a property of the whole component, so it is decided once, by
  // dominance over the component's text (an English GenUI table with one
  // Hebrew cell keeps its English layout; the Hebrew cell itself still reads
  // RTL through the line rule).
  //
  //   [data-question-key]  ask_user_question card (QuestionComposer.tsx)
  //   [data-genui]         a rendered GenUI block (dsh-genui GenuiBlock.tsx)
  var COMPONENT_SELECTOR = '[data-question-key], [data-genui]'
  // Host chrome inside a component (the question card's "Skip this question"
  // / "Submit" footer and its icon buttons) is in the GUI's language, not the
  // content's, so it does not vote.
  var COMPONENT_CHROME_SELECTOR = 'footer, [class*="_headerActions"]'

  function componentText(el) {
    var text = el.textContent || ''
    var chrome = el.querySelectorAll ? el.querySelectorAll(COMPONENT_CHROME_SELECTOR) : []
    for (var i = 0; i < chrome.length; i++) text = text.replace(chrome[i].textContent || '', ' ')
    return text
  }

  function applyComponentDirection(el) {
    var dir = dominantDirection(componentText(el))
    if (dir === 'rtl') {
      el.style.setProperty('direction', 'rtl', 'important')
      el.style.setProperty('unicode-bidi', 'isolate', 'important')
      setMark(el, 'rtl')
    } else if (el.getAttribute && el.getAttribute(MARK) === 'rtl') {
      el.style.removeProperty('direction')
      el.style.removeProperty('unicode-bidi')
      setMark(el, null)
    }
  }

  // --- Lines outside blocks -----------------------------------------------------
  //
  // GenUI steps, question options and the user's message bubble render text
  // in <span>/<div> elements, not in <p>. The plaintext CSS rule gives each
  // of those its own first-strong direction, so a line opening with a Latin
  // word ("Rollout: מוסיפים ...") is laid out LTR even inside an RTL list. For
  // every text node that holds Hebrew, force RTL on:
  //   - its line owner: the nearest ancestor that is not `display: inline`,
  //     i.e. the box that lays the line out (a flex-item span counts, since
  //     flex items are blockified); and
  //   - every inline element between the text and that owner — with
  //     plaintext, an inline span starting with Latin would otherwise isolate
  //     itself as an LTR run inside the RTL line.
  //
  // Scoped to the conversation, question cards and GenUI blocks/panels: the
  // sidebars and settings keep the stock behaviour.
  var LINE_SCOPE_SELECTOR = '[data-chat-flow], [data-question-key], [data-genui], [data-genui-panel]'
  // Text the line rule never touches: code (a code block stays LTR whatever
  // it contains), formulas, SVG, and every editable field.
  var LINE_SKIP_SELECTOR =
    'pre, code, .katex, svg, ' + EXCLUDE_SELECTOR + ', [data-composer-input], [data-composer-input] *'
  var LINE_OWNER = 'line'
  var LINE_INLINE = 'inline'

  function displayOf(el) {
    try {
      return window.getComputedStyle(el).display
    } catch (err) {
      return 'block'
    }
  }

  function forceLine(el, owner) {
    el.style.setProperty('direction', 'rtl', 'important')
    el.style.setProperty('unicode-bidi', 'isolate', 'important')
    if (owner) el.style.setProperty('text-align', 'right', 'important')
    setMark(el, owner ? LINE_OWNER : LINE_INLINE)
  }

  function releaseLine(el) {
    el.style.removeProperty('direction')
    el.style.removeProperty('unicode-bidi')
    el.style.removeProperty('text-align')
    setMark(el, null)
  }

  /** Force RTL from one Hebrew text node up to the element that owns its line. */
  function claimLine(textNode, scope) {
    var el = textNode.parentElement
    while (el && el !== document.body) {
      var mark = el.getAttribute(MARK)
      // A block the block rule already forced RTL owns the line.
      if (mark === 'rtl' || mark === LINE_OWNER) return
      if (mark === LINE_INLINE) {
        el = el.parentElement
        continue
      }
      var display = displayOf(el)
      if (display === 'contents') {
        el = el.parentElement
        continue
      }
      // Never promote a component or a scope to a line owner: their layout
      // direction is decided as a whole (applyComponentDirection), and an
      // English GenUI block with one Hebrew value must keep its LTR layout.
      // The inline elements already forced carry the line's direction.
      if (el === scope || el.matches(COMPONENT_SELECTOR) || el.matches(LINE_SCOPE_SELECTOR)) return
      var owner = display !== 'inline'
      forceLine(el, owner)
      if (owner) return
      el = el.parentElement
    }
  }

  function scanLines(scope) {
    if (!document.createTreeWalker) return
    // Release lines whose Hebrew is gone (streamed text rewritten, a row
    // re-used for another message).
    var marked = scope.querySelectorAll('[' + MARK + '="' + LINE_OWNER + '"], [' + MARK + '="' + LINE_INLINE + '"]')
    for (var i = 0; i < marked.length; i++) {
      if (!hasHebrew(marked[i].textContent || '')) releaseLine(marked[i])
    }
    var walker = document.createTreeWalker(scope, 4 /* NodeFilter.SHOW_TEXT */)
    var node
    while ((node = walker.nextNode())) {
      if (!hasHebrew(node.nodeValue)) continue
      var parent = node.parentElement
      if (!parent || parent.closest(LINE_SKIP_SELECTOR) !== null) continue
      claimLine(node, scope)
    }
  }

  /** Outermost line scopes only, so nested scopes are not walked twice. */
  function lineScopes() {
    var all = document.body.querySelectorAll(LINE_SCOPE_SELECTOR)
    var out = []
    for (var i = 0; i < all.length; i++) {
      var parent = all[i].parentElement
      if (parent && parent.closest && parent.closest(LINE_SCOPE_SELECTOR) !== null) continue
      out.push(all[i])
    }
    return out
  }

  /**
   * Scan one subtree. `root` is document.body for a full pass, or one changed
   * unit (a chat row, a question card, a GenUI panel) for an incremental one.
   */
  function scan(root) {
    if (root.nodeType !== 1) return
    var all = function (sel) {
      var list = root.querySelectorAll ? Array.prototype.slice.call(root.querySelectorAll(sel)) : []
      if (root.matches && root.matches(sel)) list.unshift(root)
      return list
    }
    // 1. Blocks. Each message root resolves once, then its blocks follow it.
    var messages = all(MESSAGE_SELECTOR)
    if (messages.length === 0 && root.closest) {
      var enclosing = root.closest(MESSAGE_SELECTOR)
      if (enclosing !== null) messages = [enclosing]
    }
    for (var m = 0; m < messages.length; m++) scanMessage(messages[m])
    // Blocks outside any message root (dialogs, panels) judge themselves.
    var nodes = all(BLOCK_SELECTOR)
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].closest(MESSAGE_SELECTOR) === null) applyBlockDirection(nodes[i])
    }
    // 2. Components.
    var components = all(COMPONENT_SELECTOR)
    for (var c = 0; c < components.length; c++) {
      if (!isExcluded(components[c])) applyComponentDirection(components[c])
    }
    // 3. Lines outside blocks.
    if (root === document.body) {
      var scopes = lineScopes()
      for (var s = 0; s < scopes.length; s++) scanLines(scopes[s])
    } else {
      var scope = root.closest ? root.closest(LINE_SCOPE_SELECTOR) : null
      if (scope !== null) scanLines(root)
      else {
        var inner = all(LINE_SCOPE_SELECTOR)
        for (var t = 0; t < inner.length; t++) scanLines(inner[t])
      }
    }
  }

  // The unit a mutation is re-scanned at. Each is self-contained for every
  // rule above: a chat row holds its whole message, a question card and a
  // GenUI panel hold their whole component.
  var UNIT_SELECTOR = '[data-chat-flow-key], [data-question-key], [data-genui-panel]'

  /** The unit to re-scan for one mutated node, or document.body. */
  function unitOf(el) {
    var unit = el.closest ? el.closest(UNIT_SELECTOR) : null
    return unit !== null ? unit : document.body
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

  /**
   * Direction of one line. A line with any Hebrew is RTL, matching how the
   * field renders it (see "Input fields" below); otherwise the field's own
   * computed direction decides — an English line in a field forced RTL is
   * laid out RTL too.
   */
  function lineDirection(el, line) {
    if (HEBREW_ONE.test(line)) return 'rtl'
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

  // --- Input fields ---------------------------------------------------------
  //
  // Same rule as the chat: a field holding any Hebrew is RTL.
  //
  // Text inputs and textareas (session rename, the ask_user_question custom
  // answer, search boxes): without this, `direction` is inherited from the
  // page, so a rename dialog opened on a Hebrew title showed it LTR, and
  // plaintext made "Rollout: מוסיפים" in the custom-answer field LTR too. A
  // field with Hebrew is forced RTL as a whole (a textarea cannot style its
  // lines separately); clearing the Hebrew releases it.
  //
  // The custom-answer textarea (`fieldInput`) shares a grid cell with a
  // hidden height ruler (`fieldMirror`). Both MUST carry identical bidi
  // styles or their wrapped heights diverge and the field mis-sizes, so the
  // mirror is forced together with its textarea, never alone.
  var FIELD_SELECTOR = 'textarea, input:not([type]), input[type="text"], input[type="search"]'
  var FIELD_ATTR = 'data-hebrew-rtl-field'

  function forceField(el, rtl) {
    if (rtl) {
      if (el.getAttribute(FIELD_ATTR) === 'rtl') return
      el.style.setProperty('direction', 'rtl', 'important')
      el.style.setProperty('text-align', 'right', 'important')
      el.style.setProperty('unicode-bidi', 'isolate', 'important')
      el.setAttribute(FIELD_ATTR, 'rtl')
    } else if (el.getAttribute(FIELD_ATTR) === 'rtl') {
      el.style.removeProperty('direction')
      el.style.removeProperty('text-align')
      el.style.removeProperty('unicode-bidi')
      el.removeAttribute(FIELD_ATTR)
    }
  }

  function applyFieldDirection(el) {
    if (!el || !el.matches || !el.matches(FIELD_SELECTOR)) return
    var rtl = typeof el.value === 'string' && HEBREW_ONE.test(el.value)
    forceField(el, rtl)
    // The custom-answer mirror sits beside its textarea in the same wrapper.
    if (el.matches('[class*="fieldInput"]') && el.parentElement) {
      var mirror = el.parentElement.querySelector('[class*="fieldMirror"]')
      if (mirror) forceField(mirror, rtl)
    }
  }

  function onFieldEvent(e) {
    applyFieldDirection(e.target)
  }

  // The composer is a Lexical contenteditable since dsh 0.1.7 (the old
  // textarea/backdrop/mirror stack is gone). Lexical renders each line as a
  // <p dir="auto">, and dir=auto is first-strong — "Rollout: מוסיפים" came
  // out LTR. Each paragraph with Hebrew is forced RTL. Only the paragraph's
  // inline style and a marker attribute are touched, never its content:
  // Lexical's observer watches childList/characterData, not attributes, so
  // this does not fight the editor's reconciliation.
  var COMPOSER_SELECTOR = '[data-composer-input]'

  function scanComposer(root) {
    var paragraphs = root.children || []
    for (var i = 0; i < paragraphs.length; i++) {
      var p = paragraphs[i]
      var rtl = HEBREW_ONE.test(p.textContent || '')
      if (rtl && p.getAttribute(FIELD_ATTR) !== 'rtl') {
        p.style.setProperty('direction', 'rtl', 'important')
        p.style.setProperty('text-align', 'right', 'important')
        p.setAttribute(FIELD_ATTR, 'rtl')
      } else if (!rtl && p.getAttribute(FIELD_ATTR) === 'rtl') {
        p.style.removeProperty('direction')
        p.style.removeProperty('text-align')
        p.removeAttribute(FIELD_ATTR)
      }
    }
  }

  function scanComposers() {
    var roots = document.querySelectorAll(COMPOSER_SELECTOR)
    for (var i = 0; i < roots.length; i++) scanComposer(roots[i])
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
    //
    // Only the changed units are re-scanned: while a reply streams that is one
    // chat row per frame, not the whole conversation (a full pass over 600
    // messages costs ~10ms; a row costs a fraction of that). A mutation
    // outside every unit falls back to a full pass.
    var pending = false
    var dirty = []
    function flush() {
      pending = false
      var units = dirty
      dirty = []
      if (units.indexOf(document.body) !== -1) {
        scan(document.body)
        return
      }
      for (var i = 0; i < units.length; i++) {
        if (units[i].isConnected !== false) scan(units[i])
      }
    }
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target
        var el = target.nodeType === 1 ? target : target.parentElement
        // Ignore mutations inside excluded subtrees (keystroke-by-keystroke
        // composer/input updates) so content is what drives re-scans.
        if (!el || isExcluded(el)) continue
        // Our own style/attribute writes are not observed (no `attributes`).
        var unit = unitOf(el)
        // An added subtree may itself contain units (a whole page of rows).
        if (unit === document.body || dirty.indexOf(unit) === -1) dirty.push(unit)
      }
      if (dirty.length > 0 && !pending) {
        pending = true
        requestAnimationFrame(flush)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    // Capture phase so the swap wins over any app-level key handling.
    document.addEventListener('keydown', swapLineKeysOnRtl, true)

    // Fields: on typing, and on focus (a rename dialog opens prefilled and
    // autofocused, with no input event).
    document.addEventListener('input', onFieldEvent, true)
    document.addEventListener('focusin', onFieldEvent, true)

    // Composer: its own observer, because the main one skips every
    // contenteditable mutation on purpose. Coalesced per frame; it only reads
    // the composer's few paragraphs.
    scanComposers()
    var composerPending = false
    function flushComposers() {
      composerPending = false
      scanComposers()
    }
    var composerObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var t = mutations[i].target
        var el = t.nodeType === 1 ? t : t.parentElement
        if (!el) continue
        // Typing inside the composer, or a composer mounted fresh (session
        // switch) as part of an added subtree.
        var inside = el.closest && el.closest(COMPOSER_SELECTOR) !== null
        var added = !inside && mutations[i].addedNodes.length > 0 && el.querySelector && el.querySelector(COMPOSER_SELECTOR) !== null
        if (!inside && !added) continue
        if (!composerPending) {
          composerPending = true
          requestAnimationFrame(flushComposers)
        }
        return
      }
    })
    composerObserver.observe(document.body, { childList: true, subtree: true, characterData: true })

    ctx.effect(function () {
      return function () {
        document.removeEventListener('keydown', swapLineKeysOnRtl, true)
        document.removeEventListener('input', onFieldEvent, true)
        document.removeEventListener('focusin', onFieldEvent, true)
        composerObserver.disconnect()
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
