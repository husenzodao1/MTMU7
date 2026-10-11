import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { Document, OfficialHeading, Page, PageFooter, PdfTable, Text, pdf, renderPdf } from "@/lib/pdf/kit";
import { formatNumber } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";
import { getPlatformIdentity } from "@/lib/site/identity";

/**
 * An office report as a printable PDF: the official heading, the period, and
 * the same table the page shows, on landscape A4 so wide reports still fit;
 * the column headings repeat on every page.
 */
export async function reportPdf({
  title,
  period,
  school,
  columns,
  rows,
}: {
  title: string;
  period: string;
  school: string;
  columns: Array<{ label: string; numeric: boolean }>;
  rows: Array<Array<string | number>>;
}): Promise<Buffer> {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("reportCard");
  const identity = await getPlatformIdentity();
  const authority = pickText(identity.authorityName, locale) || t("authority");
  const cell = (value: string | number) => (typeof value === "number" ? formatNumber(value, locale) : value);
  const fontSize = columns.length > 8 ? 7 : 8.5;

  return renderPdf(
    <Document title={title} author={school} creator="MTMU7" language={locale}>
      <Page size="A4" orientation="landscape" style={pdf.page}>
        <OfficialHeading authority={authority} school={school} title={title} subtitle={period} />
        {rows.length === 0 ? (
          <Text style={[pdf.center, pdf.muted]}>—</Text>
        ) : (
          <PdfTable
            fontSize={fontSize}
            columns={columns.map((c, index) => ({ label: c.label, weight: index === 0 ? 2.2 : 1, align: c.numeric ? "right" : "left" }))}
            rows={rows.map((row) => row.map(cell))}
          />
        )}
        <PageFooter left={`${school} · ${title}`} pageLabel={(page, total) => t("page", { page, total })} />
      </Page>
    </Document>
  );
}
