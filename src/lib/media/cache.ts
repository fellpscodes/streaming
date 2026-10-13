import fs from "node:fs/promises";
import path from "node:path";

export const CACHE_ROOT = process.env.CACHE_DIR ?? path.join(process.cwd(), "data", "cache");
const LIMIT_BYTES = Number(process.env.STREAM_CACHE_GB ?? 30) * 1024 ** 3;

export async function ensureDir(sub: string) {
  const dir = path.join(CACHE_ROOT, sub);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export const exists = (p: string) => fs.access(p).then(() => true, () => false);

const lastTouch = new Map<string, number>();
/**
 * Marca o arquivo como "em uso agora". O disco costuma ser montado sem registrar acessos (noatime), então a limpeza
 * do cache não pode confiar no último acesso: sem isto ela apagava o episódio que você estava assistindo.
 */
export async function touch(file: string) {
  const now = Date.now();
  if (now - (lastTouch.get(file) ?? 0) < 30_000) return;
  lastTouch.set(file, now);
  const d = new Date(now);
  await fs.utimes(file, d, d).catch(() => {});
}

/** Arquivos usados há menos disto nunca são apagados, mesmo com o cache acima do limite. */
const PROTECT_MS = 6 * 3600_000;

/** Mantém o cache de vídeos abaixo do limite, apagando os menos recentes. `keep` e o que foi usado há pouco nunca são apagados. */
export async function pruneVideoCache(keep: string) {
  const dir = path.join(CACHE_ROOT, "play");
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const files = (
    await Promise.all(
      names
        .filter((n) => n.endsWith(".mp4"))
        .map(async (n) => ({ p: path.join(dir, n), st: await fs.stat(path.join(dir, n)) })),
    )
  ).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  let total = 0;
  for (const f of files) {
    total += f.st.size;
    if (total > LIMIT_BYTES && f.p !== keep && Date.now() - f.st.mtimeMs > PROTECT_MS) await fs.rm(f.p, { force: true });
  }
}
