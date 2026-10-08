import { eq } from "drizzle-orm";
import { db, episodes } from "@/lib/db";
import { refreshTitleStatus } from "@/lib/scanner/scan";

/** Correção manual de temporada/episódio de um arquivo. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/episodes/[id]">) {
  const id = Number((await ctx.params).id);
  const { season, episode } = (await req.json().catch(() => ({}))) as { season?: number | null; episode?: number | null };
  const ok = (n: unknown) => n === null || (Number.isInteger(n) && (n as number) >= 0);
  if (!ok(season) || !ok(episode)) return Response.json({ error: "Valores inválidos." }, { status: 400 });

  const ep = db.select().from(episodes).where(eq(episodes.id, id)).get();
  if (!ep) return Response.json({ error: "Não encontrado." }, { status: 404 });
  db.update(episodes)
    .set({ season: season === undefined ? ep.season : season, episode: episode === undefined ? ep.episode : episode, manual: true })
    .where(eq(episodes.id, id))
    .run();
  refreshTitleStatus(ep.titleId);
  return Response.json(db.select().from(episodes).where(eq(episodes.id, id)).get());
}
