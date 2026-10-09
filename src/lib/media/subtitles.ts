import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ensureDir, exists } from "./cache";
import { probe } from "./ffprobe";

const run = promisify(execFile);

export interface SubTrack {
  id: string;
  label: string;
  /** ass = renderizado pelo libass (JASSUB), preserva estilo/posição; vtt = <track> nativo. */
  format: "ass" | "vtt";
  isDefault: boolean;
  origin: "embedded" | "external";
  /** Idioma por extenso ("Português"), quando dá para saber; usado para casar a legenda entre episódios. */
  lang: string | null;
}
export interface FontFile {
  name: string;
}

const LANG: Record<string, string> = {
  por: "Português", pt: "Português", ptbr: "Português (Brasil)", eng: "Inglês", en: "Inglês", jpn: "Japonês", ja: "Japonês",
  spa: "Espanhol", es: "Espanhol", fre: "Francês", fra: "Francês", ger: "Alemão", deu: "Alemão", ita: "Italiano", kor: "Coreano", chi: "Chinês", zho: "Chinês",
};
const TEXT_CODECS = new Set(["ass", "ssa", "subrip", "srt", "webvtt", "mov_text", "text"]);
const EXT = new Set([".srt", ".vtt", ".ass", ".ssa"]);
const SUB_DIRS = /^(subs?|subtitles?|legendas?)$/i;
const FONT_EXT = /\.(ttf|otf|ttc|woff2?)$/i;

/** Sidecars: mesmo nome do vídeo (+ sufixo de idioma), na pasta do vídeo ou em Subs/Legendas. */
async function externalFiles(video: string): Promise<string[]> {
  const dir = path.dirname(video);
  const base = path.parse(video).name.toLowerCase();
  const dirs = [dir];
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory() && SUB_DIRS.test(e.name)) dirs.push(path.join(dir, e.name));
  }
  const out: string[] = [];
  for (const d of dirs) {
    for (const n of (await fs.readdir(d).catch(() => [])).sort()) {
      if (EXT.has(path.extname(n).toLowerCase()) && n.toLowerCase().startsWith(base)) out.push(path.join(d, n));
    }
  }
  return out;
}

function externalLabel(video: string, file: string) {
  const rest = path.parse(file).name.slice(path.parse(video).name.length).replace(/^[\s._-]+/, "");
  return LANG[rest.toLowerCase().replace(/[-_]/g, "")] ?? (rest || "Externa");
}

export async function listSubtitles(video: string): Promise<{ tracks: SubTrack[]; fonts: FontFile[] }> {
  const p = await probe(video);
  const tracks: SubTrack[] = [];
  for (const s of p.subs) {
    if (!TEXT_CODECS.has(s.codec)) continue; // PGS/DVD são imagem: não dá para renderizar como texto
    const lang = s.lang ? (LANG[s.lang.toLowerCase()] ?? s.lang) : null;
    tracks.push({
      lang,
      id: `e${s.index}`,
      label: [lang, s.title].filter(Boolean).join(" · ") || `Faixa ${s.index}`,
      format: s.codec === "webvtt" ? "vtt" : "ass",
      isDefault: s.isDefault,
      origin: "embedded",
    });
  }
  (await externalFiles(video)).forEach((f, i) => {
    const label = externalLabel(video, f);
    tracks.push({
      lang: Object.values(LANG).includes(label) ? label : null,
      id: `x${i}`,
      label,
      format: path.extname(f).toLowerCase() === ".vtt" ? "vtt" : "ass",
      isDefault: false,
      origin: "external",
    });
  });
  const fonts = p.attachments.filter((a) => FONT_EXT.test(a.filename) || /font/i.test(a.mimetype ?? "")).map((a) => ({ name: a.filename }));
  return { tracks, fonts };
}

/** Decodifica o sidecar para UTF-8 (BOM, UTF-8 ou Windows-1252, comum em .srt antigos). */
export function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export interface SubFile {
  path: string;
  contentType: string;
}

/**
 * Entrega a legenda pronta. ASS/SSA saem IDÊNTICOS ao original (estilos, posição e efeitos intactos);
 * SRT e legendas de outros formatos são convertidos para ASS pelo ffmpeg, mantendo itálico/cor/posição.
 */
