import "server-only";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";

/**
 * The shared pieces of every PDF the school prints: the typeface, the
 * official heading with the emblem of the Republic, a plain ruled table and a
 * page footer with the page numbers. Report cards use them now, the journal
 * archive later.
 *
 * Noto Sans is embedded because the built-in PDF fonts have no Cyrillic, let
 * alone ӣ, ӯ, ҳ, ҷ, қ and ғ. It is the same small subset the parents' bot
 * draws its report with (src/lib/telegram/fonts, SIL Open Font License); the
 * fonts and the emblem are listed for the build's file tracing in next.config.
 */
const FONTS = path.join(process.cwd(), "src/lib/telegram/fonts");
export const EMBLEM_PNG = path.join(process.cwd(), "src/lib/pdf/assets/emblem.png");

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: "Noto Sans",
    fonts: [
      { src: path.join(FONTS, "NotoSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONTS, "NotoSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Words are never broken with a hyphen: Tajik hyphenation rules are not in the library.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

export const INK = "#1c1f24";
export const MUTED = "#6b7280";
export const LINE = "#c9ced6";
export const SOFT = "#f2f4f7";

export const pdf = StyleSheet.create({
  page: { fontFamily: "Noto Sans", fontSize: 9, color: INK, paddingTop: 34, paddingBottom: 46, paddingHorizontal: 40 },
  center: { textAlign: "center" },
  muted: { color: MUTED },
  bold: { fontWeight: 700 },
  small: { fontSize: 7.5 },
});

/** The emblem, the ministry and the school, then the document's title. */
export function OfficialHeading({ authority, school, title, subtitle }: { authority: string; school: string; title: string; subtitle?: string }) {
  return (
    <View style={{ alignItems: "center", marginBottom: 14 }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt */}
      <Image src={EMBLEM_PNG} style={{ width: 42, height: 42, marginBottom: 6 }} />
      <Text style={{ fontSize: 7.5, letterSpacing: 0.6, color: MUTED, textTransform: "uppercase" }}>{authority}</Text>
      <Text style={{ fontSize: 10, fontWeight: 700, marginTop: 2, textAlign: "center" }}>{school}</Text>
      <View style={{ width: 120, height: 0.8, backgroundColor: LINE, marginVertical: 8 }} />
      <Text style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 9, color: MUTED, marginTop: 3 }}>{subtitle}</Text> : null}
    </View>
  );
}

/** A label and its value on one line: "Хонанда: Каримов Алишер". */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <Text style={{ fontSize: 9, marginBottom: 2 }}>
      <Text style={{ color: MUTED }}>{label}: </Text>
      <Text style={{ fontWeight: 700 }}>{value}</Text>
    </Text>
  );
}

export interface PdfColumn {
  label: string;
  /** Share of the row's width, as a flex weight. */
  weight: number;
  align?: "left" | "center" | "right";
}

/**
 * A ruled table. The header repeats on every page a long table runs onto;
 * a row never splits across two pages.
 */
export function PdfTable({ columns, rows, zebra = true, fontSize = 8.5 }: { columns: PdfColumn[]; rows: ReactNode[][]; zebra?: boolean; fontSize?: number }) {
  const cell = (column: PdfColumn, content: ReactNode, header: boolean, key: number) => (
    <View
      key={key}
      style={{
        flex: column.weight,
        paddingVertical: header ? 4 : 3.5,
        paddingHorizontal: 4,
        borderRightWidth: 0.5,
        borderRightColor: LINE,
        justifyContent: "center",
      }}
    >
      {typeof content === "string" || typeof content === "number" || content === null || content === undefined ? (
        <Text style={{ fontSize: header ? fontSize - 1 : fontSize, fontWeight: header ? 700 : 400, color: header ? MUTED : INK, textAlign: column.align ?? "left" }}>
          {content ?? ""}
        </Text>
      ) : (
        content
      )}
    </View>
  );
  return (
    // Each row draws its own left and bottom rules (and each cell its right
    // one), so a table that runs onto the next page has no frame left hanging.
    <View>
      <View fixed style={{ flexDirection: "row", backgroundColor: SOFT, borderWidth: 0.5, borderRightWidth: 0, borderColor: LINE }}>
        {columns.map((column, index) => cell(column, column.label, true, index))}
      </View>
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          wrap={false}
          style={{
            flexDirection: "row",
            borderLeftWidth: 0.5,
            borderLeftColor: LINE,
            borderBottomWidth: 0.5,
            borderBottomColor: LINE,
            backgroundColor: zebra && rowIndex % 2 === 1 ? "#fafbfc" : "#ffffff",
          }}
        >
          {columns.map((column, index) => cell(column, row[index], false, index))}
        </View>
      ))}
    </View>
  );
}

/** Lines to sign on: "Роҳбари синф ____________". */
export function Signatures({ items, stamp }: { items: string[]; stamp?: string }) {
  return (
    <View style={{ marginTop: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }} wrap={false}>
      <View>
        {items.map((label) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 12 }}>
            <Text style={{ fontSize: 9, width: 110 }}>{label}</Text>
            <View style={{ width: 140, borderBottomWidth: 0.6, borderBottomColor: INK }} />
          </View>
        ))}
      </View>
      {stamp ? (
        <View style={{ width: 70, height: 70, borderRadius: 35, borderWidth: 0.6, borderColor: LINE, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 8, color: MUTED }}>{stamp}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The foot of each page: what this is on the left, "page 2 / 5" on the right. */
export function PageFooter({ left, pageLabel }: { left: string; pageLabel: (page: number, total: number) => string }) {
  return (
    <View fixed style={{ position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5 }}>
      <Text style={{ fontSize: 7, color: MUTED }}>{left}</Text>
      <Text style={{ fontSize: 7, color: MUTED }} render={({ pageNumber, totalPages }) => pageLabel(pageNumber, totalPages)} />
    </View>
  );
}

export { Document, Page, Text, View };

/** Draws the document into a Buffer, fonts registered first. */
export async function renderPdf(document: ReactElement): Promise<Buffer> {
  registerFonts();
  // react-pdf's own element types are narrower than React's; the document is one of its Documents.
  return renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
}

/** The HTTP answer for a PDF: downloaded under a readable (Cyrillic-safe) name, never cached. */
export function pdfResponse(buffer: Buffer, filename: string): Response {
  const ascii = filename.replace(/[^\w.-]+/g, "_");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
