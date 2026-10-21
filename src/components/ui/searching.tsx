"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * What a search shows while it looks: a short line in a light hand —
 * "Ҷустуҷӯи маълумот..." — and a magnifying glass going along it from its
 * first letter to its last, slowly. Through the glass the letters are larger,
 * and towards its rim they bend off to either side, as they do under a real
 * lens. At the end of the line the handle swings over to the other side and
 * the glass comes back.
 *
 * When a search finds nothing, "Маълумоте ёфт нашуд!" writes itself out
 * letter by letter, and the glass goes along it in the same way — setting off
 * once every few seconds for as long as nothing found is what is on screen.
 *
 * However quickly the answer comes, the line stays long enough for the glass
 * to go its length — a search that blinks past looks as if nothing was
 * searched — so it shows for at least MIN_MS from the moment the search is
 * sent, longer while the answer is still on its way, and the results under
 * it wait, dimmed, until it is done.
 */

const MIN_MS = 2600;

/**
 * `start` when a search is sent; `searching` is true from then for `minMs`
 * (MIN_MS unless asked otherwise) at least, and for as long after that as
 * `pending` (the search's own transition) is.
 */
export function useSearchSweep(pending: boolean, minMs = MIN_MS) {
  const [round, setRound] = useState(0);
  const [held, setHeld] = useState(false);
  const start = useCallback(() => {
    setRound((n) => n + 1);
    setHeld(true);
  }, []);
  useEffect(() => {
    if (round === 0) return;
    const done = window.setTimeout(() => setHeld(false), minMs);
    return () => window.clearTimeout(done);
  }, [round, minMs]);
  // Wherever a search can be sent, the hand the line is written in is
  // fetched beforehand, so the first search does not wait for it.
  useEffect(() => warmHand(), []);
  return { searching: held || (round > 0 && pending), start, round };
}

/** The line and its glass while a search is on its way. */
export function SearchingPanel({ label }: { label: string }) {
  const text = useTranslations("common")("searchingNote");
  return <LensLine className="searching" text={text} label={label} writes={false} />;
}

/** "Nothing found", written out, with the glass going along it. */
export function NotFoundNote({ label }: { label?: ReactNode }) {
  const text = useTranslations("common")("notFoundNote");
  return <LensLine className="lens-empty" text={text} label={label ?? text} writes />;
}

/**
 * An empty list's message — unless the list is empty because a search (?q=)
 * found nothing in it: then `nothing`, which writes "nothing found" out
 * (surface.tsx's EmptyState). `plain` is the message as it would be.
 */
export function EmptyOrNotFound({ plain, nothing }: { plain: ReactNode; nothing: ReactNode }) {
  return (
    <Suspense fallback={plain}>
      <SearchedNothing plain={plain} nothing={nothing} />
    </Suspense>
  );
}

function SearchedNothing({ plain, nothing }: { plain: ReactNode; nothing: ReactNode }) {
  return useSearchParams().get("q")?.trim() ? nothing : plain;
}

function LensLine({ className, text, label, writes }: { className: string; text: string; label: ReactNode; writes: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // Before the first paint, so the line never shows at a size it then leaves.
  useLayoutEffect(() => {
    if (!host.current || !canvas.current) return;
    return runLine(host.current, canvas.current, text, writes);
  }, [text, writes]);
  return (
    <div ref={host} className={className} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <canvas ref={canvas} className="lens-line" aria-hidden />
    </div>
  );
}

/* --------------------------------------------------------------- the line */

/** How much larger the letters are at the middle of the glass. */
const POWER = 1.75;
/** From the rim to the end of the handle. */
const HANDLE = 22;
/** The glass's radius, against the letters' size: a small glass, just over a letter. */
const GLASS = 0.82;
/** The handle's slant below the level, either way. */
const LEAN = 0.86;
/** One way along the line, and the handle's swing at its end, in seconds. */
const PASS = 2.3;
const TURN = 0.6;
/** Nothing found: the glass stays this long at each end before going back. */
const REST = 1.4;
/** Nothing found: a letter is written every LETTER seconds. */
const LETTER = 0.075;

/** The family next/font gave the greeting's hand (layout.tsx), as the canvas names it. */
function handFamily() {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-greeting").trim();
  return family ? `${family}, cursive` : "cursive";
}

/**
 * The hand alone, without the fallback next/font lists after it: what to wait
 * for. The fallback is a local face most phones do not have, and waiting for
 * a list with a face that fails ends at once, before the hand is here.
 */
function handFace() {
  return handFamily().split(",")[0]!.trim();
}

let warmed = false;
function warmHand() {
  if (warmed || typeof document === "undefined" || !document.fonts) return;
  warmed = true;
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1200));
  idle(() => void document.fonts.load(`25px ${handFace()}`, "Ҷустуҷӯи маълумот ёфт нашуд!").catch(() => undefined));
}

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

