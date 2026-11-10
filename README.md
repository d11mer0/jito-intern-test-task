# html2json Solution Overview

## How to Run
1. Open `index.html` in any web browser.
2. Click **Input Example 1** or **Input Example 2** to load sample HTML (or paste your own HTML markup into the left textarea).
3. Click **Convert to JSON** to see the resulting JSON structure in the right textarea.

---

## JSON Structure
The `html2json` function converts an HTML string into a tree starting with a root `document` node:
```json
{
  "type": "document",
  "children": []
}
```

Using a `children` array of node objects instead of using tag names as object keys preserves the exact order of sibling tags, handles mixed content (like text combined with inline tags inside `<p>`), and avoids collisions between attribute names and child tag names.

### Supported Node Types
- `doctype`: `{ "type": "doctype", "value": "html" }`
- `element`: `{ "type": "element", "tag": "div", "attributes": {}, "children": [] }`
- `text`: `{ "type": "text", "value": "..." }`
- `comment`: `{ "type": "comment", "value": "..." }`

---

## How the Parser Works

The implementation is split into two steps without using `DOMParser` or regular expressions for tag matching:

1. **Tokenizer (`tokenize`)**:
   Reads the HTML string from left to right and builds a flat list of tokens:
   - Extracts comments (`<!-- ... -->`) and `<!DOCTYPE ...>`.
   - Parses opening tags and attributes character by character. It supports double quotes, single quotes, unquoted values, and boolean attributes (`disabled` -> `true`). Because quotes are tracked while scanning the tag, characters like `>` or `/` inside attribute values do not break the tag, and unclosed quotes or tags recover cleanly.
   - If `<` is not followed by a valid tag start (for example `5 < 10` in plain text), it is treated as normal text.
   - For `<script>`, `<style>`, `<textarea>`, and `<title>`, the tokenizer reads the inner content as raw text until the matching closing `</tag>` is found.

2. **Tree Builder (`html2json`)**:
   Uses an explicit stack (`const stack = [root]`) instead of recursion so deeply nested HTML will not cause a call stack overflow.
   - Void tags (`meta`, `link`, `img`, `br`, `hr`, `input`, etc.) and self-closing tags (`<path />`) are added to the current parent's `children` without being pushed to the stack.
   - Common optional closing tags (`<p>`, `<li>`, `<td>`, `<th>`, `<tr>`, `<thead>`, `<tbody>`, `<tfoot>`, `<option>`, `<optgroup>`) are closed automatically when a new sibling or block tag starts, respecting scoping containers like `<td>`, `<table>`, or `<template>`.
   - When a closing tag `</tag>` is encountered, the stack is searched from the top down. If a matching open tag exists, the stack is popped back to that level (closing any unclosed inner tags). If no matching tag is in the stack, the stray closing tag is ignored.
   - Formatting whitespace with newlines (`\n`) is skipped, while single spaces between inline tags and whitespace inside `<pre>`, `<code>`, `<textarea>`, `<script>`, and `<style>` are preserved. Common HTML entities (`&copy;`, `&amp;`, numeric entities) are decoded in text and attributes, while `<script>` and `<style>` keep raw text untouched.
