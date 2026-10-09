import fs from "node:fs";
import { episodeFile } from "@/lib/media/episode";
import { probe } from "@/lib/media/ffprobe";
import { makePlan, type Mode } from "@/lib/media/plan";
import { playablePath } from "@/lib/media/prepare";
import { serveFile } from "@/lib/media/serve";

const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/mp4", ".webm": "video/webm" };

async function resolve(req: Request, ctx: RouteContext<"/api/stream/[episodeId]">) {
  const ep = episodeFile(Number((await ctx.params).episodeId));
  if (!ep) return null;
  const q = new URL(req.url).searchParams;
  const audio = q.get("audio");
  const mode: Mode = q.get("mode") === "compat" ? "compat" : "auto";
  const p = await probe(ep.filePath).catch(() => null);
  if (!p) return null;
  const plan = makePlan(ep.filePath, p, { audioIndex: audio ? Number(audio) : null, mode });
  const file = await playablePath(ep.id, ep.filePath, p, plan);
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st) return null;
  const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
  return { file, size: st.size, type: TYPES[ext] ?? "video/mp4" };
}

const base = (type: string, size: number): Record<string, string> => ({
  "Content-Type": type,
  "Accept-Ranges": "bytes",
  "Cache-Control": "private, no-cache",
  "Content-Length": String(size),
});

/** Streaming com HTTP Range: o navegador pede só o trecho que precisa (seek instantâneo, sem baixar tudo). */
export async function GET(req: Request, ctx: RouteContext<"/api/stream/[episodeId]">) {
  const r = await resolve(req, ctx);
  if (!r) return new Response("Vídeo indisponível (ainda não preparado?)", { status: 404 });
  return serveFile(req, r.file, r.size, r.type);
}

export async function HEAD(req: Request, ctx: RouteContext<"/api/stream/[episodeId]">) {
  const r = await resolve(req, ctx);
  return r ? new Response(null, { headers: base(r.type, r.size) }) : new Response(null, { status: 404 });
}
