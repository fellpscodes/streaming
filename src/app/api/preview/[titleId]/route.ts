import fs from "node:fs";
import { enqueuePreview, previewFiles } from "@/lib/media/preview";
import { serveFile } from "@/lib/media/serve";

const idOf = async (ctx: RouteContext<"/api/preview/[titleId]">) => Number((await ctx.params).titleId);

/** GET ?kind=video|poster — a prévia do título (trecho de 18 s do episódio) ou o quadro de fundo. */
export async function GET(req: Request, ctx: RouteContext<"/api/preview/[titleId]">) {
  const id = await idOf(ctx);
  const kind = new URL(req.url).searchParams.get("kind") === "poster" ? "poster" : "video";
  const f = previewFiles(id);
  const file = kind === "poster" ? f.poster : f.video;
  if (!file) {
    enqueuePreview(id); // pediu e não existe: começa a gerar para a próxima vez
    return new Response("Prévia ainda não gerada", { status: 404 });
  }
  const st = await fs.promises.stat(file);
  return serveFile(req, file, st.size, kind === "poster" ? "image/jpeg" : "video/mp4", "private, max-age=3600");
}

/** POST — pede a geração em segundo plano. */
export async function POST(_req: Request, ctx: RouteContext<"/api/preview/[titleId]">) {
  const id = await idOf(ctx);
  const started = enqueuePreview(id);
  return Response.json({ started }, { status: 202 });
}