export async function subtitleFile(episodeId: number, video: string, trackId: string): Promise<SubFile | null> {
  const st = await fs.stat(video);
  const key = `${episodeId}-${Math.floor(st.mtimeMs)}`;
  const dir = await ensureDir("subs");
  const kind = trackId[0];
  const n = Number(trackId.slice(1));
  if (!Number.isInteger(n)) return null;

  if (kind === "e") {
    const p = await probe(video);
    const s = p.subs.find((x) => x.index === n);
    if (!s || !TEXT_CODECS.has(s.codec)) return null;
    const isVtt = s.codec === "webvtt";
    const out = path.join(dir, `${key}-s${n}.${isVtt ? "vtt" : "ass"}`);
    if (!(await exists(out))) {
      // ass/ssa: copia a faixa sem tocar no script; demais formatos: converte para ASS.
      const codec = s.codec === "ass" || s.codec === "ssa" ? "copy" : isVtt ? "webvtt" : "ass";
      await run("ffmpeg", ["-nostdin", "-y", "-v", "error", "-i", video, "-map", `0:${n}`, "-c:s", codec, `${out}.part.${isVtt ? "vtt" : "ass"}`]);
      await fs.rename(`${out}.part.${isVtt ? "vtt" : "ass"}`, out);
    }
    return { path: out, contentType: isVtt ? "text/vtt; charset=utf-8" : "text/x-ssa; charset=utf-8" };
  }

  if (kind === "x") {
    const file = (await externalFiles(video))[n];
    if (!file) return null;
    const ext = path.extname(file).toLowerCase();
    const text = decodeText(await fs.readFile(file));
    if (ext === ".vtt") {
      const out = path.join(dir, `${key}-x${n}.vtt`);
      await fs.writeFile(out, text);
      return { path: out, contentType: "text/vtt; charset=utf-8" };
    }
    if (ext === ".ass" || ext === ".ssa") {
      const out = path.join(dir, `${key}-x${n}.ass`);
      await fs.writeFile(out, text); // conteúdo original, só normalizado para UTF-8
      return { path: out, contentType: "text/x-ssa; charset=utf-8" };
    }
    const src = path.join(dir, `${key}-x${n}.utf8.srt`);
    const out = path.join(dir, `${key}-x${n}.ass`);
    await fs.writeFile(src, text);
    await run("ffmpeg", ["-nostdin", "-y", "-v", "error", "-i", src, out]);
    return { path: out, contentType: "text/x-ssa; charset=utf-8" };
  }
  return null;
}

/** Extrai as fontes anexadas ao MKV (necessárias para o ASS ficar como o autor fez). */
const dumping = new Map<string, Promise<void>>();

/** Extrai TODAS as fontes anexadas de uma vez (um só ffmpeg); o player pede dezenas delas ao abrir o episódio. */
function dumpFonts(key: string, dir: string, video: string, atts: Array<{ index: number; filename: string }>): Promise<void> {
  let job = dumping.get(key);
  if (!job) {
    const args = ["-nostdin", "-y", "-v", "error"];
    for (const a of atts) args.push(`-dump_attachment:${a.index}`, path.join(dir, `${a.index}${path.extname(a.filename).toLowerCase()}`));
    args.push("-i", video);
    // -dump_attachment grava e depois o ffmpeg reclama que falta saída; os arquivos já foram escritos.
    job = run("ffmpeg", args, { maxBuffer: 8 * 1024 * 1024 }).then(() => {}, () => {}).finally(() => dumping.delete(key));
    dumping.set(key, job);
  }
  return job;
}

export async function fontFile(episodeId: number, video: string, name: string): Promise<string | null> {
  const p = await probe(video);
  const att = p.attachments.find((a) => a.filename === name && FONT_EXT.test(a.filename));
  if (!att) return null; // só nomes que existem no arquivo: nada vindo do cliente vira caminho
  const st = await fs.stat(video);
  const dir = await ensureDir(path.join("fonts", `${episodeId}-${Math.floor(st.mtimeMs)}`));
  const out = path.join(dir, `${att.index}${path.extname(att.filename).toLowerCase()}`);
  if (!(await exists(out))) {
    const fonts = p.attachments.filter((a) => FONT_EXT.test(a.filename) || /font/i.test(a.mimetype ?? ""));
    await dumpFonts(dir, dir, video, fonts);
  }
  return (await exists(out)) ? out : null;
}
