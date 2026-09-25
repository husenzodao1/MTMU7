import Link from "next/link";
import type { ReactNode } from "react";
import type { Block, Inline } from "@/lib/content/markdown";
import { parseMarkdown } from "@/lib/content/markdown";
import { cn } from "@/lib/utils/cn";

export function Avatar({ name, src, size = "md", className }: { name: string; src?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const dimension = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" }[size];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- user avatars come from signed/public storage URLs of arbitrary size
    return <img src={src} alt="" className={cn("shrink-0 rounded-full object-cover", dimension, className)} loading="lazy" />;
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-text-strong", dimension, className)} aria-hidden>
      {initials || "?"}
    </span>
  );
}

/** Link-based tabs for sub-pages (server friendly, aria-current on the active tab). */
export function TabNav({ items, label }: { items: Array<{ href: string; label: string; active: boolean; count?: number }>; label: string }) {
  return (
    <nav aria-label={label} className="mb-5 border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
                item.active ? "border-brand-600 text-brand-text" : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink"
              )}
            >
              {item.label}
              {item.count !== undefined ? (
                <span className="rounded bg-surface-muted px-1.5 text-xs tabular text-ink-secondary">{item.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function renderInline(nodes: Inline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case "text":
        return node.value;
      case "br":
        return <br key={key} />;
      case "strong":
        return <strong key={key} className="font-semibold">{renderInline(node.children, key)}</strong>;
      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "link": {
        const external = /^https?:/i.test(node.href);
        return (
          <a key={key} href={node.href} className="font-medium text-brand-text underline underline-offset-2 hover:text-brand-text-strong" {...(external ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}>
            {renderInline(node.children, key)}
          </a>
        );
      }
      case "mention":
        // /u/<nickname> resolves the handle and forwards to whoever holds it,
        // so the text can name a person without the writer knowing their id.
        return (
          <Link
            key={key}
            href={`/u/${node.nickname}`}
            className="rounded font-medium text-brand-text hover:text-brand-text-strong hover:underline"
          >
            @{node.nickname}
          </Link>
        );
    }
  });
}

function renderBlock(block: Block, index: number): ReactNode {
  const key = `b-${index}`;
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h2 key={key} className="text-xl font-semibold">{renderInline(block.children, key)}</h2>
      ) : (
        <h3 key={key} className="text-lg font-semibold">{renderInline(block.children, key)}</h3>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={key} className={cn("space-y-1 ps-6", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote key={key} className="border-s-4 border-brand-200 ps-4 text-ink-secondary">
          {renderInline(block.children, key)}
        </blockquote>
      );
    case "paragraph":
      return <p key={key}>{renderInline(block.children, key)}</p>;
    case "image":
      return (
        <figure key={key} className="-mx-1 my-4 overflow-hidden rounded-xl border border-line bg-surface-muted sm:mx-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- editorial images are arbitrary owner-supplied URLs */}
          <img src={block.src} alt={block.alt} className="w-full object-cover" loading="lazy" />
          {block.alt ? <figcaption className="px-3 py-2 text-sm text-ink-muted">{block.alt}</figcaption> : null}
        </figure>
      );
  }
}

/**
 * The picture an item leads with, and everything else.
 *
 * A photograph belongs at the top, large, with the words underneath — which is
 * how a notice board reads and how nobody reads a URL. Splitting it out lets a
 * card place the two independently instead of taking whatever order the writer
 * happened to type.
 */
export function splitLeadImage(source: string | null | undefined): { lead: { src: string; alt: string } | null; rest: Block[] } {
  const blocks = parseMarkdown(source);
  const index = blocks.findIndex((block) => block.type === "image");
  if (index < 0) return { lead: null, rest: blocks };
  const lead = blocks[index] as Extract<Block, { type: "image" }>;
  return { lead: { src: lead.src, alt: lead.alt }, rest: blocks.filter((_, i) => i !== index) };
}

/** Renders editorial text safely (no HTML is ever interpreted). */
export function Markdown({ source, className, lang }: { source: string | null | undefined; className?: string; lang?: string }) {
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;
  return <div lang={lang} className={cn("prose-official text-base leading-relaxed text-ink", className)}>{blocks.map(renderBlock)}</div>;
}

/** The same renderer, for blocks a caller has already split. */
export function MarkdownBlocks({ blocks, className, lang }: { blocks: Block[]; className?: string; lang?: string }) {
  if (blocks.length === 0) return null;
  return <div lang={lang} className={cn("prose-official text-base leading-relaxed text-ink", className)}>{blocks.map(renderBlock)}</div>;
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/** Placeholder for owner-supplied official content (spec: never invent it). */
export function OwnerContentPlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border border-dashed border-warning-600/50 bg-warning-50 px-2 py-0.5 text-sm text-warning-700", className)}>
      {label}
    </span>
  );
}
