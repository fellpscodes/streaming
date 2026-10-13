import fs from "node:fs/promises";
import { episodeFile } from "@/lib/media/episode";
import { subtitleFile, subtitleVtt } from "@/lib/media/subtitles";

export async function GET(req: Request, ctx: RouteContext<"/api/subtitles/[episodeId]/[trackId]">) {
  const { episodeId, trackId } = await ctx.params;
  const ep = episodeFile(Number(episodeId));
  if (!ep) return new Response("Não encontrado", { status: 404 });
  const f = await subtitleFile(ep.id, ep.filePath, trackId).catch(() => null);
  if (!f) return new Response("Legenda indisponível", { status: 404 });
  // ?as=vtt: versão só texto, para celulares (o desenho por cima do vídeo some com a imagem em alguns aparelhos)
  if (new URL(req.url).searchParams.get("as") === "vtt") {
    const v = await subtitleVtt(f).catch(() => null);
    if (!v) return new Response("Legenda indisponível", { status: 404 });
    return new Response(await fs.readFile(v.path), { headers: { "Content-Type": v.contentType, "Cache-Control": "private, max-age=3600" } });
  }
  return new Response(await fs.readFile(f.path), { headers: { "Content-Type": f.contentType, "Cache-Control": "private, max-age=3600" } });
}
