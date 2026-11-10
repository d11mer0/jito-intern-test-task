function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");
  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed",
  "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"
]);

const RAW_TEXT_TAGS = new Set([
  "script",
  "style",
  "textarea",
  "title"
]);

const P_CLOSING_TAGS = new Set([
  "address", "article", "aside", "blockquote", "details", "dialog",
  "div", "dl", "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
  "main", "menu", "nav", "ol", "p", "pre", "section",
  "table", "ul"
]);

const PRESERVE_WHITESPACE_TAGS = new Set([
  "pre",
  "code",
  "textarea",
  "script",
  "style"
]);

const HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  copy: "©",
  nbsp: "\u00A0",
  reg: "®",
  euro: "€",
  mdash: "—",
  ndash: "–",
  hellip: "…"
};

function isTagStart(html, i) {
  return (
    html[i] === "<" &&
    (
      /[a-zA-Z]/.test(html[i + 1] || "") ||
      (html[i + 1] === "/" && /[a-zA-Z]/.test(html[i + 2] || ""))
    )
  );
}

function readTagEnd(html, start) {
  let quote = null;

  for (let i = start + 1; i < html.length; i++) {
    const char = html[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (
        (char === "\n" || char === "\r") &&
        (
          html.indexOf(quote, i + 1) === -1 ||
          /^\s*<\/?[a-zA-Z!]/.test(html.slice(i + 1, i + 40))
        )
      ) {
        return {
          end: i,
          closed: false
        };
      }
    } else {
      if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        return {
          end: i + 1,
          closed: true
        };
      } else if (char === "<") {
        return {
          end: i,
          closed: false
        };
      }
    }
  }

  return {
    end: html.length,
    closed: false
  };
}

function parseComment(html, start) {
  const end = html.indexOf("-->", start + 4);

  if (end === -1) {
    return {
      token: {
        type: "comment",
        value: html.slice(start + 4)
      },
      nextIndex: html.length
    };
  }

  return {
    token: {
      type: "comment",
      value: html.slice(start + 4, end)
    },
    nextIndex: end + 3
  };
}

function parseDoctype(html, start) {
  const { end, closed } = readTagEnd(html, start);
  const content = html.slice(start + 2, closed ? end - 1 : end).trim();

  const name = content
    .replace(/^doctype\s*/i, "")
    .split(/\s+/)[0]
    .toLowerCase();

  return {
    token: {
      type: "doctype",
      value: name || "html"
    },
    nextIndex: end
  };
}

function parseStartTag(source) {
  let i = 0;

  while (i < source.length && !/\s|\//.test(source[i])) {
    i++;
  }

  const tag = source.slice(0, i).toLowerCase();
  const attributes = {};
  let selfClosing = false;

  while (i < source.length) {
    while (/\s/.test(source[i] || "")) {
      i++;
    }

    if (i >= source.length) break;

    if (source[i] === "/") {
      selfClosing = true;
      i++;
      continue;
    }

    const start = i;

    while (i < source.length && !/[\s=/>]/.test(source[i])) {
      i++;
    }

    if (start === i) {
      i++;
      continue;
    }

    const name = source.slice(start, i).toLowerCase();

    while (/\s/.test(source[i] || "")) {
      i++;
    }

    let value = true;

    if (source[i] === "=") {
      i++;

      while (/\s/.test(source[i] || "")) {
        i++;
      }

      const quote = source[i];

      if (quote === '"' || quote === "'") {
        i++;
        const valueStart = i;

        while (i < source.length && source[i] !== quote) {
          i++;
        }

        value = source.slice(valueStart, i);
        if (i < source.length) i++;
      } else {
        const valueStart = i;

        while (
          i < source.length &&
          !/[\s>]/.test(source[i]) &&
          !(source[i] === "/" && i === source.length - 1)
        ) {
          i++;
        }

        value = source.slice(valueStart, i);
      }
    }

    if (!(name in attributes)) {
      attributes[name] = value;
    }
  }

  return {
    tag,
    attributes,
    selfClosing
  };
}

