"use client";

import {
  BookOpen,
  Briefcase,
  CalendarDays,
  FileText,
  GraduationCap,
  LayoutGrid,
  Megaphone,
  Newspaper,
  NotebookPen,
  User,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { NotFoundNote, SearchingPanel, useSearchSweep } from "@/components/ui/searching";
import { searchEverythingAction, type EverythingKind, type EverythingSection } from "@/features/search/actions";

/** However quick the answer, the note stays this long: long enough to be read. */
const SWEEP_MS = 3000;
/** A pause in typing this long sends the search; Enter sends it at once. */
const TYPING_MS = 450;

const ICON: Record<EverythingKind, LucideIcon> = {
  pages: LayoutGrid,
  people: User,
  students: GraduationCap,
  staff: Briefcase,
  users: UserCog,
  classes: Users,
  announcements: Megaphone,
  news: Newspaper,
  events: CalendarDays,
  homework: NotebookPen,
  library: BookOpen,
  documents: FileText,
};

const noSubscribe = () => () => undefined;

/**
 * "Search everything", at the top of the dashboard: a small, soft box with a
 * faint glass and a line of small type. A press sinks it a little and it
 * springs back; it opens the search over the page — the whole screen on a
 * phone, a panel under a dimmed page on a computer.
 *
 * The search runs as the typing pauses (or at Enter) across everything the
 * person may see (actions.ts): the portal's sections, people, announcements,
 * news, events, homework, the library, documents, and in the office the
 * school's records. The note and its glass stay for at least three seconds
 * whatever the speed of the answer, and the results come in under it as it
 * leaves.
 */
export function EverythingSearch() {
  const t = useTranslations("portal.search");
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  // The box stays under the header while the page scrolls (search.css); once
  // it has left its own place it is marked: its shadow deepens, and what
  // scrolls up under it fades into the page before it reaches it.
  const dock = useRef<HTMLDivElement>(null);
  const place = useRef<HTMLSpanElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      if (!dock.current || !place.current) return;
      const d = dock.current.getBoundingClientRect();
      const p = place.current.getBoundingClientRect();
      // At rest the dock sits its (negative) top margin from its place.
      const rest = parseFloat(getComputedStyle(dock.current).marginTop) || 0;
      setStuck(p.top + rest < d.top - 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <span ref={place} className="everything-place" aria-hidden />
      <div ref={dock} className="everything-dock" data-stuck={stuck || undefined}>
        <button type="button" className="everything-box" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" className="everything-glass" aria-hidden>
            <circle cx="10.5" cy="10.5" r="6.25" />
            <path d="M15.2 15.2 L20 20" />
          </svg>
          <span>{t("placeholder")}</span>
        </button>
      </div>
      {open && mounted ? createPortal(<EverythingOverlay onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

function EverythingOverlay({ onClose }: { onClose: () => void }) {
  const t = useTranslations("portal.search");
  const tRoot = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState("");
  const [sections, setSections] = useState<EverythingSection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const { searching, start, round } = useSearchSweep(pending, SWEEP_MS);
  const asked = useRef(0);

  const run = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (q.length < 2 || q === sent) return;
      setSent(q);
      start();
      const ticket = ++asked.current;
      startTransition(async () => {
        const result = await searchEverythingAction(q);
        // An answer to an older question is let go.
        if (ticket !== asked.current) return;
        setFailed(!result.ok);
        setSections(result.ok ? result.data ?? [] : []);
      });
    },
    [sent, start]
  );

  // Typing pauses: the search goes.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => run(q), TYPING_MS);
    return () => window.clearTimeout(timer);
  }, [query, run]);

  // The page behind stays still; Escape — and Android's back button, which
  // sends it to any open dialog — closes the search.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const focus = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      html.style.overflow = before;
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focus);
    };
  }, [onClose]);

  const short = query.trim().length < 2;
  const total = sections?.reduce((sum, s) => sum + s.hits.length, 0) ?? 0;

  return (
    <div className="everything-layer" role="dialog" aria-modal="true" aria-label={t("placeholder")} data-state="open">
      <div className="everything-scrim" onClick={onClose} aria-hidden />
      <div className="everything-panel">
        <form
          role="search"
          className="everything-head"
          onSubmit={(event) => {
            event.preventDefault();
            run(query);
          }}
        >
          <svg viewBox="0 0 24 24" className="everything-glass" aria-hidden>
            <circle cx="10.5" cy="10.5" r="6.25" />
            <path d="M15.2 15.2 L20 20" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            enterKeyHint="search"
            maxLength={100}
            className="everything-input"
          />
          {query ? (
            <button
              type="button"
              className="everything-clear"
              onClick={() => {
                setQuery("");
                setSent("");
                setSections(null);
                inputRef.current?.focus();
              }}
              aria-label={t("clear")}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
          <button type="button" className="everything-cancel" onClick={onClose}>
            {t("cancel")}
          </button>
        </form>

        <div className="everything-body">
          {searching ? (
            <SearchingPanel key={round} label={tRoot("common.searching")} />
          ) : short || sections === null ? (
            <p className="everything-hint">{t("hint")}</p>
          ) : failed ? (
            <p className="everything-hint">{tRoot("errors.unexpected")}</p>
          ) : total === 0 ? (
            <NotFoundNote label={t("empty", { query: sent })} />
          ) : (
            <div className="everything-results">
              {sections.map((section) => {
                const Icon = ICON[section.kind];
                return (
                  <section key={section.kind} className="everything-section">
                    <h2 className="everything-section-title">{t(`kinds.${section.kind}`)}</h2>
                    <ul>
                      {section.hits.map((hit) => (
                        <li key={`${section.kind}-${hit.id}`}>
                          <Link href={hit.href} className="everything-hit" onClick={onClose}>
                            <span className="everything-hit-icon" aria-hidden>
                              <Icon className="size-4" strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="everything-hit-title">
                                <Marked text={hit.title} words={sent} />
                              </span>
                              {hit.detail ? <span className="everything-hit-detail">{hit.detail}</span> : null}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The title with the words that were searched for picked out. */
function Marked({ text, words }: { text: string; words: string }) {
  const needle = words.trim().toLocaleLowerCase();
  const at = needle ? text.toLocaleLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}
