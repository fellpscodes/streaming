import fs from "node:fs/promises";
import { episodeFile } from "@/lib/media/episode";
import { subtitleFile } from "@/lib/media/subtitles";

export async function GET(_req: Request, ctx: RouteContext<"/api/subtitles/[episodeId]/[trackId]">) {
  const { episodeId, trackId } = await ctx.params;
  const ep = episodeFile(Number(episodeId));
  if (!ep) return new Response("Não encontrado", { status: 404 });
  const f = await subtitleFile(ep.id, ep.filePath, trackId).catch(() => null);
  if (!f) return new Response("Legenda indisponível", { status: 404 });
  return new Response(await fs.readFile(f.path), { headers: { "Content-Type": f.contentType, "Cache-Control": "private, max-age=3600" } });
}
