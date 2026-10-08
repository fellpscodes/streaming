import fs from "node:fs/promises";
import { episodeFile } from "@/lib/media/episode";
import { fontFile } from "@/lib/media/subtitles";

export async function GET(_req: Request, ctx: RouteContext<"/api/fonts/[episodeId]/[name]">) {
  const { episodeId, name } = await ctx.params;
  const ep = episodeFile(Number(episodeId));
  if (!ep) return new Response("Não encontrado", { status: 404 });
  const f = await fontFile(ep.id, ep.filePath, decodeURIComponent(name)).catch(() => null);
  if (!f) return new Response("Fonte indisponível", { status: 404 });
  return new Response(await fs.readFile(f), { headers: { "Content-Type": "font/ttf", "Cache-Control": "private, max-age=86400" } });
}
