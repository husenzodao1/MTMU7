"use client";

import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { Download, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, LoaderCircle, Mic, Pause, Play, Plus, Presentation } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { downloadLink, useSignedUrl } from "@/features/messages/media";
import { formatBytes, formatDuration, kindOf, splitLinks, type FileKind } from "@/features/messages/files";
import { MORE_REACTIONS, QUICK_REACTIONS, type Reaction, type ThreadMessage } from "@/features/messages/types";
import { cn } from "@/lib/utils/cn";

// ------------------------------------------------------------------ text

/** The words of a message, with its web addresses as links that leave the portal safely. */
export function MessageText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitLinks(text), [text]);
  return (
    <p className={cn("inline whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) =>
        part.href ? (
          <a key={index} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="chat-link break-all underline underline-offset-2">
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        )
      )}
    </p>
  );
}

// ------------------------------------------------------------------ files

const FILE_LOOK: Record<FileKind, { icon: typeof FileText; tint: string }> = {
  pdf: { icon: FileText, tint: "bg-[#e5484d] text-white" },
  doc: { icon: FileText, tint: "bg-[#2f6fed] text-white" },
  sheet: { icon: FileSpreadsheet, tint: "bg-[#16a34a] text-white" },
  slides: { icon: Presentation, tint: "bg-[#f97316] text-white" },
  text: { icon: FileText, tint: "bg-[#64748b] text-white" },
  archive: { icon: FileArchive, tint: "bg-[#a16207] text-white" },
  audio: { icon: FileAudio, tint: "bg-[#8b5cf6] text-white" },
  video: { icon: FileVideo, tint: "bg-[#db2777] text-white" },
  image: { icon: FileImage, tint: "bg-[#0d9488] text-white" },
};

/**
 * A document in a bubble: its kind at a glance, its name, its size, and a tap
 * that downloads it under that name.
 */
export function FileCard({
  message,
  locale,
  labels,
  onError,
}: {
  message: ThreadMessage;
  locale: string;
  labels: { download: string; failed: string };
  onError: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const name = message.media_name ?? "file";
  const kind = kindOf(name, message.media_mime);
  const look = FILE_LOOK[kind];
  const Icon = look.icon;
  const extension = (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? "").toUpperCase();
  const waiting = message.pending || busy;

  const open = async () => {
    if (!message.media_path || waiting) return;
    setBusy(true);
    const url = await downloadLink(message.media_path, name);
    setBusy(false);
    if (!url) return onError();
    // The link answers "save as <name>", so following it downloads rather
    // than leaving the conversation.
    window.location.assign(url);
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={!message.media_path || message.failed}
      title={labels.download}
      className="chat-file flex w-64 max-w-full items-center gap-3 rounded-lg p-2 text-start transition-colors disabled:cursor-default"
    >
      <span className={cn("relative inline-flex size-11 shrink-0 flex-col items-center justify-center rounded-lg", look.tint)} aria-hidden>
        <Icon className="size-5" />
        {extension ? <span className="mt-0.5 text-[0.5625rem] font-bold leading-none tracking-wide">{extension}</span> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{name}</span>
        <span className="chat-meta block text-xs">
          {formatBytes(message.media_size, locale)}
          {extension ? ` · ${extension}` : ""}
        </span>
      </span>
      <span className="chat-file-action inline-flex size-9 shrink-0 items-center justify-center rounded-full" aria-hidden>
        {waiting ? <LoaderCircle className="size-4.5 animate-spin" /> : <Download className="size-4.5" />}
      </span>
    </button>
  );
}

// ------------------------------------------------------------- voice notes

/** One recording plays at a time, as in any messenger. */
let playing: HTMLAudioElement | null = null;

/** Bars of a waveform, from the message's id: the same shape every time it is drawn. */
function bars(seed: string, count: number): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const noise = ((hash >>> 0) % 1000) / 1000;
    const swell = Math.sin((i / count) * Math.PI) * 0.35;
    out.push(0.22 + noise * 0.5 + swell * 0.6);
  }
  return out;
}

