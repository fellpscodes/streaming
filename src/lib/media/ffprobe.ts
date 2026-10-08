import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface AudioStream {
  index: number;
  codec: string;
  channels: number | null;
  lang: string | null;
  title: string | null;
  isDefault: boolean;
}
export interface SubStream {
  index: number;
  codec: string;
  lang: string | null;
  title: string | null;
  isDefault: boolean;
  forced: boolean;
}
export interface Attachment {
  index: number;
  filename: string;
  mimetype: string | null;
}
export interface Chapter {
  start: number;
  end: number;
  title: string;
}
export interface ProbeResult {
  duration: number;
  chapters: Chapter[];
  video: { index: number; codec: string; pixFmt: string | null; width: number; height: number } | null;
  audio: AudioStream[];
  subs: SubStream[];
  attachments: Attachment[];
}

interface RawStream {
  index: number;
  codec_type: string;
  codec_name?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  channels?: number;
  disposition?: Record<string, number>;
  tags?: Record<string, string>;
}

const tag = (s: RawStream, k: string) => {
  const t = s.tags ?? {};
  const key = Object.keys(t).find((x) => x.toLowerCase() === k);
  return key ? t[key] : null;
};

interface RawChapter {
  start_time?: string;
  end_time?: string;
  tags?: Record<string, string>;
}

export function parseProbe(json: { streams?: RawStream[]; format?: { duration?: string }; chapters?: RawChapter[] }): ProbeResult {
  const streams = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  return {
    duration: Number(json.format?.duration) || 0,
    chapters: (json.chapters ?? []).map((c) => ({
      start: Number(c.start_time) || 0,
      end: Number(c.end_time) || 0,
      title: c.tags?.title ?? c.tags?.TITLE ?? "",
    })),
    video: video
      ? { index: video.index, codec: video.codec_name ?? "", pixFmt: video.pix_fmt ?? null, width: video.width ?? 0, height: video.height ?? 0 }
      : null,
    audio: streams
      .filter((s) => s.codec_type === "audio")
      .map((s) => ({
        index: s.index,
        codec: s.codec_name ?? "",
        channels: s.channels ?? null,
        lang: tag(s, "language"),
        title: tag(s, "title"),
        isDefault: Boolean(s.disposition?.default),
      })),
    subs: streams
      .filter((s) => s.codec_type === "subtitle")
      .map((s) => ({
        index: s.index,
        codec: s.codec_name ?? "",
        lang: tag(s, "language"),
        title: tag(s, "title"),
        isDefault: Boolean(s.disposition?.default),
        forced: Boolean(s.disposition?.forced),
      })),
    attachments: streams
      .filter((s) => s.codec_type === "attachment")
      .map((s) => ({ index: s.index, filename: tag(s, "filename") ?? `attachment-${s.index}`, mimetype: tag(s, "mimetype") })),
  };
}

const cache = new Map<string, ProbeResult>();

/** ffprobe com cache por caminho+mtime (o arquivo não muda entre cliques). */
export async function probe(file: string): Promise<ProbeResult> {
  const st = await fs.stat(file);
  const key = `${file}:${st.mtimeMs}:${st.size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", "-show_chapters", file], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const res = parseProbe(JSON.parse(stdout));
  cache.set(key, res);
  return res;
}
