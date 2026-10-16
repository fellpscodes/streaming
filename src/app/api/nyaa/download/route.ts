import { connection } from "next/server";
import { addDownload, DownloadError } from "@/lib/nyaa/download";
import { guardLocal } from "@/lib/nyaa/guard";
import { QbtError } from "@/lib/qbittorrent";

/** POST /api/nyaa/download { magnet, title, folderId? } — manda o torrent ao qBittorrent, na pasta da biblioteca. */
export async function POST(req: Request) {
  await connection();
  const denied = guardLocal(req, true);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { magnet?: unknown; title?: unknown; folderId?: unknown };
  if (typeof body.magnet !== "string" || typeof body.title !== "string") return Response.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const r = await addDownload({
      magnet: body.magnet,
      title: body.title,
      folderId: Number.isInteger(body.folderId) ? (body.folderId as number) : undefined,
    });
    return Response.json(r, { status: r.alreadyAdded ? 200 : 201 });
  } catch (e) {
    if (e instanceof DownloadError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof QbtError) return Response.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
