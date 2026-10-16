import fs from "node:fs/promises";
import path from "node:path";
import { db, libraryFolders } from "@/lib/db";
import { showName } from "@/lib/nyaa/parse";
import { startScan } from "@/lib/scanner/scan";
import { getQbtConfig, qbtAddMagnet, qbtList, toDownloadView, type DownloadView } from "@/lib/qbittorrent";

export class DownloadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Folder = typeof libraryFolders.$inferSelect;

/** Pasta de destino padrão: a primeira marcada como anime; se não houver, a primeira cadastrada. */
export function defaultFolder(folders: Folder[]): Folder | undefined {
  return folders.find((f) => f.kind === "anime") ?? folders[0];
}

/** Nome da subpasta do título: o nome limpo da release, seguro para qualquer sistema de arquivos. */
export function showFolderName(releaseTitle: string): string {
  const name = showName(releaseTitle)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120)
    .trim();
  return name || "Nyaa";
}

const BTIH = /^magnet:\?(?:.*&)?xt=urn:btih:[0-9a-f]{40}(?:&|$)/i;

export interface AddInput {
  magnet: string;
  title: string;
  folderId?: number;
}

/** Manda o magnet ao qBittorrent para <pasta da biblioteca>/<nome do anime>. Devolve onde vai salvar. */
export async function addDownload({ magnet, title, folderId }: AddInput): Promise<{ savePath: string; alreadyAdded: boolean }> {
  if (!BTIH.test(magnet)) throw new DownloadError("Link magnet inválido.");
  const folders = db.select().from(libraryFolders).all();
  if (folders.length === 0) throw new DownloadError("Cadastre uma pasta de biblioteca em Configurações antes de baixar.");
  const folder = folderId == null ? defaultFolder(folders) : folders.find((f) => f.id === folderId);
  if (!folder) throw new DownloadError("Pasta de destino não encontrada.");
  if (!(await fs.stat(folder.path).catch(() => null))?.isDirectory()) {
    throw new DownloadError(`A pasta ${folder.path} não está acessível agora (HD desmontado?).`);
  }

  const cfg = getQbtConfig();
  const hash = magnet.match(/btih:([0-9a-f]{40})/i)![1].toLowerCase();
  if ((await qbtList(cfg)).some((t) => t.hash === hash)) return { savePath: folder.path, alreadyAdded: true };

  const savePath = path.join(folder.path, showFolderName(title));
  await qbtAddMagnet(cfg, magnet, savePath);
  return { savePath, alreadyAdded: false };
}

// Hashes que já vimos concluídos. Na primeira consulta só "aprende" o que já estava pronto, sem escanear.
const g = globalThis as unknown as { __nyaaDone?: Set<string> };

/** Lista os downloads do app e, quando algum acaba de concluir, dispara a varredura para ele entrar no catálogo. */
export async function listDownloads(): Promise<{ downloads: DownloadView[]; scanStarted: boolean }> {
  const downloads = (await qbtList(getQbtConfig())).map(toDownloadView).sort((a, b) => Number(a.phase === "done") - Number(b.phase === "done"));
  const doneNow = downloads.filter((d) => d.phase === "done").map((d) => d.hash);
  let scanStarted = false;
  if (!g.__nyaaDone) {
    g.__nyaaDone = new Set(doneNow);
  } else {
    const fresh = doneNow.filter((h) => !g.__nyaaDone!.has(h));
    // se já há uma varredura em andamento, tenta de novo na próxima consulta (ela pode ter começado antes do fim do download)
    if (fresh.length && (scanStarted = await startScan())) for (const h of fresh) g.__nyaaDone.add(h);
  }
  return { downloads, scanStarted };
}
