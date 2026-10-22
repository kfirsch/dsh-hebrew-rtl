# dsh-hebrew-rtl

English | [עברית](./README.he.md)

Correct Hebrew RTL rendering for the [DeepSeek Harness](https://github.com/deepseek-harness/harness) web GUI: any line with Hebrew reads right-to-left, bidi-safe input fields, and RTL-aware `Cmd`+`←`/`→` line navigation.

## The problem

The GUI renders every block left-to-right. For Hebrew that produces three distinct failures:

1. **Whole paragraphs read backwards.** A Hebrew sentence is laid out as an LTR paragraph, so its lines start on the wrong side and punctuation lands at the wrong end.
2. **Typing into a field runs the wrong way.** The `ask_user_question` custom-answer field inherits the page direction, so Hebrew typed into it flows left-to-right.
3. **`Cmd`+`←`/`→` feel inverted.** These shortcuts are *logical* in every browser: `←` goes to the line's logical start, which on an RTL line sits at the visual **right** edge. Pressing `←` jumps the caret to the far right.

The obvious CSS answer — `unicode-bidi: plaintext` — fixes only the easy half. It picks a block's direction from its **first strong directional character**, so a Hebrew sentence that opens with a Latin product name, a list number, or an emoji is still rendered LTR and still reads garbled.

## What this plugin does

### Any line with Hebrew in it is RTL

The rule is deliberately blunt: a block (`p`, `ul`/`ol`, `h1`–`h6`, `blockquote`, `table`) or a line of text that contains **even one Hebrew letter** is forced to `direction: rtl` + `text-align: right`. A block with no Hebrew is left to `unicode-bidi: plaintext`.

Forced blocks get `unicode-bidi: isolate`, so the Unicode Bidi algorithm still lays out the Latin runs correctly **inside** the RTL line:

```
Rollout: מוסיפים minPodsPerReplicaSet: 2
→ RTL: "Rollout:" reads first, on the right; the identifiers stay unreversed

DSH הוא כלי מצוין לעבודה יומיומית.
→ RTL, and "DSH" stays in place
```

**Why not count which script dominates.** Earlier versions counted Hebrew words against Latin words and followed the majority. Mixed technical Hebrew is the normal case, not the edge case: `Rollout: מוסיפים minPodsPerReplicaSet: 2`, `canonical-revision=canary. minAvailable: 50% ... בוחר רק pods עם` — each has more Latin than Hebrew and came out LTR, line after line, in otherwise Hebrew answers. The accepted cost: an English sentence carrying a single Hebrew word is RTL too.

**Lines outside paragraphs.** GenUI components (steps, lists, tables, callouts…), `ask_user_question` cards and your own message bubble render text in `<span>`/`<div>` elements, not `<p>`. With `unicode-bidi: plaintext` each of those picked its own direction from its first strong character, so a step titled `1. Rollout: מוסיפים ...` was LTR even inside an RTL list. The plugin now walks the text in the conversation, question cards and GenUI blocks, and forces RTL on the element that lays out each Hebrew line (and on any inline span between the text and that element). The sidebars and settings are not touched.

**Components are laid out as a whole.** Which side a question card's option numbers, a GenUI step's markers, or a table's columns sit on is a property of the whole component, so it follows the component's dominant script: a Hebrew question card or GenUI block is laid out RTL (markers and numbers on the right), while an English GenUI table with one Hebrew value keeps its English layout — the Hebrew value itself still reads RTL.

**Where dominance is still used: the message and the component.** Dominance no longer decides a line, but it still decides two things that are not a line: which direction a whole message takes (so its all-Latin headings follow it), and a component's layout direction (see above). For those, words are counted and code tokens are excluded. Counting raw letters breaks on technical Hebrew prose. A single identifier can outweigh a whole paragraph — `git+https://git@github.com:kfirsch/...#<sha>` contributes 44 Latin letters by itself, and a commit sha another 40 — so a Hebrew sentence that merely *cites* a URL was rendered LTR. Identifiers, URLs, paths, shas and `15/15`-style ratios are therefore stripped before counting; they are still laid out normally, they just no longer vote on the paragraph's direction. Counting whole words rather than letters follows from the same reasoning: a three-letter Hebrew word says as much about the sentence's language as `credential` does. The stripping is deliberately conservative — an ordinary Latin word standing alone is never treated as code, so genuine English prose still counts in full.

**Headings follow their message.** A block on its own is not always enough context. In a Hebrew answer a heading is one line — often a bare identifier such as `agent-sandbox (SIG Apps, kubernetes-sigs)` with no Hebrew in it at all — so judging it alone left it LTR beside its own RTL body, and a document came out alternating sides heading by heading.

So each message resolves one direction — Hebrew when more of its paragraphs, lists, tables and quotes carry Hebrew than do not — and a heading with no Hebrew follows it. Two things keep their own direction:

- **A whole paragraph with no Hebrew at all** stays LTR. It is prose in its own right, and forcing RTL on it pushes the run to the far margin and migrates its trailing punctuation to the wrong end. A block inside a Hebrew list or table follows that list or table instead.
- **Code** (`pre`, `code`, and KaTeX) is excluded outright — a code block stays LTR even when it contains Hebrew.

**Composite elements are judged whole, never by their parts.** This one rule was learned three times over:

- **Tables.** Judging each `td` separately gave a six-row status table three different verdicts — Hebrew label cells went RTL while the `HEAD` and `Commits` cells beside them stayed LTR — so the label column changed edges from row to row. Column *order* is a property of the table rather than the cell, so per-cell directions also fight the column order itself.
- **Lists.** The same failure one level down. In a Hebrew numbered list, a short all-Latin item such as `push` has no Hebrew to weigh, so it got no verdict at all, fell back to the page's LTR, and jumped to the opposite margin from its RTL siblings — breaking the numbering column.
- **Formulas.** KaTeX renders a formula as hundreds of nested `<span>`s whose horizontal positions it computes itself. Letting each one pick its own direction tore formulas apart: `(idle + rightsizing)` and `$870/month` came out reordered into nonsense. `.katex` and its whole subtree are excluded — KaTeX handles bidi itself.

So the direction is decided once per composite, from its whole text, and every part inherits it. `unicode-bidi: isolate` still lays out each part's own content correctly within that direction.

Blocks are re-evaluated through a `MutationObserver` as text streams in, coalesced with `requestAnimationFrame` so streaming does not trigger a scan per character.

### Input fields: any Hebrew, RTL

The same rule as the chat, applied to what you type:

- **The composer** (a Lexical rich-text editor since dsh `0.1.7`) renders each line as `<p dir="auto">`, and `dir="auto"` is first-strong — `Rollout: מוסיפים` came out LTR. Each composer line holding Hebrew is forced RTL. Only the line's inline style is touched, never its content, so the editor's own reconciliation is unaffected.
- **Text inputs and textareas** — the session rename dialog, the `ask_user_question` custom answer, search boxes — are forced RTL as a whole when they hold any Hebrew, and released when the Hebrew is gone. The rename dialog opens prefilled and focused, so it is checked on focus as well as on typing.
- The custom-answer field is a **two-layer stack**: a hidden height mirror plus the real `<textarea>`, sharing one grid cell. Both layers are always styled together — never the textarea alone — or their wrapped heights diverge and the field mis-sizes.

### RTL-aware line navigation

A capture-phase `keydown` listener intercepts `Cmd`+`←`/`→` in text inputs and textareas **only when the caret's current line is RTL** (holds any Hebrew, or sits in a field laid out RTL), and swaps them so each arrow points where the caret visually goes. Lines that are not RTL are left completely untouched. Shift-extension and selection direction are preserved.

## Install

```sh
dsh plugin --profile web add github:kfirsch/dsh-hebrew-rtl
```

Then restart `dsh web` and hard-refresh the browser tab.

To pin a release (recommended — a later push then cannot silently change what runs):

```sh
dsh plugin --profile web add github:kfirsch/dsh-hebrew-rtl#v0.2.0
```

or an exact commit: `github:kfirsch/dsh-hebrew-rtl#<commit-sha>`. Releases and their changes are listed on the [Releases](https://github.com/kfirsch/dsh-hebrew-rtl/releases) page.

The package ships plain hand-written JavaScript in `lib/` with **no build step**, so installing from GitHub needs no `allowBuilds` approval.

### Uninstall

```sh
dsh plugin --profile web remove dsh-hebrew-rtl
```

## Scope: Hebrew only, deliberately

The direction rule generalises cleanly to every RTL script — Arabic and its languages, Syriac, Thaana, N'Ko, Adlam — and that version was written and passed a 16-case script matrix. It was then **reverted on purpose**: neither the author nor a reviewer can proof-read those scripts, and shipping text-direction handling that nobody involved can verify is worse than not shipping it. The package name says what it actually supports.

A pull request adding another script is welcome **from someone who reads it** and can confirm the rendering by eye.

## Compatibility

- **Surface:** the `web` profile (`dsh web`). No host service, no configuration, no network access.
- **What it never touches:** code blocks — code stays LTR regardless of its content — and contenteditable regions other than the composer.
- Tested against dsh `0.1.7-alpha.1`.

## License

[MIT](./LICENSE) © Kfir Schneider

## For reviewers: why there is no build step

`lib/` is not build output — it is the hand-written source, in the exact wire
format the DSH client module system loads. There is deliberately no `src/`, no
`scripts.build` and no `scripts.prepack`, so a clean checkout is already the
artifact and a GitHub install needs no `allowBuilds` approval.

`plugin_check` flags all three of those as warnings on the assumption that a
plugin is compiled; they are inapplicable here rather than unaddressed. The
package passes with **no errors**.

Run the checks yourself:

```sh
npm test              # all three suites below
npm run test:unit     # direction verdicts and the caret swap, against DOM stubs
npm run test:browser  # real layout in headless Chrome: GenUI steps, question
                      # cards, the user bubble, markdown blocks
npm run test:fields   # input fields in headless Chrome: composer, rename,
                      # custom answer (browser suites skip if no Chrome)
```
