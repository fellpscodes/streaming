import { episodeFile } from "@/lib/media/episode";
import { listSubtitles } from "@/lib/media/subtitles";

export async function GET(_req: Request, ctx: RouteContext<"/api/subtitles/[episodeId]">) {
  const ep = episodeFile(Number((await ctx.params).episodeId));
  if (!ep) return Response.json({ error: "Episódio não encontrado." }, { status: 404 });
  const { tracks, fonts } = await listSubtitles(ep.filePath).catch(() => ({ tracks: [], fonts: [] }));
  return Response.json({
    tracks: tracks.map((t) => ({ ...t, url: `/api/subtitles/${ep.id}/${t.id}` })),
    fonts: fonts.map((f) => `/api/fonts/${ep.id}/${encodeURIComponent(f.name)}`),
  });
}
