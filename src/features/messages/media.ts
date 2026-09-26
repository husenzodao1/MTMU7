"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Photos in chat: made small in the browser, kept in a private bucket, and
 * shown through short-lived signed links.
 *
 * A phone photo is four to twelve megabytes and carries, in its EXIF, where
 * it was taken. Redrawn onto a canvas at chat size it is a few hundred
 * kilobytes and carries nothing but pixels — which is both the speed and the
 * privacy of it. The bucket (00067) only takes what this produces.
 */

export const CHAT_MEDIA_BUCKET = "chat-media";

/** The long edge after shrinking: sharp on a phone, light on a school's line. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;
/** What we will even try to open. Anything bigger is not a photo from a phone. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  extension: "webp" | "jpg";
  /** A local link to the shrunken picture, for the bubble before it is sent. */
  previewUrl: string;
}

export type PrepareError = "not_image" | "too_large" | "unreadable";

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, QUALITY));
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if ("createImageBitmap" in window) {
    // "from-image" turns a portrait photo the right way up before its EXIF,
    // which said which way was up, is thrown away with the rest.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

export async function prepareImage(file: File): Promise<{ ok: true; image: PreparedImage } | { ok: false; error: PrepareError }> {
  if (!file.type.startsWith("image/")) return { ok: false, error: "not_image" };
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, error: "too_large" };
  try {
    const decoded = await decode(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      decoded.release();
      return { ok: false, error: "unreadable" };
    }
    // White under a transparent PNG, or it turns black as a JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    decoded.release();

    // WebP where the browser can write it (Safari before 17 cannot, and says
    // so by handing back a PNG), JPEG everywhere else.
    const webp = await canvasBlob(canvas, "image/webp");
    const blob = webp && webp.type === "image/webp" ? webp : await canvasBlob(canvas, "image/jpeg");
    if (!blob) return { ok: false, error: "unreadable" };
    return {
      ok: true,
      image: { blob, width, height, extension: blob.type === "image/webp" ? "webp" : "jpg", previewUrl: URL.createObjectURL(blob) },
    };
  } catch {
    return { ok: false, error: "unreadable" };
  }
}

/** <school>/<conversation>/<uploader>/<random>.<ext> — the shape the bucket and the guard insist on. */
export function mediaPath(schoolId: string, conversationId: string, userId: string, extension: string): string {
  return `${schoolId}/${conversationId}/${userId}/${crypto.randomUUID()}.${extension}`;
}

export async function uploadImage(path: string, image: PreparedImage): Promise<boolean> {
  const { error } = await getBrowserClient()
    .storage.from(CHAT_MEDIA_BUCKET)
    .upload(path, image.blob, { contentType: image.blob.type, cacheControl: "31536000", upsert: false });
  // A retry of an upload that did land the first time is not a failure.
  return !error || /exists|duplicate/i.test(error.message);
}

export function removeImage(path: string): void {
  void getBrowserClient()
    .storage.from(CHAT_MEDIA_BUCKET)
    .remove([path])
    .then(
      () => undefined,
      () => undefined
    );
}

// ------------------------------------------------------------ signed links

/**
 * Signed links, asked for in batches and remembered.
 *
 * A thread with forty photos would otherwise make forty requests as it
 * opens; every path asked for in the same tick goes in one request, and a link
 * is reused until five minutes before it runs out.
 */
const LINK_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; expires: number }>();
const waiting = new Map<string, Array<(url: string | null) => void>>();
let scheduled = false;

function flush() {
  scheduled = false;
  const paths = [...waiting.keys()];
  const callbacks = new Map(waiting);
  waiting.clear();
  if (paths.length > 0) void request(paths, callbacks, 0);
}

/** One batch of links; asked for once more, a moment later, if the first ask fails. */
async function request(paths: string[], callbacks: Map<string, Array<(url: string | null) => void>>, attempt: number): Promise<void> {
  const { data, error } = await getBrowserClient()
    .storage.from(CHAT_MEDIA_BUCKET)
    .createSignedUrls(paths, LINK_SECONDS)
    .catch((cause: unknown) => ({ data: null, error: cause }));
  if (error && attempt === 0) {
    setTimeout(() => void request(paths, callbacks, 1), 1500 + Math.floor(Math.random() * 1000));
    return;
  }
  const expires = Date.now() + (LINK_SECONDS - 300) * 1000;
  for (const path of paths) {
    const url = data?.find((entry) => entry.path === path)?.signedUrl ?? null;
    if (url) cache.set(path, { url, expires });
    for (const done of callbacks.get(path) ?? []) done(url);
  }
}

/** A remembered link that still has five minutes or more to run. */
function cachedLink(path: string): string | null {
  const hit = cache.get(path);
  if (!hit) return null;
  if (hit.expires > Date.now()) return hit.url;
  cache.delete(path);
  return null;
}

function signedUrl(path: string): Promise<string | null> {
  const hit = cachedLink(path);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const list = waiting.get(path) ?? [];
    list.push(resolve);
    waiting.set(path, list);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });
}

/** The link for a stored photo, or null while it is being fetched or if it cannot be. */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [fetched, setFetched] = useState<{ path: string; url: string | null } | null>(null);
  const cached = path ? cachedLink(path) : null;

  useEffect(() => {
    if (!path || cached) return;
    let live = true;
    void signedUrl(path).then((url) => {
      if (live) setFetched({ path, url });
    });
    return () => {
      live = false;
    };
  }, [path, cached]);

  if (!path) return null;
  return cached ?? (fetched?.path === path ? fetched.url : null);
}
