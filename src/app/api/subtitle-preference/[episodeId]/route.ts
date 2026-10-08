import { eq } from "drizzle-orm";
import { db, titles } from "@/lib/db";
import { episodeFile } from "@/lib/media/episode";
import { prefFromTrack } from "@/lib/media/subtitle-pref";
import { listSubtitles } from "@/lib/media/subtitles";

/**
 * PUT { trackId } — guarda a legenda escolhida neste episódio como preferência do título inteiro.
 * trackId "" (ou ausente) = "Sem legenda". O cliente só manda o id; a descrição vem das faixas reais do arquivo.
 */
export async function PUT(req: Request, ctx: RouteContext<"/api/subtitle-preference/[episodeId]">) {
  const ep = episodeFile(Number((await ctx.params).episodeId));
  if (!ep) return Response.json({ error: "Episódio não encontrado." }, { status: 404 });
  const { trackId } = (await req.json().catch(() => ({}))) as { trackId?: string };

  let track = null;
  if (trackId) {
    const { tracks } = await listSubtitles(ep.filePath).catch(() => ({ tracks: [] }));
    track = tracks.find((t) => t.id === trackId) ?? null;
    if (!track) return Response.json({ error: "Faixa de legenda inexistente." }, { status: 400 });
  }
  const pref = prefFromTrack(track);
  db.update(titles).set({ subtitlePref: pref }).where(eq(titles.id, ep.titleId)).run();
  return Response.json(pref);
}
