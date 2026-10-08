import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface Listing {
  path: string;
  parent: string | null;
  dirs: string[];
}

/** Lista só as subpastas (sem arquivos nem ocultas) para o seletor de pastas. */
export async function listDirs(raw?: string | null): Promise<Listing> {
  const p = path.resolve(raw && path.isAbsolute(raw) ? raw : os.homedir());
  const st = await fs.stat(p).catch(() => null);
  if (!st?.isDirectory()) throw new BrowseError("Pasta não encontrada.", 404);
  let entries;
  try {
    entries = await fs.readdir(p, { withFileTypes: true });
  } catch {
    throw new BrowseError("Sem permissão para ler esta pasta.", 403);
  }
  const dirs: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    // symlink para pasta também conta (HDs montados costumam ser links)
    const isDir = e.isDirectory() || (e.isSymbolicLink() && (await fs.stat(path.join(p, e.name)).then((s) => s.isDirectory(), () => false)));
    if (isDir) dirs.push(e.name);
  }
  dirs.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const parent = path.dirname(p);
  return { path: p, parent: parent === p ? null : parent, dirs };
}

export class BrowseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
