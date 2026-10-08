import path from "node:path";
import type { ProbeResult } from "./ffprobe";

/** Áudio que o navegador toca dentro de MP4 sem reprocessar. */
const COPY_AUDIO = new Set(["aac", "mp3", "opus", "flac", "vorbis"]);
/** Vídeo que o navegador decodifica de forma confiável; HEVC também é copiado (depende do hardware). */
const COPY_VIDEO = new Set(["h264", "vp9", "av1", "hevc"]);
const DIRECT_EXT = new Set([".mp4", ".m4v", ".mov", ".webm"]);

export type Mode = "auto" | "compat";

export interface PlayPlan {
  /** Toca o arquivo original, sem gerar cópia. */
  direct: boolean;
  videoIndex: number;
  audioIndex: number | null;
  /** copy = bit a bit, sem perda. x264 = recodifica (só se o navegador não tem como decodificar). */
  video: "copy" | "x264";
  /** copy = sem perda. aac = codec que o navegador não toca (AC3/DTS...), convertido em alta taxa. */
  audio: "copy" | "aac" | "none";
  /** Chave estável do arquivo gerado (vai no nome do cache). */
  variant: string;
}

export function makePlan(file: string, p: ProbeResult, opts: { audioIndex?: number | null; mode?: Mode } = {}): PlayPlan {
  if (!p.video) throw new Error("Arquivo sem faixa de vídeo");
  const mode = opts.mode ?? "auto";
  const audio = p.audio.find((a) => a.index === opts.audioIndex) ?? p.audio.find((a) => a.isDefault) ?? p.audio[0] ?? null;

  // H.264 de 10 bits (Hi10P, comum em anime), MPEG-4/XviD, VC-1 etc. não rodam no navegador.
  const tenBit = /10|12/.test(p.video.pixFmt ?? "");
  const videoOk = COPY_VIDEO.has(p.video.codec) && !(p.video.codec === "h264" && tenBit);
  const video: PlayPlan["video"] = mode === "compat" || !videoOk ? "x264" : "copy";
  const audioMode: PlayPlan["audio"] = !audio ? "none" : COPY_AUDIO.has(audio.codec) ? "copy" : "aac";

  const ext = path.extname(file).toLowerCase();
  const isFirstAudio = !audio || audio.index === (p.audio.find((a) => a.isDefault) ?? p.audio[0]).index;
  const direct = DIRECT_EXT.has(ext) && video === "copy" && audioMode !== "aac" && isFirstAudio;

  return {
    direct,
    videoIndex: p.video.index,
    audioIndex: audio?.index ?? null,
    video,
    audio: audioMode,
    variant: `v${video}-a${audio?.index ?? "n"}${audioMode === "aac" ? "aac" : ""}`,
  };
}

export function ffmpegArgs(input: string, output: string, plan: PlayPlan, videoCodec: string): string[] {
  const args = ["-nostdin", "-y", "-v", "error", "-progress", "pipe:1", "-nostats", "-i", input, "-map", `0:${plan.videoIndex}`];
  if (plan.audioIndex != null) args.push("-map", `0:${plan.audioIndex}`);
  if (plan.video === "copy") {
    args.push("-c:v", "copy");
    if (videoCodec === "hevc") args.push("-tag:v", "hvc1"); // exigido para o navegador reconhecer HEVC em MP4
  } else {
    // CRF 16 com x264: visualmente transparente; 8 bits yuv420p para o navegador decodificar.
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-profile:v", "high");
  }
  if (plan.audio === "copy") args.push("-c:a", "copy");
  else if (plan.audio === "aac") args.push("-c:a", "aac", "-b:a", "384k");
  args.push("-sn", "-dn", "-map_metadata", "-1", "-movflags", "+faststart", "-f", "mp4", output);
  return args;
}
