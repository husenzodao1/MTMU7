"use client";

import { Camera, ImagePlus, Minus, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { removeAvatarAction, setAvatarAction } from "@/features/profile/actions";
import { meChanged } from "@/lib/kept-pages";
import { getBrowserClient } from "@/lib/supabase/browser";

/** The side of the square photo that goes up: four times what the largest avatar shows. */
const OUT = 512;
/** The largest photo taken in from a phone's camera. */
const SOURCE_MAX = 40 * 1024 * 1024;
const MAX_ZOOM = 4;

export interface AvatarEditorLabels {
  change: string;
  choose: string;
  remove: string;
  cropTitle: string;
  cropHint: string;
  zoomIn: string;
  zoomOut: string;
  save: string;
  cancel: string;
  unreadable: string;
  failed: string;
}

type Picture = { bitmap: ImageBitmap | HTMLImageElement; width: number; height: number; release: () => void };

async function readPicture(file: File): Promise<Picture> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  return { bitmap: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

/**
 * One's own round photo at the top of Profile and Settings, with a small
 * camera on it: a press offers a new photo (or taking the one there away); a
 * new one opens in a circle to be moved with a finger and made larger with
 * two (or the slider), and is saved the moment "Save" is pressed — no other
 * button to remember. Every page then shows it, the ones kept on the phone
 * included (meChanged).
 */
export function AvatarEditor({
  name,
  src,
  folder,
  labels,
}: {
  name: string;
  src: string | null;
  /** `${schoolId}/${userId}`: the person's own folder in the avatars bucket. */
  folder: string;
  labels: AvatarEditorLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const tRoot = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [busy, setBusy] = useState(false);

  const done = useCallback(
    (message: string | undefined) => {
      meChanged();
      router.refresh();
      if (message) toast("success", tRoot(message));
    },
    [router, toast, tRoot]
  );

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMenu(false);
    if (!file) return;
    if (file.size > SOURCE_MAX) {
      toast("danger", labels.unreadable);
      return;
    }
    try {
      setPicture(await readPicture(file));
    } catch {
      // Not a picture the phone can draw (or not a picture at all).
      toast("danger", labels.unreadable);
    }
  }

  async function save(blob: Blob) {
    setBusy(true);
    try {
      const path = `${folder}/${crypto.randomUUID()}.jpg`;
      const { error } = await getBrowserClient().storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const result = await setAvatarAction(path);
      if (!result.ok) throw new Error(result.message);
      picture?.release();
      setPicture(null);
      done(result.message);
    } catch {
      toast("danger", labels.failed);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setMenu(false);
    setBusy(true);
    const result = await removeAvatarAction().catch(() => null);
    setBusy(false);
    if (result?.ok) done(result.message);
    else toast("danger", labels.failed);
  }

  return (
    <div className="avatar-editor">
      <button type="button" className="avatar-editor-face" onClick={() => setMenu((open) => !open)} aria-haspopup="menu" aria-expanded={menu} aria-label={labels.change} disabled={busy}>
        <Avatar name={name} src={src} size="lg" className="size-20 text-2xl" />
        <span className="avatar-editor-badge" aria-hidden>
          <Camera size={14} />
        </span>
      </button>
      {menu ? (
        <div className="avatar-editor-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => input.current?.click()}>
            <ImagePlus className="size-4" aria-hidden />
            {labels.choose}
          </button>
          {src ? (
            <button type="button" role="menuitem" className="avatar-editor-danger" onClick={remove}>
              <Trash2 className="size-4" aria-hidden />
              {labels.remove}
            </button>
          ) : null}
        </div>
      ) : null}
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={onPick} />
      {picture ? (
        <PhotoCrop
          picture={picture}
          labels={labels}
          busy={busy}
          onCancel={() => {
            picture.release();
            setPicture(null);
          }}
          onDone={save}
        />
      ) : null}
    </div>
  );
}

/**
 * The circle the photo is placed in. The picture always covers it: it can be
 * moved only as far as its edges and made no smaller than the circle. What
 * the circle shows is what goes up, drawn as a square JPEG of OUT pixels.
 */
function PhotoCrop({
  picture,
  labels,
  busy,
  onCancel,
  onDone,
}: {
  picture: Picture;
  labels: AvatarEditorLabels;
  busy: boolean;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const id = useId();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(280);
  // zoom 1 = the picture just covers the circle; x/y = its centre's offset from the circle's, in stage pixels.
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const cover = size / Math.min(picture.width, picture.height);
  const clamp = useCallback(
    (next: { zoom: number; x: number; y: number }) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(1, next.zoom));
      const w = picture.width * cover * zoom;
      const h = picture.height * cover * zoom;
      const maxX = Math.max(0, (w - size) / 2);
      const maxY = Math.max(0, (h - size) / 2);
      return { zoom, x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
    },
    [picture, cover, size]
  );

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setSize(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The picture as it is placed, drawn on the canvas under the circle.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(size * ratio);
    element.height = Math.round(size * ratio);
    const context = element.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);
    const scale = cover * view.zoom;
    const w = picture.width * scale;
    const h = picture.height * scale;
    context.drawImage(picture.bitmap, size / 2 + view.x - w / 2, size / 2 + view.y - h / 2, w, h);
  }, [picture, view, size, cover]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: distance(), zoom: view.zoom };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = pinch.current;
    if (pointers.current.size >= 2 && start) {
      const now = distance();
      if (start.distance > 0) setView((v) => clamp({ ...v, zoom: start.zoom * (now / start.distance) }));
      return;
    }
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    setView((v) => clamp({ ...v, zoom: v.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08) }));
  }

  function finish() {
    const out = document.createElement("canvas");
    out.width = OUT;
    out.height = OUT;
    const context = out.getContext("2d");
    if (!context) return;
    // White under a transparent picture, or it turns black as a JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, OUT, OUT);
    const scale = cover * view.zoom;
    const left = size / 2 + view.x - (picture.width * scale) / 2;
    const top = size / 2 + view.y - (picture.height * scale) / 2;
    context.drawImage(picture.bitmap, -left / scale, -top / scale, size / scale, size / scale, 0, 0, OUT, OUT);
    out.toBlob((blob) => blob && onDone(blob), "image/jpeg", 0.88);
  }

  return createPortal(
    <div className="photo-crop" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <div className="photo-crop-panel">
        <div className="photo-crop-head">
          <p id={`${id}-title`} className="photo-crop-title">
            {labels.cropTitle}
          </p>
          <button type="button" className="photo-crop-close" onClick={onCancel} disabled={busy} aria-label={labels.cancel}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div
          ref={stage}
          className="photo-crop-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <canvas ref={canvas} className="photo-crop-canvas" />
          <span className="photo-crop-ring" aria-hidden />
        </div>
        <p className="photo-crop-hint">{labels.cropHint}</p>
        <div className="photo-crop-zoom">
          <button type="button" onClick={() => setView((v) => clamp({ ...v, zoom: v.zoom / 1.2 }))} aria-label={labels.zoomOut} disabled={view.zoom <= 1}>
            <Minus size={16} aria-hidden />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            onChange={(event) => setView((v) => clamp({ ...v, zoom: Number(event.target.value) }))}
            aria-label={labels.zoomIn}
          />
          <button type="button" onClick={() => setView((v) => clamp({ ...v, zoom: v.zoom * 1.2 }))} aria-label={labels.zoomIn} disabled={view.zoom >= MAX_ZOOM}>
            <Plus size={16} aria-hidden />
          </button>
        </div>
        <div className="photo-crop-foot">
          <button type="button" className="photo-crop-cancel" onClick={onCancel} disabled={busy}>
            {labels.cancel}
          </button>
          <button type="button" className="photo-crop-done" onClick={finish} disabled={busy} aria-busy={busy}>
            {labels.save}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
