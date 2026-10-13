import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { CACHE_ROOT, ensureDir, exists, pruneVideoCache, touch } from "./cache";
import { probe, type ProbeResult } from "./ffprobe";
import { ffmpegArgs, makePlan, type Mode, type PlayPlan } from "./plan";

export interface PlayOptions {
  audioIndex?: number | null;
  mode?: Mode;
}

export type PrepareState =
  | { state: "ready"; plan: PlayPlan }
  | { state: "preparing"; progress: number; plan: PlayPlan }
  | { state: "error"; error: string };

interface Job {
  progress: number;
  error?: string;
  done: boolean;
}
const g = globalThis as unknown as { __jobs?: Map<string, Job> };
const jobs = (g.__jobs ??= new Map<string, Job>());

/** No máximo 2 conversões ao mesmo tempo: pular vários episódios seguidos não pode travar o disco nem a máquina. */
const MAX_JOBS = 2;
const gq = globalThis as unknown as { __slots?: { running: number; waiting: Array<() => void> } };
const slots = (gq.__slots ??= { running: 0, waiting: [] });
function acquire(): Promise<void> {
  if (slots.running < MAX_JOBS) {
    slots.running++;
    return Promise.resolve();
  }
  return new Promise((res) => slots.waiting.push(() => { slots.running++; res(); }));
}
function release() {
  slots.running--;
  slots.waiting.shift()?.();
}

/** Arquivo que será entregue ao navegador para este episódio+opções (original ou remux em cache). */
export async function playablePath(episodeId: number, file: string, p: ProbeResult, plan: PlayPlan) {
  if (plan.direct) return file;
  const st = await fs.stat(file);
  const dir = path.join(CACHE_ROOT, "play");
  return path.join(dir, `${episodeId}-${Math.floor(st.mtimeMs)}-${plan.variant}.mp4`);
}

/**
 * Garante que o vídeo tocável existe. Idempotente: chamadas repetidas só consultam o andamento.
 * Remux copia o vídeo bit a bit (sem perda); só recodifica se o navegador não decodifica o original.
 */
export async function prepare(episodeId: number, file: string, opts: PlayOptions = {}): Promise<PrepareState> {
  let p: ProbeResult;
  try {
    p = await probe(file);
  } catch {
    return { state: "error", error: "Não foi possível ler o arquivo (existe? ffprobe instalado?)." };
  }
  const plan = makePlan(file, p, opts);
  const out = await playablePath(episodeId, file, p, plan);
  await ensureDir("play");
  if (plan.direct) return { state: "ready", plan };
  if (await exists(out)) {
    void touch(out);
    return { state: "ready", plan };
  }

  // Daqui até jobs.set() NÃO pode haver await: duas chamadas simultâneas (ex.: React em dev)
  // não podem iniciar dois ffmpeg escrevendo no mesmo arquivo.
  const job = jobs.get(out);
  if (job && !job.done) return { state: "preparing", progress: job.progress, plan };
  if (job?.error) {
    jobs.delete(out); // permite tentar de novo na próxima chamada, mas reporta o erro uma vez
    return { state: "error", error: job.error };
  }

  const j: Job = { progress: 0, done: false };
  jobs.set(out, j);
  const tmp = `${out}.part`;
  void acquire().then(() => run(out, tmp, file, plan, p, j));
  return { state: "preparing", progress: 0, plan };
}

function run(out: string, tmp: string, file: string, plan: PlayPlan, p: ProbeResult, j: Job) {
  const child = spawn("ffmpeg", ffmpegArgs(file, tmp, plan, p.video?.codec ?? ""), { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    for (const m of buf.matchAll(/out_time_us=(\d+)/g)) {
      if (p.duration > 0) j.progress = Math.min(0.99, Number(m[1]) / 1e6 / p.duration);
    }
    buf = buf.slice(-200);
  });
  child.on("error", (e) => {
    j.error = `ffmpeg não pôde ser iniciado: ${e.message}`;
    j.done = true;
    release();
  });
  child.on("close", async (code) => {
    release();
    if (code === 0) {
      await fs.rename(tmp, out);
      jobs.delete(out);
      void pruneVideoCache(out);
    } else {
      await fs.rm(tmp, { force: true });
      j.error = `ffmpeg falhou (${code}): ${stderr.trim().split("\n").slice(-2).join(" ")}`;
      j.done = true;
    }
  });
}
