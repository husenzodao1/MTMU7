import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../../admin-nav";
import { ContentEditor } from "./content-editor";
import { notFound } from "next/navigation";

async function getPageWithBlocks(pageId: string) {
  const supabase = await createServerClient();

  const { data: page } = await supabase
    .from("pages" as never)
    .select("id, slug, title_tg, title_ru, is_published" as never)
    .eq("id" as never, pageId)
    .single();

  if (!page) return null;

  const { data: blocks } = await supabase
    .from("content_blocks" as never)
    .select(
      "id, section, type, title_tg, body_tg, image_url, is_visible, sort_order" as never
    )
    .eq("page_id" as never, pageId)
    .order("sort_order" as never, { ascending: true });

  const pageRow = page as Record<string, unknown>;
  return {
    page: {
      id: pageRow.id as string,
      slug: pageRow.slug as string,
      titleTg: pageRow.title_tg as string,
      titleRu: (pageRow.title_ru as string) ?? null,
      isPublished: pageRow.is_published as boolean,
    },
    blocks: ((blocks ?? []) as Array<Record<string, unknown>>).map((b) => ({
      id: b.id as string,
      section: b.section as string,
      type: b.type as string,
      titleTg: (b.title_tg as string) ?? null,
      bodyTg: (b.body_tg as string) ?? null,
      imageUrl: (b.image_url as string) ?? null,
      isVisible: b.is_visible as boolean,
      sortOrder: b.sort_order as number,
    })),
  };
}

export default async function PageEditorPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  await requireAdmin();
  const { pageId } = await params;
  const data = await getPageWithBlocks(pageId);

  if (!data) notFound();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <ContentEditor
          pageId={data.page.id}
          pageTitleTg={data.page.titleTg}
          blocks={data.blocks}
        />
      </div>
    </div>
  );
}
