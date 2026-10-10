import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { cardHeight, reportCardModel, type CardModel, type CardRow, type Tone } from "@/lib/telegram/report-card-model";
import type { Loc, Report, ReportKind } from "@/lib/telegram/messages";

/**
 * The parents' report as a picture: the school's night blue across the top
 * with the child's name, then a white card with every mark and absence on a
 * line of its own — the subject in words, the mark as a coloured badge.
 * Drawn at 1080 px wide, which is what Telegram shows a photo at on a phone.
 */

const WIDTH = 1080;

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e8edf3";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  great: { bg: "#16a34a", fg: "#ffffff" },
  good: { bg: "#0ea5e9", fg: "#ffffff" },
  fair: { bg: "#f59e0b", fg: "#ffffff" },
  poor: { bg: "#dc2626", fg: "#ffffff" },
  absent: { bg: "#fde2e2", fg: "#b42318" },
  late: { bg: "#fef3c7", fg: "#92400e" },
  excused: { bg: "#e0ecff", fg: "#1d4ed8" },
  plain: { bg: "#eef2ff", fg: "#3730a3" },
};

let fonts: Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }>> | null = null;

/** Noto Sans, cut down to Latin and Cyrillic with the Tajik letters (fonts/OFL.txt). */
function loadFonts() {
  fonts ??= Promise.all(
    (["Regular", "Bold"] as const).map(async (weight) => {
      const file = await readFile(join(process.cwd(), "src/lib/telegram/fonts", `NotoSans-${weight}.ttf`));
      return {
        name: "Noto Sans",
        data: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
        weight: weight === "Bold" ? (700 as const) : (400 as const),
        style: "normal" as const,
      };
    })
  ).catch((error) => {
    fonts = null;
    throw error;
  });
  return fonts;
}

function Badge({ row }: { row: CardRow }) {
  const tone = TONES[row.tone];
  if (row.shape === "pill") {
    return (
      <div style={{ display: "flex", padding: "12px 26px", borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 28, fontWeight: 700 }}>
        {row.value}
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 76,
        height: 76,
        padding: "0 18px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        fontSize: row.value.length > 2 ? 28 : 36,
        fontWeight: 700,
      }}
    >
      {row.value}
    </div>
  );
}

function Card({ model }: { model: CardModel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#eef2f7", fontFamily: "Noto Sans" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px 132px",
          backgroundImage: "linear-gradient(150deg, #231a5c 0%, #17306d 55%, #0a6d72 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", width: 18, height: 18, borderRadius: 999, background: "#ffb547" }} />
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 3, textTransform: "uppercase", opacity: 0.75 }}>
            {model.title} · {model.dateLine}
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 60, fontWeight: 700, lineHeight: 1.1 }}>{model.child}</div>
        {model.className ? (
          <div style={{ display: "flex", marginTop: 22 }}>
            <div style={{ display: "flex", padding: "8px 22px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 28, fontWeight: 700 }}>
              {model.className}
            </div>
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          margin: "-88px 40px 0",
          padding: "26px 44px 34px",
          borderRadius: 40,
          background: "#ffffff",
          boxShadow: "0 18px 48px rgba(15, 23, 42, 0.12)",
        }}
      >
        {model.empty ? (
          <div style={{ display: "flex", padding: "40px 0", fontSize: 32, color: MUTED }}>{model.empty}</div>
        ) : null}
        {model.sections.map((section, index) => (
          <div key={section.title} style={{ display: "flex", flexDirection: "column", marginTop: index === 0 ? 0 : 22 }}>
            {/* The timetable and the results are the whole card; their name is already in the header. */}
            {section.kind === "timetable" || section.kind === "results" ? null : (
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 0 10px", fontSize: 24, fontWeight: 700, color: MUTED, letterSpacing: 2, textTransform: "uppercase" }}>
                <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: section.kind === "attendance" ? "#dc2626" : "#16a34a" }} />
                {section.title}
              </div>
            )}
            {section.rows.map((row, rowIndex) => (
              <div
                key={`${row.title}-${rowIndex}`}
                style={{ display: "flex", alignItems: "center", gap: 24, minHeight: 112, borderTop: rowIndex === 0 ? "none" : `2px solid ${LINE}` }}
              >
                {section.kind === "timetable" ? <Badge row={row} /> : null}
                <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: INK }}>{row.title}</div>
                  {row.detail ? <div style={{ display: "flex", marginTop: 4, fontSize: 25, color: MUTED }}>{row.detail}</div> : null}
                </div>
                {section.kind === "timetable" ? null : <Badge row={row} />}
              </div>
            ))}
            {section.more ? (
              <div style={{ display: "flex", padding: "18px 0 4px", fontSize: 26, color: MUTED }}>+{section.more}</div>
            ) : null}
          </div>
        ))}
        {model.average ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 26,
              padding: "26px 32px",
              borderRadius: 28,
              background: "#f5f7fb",
            }}
          >
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: INK }}>{model.average.label}</div>
            <div style={{ display: "flex", fontSize: 52, fontWeight: 700, color: TONES[model.average.tone].bg }}>{model.average.value}</div>
          </div>
        ) : null}
      </div>

      {model.school ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "34px 60px 0", fontSize: 24, color: MUTED, textAlign: "center" }}>
          {model.school}
        </div>
      ) : null}
    </div>
  );
}

/** The report as a PNG, or null when it could not be drawn (the caller sends the text instead). */
export async function renderReportCard(
  locale: Loc,
  report: Report,
  kind: ReportKind,
  school?: { name?: string | null } | null
): Promise<Uint8Array | null> {
  try {
    const model = reportCardModel(locale, report, kind, school);
    const image = new ImageResponse(<Card model={model} />, {
      width: WIDTH,
      height: cardHeight(model),
      fonts: await loadFonts(),
    });
    return new Uint8Array(await image.arrayBuffer());
  } catch (error) {
    console.error("[telegram] report card", error instanceof Error ? error.message : "unknown");
    return null;
  }
}
