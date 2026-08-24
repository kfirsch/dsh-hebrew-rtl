# dsh-hebrew-rtl

English | [עברית](./README.he.md)

Correct Hebrew RTL rendering for the [DeepSeek Harness](https://github.com/deepseek-harness/harness) web GUI: per-block direction by dominant script, bidi-safe input fields, and RTL-aware `Cmd`+`←`/`→` line navigation.

## The problem

The GUI renders every block left-to-right. For Hebrew that produces three distinct failures:

1. **Whole paragraphs read backwards.** A Hebrew sentence is laid out as an LTR paragraph, so its lines start on the wrong side and punctuation lands at the wrong end.
2. **Typing into a field runs the wrong way.** The `ask_user_question` custom-answer field inherits the page direction, so Hebrew typed into it flows left-to-right.
3. **`Cmd`+`←`/`→` feel inverted.** These shortcuts are *logical* in every browser: `←` goes to the line's logical start, which on an RTL line sits at the visual **right** edge. Pressing `←` jumps the caret to the far right.

The obvious CSS answer — `unicode-bidi: plaintext` — fixes only the easy half. It picks a block's direction from its **first strong directional character**, so a Hebrew sentence that opens with a Latin product name, a list number, or an emoji is still rendered LTR and still reads garbled.

## What this plugin does

### Per-block direction by dominant script

For each block element (`p`, `li`, `h1`–`h6`, `blockquote`, `td`, `th`) it drops code-like tokens from the block's text, then counts Hebrew-majority **words** against Latin-majority words in what remains:

| Content | Result |
| --- | --- |
| No Hebrew prose | No override — `unicode-bidi: plaintext` stays in charge |
| Hebrew words > Latin words | `direction: rtl` + `text-align: right` |
| Latin words > Hebrew words | `direction: ltr` + `text-align: left` |
| Equal (both present) | No override — falls back to first-strong |

Forced blocks get `unicode-bidi: isolate`, so the Unicode Bidi algorithm still lays out the minority-script runs correctly **inside** the chosen paragraph direction:

```
היום בדקנו את הפלאגין החדש עם DSH והכול עבד מצוין.
→ RTL, and "DSH" stays in place, unreversed

This is a test sentence with שלום in the middle.
→ LTR, and "שלום" stays in place, mid-sentence
```

Dominance is the rule because both simpler alternatives fail in an obvious way. First-strong alone mis-renders any Hebrew paragraph that does not *begin* in Hebrew. "Any Hebrew character forces RTL" over-corrects in the other direction: an English sentence carrying one Hebrew word flips to RTL and its English runs come out reversed.

**Why words, and why code tokens are excluded.** Counting raw letters breaks on technical Hebrew prose. A single identifier can outweigh a whole paragraph — `git+https://git@github.com:kfirsch/...#<sha>` contributes 44 Latin letters by itself, and a commit sha another 40 — so a Hebrew sentence that merely *cites* a URL was rendered LTR. Identifiers, URLs, paths, shas and `15/15`-style ratios are therefore stripped before counting; they are still laid out normally, they just no longer vote on the paragraph's direction. Counting whole words rather than letters follows from the same reasoning: a three-letter Hebrew word says as much about the sentence's language as `credential` does. The stripping is deliberately conservative — an ordinary Latin word standing alone is never treated as code, so genuine English prose still counts in full.

The heuristic is not infallible on a block that is genuinely half-and-half after stripping (a short line of mostly commit hashes with two Hebrew words, say). Those fall back to first-strong rather than guessing.

Blocks are re-evaluated through a `MutationObserver` as text streams in, coalesced with `requestAnimationFrame` so streaming does not trigger a scan per character.

### Bidi-safe input fields

The composer and the `ask_user_question` custom-answer field are each a **two-layer stack**: a visible or measuring mirror layer plus a real `<textarea>` sharing one grid cell. Both layers must carry *identical* bidi metrics, or their computed heights and wrapping diverge and the field mis-sizes or the caret drifts away from the glyphs.

Both layers therefore receive `unicode-bidi: plaintext` together — never the textarea alone — so each line's direction follows what is actually typed into it.

### RTL-aware line navigation

A capture-phase `keydown` listener intercepts `Cmd`+`←`/`→` **only when the caret's current line is RTL**, and swaps them so each arrow points where the caret visually goes. Lines that are not RTL are left completely untouched. Shift-extension and selection direction are preserved.

## Install

```sh
dsh plugin --profile web add github:kfirsch/dsh-hebrew-rtl
```

Then restart `dsh web` and hard-refresh the browser tab.

To pin an exact commit (recommended — a later push then cannot silently change what runs):

```sh
dsh plugin --profile web add github:kfirsch/dsh-hebrew-rtl#<commit-sha>
```

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
- **What it never touches:** `contenteditable` regions and code blocks — code stays LTR regardless of its content.
- Tested against dsh `0.1.1-rc.2`.

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
npm test          # smoke-tests the direction rule and the caret swap
```
