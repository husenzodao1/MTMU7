"use client";

import { Eye, ImagePlus, Pause, Play, Plus, SendHorizontal, Trash2, Type, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { replyToStoryAction } from "@/features/messages/actions";
import { prepareImage, type PreparedImage } from "@/features/messages/media";
import { dbErrorKey } from "@/lib/actions/db-error-key";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

/**
 * Stories, as on Instagram: a photo or a few words that stay for a day.
 *
 *   StoriesRow    the row of rings at the top of the messages — one's own
 *                 first, with a small "+", then whoever has something new,
 *                 then the rest; a ring in the school's colours means not yet
 *                 seen, a hairline means seen
 *   StoryViewer   full screen, a thin bar per story filling as it plays; a
 *                 tap on the right goes on, on the left goes back, holding
 *                 pauses, a swipe down closes; one's own shows who has seen
 *                 it, somebody else's takes a reply, which arrives in the
 *                 conversation the two already have
 *   StoryComposer a photo with a caption, or words on a colour
 *
 * Who sees what is the database's business (00094): only people one shares a
 * conversation with, only for a day.
 */

export interface StoryItem {
  id: string;
  kind: "image" | "text";
  media_path: string | null;
  media_width: number | null;
  media_height: number | null;
  caption: string;
  background: string | null;
  created_at: string;
  seen: boolean;
  views: number | null;
}

export interface StoryAuthor {
  author_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_me: boolean;
  all_seen: boolean;
  latest_at: string;
  stories: StoryItem[];
}

export const STORY_BACKGROUNDS = ["ember", "night", "brass", "sea", "leaf", "plum"] as const;
type Background = (typeof STORY_BACKGROUNDS)[number];

const BUCKET = "stories";
const IMAGE_MS = 6000;

const fullName = (a: Pick<StoryAuthor, "first_name" | "last_name">) => `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();

// ------------------------------------------------------------ signed links

const links = new Map<string, { url: string; expires: number }>();

/** Links for a person's photos, in one request, remembered for most of an hour. */
async function storyLinks(paths: string[]): Promise<void> {
  const now = Date.now();
  const missing = paths.filter((path) => (links.get(path)?.expires ?? 0) < now);
  if (missing.length === 0) return;
  const { data } = await getBrowserClient()
    .storage.from(BUCKET)
    .createSignedUrls(missing, 3600)
    .catch(() => ({ data: null }));
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) links.set(entry.path, { url: entry.signedUrl, expires: now + 50 * 60 * 1000 });
  }
}

/** Gone from the bucket, quietly: a photo whose story has ended or been taken down. */
function removeFiles(paths: string[]) {
  if (paths.length === 0) return;
  void getBrowserClient()
    .storage.from(BUCKET)
    .remove(paths)
    .then(
      () => undefined,
      () => undefined
    );
}

// --------------------------------------------------------------- the row

export function StoriesRow({
  feed,
  me,
  schoolId,
}: {
  feed: StoryAuthor[];
  me: { id: string; name: string; avatarUrl: string | null };
  schoolId: string;
}) {
  const t = useTranslations("portal.messages.stories");
  // What has been watched since the row was rendered, laid over it.
  const [seenHere, setSeenHere] = useState<Set<string>>(() => new Set());
  const [watching, setWatching] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);

  const authors = useMemo(
    () =>
      feed.map((author) => {
        const stories = author.stories.map((story) => (seenHere.has(story.id) ? { ...story, seen: true } : story));
        return { ...author, stories, all_seen: author.is_me || stories.every((story) => story.seen) };
      }),
    [feed, seenHere]
  );
  const mine = authors.find((author) => author.is_me);
  const others = authors.filter((author) => !author.is_me);
  // Watching goes on from one person to the next in the order of the row.
  const order = mine ? [mine, ...others] : others;

  const onSeen = useCallback((storyId: string) => {
    setSeenHere((current) => (current.has(storyId) ? current : new Set(current).add(storyId)));
  }, []);

  return (
    <>
      <div className="story-row" role="list" aria-label={t("title")} data-swipe="own">
        <div role="listitem" className="story-cell">
          <button
            type="button"
            className="story-ring"
            data-state={mine ? "mine" : "none"}
            onClick={() => (mine ? setWatching(0) : setComposing(true))}
            aria-label={mine ? t("watchMine") : t("add")}
          >
            <Avatar name={me.name} src={me.avatarUrl} size="lg" ring={false} />
          </button>
          <button type="button" className="story-plus" onClick={() => setComposing(true)} aria-label={t("add")}>
            <Plus className="size-3" strokeWidth={3} aria-hidden />
          </button>
          <span className="story-name">{t("me")}</span>
        </div>
        {others.map((author) => {
          const index = order.indexOf(author);
          const name = fullName(author);
          return (
            <div key={author.author_id} role="listitem" className="story-cell">
              <button
                type="button"
                className="story-ring"
                data-state={author.all_seen ? "seen" : "new"}
                onClick={() => setWatching(index)}
                aria-label={author.all_seen ? name : t("unseen", { name })}
              >
                <Avatar name={name} src={author.avatar_url} size="lg" ring={false} />
              </button>
              <span className="story-name">{author.first_name ?? name}</span>
            </div>
          );
        })}
      </div>
      {watching !== null && order[watching] ? (
        <StoryViewer authors={order} start={watching} onClose={() => setWatching(null)} onSeen={onSeen} />
      ) : null}
      {composing ? <StoryComposer schoolId={schoolId} userId={me.id} onClose={() => setComposing(false)} /> : null}
    </>
  );
}

// ------------------------------------------------------------ the viewer

function ago(createdAt: string, t: ReturnType<typeof useTranslations>) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  return t("hoursAgo", { count: Math.floor(minutes / 60) });
}

function StoryViewer({
  authors,
  start,
  onClose,
  onSeen,
}: {
  authors: StoryAuthor[];
  start: number;
  onClose: () => void;
  onSeen: (storyId: string) => void;
}) {
  const t = useTranslations("portal.messages.stories");
  const tRoot = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [authorIndex, setAuthorIndex] = useState(start);
  // Each person opens at their first story not yet seen.
  const firstUnseen = (author: StoryAuthor | undefined) => {
    if (!author || author.is_me) return 0;
    const index = author.stories.findIndex((story) => !story.seen);
    return index < 0 ? 0 : index;
  };
  const [storyIndex, setStoryIndex] = useState(() => firstUnseen(authors[start]));
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [, setLinksAt] = useState(0);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [gone, setGone] = useState<Set<string>>(() => new Set());

  const author = authors[authorIndex];
  const stories = useMemo(() => (author?.stories ?? []).filter((story) => !gone.has(story.id)), [author, gone]);
  const story = stories[Math.min(storyIndex, Math.max(stories.length - 1, 0))];
  const paused = held || typing || viewersOpen || (story?.kind === "image" && !ready[story.id]);

  const goAuthor = useCallback(
    (index: number) => {
      if (index < 0 || index >= authors.length) {
        onClose();
        return;
      }
      setAuthorIndex(index);
      setStoryIndex(firstUnseen(authors[index]));
    },
    [authors, onClose]
  );
  const next = useCallback(() => {
    if (storyIndex + 1 < stories.length) setStoryIndex(storyIndex + 1);
    else goAuthor(authorIndex + 1);
  }, [storyIndex, stories.length, goAuthor, authorIndex]);
  const previous = useCallback(() => {
    if (storyIndex > 0) setStoryIndex(storyIndex - 1);
    else if (authorIndex > 0) {
      const before = authors[authorIndex - 1];
      setAuthorIndex(authorIndex - 1);
      setStoryIndex(Math.max(0, (before?.stories.length ?? 1) - 1));
    }
  }, [storyIndex, authorIndex, authors]);

  // This person's photos, all at once, before the first is needed.
  useEffect(() => {
    if (!author) return;
    const paths = author.stories.map((s) => s.media_path).filter((path): path is string => Boolean(path));
    if (paths.length === 0) return;
    let live = true;
    void storyLinks(paths).then(() => {
      if (live) setLinksAt(Date.now());
    });
    return () => {
      live = false;
    };
  }, [author]);

  // Seen: told to the database once, and to the row at once.
  const told = useRef(new Set<string>());
  useEffect(() => {
    if (!story || !author || author.is_me || told.current.has(story.id)) return;
    told.current.add(story.id);
    onSeen(story.id);
    void getBrowserClient()
      .rpc("view_story", { p_story_id: story.id })
      .then(
        () => undefined,
        () => undefined
      );
  }, [story, author, onSeen]);

  // The page behind stays where it is; Escape closes, the arrows step.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea")) return;
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") previous();
      else if (event.key === " ") {
        event.preventDefault();
        setHeld((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = before;
      document.removeEventListener("keydown", onKey);
    };
  }, [next, previous, onClose]);

  // A tap is a step; a hold is a pause; a swipe down closes.
  const press = useRef<{ x: number; y: number; at: number; timer: ReturnType<typeof setTimeout> | null; long: boolean } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const timer = setTimeout(() => {
      if (press.current) {
        press.current.long = true;
        setHeld(true);
      }
    }, 220);
    press.current = { x: event.clientX, y: event.clientY, at: Date.now(), timer, long: false };
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    if (p.long) {
      setHeld(false);
      if (event.clientY - p.y > 90) onClose();
      return;
    }
    if (event.clientY - p.y > 90) {
      onClose();
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX - box.left < box.width / 3) previous();
    else next();
  };

  const remove = async () => {
    if (!story || !window.confirm(t("deleteConfirm"))) return;
    const { error } = await getBrowserClient().from("stories").delete().eq("id", story.id);
    if (error) {
      toast("danger", tRoot(dbErrorKey(error) ?? "errors.unexpected"));
      return;
    }
    if (story.media_path) removeFiles([story.media_path]);
    setGone((current) => new Set(current).add(story.id));
    router.refresh();
    if (stories.length <= 1) onClose();
    else if (storyIndex >= stories.length - 1) setStoryIndex(storyIndex - 1);
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !author || !story) return;
    setSending(true);
    const quote = story.kind === "text" ? story.caption.slice(0, 60) : story.caption.slice(0, 60) || t("photoStory");
    const result = await replyToStoryAction(author.author_id, text, quote);
    setSending(false);
    if (!result.ok) {
      toast("danger", tRoot(result.message ?? "errors.unexpected"));
      return;
    }
    setReply("");
    setTyping(false);
    toast("success", t("replySent"));
  };

  if (!author || !story) return null;
  const name = author.is_me ? t("yourStory") : fullName(author);
  const url = story.media_path ? links.get(story.media_path)?.url ?? null : null;
  const duration = story.kind === "image" ? IMAGE_MS : Math.min(9000, 4500 + story.caption.length * 40);

  return createPortal(
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={name}>
      <div className="story-stage" data-paused={paused || undefined}>
        <div className="story-bars" aria-hidden>
          {stories.map((s, index) => (
            <span key={s.id} className="story-bar">
              <span
                key={index === storyIndex ? `${authorIndex}-${s.id}` : undefined}
                className="story-bar-fill"
                data-state={index < storyIndex ? "done" : index === storyIndex ? "now" : "next"}
                style={index === storyIndex ? ({ "--story-ms": `${duration}ms` } as CSSProperties) : undefined}
                onAnimationEnd={index === storyIndex ? next : undefined}
              />
            </span>
          ))}
        </div>

        <div className="story-head">
          <Avatar name={fullName(author)} src={author.avatar_url} size="sm" ring={false} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block text-xs opacity-75">{ago(story.created_at, t)}</span>
          </span>
          <button type="button" className="story-icon" onClick={() => setHeld((value) => !value)} aria-label={held ? t("play") : t("pause")}>
            {held ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}
          </button>
          <button type="button" className="story-icon" onClick={onClose} aria-label={t("close")}>
            <X className="size-6" aria-hidden />
          </button>
        </div>

        <div className="story-media" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (press.current = null)}>
          {story.kind === "image" ? (
            url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed link to a private photo
              <img
                key={story.id}
                src={url}
                alt={story.caption}
                className="story-photo"
                draggable={false}
                onLoad={() => setReady((current) => ({ ...current, [story.id]: true }))}
                onError={() => setReady((current) => ({ ...current, [story.id]: true }))}
              />
            ) : (
              <span className="story-wait" aria-hidden />
            )
          ) : (
            <div className="story-words" data-bg={story.background ?? "ember"}>
              <p data-size={story.caption.length > 160 ? "s" : story.caption.length > 60 ? "m" : "l"}>{story.caption}</p>
            </div>
          )}
          {story.kind === "image" && story.caption ? <p className="story-caption">{story.caption}</p> : null}
        </div>

        <div className="story-foot">
          {author.is_me ? (
            <>
              <button type="button" className="story-chip" onClick={() => setViewersOpen(true)}>
                <Eye className="size-4" aria-hidden />
                {t("views", { count: story.views ?? 0 })}
              </button>
              <button type="button" className="story-icon" onClick={() => void remove()} aria-label={t("delete")}>
                <Trash2 className="size-5" aria-hidden />
              </button>
            </>
          ) : (
            <form
              className="story-reply"
              onSubmit={(event) => {
                event.preventDefault();
                void sendReply();
              }}
            >
              <input
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(Boolean(reply.trim()))}
                placeholder={t("replyTo", { name: author.first_name ?? name })}
                maxLength={1000}
                enterKeyHint="send"
                aria-label={t("reply")}
              />
              <button type="submit" className="story-icon" disabled={!reply.trim() || sending} aria-label={t("send")}>
                <SendHorizontal className="size-5" aria-hidden />
              </button>
            </form>
          )}
        </div>
      </div>
      {viewersOpen ? <StoryViewers storyId={story.id} onClose={() => setViewersOpen(false)} /> : null}
    </div>,
    document.body
  );
}

/** Who has seen one of one's own stories: a sheet over the story, latest first. */
function StoryViewers({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const t = useTranslations("portal.messages.stories");
  const [people, setPeople] = useState<Array<{ user_id: string; first_name: string; last_name: string; avatar_url: string | null }> | null>(null);
  useEffect(() => {
    let live = true;
    void getBrowserClient()
      .rpc("get_story_viewers", { p_story_id: storyId })
      .then(({ data }) => {
        if (live) setPeople((data ?? []).map((row) => ({ user_id: row.user_id ?? "", first_name: row.first_name ?? "", last_name: row.last_name ?? "", avatar_url: row.avatar_url })));
      });
    return () => {
      live = false;
    };
  }, [storyId]);
  return (
    <div className="story-sheet-scrim" onClick={onClose}>
      <div className="story-sheet" role="dialog" aria-label={t("viewers")} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
          <p className="text-sm font-semibold">{t("viewers")}</p>
          <button type="button" className="rounded-md p-1 text-ink-muted hover:text-ink" onClick={onClose} aria-label={t("close")}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {people === null ? (
          <p className="px-4 pb-5 text-sm text-ink-muted">…</p>
        ) : people.length === 0 ? (
          <p className="px-4 pb-5 text-sm text-ink-muted">{t("noViewers")}</p>
        ) : (
          <ul className="max-h-[50dvh] overflow-y-auto pb-3">
            {people.map((person) => {
              const name = `${person.first_name} ${person.last_name}`.trim();
              return (
                <li key={person.user_id} className="flex items-center gap-3 px-4 py-2">
                  <Avatar name={name} src={person.avatar_url} size="sm" ring={false} />
                  <span className="truncate text-sm">{name}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------- the composer

function StoryComposer({ schoolId, userId, onClose }: { schoolId: string; userId: string; onClose: () => void }) {
  const t = useTranslations("portal.messages.stories");
  const tRoot = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<"photo" | "text">("photo");
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [caption, setCaption] = useState("");
  const [words, setWords] = useState("");
  const [background, setBackground] = useState<Background>("ember");
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = before;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.previewUrl) : undefined), [photo]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const prepared = await prepareImage(file);
    if (!prepared.ok) {
      toast("danger", t("photoError"));
      return;
    }
    setPhoto(prepared.image);
  };

  const post = async () => {
    const supabase = getBrowserClient();
    setPosting(true);
    try {
      if (mode === "photo") {
        if (!photo) return;
        const path = `${schoolId}/${userId}/${crypto.randomUUID()}.${photo.extension}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, photo.blob, { contentType: photo.blob.type, cacheControl: "86400", upsert: false });
        if (uploadError) {
          toast("danger", t("failed"));
          return;
        }
        const { error } = await supabase.from("stories").insert({
          school_id: schoolId,
          author_id: userId,
          kind: "image",
          media_path: path,
          media_width: photo.width,
          media_height: photo.height,
          caption: caption.trim().slice(0, 700),
        });
        if (error) {
          removeFiles([path]);
          toast("danger", tRoot(dbErrorKey(error) ?? "errors.unexpected"));
          return;
        }
      } else {
        const text = words.trim();
        if (!text) return;
        const { error } = await supabase.from("stories").insert({
          school_id: schoolId,
          author_id: userId,
          kind: "text",
          caption: text.slice(0, 700),
          background,
        });
        if (error) {
          toast("danger", tRoot(dbErrorKey(error) ?? "errors.unexpected"));
          return;
        }
      }
      // Stories of one's own that ended over a day ago leave with this one.
      void supabase.rpc("forget_old_stories").then(({ data }) => removeFiles(((data ?? []) as Array<string | null>).filter((p): p is string => Boolean(p))));
      router.refresh();
      onClose();
    } finally {
      setPosting(false);
    }
  };

  const canPost = mode === "photo" ? Boolean(photo) : Boolean(words.trim());

  return createPortal(
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={t("addStory")}>
      <div className="story-stage">
        <div className="story-head">
          <button type="button" className="story-icon" onClick={onClose} aria-label={t("close")}>
            <X className="size-6" aria-hidden />
          </button>
          <span className="flex-1 text-center text-sm font-semibold">{t("addStory")}</span>
          <span className="w-10" aria-hidden />
        </div>

        <div className="story-media">
          {mode === "photo" ? (
            photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked photo
              <img src={photo.previewUrl} alt="" className="story-photo" />
            ) : (
              <button type="button" className="story-pick" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="size-9" strokeWidth={1.4} aria-hidden />
                <span>{t("pickPhoto")}</span>
              </button>
            )
          ) : (
            <div className="story-words" data-bg={background}>
              <textarea
                value={words}
                onChange={(event) => setWords(event.target.value)}
                placeholder={t("typeSomething")}
                maxLength={700}
                rows={4}
                autoFocus
                aria-label={t("text")}
                data-size={words.length > 160 ? "s" : words.length > 60 ? "m" : "l"}
              />
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(event) => void pick(event.target.files?.[0])} />
        </div>

        <div className="story-foot story-foot-compose">
          {mode === "photo" && photo ? (
            // Room to write: a few lines, growing with the words up to about six.
            <textarea
              className="story-caption-input"
              value={caption}
              onChange={(event) => {
                setCaption(event.target.value);
                const field = event.currentTarget;
                field.style.height = "auto";
                field.style.height = `${field.scrollHeight}px`;
              }}
              placeholder={t("caption")}
              maxLength={700}
              rows={3}
              enterKeyHint="enter"
              aria-label={t("caption")}
            />
          ) : null}
          {mode === "text" ? (
            <div className="story-swatches" role="radiogroup" aria-label={t("background")}>
              {STORY_BACKGROUNDS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={background === key}
                  aria-label={key}
                  className="story-swatch"
                  data-bg={key}
                  onClick={() => setBackground(key)}
                />
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <div className="story-modes" role="tablist">
              <button type="button" role="tab" aria-selected={mode === "photo"} onClick={() => setMode("photo")}>
                <ImagePlus className="size-4" aria-hidden />
                {t("photo")}
              </button>
              <button type="button" role="tab" aria-selected={mode === "text"} onClick={() => setMode("text")}>
                <Type className="size-4" aria-hidden />
                {t("text")}
              </button>
            </div>
            <button type="button" className={cn("story-post", posting && "opacity-70")} disabled={!canPost || posting} onClick={() => void post()}>
              {posting ? t("posting") : t("post")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
