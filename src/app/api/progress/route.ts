import { connection } from "next/server";
import { getProgress, saveProgress } from "@/lib/progress";

export async function GET(req: Request) {
  await connection();
  const id = Number(new URL(req.url).searchParams.get("episodeId"));
  return Response.json(getProgress(id));
}

/** Aceita POST também porque navigator.sendBeacon (ao fechar a aba) só envia POST. */
async function save(req: Request) {
  const b = (await req.json().catch(() => null)) as { episodeId?: number; position?: number; duration?: number } | null;
  if (!b || !Number.isInteger(b.episodeId) || !saveProgress(b.episodeId!, Number(b.position), Number(b.duration))) {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  return new Response(null, { status: 204 });
}
export { save as PUT, save as POST };
