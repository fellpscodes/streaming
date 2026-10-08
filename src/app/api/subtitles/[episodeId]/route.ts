import { eq } from "drizzle-orm";
import { db, titles } from "@/lib/db";
import { episodeFile } from "@/lib/media/episode";
import { pickTrack } from "@/lib/media/subtitle-pref";
import { listSubtitles } from "@/lib/media/subtitles";

/** Faixas do episódio e a que deve vir selecionada (a preferência do título, ou o padrão do arquivo). */
export async function GET(_req: Request, ctx: RouteContext<"/api/subtitles/[episodeId]">) {
  const ep = episodeFile(Number((await ctx.params).episodeId));
  if (!ep) return Response.json({ error: "Episódio não encontrado." }, { status: 404 });
  const { tracks, fonts } = await listSubtitles(ep.filePath).catch(() => ({ tracks: [], fonts: [] }));
  const pref = db.select({ p: titles.subtitlePref }).from(titles).where(eq(titles.id, ep.titleId)).get()?.p ?? null;
  return Response.json({
    tracks: tracks.map((t) => ({ ...t, url: `/api/subtitles/${ep.id}/${t.id}` })),
    fonts: fonts.map((f) => `/api/fonts/${ep.id}/${encodeURIComponent(f.name)}`),
    selectedId: pickTrack(tracks, pref),
    hasPreference: pref !== null,
  });
}
