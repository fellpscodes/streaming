import { eq } from "drizzle-orm";
import { db, titles, type Category } from "@/lib/db";
import { resetMetadata } from "@/lib/metadata";
import { refreshTitleStatus } from "@/lib/scanner/scan";

const CATEGORIES: Category[] = ["movie", "series", "anime"];

/** Correção manual de nome/ano/categoria. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/titles/[id]">) {
  const id = Number((await ctx.params).id);
  const body = (await req.json().catch(() => ({}))) as { name?: string; year?: number | null; category?: Category };

  const patch: Partial<typeof titles.$inferInsert> = { manual: true };
  if (body.name !== undefined) {
    if (!body.name.trim()) return Response.json({ error: "Nome vazio." }, { status: 400 });
    patch.name = body.name.trim();
  }
  if (body.year !== undefined) patch.year = body.year;
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) return Response.json({ error: "Categoria inválida." }, { status: 400 });
    patch.category = body.category;
  }
  const res = db.update(titles).set(patch).where(eq(titles.id, id)).run();
  if (!res.changes) return Response.json({ error: "Não encontrado." }, { status: 404 });
  refreshTitleStatus(id);
  if (body.name !== undefined || body.year !== undefined || body.category !== undefined) resetMetadata(id); // nome mudou: rebusca capa
  return Response.json(db.select().from(titles).where(eq(titles.id, id)).get());
}