interface Line {
  /** The canvas, in CSS pixels. */
  width: number;
  height: number;
  size: number;
  radius: number;
  /** Where the line starts, and its baseline. */
  left: number;
  baseline: number;
  /** The glass's middle rides at the letters' middle height, from `from` to `to`. */
  y: number;
  from: number;
  to: number;
  /** Where each letter ends, from the line's start. */
  ends: number[];
}

function measure(ctx: CanvasRenderingContext2D, room: number, text: string, family: string): Line {
  // As large as fits, with the glass and its handle at either end.
  let size = 25;
  let width = 0;
  let radius = 0;
  let side = 0;
  for (let i = 0; i < 3; i++) {
    radius = Math.round(size * GLASS);
    side = Math.max(radius, (radius + HANDLE) * Math.cos(LEAN)) + 6;
    ctx.font = `${size}px ${family}`;
    width = ctx.measureText(text).width;
    if (width + 2 * side <= room - 4 || size <= 16) break;
    size = Math.max(16, Math.floor(size * ((room - 4 - 2 * side) / width)));
  }
  ctx.font = `${size}px ${family}`;
  const letters = Array.from(text);
  const ends = letters.map((_, i) => ctx.measureText(letters.slice(0, i + 1).join("")).width);
  const y = radius + 6;
  return {
    width: Math.ceil(width + 2 * side),
    height: Math.ceil(y + (radius + HANDLE) * Math.sin(LEAN) + 12),
    size,
    radius,
    left: side,
    baseline: y + size * 0.3,
    y,
    from: side + size * 0.3,
    to: side + width - size * 0.3,
    ends,
  };
}

