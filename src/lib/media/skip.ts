import type { SkipMarks } from "@/lib/db/schema";
import type { Chapter } from "./ffprobe";

export interface Segment {
  start: number;
  end: number;
  /** chapters = capítulos do arquivo (por episódio); manual = marcado por você (vale para o título). */
  source: "chapters" | "manual";
}
export interface SkipInfo {
  intro: Segment | null;
  outro: Segment | null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// "OP", "OP2", "Opening", "Opening Theme", "Intro", "Abertura" / "ED", "Ending", "Encerramento", "Credits", "End Credits"
const INTRO = /^(op\s?\d*|opening(\b.*)?|intro\w*(\s.*)?|abertura\b.*)$/; // intro, introdução, introduction
const OUTRO = /^(ed\s?\d*|ending(\b.*)?|outro\b.*|encerramento\b.*|(end\s)?credits?\b.*|creditos\b.*|closing\b.*)$/;

/** Abertura e encerramento pelos nomes dos capítulos. Descarta trechos absurdos (curtos demais ou o filme inteiro). */
export function segmentsFromChapters(chapters: Chapter[], duration: number): SkipInfo {
  const find = (re: RegExp) => chapters.find((c) => re.test(norm(c.title)) && c.end > c.start);
  const intro = find(INTRO);
  const outro = find(OUTRO);
  const ok = (c: Chapter | undefined, min: number, max: number) => c && c.end - c.start >= min && c.end - c.start <= max;
  return {
    intro: ok(intro, 15, 300) ? { start: intro!.start, end: intro!.end, source: "chapters" } : null,
    // o encerramento pode ir até o fim do vídeo; só importa onde ele começa
    outro: outro && outro.start > 0 && (duration <= 0 || outro.start < duration - 5) ? { start: outro.start, end: outro.end || duration, source: "chapters" } : null,
  };
}

/** Capítulos do arquivo têm prioridade (são por episódio); as marcas manuais cobrem o que faltar. */
export function resolveSkip(chapters: Chapter[], duration: number, manual: SkipMarks | null | undefined): SkipInfo {
  const fromChapters = segmentsFromChapters(chapters, duration);
  const m = manual ?? {};
  const intro =
    fromChapters.intro ??
    (m.introStart != null && m.introEnd != null && m.introEnd > m.introStart
      ? { start: m.introStart, end: m.introEnd, source: "manual" as const }
      : null);
  const outro = fromChapters.outro ?? (m.outroStart != null ? { start: m.outroStart, end: duration, source: "manual" as const } : null);
  return { intro, outro };
}

/** Valida e junta uma atualização parcial das marcas manuais (null apaga o campo). */
export function mergeMarks(current: SkipMarks | null | undefined, patch: SkipMarks): SkipMarks | { error: string } {
  const next: SkipMarks = { ...(current ?? {}) };
  for (const k of ["introStart", "introEnd", "outroStart"] as const) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null) delete next[k];
    else if (typeof v === "number" && Number.isFinite(v) && v >= 0) next[k] = Math.round(v * 10) / 10;
    else return { error: `Valor inválido para ${k}.` };
  }
  if (next.introStart != null && next.introEnd != null && next.introEnd <= next.introStart) {
    return { error: "O fim da abertura precisa vir depois do início." };
  }
  return next;
}
