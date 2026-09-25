/**
 * Minimal, safe Markdown subset for editorial content (news, announcements,
 * pages). It never produces HTML strings: the output is a tree that React
 * renders as elements, so script injection is impossible by construction.
 *
 * Supported: paragraphs, ## / ### headings, - and 1. lists, > quotes,
 * **bold**, *italic*, [links](https://…) with http(s), mailto, tel or
 * site-relative targets, hard line breaks inside paragraphs, @mentions of a
 * nickname, and pictures.
 *
 * A picture is written ![alt](url), or simply left as a bare image address on
 * a line of its own — which is what people do, and what used to come out as a
 * line of blue text nobody could see the photograph in.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  /** @nickname — the handle a person chose, linked to whoever holds it. */
  | { type: "mention"; nickname: string }
  | { type: "br" };

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; children: Inline[] }
  | { type: "image"; src: string; alt: string };

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return href;
  if (/^tel:\+?[0-9 ()-]{3,20}$/i.test(href)) return href;
  if (/^\/(?!\/)[^\s\\]*$/.test(href)) return href;
  return null;
}

const IMAGE_SUFFIX = /\.(?:jpe?g|png|webp|gif|avif|svg)(?:\?[^\s]*)?$/i;

/** An address that names a picture, and that this platform will actually load. */
export function safeImageSrc(raw: string): string | null {
  const href = safeHref(raw);
  if (!href) return null;
  if (!/^https?:\/\//i.test(href) && !href.startsWith("/")) return null;
  return IMAGE_SUFFIX.test(href) ? href : null;
}

// A handle is 3–30 of the characters the nickname constraint allows, and must
// not swallow the domain of an address somebody typed.
const MENTION = /^@([A-Za-z0-9._]{3,30})\b/;

export function parseInline(source: string): Inline[] {
  const nodes: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      nodes.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);

    if (rest.startsWith("**")) {
      const end = rest.indexOf("**", 2);
      if (end > 2) {
        flush();
        nodes.push({ type: "strong", children: parseInline(rest.slice(2, end)) });
        i += end + 2;
        continue;
      }
    }

    if (rest.startsWith("*") && !rest.startsWith("**")) {
      const end = rest.indexOf("*", 1);
      if (end > 1 && rest[1] !== " ") {
        flush();
        nodes.push({ type: "em", children: parseInline(rest.slice(1, end)) });
        i += end + 1;
        continue;
      }
    }

    if (rest.startsWith("[")) {
      const match = /^\[([^\]]{1,300})\]\(((?:[^()\s]|\([^()\s]*\)){1,2000})\)/.exec(rest);
      if (match) {
        const href = safeHref(match[2]!);
        flush();
        if (href) {
          nodes.push({ type: "link", href, children: parseInline(match[1]!) });
        } else {
          nodes.push({ type: "text", value: match[1]! });
        }
        i += match[0].length;
        continue;
      }
    }

    // Only after whitespace or an opening bracket, so the @ inside an address
    // somebody typed is not read as somebody's handle.
    if (rest.startsWith("@") && (i === 0 || /[\s([]/.test(source[i - 1]!))) {
      const match = MENTION.exec(rest);
      if (match) {
        flush();
        nodes.push({ type: "mention", nickname: match[1]! });
        i += match[0].length;
        continue;
      }
    }

    if (rest.startsWith("\n")) {
      flush();
      nodes.push({ type: "br" });
      i += 1;
      continue;
    }

    buffer += source[i];
    i += 1;
  }
  flush();
  return nodes;
}

export function parseMarkdown(source: string | null | undefined): Block[] {
  if (!source) return [];
  const text = source.replace(/\r\n?/g, "\n").slice(0, 100_000);
  const blocks: Block[] = [];
  const chunks = text.split(/\n{2,}/);

  for (const rawChunk of chunks) {
    const chunk = rawChunk.replace(/^\n+|\n+$/g, "");
    if (!chunk.trim()) continue;
    const lines = chunk.split("\n");

    // A picture on a line of its own, written either way round. People paste
    // the address on its own far more often than they write the ![](…) form,
    // and a pasted address used to come out as a line of blue text with the
    // photograph nowhere in sight.
    if (lines.length === 1) {
      const explicit = /^!\[([^\]]{0,300})\]\(([^()\s]{1,2000})\)$/.exec(lines[0]!.trim());
      const src = explicit ? safeImageSrc(explicit[2]!) : safeImageSrc(lines[0]!.trim());
      if (src) {
        blocks.push({ type: "image", src, alt: explicit ? explicit[1]!.trim() : "" });
        continue;
      }
    }

    const heading = /^(#{2,3})\s+(.+)$/.exec(lines[0]!);
    if (heading && lines.length === 1) {
      blocks.push({ type: "heading", level: heading[1]!.length === 2 ? 2 : 3, children: parseInline(heading[2]!.trim()) });
      continue;
    }

    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      blocks.push({ type: "list", ordered: false, items: lines.map((l) => parseInline(l.replace(/^\s*[-*]\s+/, ""))) });
      continue;
    }

    if (lines.every((l) => /^\s*\d{1,3}[.)]\s+/.test(l))) {
      blocks.push({ type: "list", ordered: true, items: lines.map((l) => parseInline(l.replace(/^\s*\d{1,3}[.)]\s+/, ""))) });
      continue;
    }

    if (lines.every((l) => /^>\s?/.test(l))) {
      blocks.push({ type: "quote", children: parseInline(lines.map((l) => l.replace(/^>\s?/, "")).join("\n")) });
      continue;
    }

    blocks.push({ type: "paragraph", children: parseInline(chunk) });
  }
  return blocks;
}

/** Plain-text excerpt for previews and meta descriptions. */
export function markdownToPlainText(source: string | null | undefined, maxLength = 200): string {
  const plain = (source ?? "")
    // A picture contributes nothing to an excerpt, and its address contributes
    // a line of noise, so both forms are removed rather than flattened.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "")
    .replace(/^[^\S\n]*https?:\/\/\S+\.(?:jpe?g|png|webp|gif|avif|svg)[^\S\n]*$/gim, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*#>]/g, "")
    .replace(/^\s*[-]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1).trimEnd()}…` : plain;
}
