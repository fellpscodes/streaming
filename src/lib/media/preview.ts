import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, episodes, titles } from "@/lib/db";
import { compareEpisodes } from "@/lib/episodes";
import { CACHE_ROOT, ensureDir } from "./cache";
import { probe, type Chapter } from "./ffprobe";
import { segmentsFromChapters } from "./skip";

const run = promisify(execFile);
const LEN = 18; // segundos de prévia
const MARGIN = 5;
const PREVIEWS = path.join(CACHE_ROOT, "previews");

const NOT_STORY = /^(op\s?\d*|opening\b.*|ed\s?\d*|ending\b.*|next\b.*|preview\b.*|previa\b.*|title\b.*|credits?\b.*|creditos\b.*|intro\b.*|abertura\b.*|encerramento\b.*)$/;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Trechos [início, fim] livres depois de tirar as zonas proibidas, em ordem. */
function freeWindows(duration: number, forbidden: Array<[number, number]>): Array<[number, number]> {
  const sorted = forbidden.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const free: Array<[number, number]> = [];
  let cursor = 0;
  for (const [a, b] of sorted) {
    if (a > cursor) free.push([cursor, Math.min(a, duration)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < duration) free.push([cursor, duration]);
  return free;
}

/**
 * Onde cortar a prévia: um trecho da história, longe da abertura, do encerramento, da prévia do próximo episódio e dos
 * créditos (para não entregar spoiler nem repetir a mesma música em todo título). Usa os capítulos do arquivo e prefere o
 * ponto mais próximo de 30% do episódio; sem capítulos, fica ~30%, longe do começo e do fim.
 */
export function pickPreviewStart(duration: number, chapters: Chapter[]): number {
  const target = duration * 0.3;
  const { intro, outro } = segmentsFromChapters(chapters, duration);
  const forbidden: Array<[number, number]> = chapters.filter((c) => NOT_STORY.test(norm(c.title))).map((c) => [c.start, c.end]);
  if (intro) forbidden.push([intro.start, intro.end]);
  if (outro) forbidden.push([outro.start, Math.max(outro.end, duration)]);

  if (forbidden.length) {
    const free = freeWindows(duration, forbidden);
    // 1º: janela com folga de segurança nas pontas; 2º: qualquer janela em que o trecho caiba
    for (const need of [LEN + 2 * MARGIN, LEN]) {
      const fits = free.filter(([a, b]) => b - a >= need);
      if (fits.length) {
        const near = (w: [number, number]) => (target < w[0] ? w[0] - target : target > w[1] ? target - w[1] : 0);
        const best = fits.reduce((x, y) => (near(x) <= near(y) ? x : y));
        const pad = need > LEN ? MARGIN : 0;
        return clamp(target, best[0] + pad, best[1] - LEN - pad);
      }
    }
  }
  if (duration <= LEN + 120) return Math.max(0, (duration - LEN) / 2);
  return clamp(target, 30, duration - LEN - 60);
}

/** Arquivos já gerados deste título (sem tocar no episódio de origem: serve para a Home decidir rápido). */
export function previewFiles(titleId: number): { video: string | null; poster: string | null } {
  let names: string[] = [];
  try {
    names = fs.readdirSync(PREVIEWS);
  } catch {
    /* ainda não existe */
  }
  const find = (ext: string) => names.find((n) => n.startsWith(`${titleId}-`) && n.endsWith(ext));
  const v = find(".mp4");
  const p = find(".jpg");
  return { video: v ? path.join(PREVIEWS, v) : null, poster: p ? path.join(PREVIEWS, p) : null };
}
export const previewReady = (titleId: number) => {
  const f = previewFiles(titleId);
  return Boolean(f.video && f.poster);
};

async function generate(titleId: number) {
  const eps = db.select().from(episodes).where(eq(episodes.titleId, titleId)).all().sort(compareEpisodes);
  const file = eps[0]?.filePath;
  if (!file) return;
  const st = await fsp.stat(file);
  const p = await probe(file);
  if (!p.video || p.duration <= 0) return;

  const start = pickPreviewStart(p.duration, p.chapters);
  const audio = p.audio.find((a) => a.isDefault) ?? p.audio[0];
  const dir = await ensureDir("previews");
  for (const old of fs.readdirSync(dir)) if (old.startsWith(`${titleId}-`)) await fsp.rm(path.join(dir, old), { force: true });
  const base = path.join(dir, `${titleId}-${Math.floor(st.mtimeMs)}`);

  // Vídeo de 18 s em 480p: leve, com som (a Home começa muda e deixa ligar).
  const args = ["-nostdin", "-y", "-v", "error", "-ss", start.toFixed(2), "-t", String(LEN), "-i", file, "-map", `0:${p.video.index}`];
  if (audio) args.push("-map", `0:${audio.index}`);
  args.push(
    "-vf", "scale=-2:480", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
    ...(audio ? ["-c:a", "aac", "-b:a", "96k", "-ac", "2"] : []),
    "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1", "-movflags", "+faststart", "-f", "mp4", `${base}.mp4.part`,
  );
  await run("ffmpeg", args, { timeout: 120_000 });
  // Quadro de alta qualidade para o fundo da Home enquanto o vídeo carrega.
  await run("ffmpeg", ["-nostdin", "-y", "-v", "error", "-ss", (start + 4).toFixed(2), "-i", file, "-map", `0:${p.video.index}`, "-frames:v", "1", "-vf", "scale=1920:-2", "-q:v", "3", `${base}.jpg`], { timeout: 60_000 });
  await fsp.rename(`${base}.mp4.part`, `${base}.mp4`);
}

// ---- fila: uma geração por vez, para não pesar o computador ----
interface Q {
  waiting: number[];
  running: boolean;
  failedAt: Map<number, number>;
}
const g = globalThis as unknown as { __previewQ?: Q };
const q: Q = (g.__previewQ ??= { waiting: [], running: false, failedAt: new Map<number, number>() });
const RETRY_AFTER_MS = 10 * 60 * 1000;

async function drain() {
  if (q.running) return;
  q.running = true;
  try {
    for (let id = q.waiting.shift(); id !== undefined; id = q.waiting.shift()) {
      try {
        await generate(id);
      } catch (e) {
        q.failedAt.set(id, Date.now());
        console.warn(`[prévia] título ${id}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
    }
  } finally {
    q.running = false;
  }
}

export function enqueuePreview(titleId: number): boolean {
  if (previewReady(titleId) || q.waiting.includes(titleId)) return false;
  const failed = q.failedAt.get(titleId);
  if (failed && Date.now() - failed < RETRY_AFTER_MS) return false;
  q.waiting.push(titleId);
  void drain();
  return true;
}

/** Gera, em segundo plano, a prévia de todo título que ainda não tem. */
export function enqueueMissingPreviews(): number {
  let n = 0;
  for (const t of db.select({ id: titles.id }).from(titles).all()) if (enqueuePreview(t.id)) n++;
  return n;
}