const SPEEDS = [1, 1.5, 2] as const;

export function VoiceNote({ message, mine, labels }: { message: ThreadMessage; mine: boolean; labels: { play: string; pause: string } }) {
  const remote = useSignedUrl(message.local_preview ? null : message.media_path);
  const src = message.local_preview ?? remote;
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const duration = Math.max(1, message.media_duration ?? 1);
  const shape = useMemo(() => bars(message.id.replace(/^local:/, ""), 34), [message.id]);

  useEffect(() => {
    const element = audio.current;
    return () => {
      if (element && playing === element) {
        element.pause();
        playing = null;
      }
    };
  }, []);

  const toggle = async () => {
    const element = audio.current;
    if (!element || !src) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    if (playing && playing !== element) playing.pause();
    playing = element;
    element.playbackRate = speed;
    setState("loading");
    try {
      await element.play();
    } catch {
      setState("idle");
    }
  };

  const seek = (fraction: number) => {
    const element = audio.current;
    if (!element || !src) return;
    const target = Math.max(0, Math.min(1, fraction)) * duration;
    try {
      element.currentTime = target;
      setProgress(target / duration);
    } catch {
      /* not seekable yet */
    }
  };

  const shown = state === "idle" ? duration : Math.max(0, duration - progress * duration);

  return (
    <span className="flex w-64 max-w-full items-center gap-2.5 py-1 ps-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={state === "playing" ? labels.pause : labels.play}
        className="chat-voice-play inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-60"
      >
        {!src || state === "loading" ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden />
        ) : state === "playing" ? (
          <Pause className="size-5 fill-current" aria-hidden />
        ) : (
          <Play className="size-5 translate-x-px fill-current" aria-hidden />
        )}
      </button>
      <span className="min-w-0 flex-1">
        <span
          className="flex h-7 cursor-pointer items-center gap-[2px]"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
            seek(rtl ? (box.right - event.clientX) / box.width : (event.clientX - box.left) / box.width);
          }}
          aria-hidden
        >
          {shape.map((height, index) => (
            <span
              key={index}
              className={cn("chat-voice-bar w-[3px] shrink-0 rounded-full", index / shape.length < progress && "is-played")}
              style={{ height: `${Math.round(height * 100)}%` }}
            />
          ))}
        </span>
        <span className="chat-meta mt-0.5 flex items-center gap-1.5 text-[0.6875rem] tabular">
          <Mic className={cn("size-3", mine ? "" : "text-success-600")} aria-hidden />
          {formatDuration(shown)}
          {state !== "idle" ? (
            <button
              type="button"
              onClick={() => {
                const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
                setSpeed(next);
                if (audio.current) audio.current.playbackRate = next;
              }}
              className="chat-voice-speed ms-1 rounded-full px-1.5 py-px text-[0.625rem] font-bold"
            >
              {speed}×
            </button>
          ) : null}
        </span>
      </span>
      {src ? (
        <audio
          ref={audio}
          src={src}
          preload="none"
          onPlaying={() => setState("playing")}
          onPause={() => setState((current) => (current === "idle" ? current : "paused"))}
          onEnded={() => {
            setState("idle");
            setProgress(0);
            if (playing === audio.current) playing = null;
          }}
          onTimeUpdate={(event) => setProgress(Math.min(1, event.currentTarget.currentTime / duration))}
          className="hidden"
        />
      ) : null}
    </span>
  );
}

// -------------------------------------------------------------- reactions

/**
 * The little pill under a bubble: the reactions it has, the most chosen
 * first, and how many. Tapping it shows who chose what; your own can be taken
 * back from there.
 */
