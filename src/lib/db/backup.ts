import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const BACKUP_DIR =
  process.env.BACKUP_DIR ?? path.join(process.env.XDG_DATA_HOME ?? path.join(process.env.HOME ?? ".", ".local", "share"), "streaming-app", "backups");

const PATTERN = /^streaming-(\d{8}-\d{6})\.db$/;
const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export interface BackupOptions {
  dir?: string;
  /** Intervalo mínimo entre backups. */
  everyMs?: number;
  /** Quantos backups manter. */
  keep?: number;
  now?: Date;
}

/**
 * Copia o banco para fora da pasta do projeto, no máximo uma vez a cada `everyMs`, mantendo os `keep`
 * mais recentes. Usa a API de backup do SQLite: a cópia é consistente mesmo com o servidor escrevendo.
 * Devolve o caminho criado, ou null se não era hora (ou o banco ainda está vazio).
 */
export async function backupIfDue(sqlite: Database.Database, opts: BackupOptions = {}): Promise<string | null> {
  const { dir = BACKUP_DIR, everyMs = 12 * 3600_000, keep = 10, now = new Date() } = opts;
  // Banco sem nada cadastrado não vale um backup (e não empurra os bons para fora da rotação).
  const hasData = (sqlite.prepare("SELECT (SELECT COUNT(*) FROM library_folders) + (SELECT COUNT(*) FROM titles) AS n").get() as { n: number }).n > 0;
  if (!hasData) return null;

  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).filter((n) => PATTERN.test(n)).sort();
  const last = existing.at(-1);
  if (last && now.getTime() - fs.statSync(path.join(dir, last)).mtimeMs < everyMs) return null;

  const dest = path.join(dir, `streaming-${stamp(now)}.db`);
  await sqlite.backup(dest);
  // A cópia herda o modo WAL do original; troca para o modo comum para ser um arquivo único (sem -wal/-shm).
  const copy = new Database(dest);
  copy.pragma("journal_mode = DELETE");
  copy.close();
  for (const old of [...existing, path.basename(dest)].sort().slice(0, -keep)) fs.rmSync(path.join(dir, old), { force: true });
  return dest;
}
