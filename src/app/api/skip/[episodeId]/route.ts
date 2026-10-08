import { eq } from "drizzle-orm";
import { db, titles, type SkipMarks } from "@/lib/db";
import { episodeFile } from "@/lib/media/episode";
import { probe } from "@/lib/media/ffprobe";
import { mergeMarks, resolveSkip } from "@/lib/media/skip";

async function info(episodeId: number) {
  const ep = episodeFile(episodeId);
  if (!ep) return null;
  const marks = db.select({ m: titles.skipMarks }).from(titles).where(eq(titles.id, ep.titleId)).get()?.m ?? null;
  const p = await probe(ep.filePath).catch(() => null);
  return { ep, marks, skip: resolveSkip(p?.chapters ?? [], p?.duration ?? 0, marks) };
}

const respond = (x: NonNullable<Awaited<ReturnType<typeof info>>>) => Response.json({ ...x.skip, marks: x.marks ?? {} });

/** Abertura e encerramento deste episódio: capítulos do arquivo, ou as marcas manuais do título. */
export async function GET(_req: Request, ctx: RouteContext<"/api/skip/[episodeId]">) {
  const x = await info(Number((await ctx.params).episodeId));
  return x ? respond(x) : Response.json({ error: "Episódio não encontrado." }, { status: 404 });
}

/** PUT { introStart?, introEnd?, outroStart? } — marca à mão (em segundos; null apaga). Vale para o título inteiro. */
export async function PUT(req: Request, ctx: RouteContext<"/api/skip/[episodeId]">) {
  const x = await info(Number((await ctx.params).episodeId));
  if (!x) return Response.json({ error: "Episódio não encontrado." }, { status: 404 });
  const patch = (await req.json().catch(() => ({}))) as SkipMarks;
  const merged = mergeMarks(x.marks, patch);
  if ("error" in merged) return Response.json(merged, { status: 400 });
  db.update(titles).set({ skipMarks: merged }).where(eq(titles.id, x.ep.titleId)).run();
  return respond((await info(x.ep.id))!);
}

/** Apaga todas as marcas manuais do título (os capítulos do arquivo não são afetados). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/skip/[episodeId]">) {
  const x = await info(Number((await ctx.params).episodeId));
  if (!x) return Response.json({ error: "Episódio não encontrado." }, { status: 404 });
  db.update(titles).set({ skipMarks: null }).where(eq(titles.id, x.ep.titleId)).run();
  return respond((await info(x.ep.id))!);
}
