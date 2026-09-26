"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A voice message, recorded in the browser.
 *
 * The microphone is asked for when the button is pressed and let go of the
 * moment recording stops or is thrown away — the little red dot a browser
 * shows while a page listens is never left on. Five minutes is the most one
 * message holds; at that point it stops by itself and is sent.
 */

export interface Recording {
  blob: Blob;
  /** Bare type, as the bucket lists it. */
  mime: string;
  extension: string;
  /** Seconds. */
  duration: number;
}

export type StartResult = "recording" | "denied" | "unsupported" | "failed";

export const MAX_RECORDING_SECONDS = 300;

/** The best format this browser can write: Opus in WebM or Ogg, else AAC in MP4 (Safari). */
function pickFormat(): { type: string | undefined; mime: string; extension: string } {
  const candidates = [
    { type: "audio/webm;codecs=opus", mime: "audio/webm", extension: "webm" },
    { type: "audio/mp4", mime: "audio/mp4", extension: "m4a" },
    { type: "audio/ogg;codecs=opus", mime: "audio/ogg", extension: "ogg" },
    { type: "audio/webm", mime: "audio/webm", extension: "webm" },
  ];
  for (const candidate of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(candidate.type)) return candidate;
  }
  return { type: undefined, mime: "audio/webm", extension: "webm" };
}

function formatFromRecorder(recorder: MediaRecorder, fallback: { mime: string; extension: string }) {
  const actual = recorder.mimeType.split(";")[0]?.trim();
  if (actual === "audio/mp4") return { mime: "audio/mp4", extension: "m4a" };
  if (actual === "audio/ogg") return { mime: "audio/ogg", extension: "ogg" };
  if (actual === "audio/webm") return { mime: "audio/webm", extension: "webm" };
  return fallback;
}

export function canRecord(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function useVoiceRecorder(onLimit: (recording: Recording) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const format = useRef({ mime: "audio/webm", extension: "webm" });
  const finish = useRef<((result: Recording | null) => void) | null>(null);
  const limitRef = useRef(onLimit);
  useEffect(() => {
    limitRef.current = onLimit;
  }, [onLimit]);

  const release = useCallback(() => {
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    recorder.current = null;
    setRecording(false);
    setElapsed(0);
  }, []);

  const stop = useCallback((): Promise<Recording | null> => {
    const active = recorder.current;
    if (!active || active.state === "inactive") {
      release();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      finish.current = resolve;
      active.stop();
    });
  }, [release]);

  const cancel = useCallback(() => {
    const active = recorder.current;
    finish.current = null;
    chunks.current = [];
    if (active && active.state !== "inactive") {
      active.onstop = null;
      active.stop();
    }
    release();
  }, [release]);

  const start = useCallback(async (): Promise<StartResult> => {
    if (!canRecord()) return "unsupported";
    if (recorder.current) return "recording";
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      const name = (error as { name?: string }).name;
      return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed";
    }
    try {
      const picked = pickFormat();
      const active = new MediaRecorder(media, picked.type ? { mimeType: picked.type, audioBitsPerSecond: 32_000 } : undefined);
      format.current = formatFromRecorder(active, picked);
      chunks.current = [];
      active.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      active.onstop = () => {
        const duration = Math.min(MAX_RECORDING_SECONDS, Math.round((Date.now() - startedAt.current) / 1000));
        const blob = new Blob(chunks.current, { type: format.current.mime });
        chunks.current = [];
        const done = finish.current;
        finish.current = null;
        release();
        const result = blob.size > 0 ? { blob, mime: format.current.mime, extension: format.current.extension, duration } : null;
        if (done) done(result);
        else if (result) limitRef.current(result);
      };
      stream.current = media;
      recorder.current = active;
      startedAt.current = Date.now();
      active.start(1000);
      setElapsed(0);
      setRecording(true);
      return "recording";
    } catch {
      for (const track of media.getTracks()) track.stop();
      return "failed";
    }
  }, [release]);

  // The clock, and the five-minute limit.
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  // Leaving the conversation mid-recording throws the recording away.
  useEffect(() => cancel, [cancel]);

  return { recording, elapsed, start, stop, cancel };
}