function findRawTextEnd(html, start, tag) {
  const lower = html.toLowerCase();
  const closing = `</${tag}`;

  let i = start;

  while (i < html.length) {
    const pos = lower.indexOf(closing, i);

    if (pos === -1) return -1;

    const next = html[pos + closing.length];

    if (
      next === ">" ||
      next === "/" ||
      /\s/.test(next || "") ||
      next === undefined
    ) {
      return pos;
    }

    i = pos + closing.length;
  }

  return -1;
}

function tokenize(html) {
  const tokens = [];

  let i = 0;
  let rawTag = null;

  while (i < html.length) {
    if (rawTag) {
      const end = findRawTextEnd(html, i, rawTag);

      if (end === -1) {
        tokens.push({
          type: "text",
          value: html.slice(i)
        });
        break;
      }

      if (end > i) {
        tokens.push({
          type: "text",
          value: html.slice(i, end)
        });
      }

      i = end;
      rawTag = null;
      continue;
    }

    if (html.startsWith("<!--", i)) {
      const result = parseComment(html, i);
      tokens.push(result.token);
      i = result.nextIndex;
      continue;
    }

    if (/^<!doctype\b/i.test(html.slice(i, i + 10))) {
      const result = parseDoctype(html, i);
      if (result) {
        tokens.push(result.token);
        i = result.nextIndex;
        continue;
      }
    }

    if (
      html.startsWith("</", i) &&
      /[a-zA-Z]/.test(html[i + 2] || "")
    ) {
      const { end, closed } = readTagEnd(html, i);
      const tag = html
        .slice(i + 2, closed ? end - 1 : end)
        .trim()
        .split(/\s/)[0]
        .toLowerCase();

      tokens.push({
        type: "endTag",
        tag
      });

      i = end;
      continue;
    }

    if (isTagStart(html, i)) {
      const { end, closed } = readTagEnd(html, i);
      const source = html.slice(i + 1, closed ? end - 1 : end);
      const parsed = parseStartTag(source);

      tokens.push({
        type: "startTag",
        ...parsed
      });

      i = end;

      if (RAW_TEXT_TAGS.has(parsed.tag) && !parsed.selfClosing) {
        rawTag = parsed.tag;
      }

      continue;
    }

    const start = i;
    i++;

    while (
      i < html.length &&
      !(
        html[i] === "<" &&
        (
          html.startsWith("<!--", i) ||
          /^<!doctype\b/i.test(html.slice(i, i + 10)) ||
          isTagStart(html, i)
        )
      )
    ) {
      i++;
    }

    tokens.push({
      type: "text",
      value: html.slice(start, i)
    });
  }

  return tokens;
}

function decodeEntities(value) {
  return value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi,
    (match, entity) => {
      if (entity.startsWith("#")) {
        const isHex = /^#x/i.test(entity);
        const digits = entity.slice(isHex ? 2 : 1);
        const codePoint = Number.parseInt(digits, isHex ? 16 : 10);

        if (!Number.isFinite(codePoint) || codePoint < 1 || codePoint > 0x10ffff) {
          return match;
        }

        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }

      const name = entity.toLowerCase();
      return HTML_ENTITIES[name] ?? match;
    }
  );
}

function decodeAttributes(attributes = {}) {
  const result = {};

  for (const [name, value] of Object.entries(attributes)) {
    result[name] = typeof value === "string" ? decodeEntities(value) : value;
  }

  return result;
}

function closeNearestInScope(stack, targetTags, boundaryTags = []) {
  const targets = new Set(
    Array.isArray(targetTags) ? targetTags : [targetTags]
  );
  const boundaries = new Set(boundaryTags);

  for (let i = stack.length - 1; i > 0; i--) {
    const tag = stack[i].tag;

    if (targets.has(tag)) {
      stack.length = i;
      return true;
    }

    if (boundaries.has(tag)) {
      return false;
    }
  }

  return false;
}