/** The line in `color`, at `scale` device pixels to the CSS pixel. */
function paint(canvas: HTMLCanvasElement, scale: number, L: Line, text: string, family: string, color: string, read = false) {
  canvas.width = Math.round(L.width * scale);
  canvas.height = Math.round(L.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: read });
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.font = `${L.size}px ${family}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.fillText(text, L.left, L.baseline);
  return ctx;
}

interface Mask {
  alpha: Uint8Array;
  width: number;
  height: number;
  scale: number;
}

/** How much ink covers a point between the mask's pixels. */
function tap(m: Mask, fx: number, fy: number) {
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  if (x < 0 || y < 0 || x > m.width - 2 || y > m.height - 2) return 0;
  const ax = fx - x;
  const ay = fy - y;
  const a = m.alpha;
  const i = y * m.width + x;
  const top = a[i]! + (a[i + 1]! - a[i]!) * ax;
  const bottom = a[i + m.width]! + (a[i + m.width + 1]! - a[i + m.width]!) * ax;
  return top + (bottom - top) * ay;
}

/**
 * What the glass shows, pixel by pixel: each point looks back towards the
 * middle by k = 1/POWER + (1 − 1/POWER)·t⁵ of its distance (t its distance
 * as a share of the rim). The middle is POWER times larger and nearly even;
 * near the rim k climbs to 1 in a short way, so the letters there are
 * squeezed along the radius and drawn out around it — bent off to either
 * side — and meet the line outside without a seam.
 */
function refract(out: ImageData, x0: number, y0: number, dpr: number, cx: number, cy: number, R: number, mask: Mask, ink: number[]) {
  const o = out.data;
  const n = out.width;
  const q = mask.scale;
  const near = 1 / POWER;
  const far = 1 - near;
  for (let j = 0; j < n; j++) {
    const uy = (y0 + j + 0.5) / dpr - cy;
    for (let i = 0; i < n; i++) {
      const ux = (x0 + i + 0.5) / dpr - cx;
      const r = Math.sqrt(ux * ux + uy * uy);
      const p = (j * n + i) * 4;
      const edge = Math.min(1, (R - r) * dpr + 0.5);
      if (edge <= 0) {
        o[p + 3] = 0;
        continue;
      }
      const t = r / R;
      const t2 = t * t;
      const k = near + far * t2 * t2 * t;
      o[p] = ink[0]!;
      o[p + 1] = ink[1]!;
      o[p + 2] = ink[2]!;
      o[p + 3] = tap(mask, (cx + ux * k) * q - 0.5, (cy + uy * k) * q - 0.5) * edge;
    }
  }
}

/** Brass, lit from the upper left. */
function brass(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  if (typeof ctx.createConicGradient === "function") {
    const g = ctx.createConicGradient(-2.4, cx, cy);
    const stops: Array<[number, string]> = [
      [0, "#fff1cf"],
      [0.1, "#e2c487"],
      [0.27, "#8c6b37"],
      [0.42, "#c9a465"],
      [0.55, "#f7e3b6"],
      [0.7, "#a9874f"],
      [0.86, "#6c5229"],
      [1, "#fff1cf"],
    ];
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }
  const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  g.addColorStop(0, "#fff1cf");
  g.addColorStop(0.5, "#b8955a");
  g.addColorStop(1, "#6c5229");
  return g;
}

/** The handle along +x from the glass's middle: a brass collar, then a lacquered grip. */
function handle(ctx: CanvasRenderingContext2D, R: number, solid: boolean) {
  const collar = new Path2D();
  collar.roundRect(R + 2, -4, 7.5, 8, 1.1);
  const grip = new Path2D();
  grip.roundRect(R + 9, -3.5, HANDLE - 9, 7, [0.7, 3.5, 3.5, 0.7]);
  if (solid) {
    ctx.fill(collar);
    ctx.fill(grip);
    return;
  }
  const metal = ctx.createLinearGradient(0, -4, 0, 4);
  metal.addColorStop(0, "#fbecc6");
  metal.addColorStop(0.4, "#d4b173");
  metal.addColorStop(0.7, "#8f6c38");
  metal.addColorStop(1, "#5d4522");
  ctx.fillStyle = metal;
  ctx.fill(collar);
  const lacquer = ctx.createLinearGradient(0, -3.5, 0, 3.5);
  lacquer.addColorStop(0, "#5b6684");
  lacquer.addColorStop(0.25, "#2b3349");
  lacquer.addColorStop(0.65, "#131827");
  lacquer.addColorStop(1, "#080a11");
  ctx.fillStyle = lacquer;
  ctx.fill(grip);
  ctx.beginPath();
  ctx.moveTo(R + 11, -1.8);
  ctx.lineTo(R + HANDLE - 4, -1.8);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgb(255 255 255 / 0.26)";
  ctx.lineWidth = 0.75;
  ctx.stroke();
}

interface Glass {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
}

function drawGlass(ctx: CanvasRenderingContext2D, L: Line, mask: Mask, glass: Glass, ink: number[], dpr: number, cx: number, cy: number, angle: number, shown: number) {
  const R = L.radius;
  ctx.save();
  ctx.globalAlpha = shown;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Held a little above the page: the light comes through the glass, so
  // mostly the rim and the handle cast a shadow, down and to the right.
  const soft = ctx.createRadialGradient(cx + 4, cy + 7, R * 0.7, cx + 4, cy + 7, R + 8);
  soft.addColorStop(0, "rgb(0 0 0 / 0)");
  soft.addColorStop(0.6, "rgb(20 16 8 / 0.1)");
  soft.addColorStop(1, "rgb(0 0 0 / 0)");
  ctx.fillStyle = soft;
  ctx.beginPath();
  ctx.arc(cx + 4, cy + 7, R + 8, 0, Math.PI * 2);
  ctx.fill();
  const away = 10000;
  ctx.save();
  ctx.shadowColor = "rgb(20 14 4 / 0.32)";
  ctx.shadowBlur = 5 * dpr;
  ctx.shadowOffsetX = (away + 4) * dpr;
  ctx.shadowOffsetY = 7 * dpr;
  ctx.translate(cx - away, cy);
  ctx.beginPath();
  ctx.arc(0, 0, R + 1.1, 0, Math.PI * 2);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.rotate(angle);
  ctx.fillStyle = "#000";
  handle(ctx, R, true);
  ctx.restore();

  // The letters under the glass give way to the same letters, larger.
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  const x0 = Math.floor((cx - R) * dpr) - 1;
  const y0 = Math.floor((cy - R) * dpr) - 1;
  refract(glass.image, x0, y0, dpr, cx, cy, R, mask, ink);
  glass.ctx.putImageData(glass.image, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(glass.canvas, x0, y0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  // The glass's own body: clear in the middle, a faint green-grey where it
  // is thickest to look through, at the rim.
  const body = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);
  body.addColorStop(0, "rgb(255 255 255 / 0)");
  body.addColorStop(0.72, "rgb(70 110 110 / 0.05)");
  body.addColorStop(1, "rgb(40 64 66 / 0.22)");
  ctx.fillStyle = body;
  ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // Light gathered in the lower edge, the far side from the light.
  const glow = ctx.createRadialGradient(cx - R * 0.1, cy - R * 0.14, R * 0.86, cx - R * 0.1, cy - R * 0.14, R * 1.1);
  glow.addColorStop(0, "rgb(255 255 255 / 0)");
  glow.addColorStop(0.45, "rgb(255 255 255 / 0.26)");
  glow.addColorStop(1, "rgb(255 255 255 / 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // A window's reflection, soft, high on the left.
  ctx.save();
  ctx.translate(cx - R * 0.4, cy - R * 0.48);
  ctx.rotate(-0.72);
  ctx.scale(1, 0.38);
  const shine = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.46);
  shine.addColorStop(0, "rgb(255 255 255 / 0.34)");
  shine.addColorStop(0.55, "rgb(255 255 255 / 0.12)");
  shine.addColorStop(1, "rgb(255 255 255 / 0)");
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // The polished edge catching it.
  ctx.beginPath();
  ctx.arc(cx, cy, R - 2, Math.PI * 1.06, Math.PI * 1.42);
  ctx.lineCap = "round";
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgb(255 255 255 / 0.75)";
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  handle(ctx, R, false);
  ctx.restore();

  // The rim: a thin ring of brass with a dark line at either edge.
  ctx.beginPath();
  ctx.arc(cx, cy, R + 1.1, 0, Math.PI * 2);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = brass(ctx, cx, cy, R);
  ctx.stroke();
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = "rgb(60 42 14 / 0.5)";
  ctx.beginPath();
  ctx.arc(cx, cy, R - 0.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R + 2.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Where the glass is `t` seconds in (0 at the line's start, 1 at its end),
 * and which way its handle points. It goes the line's length in PASS, the
 * handle trailing; at the end the handle swings under it to the other side
 * in TURN, and the glass stays there `rest` seconds in all before it goes
 * back.
 */
function course(t: number, rest: number) {
  const leg = PASS + Math.max(TURN, rest);
  const n = Math.floor(Math.max(0, t) / leg);
  const local = Math.max(0, t) - n * leg;
  const forward = n % 2 === 0;
  const along = ease(local / PASS);
  // Going right the handle points down to the left; going left, down to the right.
  const behind = forward ? Math.PI - LEAN : LEAN;
  const ahead = forward ? LEAN : Math.PI - LEAN;
  const swing = ease((local - PASS) / TURN);
  // A touch further behind while the glass moves fastest.
  const drag = Math.sin(Math.PI * Math.min(1, local / PASS)) * 0.07 * (forward ? 1 : -1);
  return { at: forward ? along : 1 - along, angle: behind + (ahead - behind) * swing + drag };
}

/**
 * Draws the line into `canvas` and moves the glass along it until the
 * returned function stops it. `writes` writes the line out letter by letter
 * first, and rests the glass at each end, so that it sets off once every few
 * seconds.
 */
function runLine(host: HTMLElement, canvas: HTMLCanvasElement, text: string, writes: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const family = handFamily();
  let color = "";
  let ink: number[] = [];
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const born = performance.now();
  // The glass sets off once the line is written.
  const written = writes && !still ? 0.15 + Array.from(text).length * LETTER + 0.35 : 0;
  const face = handFace();
  let hand = document.fonts?.check(`25px ${face}`, text) ?? true;
  let L: Line | null = null;
  let base: HTMLCanvasElement | null = null;
  let mask: Mask | null = null;
  let glass: Glass | null = null;
  let room = -1;
  let frame = 0;
  let live = true;

  const build = () => {
    room = host.clientWidth;
    // Written in the element's own colour, read afresh when the theme changes.
    color = getComputedStyle(host).color;
    ink = (color.match(/[\d.]+/g) ?? ["90", "90", "90"]).slice(0, 3).map(Number);
    L = measure(ctx, room, text, family);
    canvas.width = Math.round(L.width * dpr);
    canvas.height = Math.round(L.height * dpr);
    canvas.style.width = `${L.width}px`;
    canvas.style.height = `${L.height}px`;
    base = document.createElement("canvas");
    paint(base, dpr, L, text, family, color);
    // The line as the glass sees it: finer than the screen, so the letters
    // under it are sharp, not merely enlarged.
    const q = Math.min(4, Math.max(2, Math.ceil(dpr * POWER)));
    const fine = document.createElement("canvas");
    const fineCtx = paint(fine, q, L, text, family, "#000", true);
    if (fineCtx) {
      const rgba = fineCtx.getImageData(0, 0, fine.width, fine.height).data;
      const alpha = new Uint8Array(fine.width * fine.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!;
      mask = { alpha, width: fine.width, height: fine.height, scale: q };
    }
    const n = Math.ceil(2 * L.radius * dpr) + 3;
    const lensCanvas = document.createElement("canvas");
    lensCanvas.width = lensCanvas.height = n;
    const lensCtx = lensCanvas.getContext("2d");
    glass = lensCtx ? { canvas: lensCanvas, ctx: lensCtx, image: lensCtx.createImageData(n, n) } : null;
    draw(performance.now());
  };

  const draw = (now: number) => {
    if (!L || !base) return;
    const t = (now - born) / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Until the hand is here, nothing: never the line in another face first.
    if (!hand) return;
    ctx.drawImage(base, 0, 0);
    if (t < written) {
      // Letter by letter, each with a short stroke of the pen.
      const k = (t - 0.15) / LETTER;
      const i = Math.max(0, Math.floor(k));
      const start = i === 0 ? 0 : (L.ends[i - 1] ?? 0);
      const end = L.ends[Math.min(i, L.ends.length - 1)] ?? 0;
      const reach = k < 0 ? 0 : L.left + start + (end - start) * ease(k - i);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      const wipe = ctx.createLinearGradient(reach - 5, 0, reach + 1, 0);
      wipe.addColorStop(0, "#000");
      wipe.addColorStop(1, "rgb(0 0 0 / 0)");
      ctx.fillStyle = wipe;
      ctx.fillRect(0, 0, L.width, L.height);
      ctx.globalCompositeOperation = "source-over";
      return;
    }
    if (!mask || !glass) return;
    const { at, angle } = still ? { at: 0.5, angle: LEAN } : course(t - written, writes ? REST : TURN);
    const cx = L.from + (L.to - L.from) * at;
    const cy = L.y + (still ? 0 : Math.sin(t * 1.3) * 0.8);
    const shown = still ? 1 : ease((t - written) / 0.45);
    drawGlass(ctx, L, mask, glass, ink, dpr, cx, cy, angle, shown);
  };

  const loop = (now: number) => {
    draw(now);
    frame = requestAnimationFrame(loop);
  };

  build();
  if (!still) frame = requestAnimationFrame(loop);

  if (!hand && document.fonts) {
    // On a slow line the hand may take a while: after a moment and a half the
    // line is written in what there is, and again in the hand when it comes.
    const loaded = document.fonts.load(`25px ${face}`, text).then(
      (faces) => faces.length > 0,
      () => false
    );
    const wait = new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 1500));
    void Promise.race([loaded, wait]).then((ready) => {
      if (!live) return;
      hand = true;
      build();
      if (!ready) void loaded.then((late) => late && live && build());
    });
  }

  const watch = new ResizeObserver(() => {
    if (host.clientWidth !== room) build();
  });
  watch.observe(host);
  const theme = new MutationObserver(build);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

  return () => {
    live = false;
    cancelAnimationFrame(frame);
    watch.disconnect();
    theme.disconnect();
  };
}
