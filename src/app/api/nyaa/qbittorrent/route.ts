import { connection } from "next/server";
import { db, libraryFolders } from "@/lib/db";
import { defaultFolder } from "@/lib/nyaa/download";
import { guardLocal } from "@/lib/nyaa/guard";
import { getQbtConfig, normalizeQbtUrl, QbtError, qbtVersion, saveQbtConfig } from "@/lib/qbittorrent";

/** Estado da conexão (a senha nunca sai daqui) e as pastas onde dá para baixar. */
async function status() {
  const cfg = getQbtConfig();
  const folders = db.select().from(libraryFolders).all();
  let connected = false;
  let version: string | null = null;
  let error: string | null = null;
  try {
    version = await qbtVersion(cfg);
    connected = true;
  } catch (e) {
    if (!(e instanceof QbtError)) throw e;
    error = e.message;
  }
  return {
    connected,
    version,
    error,
    config: { url: cfg.url, username: cfg.username, hasPassword: cfg.password !== "" },
    folders: folders.map((f) => ({ id: f.id, path: f.path, kind: f.kind })),
    defaultFolderId: defaultFolder(folders)?.id ?? null,
  };
}

export async function GET(req: Request) {
  await connection();
  const denied = guardLocal(req, false);
  if (denied) return denied;
  return Response.json(await status());
}

/** PUT { url, username, password? } — salva a conexão e já testa. Sem `password`, mantém a senha atual. */
export async function PUT(req: Request) {
  await connection();
  const denied = guardLocal(req, true);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { url?: unknown; username?: unknown; password?: unknown };
  if (typeof body.url !== "string" || typeof body.username !== "string") return Response.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const current = getQbtConfig();
    saveQbtConfig({
      url: normalizeQbtUrl(body.url),
      username: body.username.trim(),
      password: typeof body.password === "string" ? body.password : current.password,
    });
  } catch (e) {
    if (e instanceof QbtError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return Response.json(await status());
}
