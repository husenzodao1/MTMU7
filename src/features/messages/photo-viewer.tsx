"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, X } from "lucide-react";

export interface ViewedPhoto {
  src: string;
  caption: string;
  /** Who sent it and when: the line at the top, the way a phone shows it. */
  title: string;
  subtitle: string;
}

/**
 * A photo from the conversation, the whole screen and nothing else.
 *
 * Black, not the theme: a picture is judged against black, and the bar and
 * caption float over it rather than framing it. A tap anywhere outside the
 * picture closes it, as does Escape and the back gesture that closes any dialog.
 */
export function PhotoViewer({
  photo,
  onClose,
  labels,
}: {
  photo: ViewedPhoto | null;
  onClose: () => void;
  labels: { close: string; download: string };
}) {
  // A signed link names its own file; asking for it with ?download sets the
  // header that makes the browser save rather than show it. A photo still on
  // this device is a blob, which the download attribute handles by itself.
  const downloadHref = photo
    ? photo.src.startsWith("blob:")
      ? photo.src
      : `${photo.src}${photo.src.includes("?") ? "&" : "?"}download=`
    : undefined;

  return (
    <DialogPrimitive.Root open={photo !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black data-[state=open]:animate-fade" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[60] flex flex-col text-white focus:outline-none data-[state=open]:animate-fade"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          aria-describedby={undefined}
        >
          <div className="photo-viewer-bar safe-top flex items-center gap-3 px-3 py-2.5 sm:px-5">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-sm font-semibold text-white">{photo?.title}</DialogPrimitive.Title>
              <p className="truncate text-xs text-white/70">{photo?.subtitle}</p>
            </div>
            <a
              href={downloadHref}
              download
              className="inline-flex size-10 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white"
              aria-label={labels.download}
              title={labels.download}
            >
              <Download className="size-5" aria-hidden />
            </a>
            <DialogPrimitive.Close
              className="inline-flex size-10 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white"
              aria-label={labels.close}
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6"
            onClick={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link or a local blob; nothing for the optimiser to cache
              <img src={photo.src} alt={photo.caption} className="max-h-full max-w-full rounded-sm object-contain shadow-2xl" />
            ) : null}
          </div>
          {photo?.caption ? (
            <p className="photo-viewer-bar safe-bottom mx-auto w-full max-w-2xl whitespace-pre-wrap break-words px-4 py-3 text-center text-sm leading-relaxed">
              {photo.caption}
            </p>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
