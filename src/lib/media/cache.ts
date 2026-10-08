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

/** Mantém o cache de vídeos abaixo do limite, apagando os menos recentes. `keep` nunca é apagado. */
export async function pruneVideoCache(keep: string) {
  const dir = path.join(CACHE_ROOT, "play");
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const files = (
    await Promise.all(
      names
        .filter((n) => n.endsWith(".mp4"))
        .map(async (n) => ({ p: path.join(dir, n), st: await fs.stat(path.join(dir, n)) })),
    )
  ).sort((a, b) => b.st.atimeMs - a.st.atimeMs);
  let total = 0;
  for (const f of files) {
    total += f.st.size;
    if (total > LIMIT_BYTES && f.p !== keep) await fs.rm(f.p, { force: true });
  }
}
