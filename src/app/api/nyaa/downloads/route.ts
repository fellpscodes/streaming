import { connection } from "next/server";
import { listDownloads } from "@/lib/nyaa/download";
import { guardLocal } from "@/lib/nyaa/guard";
import { getQbtConfig, QbtError, qbtDelete, qbtList } from "@/lib/qbittorrent";

/** GET — downloads em andamento/concluídos que vieram do app. Quando um termina, a varredura da biblioteca começa sozinha. */
export async function GET(req: Request) {
  await connection();
  const denied = guardLocal(req, false);
  if (denied) return denied;
  try {
    return Response.json(await listDownloads());
  } catch (e) {
    if (e instanceof QbtError) return Response.json({ error: e.message }, { status: 502 });
    throw e;
  }
}

/** DELETE ?hash=…&files=1 — tira da lista; com files=1 apaga também o que já foi baixado (cancelar). */
export async function DELETE(req: Request) {
  await connection();
  const denied = guardLocal(req, true);
  if (denied) return denied;
  const p = new URL(req.url).searchParams;
  const hash = (p.get("hash") ?? "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hash)) return Response.json({ error: "hash inválido" }, { status: 400 });
  try {
    const cfg = getQbtConfig();
    // só mexe no que o próprio app adicionou
    if (!(await qbtList(cfg)).some((t) => t.hash === hash)) return Response.json({ error: "Download não encontrado." }, { status: 404 });
    await qbtDelete(cfg, hash, p.get("files") === "1");
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof QbtError) return Response.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