function applyImpliedEndTags(tag, stack) {
  if (P_CLOSING_TAGS.has(tag)) {
    closeNearestInScope(stack, "p", ["td", "th", "table", "template"]);
  }

  if (tag === "li") {
    closeNearestInScope(stack, "li", ["ul", "ol", "menu", "template"]);
  }

  if (tag === "td" || tag === "th") {
    closeNearestInScope(stack, ["td", "th"], ["table", "template"]);
  }

  if (tag === "tr") {
    closeNearestInScope(stack, ["td", "th"], ["table", "template"]);
    closeNearestInScope(stack, "tr", ["table", "template"]);
  }

  if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
    closeNearestInScope(stack, ["td", "th"], ["table", "template"]);
    closeNearestInScope(stack, "tr", ["table", "template"]);
    closeNearestInScope(
      stack,
      ["thead", "tbody", "tfoot"],
      ["table", "template"]
    );
  }

  if (tag === "option") {
    closeNearestInScope(stack, "option", ["select", "datalist", "template"]);
  }

  if (tag === "optgroup") {
    closeNearestInScope(stack, "option", ["select", "datalist", "template"]);
    closeNearestInScope(stack, "optgroup", ["select", "datalist", "template"]);
  }
}

function shouldDiscardWhitespace(value, stack) {
  const preserveWhitespace = stack.some(
    (node) =>
      node.type === "element" && PRESERVE_WHITESPACE_TAGS.has(node.tag)
  );

  if (preserveWhitespace) {
    return false;
  }

  return /^[\t\n\f\r ]+$/.test(value) && /[\r\n]/.test(value);
}

/* 
  Update this function to convert html into json object.
  You can rewrite it completely, just be sure it accepts htmlText as string and outputs json object.
*/
function html2json(htmlText) {
  if (typeof htmlText !== "string") {
    htmlText = "";
  }

  const tokens = tokenize(htmlText);

  const root = {
    type: "document",
    children: []
  };

  const stack = [root];

  for (const token of tokens) {
    const current = stack[stack.length - 1];

    switch (token.type) {
      case "startTag": {
        const tag = token.tag.toLowerCase();

        applyImpliedEndTags(tag, stack);

        const node = {
          type: "element",
          tag,
          attributes: decodeAttributes(token.attributes),
          children: []
        };

        stack[stack.length - 1].children.push(node);

        if (!VOID_TAGS.has(tag) && !token.selfClosing) {
          stack.push(node);
        }

        break;
      }

      case "endTag": {
        const tag = token.tag.toLowerCase();
        closeNearestInScope(stack, tag);
        break;
      }

      case "text": {
        let value = token.value;

        if (!value) break;

        const insideScriptOrStyle = stack.some(
          (node) =>
            node.type === "element" &&
            (node.tag === "script" || node.tag === "style")
        );

        if (!insideScriptOrStyle) {
          value = decodeEntities(value);
        }

        if (shouldDiscardWhitespace(value, stack)) {
          break;
        }

        current.children.push({
          type: "text",
          value
        });

        break;
      }

      case "comment": {
        current.children.push({
          type: "comment",
          value: token.value
        });
        break;
      }

      case "doctype": {
        current.children.push({
          type: "doctype",
          value: token.value
        });
        break;
      }

      default:
        break;
    }
  }

  return root;
}

function showExample1() {
  const htmlExample = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport">
    <title>Sample HTML</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Website</h1>
    </header>
    <nav>
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main>
        <section id="home">
            <h2>Home Section</h2>
            <p>This is the home section of the webpage.</p>
        </section>
        <section id="about">
            <h2>About Section</h2>
            <p>This is the about section of the webpage.</p>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 My Website</p>
    </footer>
    <script src="script.js"></script>
</body>
</html>
`;
  const jsonContent = html2json(htmlExample);

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}

function showExample2() {
  const htmlExample = `<div>
<p>Hello world!</p>
  <button>Click me!</button>
  <textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
</div>
`;
  const jsonContent = html2json(htmlExample);

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}
