---
title: The markup is yours
description: Why Varar never edits inline text, and why document formats are block-structure plugins.
---

Varar executes prose. That only stays trustworthy if the prose the matcher
sees is exactly the prose you wrote — so Varar follows one rule:

**Format plugins own block structure. Nobody touches inline text.**

## Inline text is explicit

Step matching runs against the raw characters of each sentence. Emphasis,
bold, links, inline code — none of it is stripped, normalized or rewritten.
`Maya borrowed *Emma*` contains two asterisks, and only an expression that
accounts for them will match.

That sounds stricter than it is. In practice a marked-up run is almost
always *data* — a book title, a product name — and data is what
[custom parameters](/reference/custom-parameters/) are for:

```ts
title: {
  regexp: /\*[^*]+\*/,
  parse: (raw) => raw.slice(1, -1),   // *Emma* → Emma
  format: (t) => `*${t}*`,            // Emma → *Emma* (mismatch display)
}
```

The markers are notation, no different from the `£` in `£2.50`. `parse`
takes the notation apart, `format` puts it back, and neither Varar's core nor
your handlers ever see markup they didn't ask for.

An earlier design stripped emphasis before matching, so `*Emma*` invisibly
became `Emma`. It felt convenient and read as magic: expressions matched
text that wasn't in the document, and adding emphasis to a word silently
changed nothing — until it did. Explicit turned out to be better: what you
see in the document is what the matcher sees, and a styling change to a
matched sentence fails loudly instead of drifting quietly.

Two practical consequences:

- **Styling matched sentences is significant.** Emphasizing a word inside a
  matched sentence changes its text, and the match fails visibly. Narration
  — the prose around your matched sentences — can use any markup it likes.
- **Keep links and inline code out of matched sentences.** In narration
  they're fine; in a matched sentence the URL is just more characters.

## Formats are block structure

What does Markdown actually contribute to a spec? Sections (`#` headings
become example boundaries and `describe` scopes), prose blocks (paragraphs,
list items, blockquotes), tables, and fenced blocks (doc strings and
`error` fences). All of it is *block* structure. None of it is inline.

That boundary is what makes the format pluggable. The scanner already
accepts block-recognition plugins — the Gherkin-table plugin adds `| a | b |`
tables without separator rows — and Markdown's own block rules are on by
default for `.md` and `.mdx` files. A block marker like a list bullet or a
blockquote's `>` prefix belongs to the format, so it never reaches the
matcher; everything after it is your text, untouched.

Nothing about sentences, matching or comparison knows Markdown exists. A
future AsciiDoc plugin (`==` headings, `|===` tables, `----` blocks) would
slot into the same seam without changing how a single expression matches —
and your emphasis parameter type would simply use AsciiDoc's notation:
`/_[^_]+_/`.
