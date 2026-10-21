"use client";

import { filesPlugin, isInApp } from "@/features/native/bridge";

/** How handing a file over ended: saved, or the app is too old to save it. */
export type SaveResult = "saved" | "app-too-old";

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  // In slices: String.fromCharCode takes only so many arguments at once.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Hands a file the page made itself to the person: an import's result, the
 * only copy of the passwords it issued.
 *
 * In a browser that is a blob: link clicked on their behalf. The link is let
 * go only a minute later — dropped at once, Chrome sometimes had not started
 * the download yet and saved nothing. A web view drops blob: links whatever
 * is done, so in the app the bytes go to the app itself (FilesPlugin, build
 * 13), which writes them into Downloads; an older app cannot, and says so.
 */
export async function saveFile(blob: Blob, name: string): Promise<SaveResult> {
  if (isInApp()) {
    const files = await filesPlugin();
    if (!files) return "app-too-old";
    await files.save({ data: await base64(blob), name, mime: blob.type || "application/octet-stream" });
    return "saved";
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "saved";
}
