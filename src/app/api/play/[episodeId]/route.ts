import { episodeFile } from "@/lib/media/episode";
import { probe } from "@/lib/media/ffprobe";
import type { Mode } from "@/lib/media/plan";
import { prepare } from "@/lib/media/prepare";

/** Prepara o vídeo (remux sem perda quando preciso) e informa o andamento. O cliente repete até "ready". */
export async function POST(req: Request, ctx: RouteContext<"/api/play/[episodeId]">) {
  const ep = episodeFile(Number((await ctx.params).episodeId));
  if (!ep) return Response.json({ error: "Episódio não encontrado." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { audio?: number | null; mode?: Mode };
  const mode: Mode = body.mode === "compat" ? "compat" : "auto";

  const state = await prepare(ep.id, ep.filePath, { audioIndex: body.audio ?? null, mode });
  if (state.state === "error") return Response.json(state, { status: 500 });

  const p = await probe(ep.filePath);
  return Response.json({
    ...state,
    duration: p.duration,
    audioTracks: p.audio.map((a) => ({ index: a.index, label: [a.lang, a.title, a.codec.toUpperCase()].filter(Boolean).join(" · "), isDefault: a.isDefault })),
    audioIndex: state.plan.audioIndex,
    streamUrl: `/api/stream/${ep.id}?audio=${state.plan.audioIndex ?? ""}&mode=${mode}`,
  });
}