export function ReactionsPill({
  reactions,
  mine,
  currentUserId,
  nameOf,
  labels,
  onRemove,
}: {
  reactions: Reaction[];
  mine: boolean;
  currentUserId: string;
  nameOf: (userId: string) => string;
  labels: { title: string; you: string; tapToRemove: string };
  onRemove: () => void;
}) {
  const grouped = useMemo(() => {
    const counts = new Map<string, number>();
    for (const reaction of reactions) counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [reactions]);
  if (reactions.length === 0) return null;
  const mineToo = reactions.some((r) => r.user_id === currentUserId);

  return (
    <DropdownPrimitive.Root modal={false}>
      <DropdownPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={labels.title}
          className={cn(
            "chat-reactions relative z-[1] -mt-1 inline-flex h-6 items-center gap-0.5 rounded-full px-1.5 text-[0.8125rem] leading-none transition-transform active:scale-95",
            mine ? "me-2 self-end" : "ms-2 self-start",
            mineToo && "is-mine"
          )}
        >
          {grouped.slice(0, 3).map(([emoji]) => (
            <span key={emoji}>{emoji}</span>
          ))}
          {reactions.length > 1 ? <span className="chat-meta ms-0.5 text-[0.6875rem] font-semibold tabular">{reactions.length}</span> : null}
        </button>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          align={mine ? "end" : "start"}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-overlay data-[state=open]:animate-fade"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-ink-muted">{labels.title}</p>
          {reactions.map((reaction) => {
            const own = reaction.user_id === currentUserId;
            return (
              <DropdownPrimitive.Item
                key={reaction.user_id}
                disabled={!own}
                onSelect={() => own && onRemove()}
                className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none data-[disabled]:cursor-default data-[highlighted]:bg-surface-muted"
              >
                <span className="text-lg leading-none">{reaction.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{own ? labels.you : nameOf(reaction.user_id)}</span>
                  {own ? <span className="block text-xs text-ink-muted">{labels.tapToRemove}</span> : null}
                </span>
              </DropdownPrimitive.Item>
            );
          })}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

/**
 * The row of quick reactions at the top of a message's menu, and the rest a
 * tap away. The one already chosen is marked, and choosing it again takes it
 * back.
 */
export function ReactionBar({ chosen, onPick, moreLabel }: { chosen: string | null; onPick: (emoji: string | null) => void; moreLabel: string }) {
  const [more, setMore] = useState(false);
  const pick = (emoji: string) => onPick(emoji === chosen ? null : emoji);
  const item = (emoji: string, big: boolean): ReactNode => (
    <DropdownPrimitive.Item
      key={emoji}
      onSelect={() => pick(emoji)}
      className={cn(
        "inline-flex cursor-pointer select-none items-center justify-center rounded-full outline-none transition-transform data-[highlighted]:scale-125 data-[highlighted]:bg-surface-muted",
        big ? "size-10 text-[1.625rem]" : "size-9 text-xl",
        emoji === chosen && "bg-brand-100 ring-2 ring-brand-500/40"
      )}
    >
      {emoji}
    </DropdownPrimitive.Item>
  );
  return (
    <div className="chat-reaction-bar mb-1 border-b border-line px-1 pb-1.5 pt-0.5">
      <div className="flex items-center justify-between gap-0.5">
        {QUICK_REACTIONS.map((emoji) => item(emoji, true))}
        <DropdownPrimitive.Item
          onSelect={(event) => {
            event.preventDefault();
            setMore((open) => !open);
          }}
          aria-label={moreLabel}
          className={cn(
            "inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-surface-muted text-ink-muted outline-none data-[highlighted]:text-ink",
            more && "rotate-45"
          )}
        >
          <Plus className="size-5" aria-hidden />
        </DropdownPrimitive.Item>
      </div>
      {more ? <div className="mt-1.5 grid grid-cols-8 gap-0.5">{MORE_REACTIONS.map((emoji) => item(emoji, false))}</div> : null}
    </div>
  );
}
