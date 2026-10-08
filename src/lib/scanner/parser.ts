import path from "node:path";

export const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".m4v", ".avi", ".webm", ".mov"]);

export interface ParsedFile {
  /** Título limpo extraído da pasta (preferencial) ou do nome do arquivo. */
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
}

// Tags de release que marcam o fim do título no nome do arquivo/pasta.
const JUNK =
  /\b(2160p|1080p|720p|480p|4k|uhd|bluray|blu-ray|bdrip|brrip|web-?dl|webrip|hdtv|dvdrip|hdrip|x264|x265|h\.?264|h\.?265|hevc|avc|xvid|10bit|8bit|aac|ac3|dts|flac|eac3|atmos|ddp?\d?|remux|proper|repack|extended|unrated|dual|dublado|legendado|nacional)\b/i;

const EPISODE_PATTERNS: Array<{ re: RegExp }> = [
  // S01E02, S1E2, S01E02E03 (pega o primeiro)
  { re: /\bs(\d{1,2})[\s._-]*e(\d{1,4})\b/i },
  // 1x02
  { re: /\b(\d{1,2})x(\d{2,3})\b/i },
  // Season 2 Episode 3 / Temporada 2 Episodio 3
  { re: /\b(?:season|temporada|temp)[\s._-]*(\d{1,2})[\s._-]*(?:episode|episodio|ep|e)[\s._-]*(\d{1,4})\b/i },
];

// Sem temporada no arquivo: "Episode 5", "EP05", "E05", " - 05 ", "[05]"
const EPISODE_ONLY_PATTERNS: RegExp[] = [
  /\b(?:episode|episodio|ep|e)[\s._-]*(\d{1,4})\b/i,
  /\s-\s(\d{1,4})(?:v\d)?(?=\s|\.|\[|\(|$)/,
  /\[(\d{1,3})(?:v\d)?\]/,
];

const SEASON_FOLDER = /^(?:season|temporada|temp|s)[\s._-]*(\d{1,2})$/i;

const YEAR_RE = /[(\[.\s](19\d{2}|20\d{2})(?=[)\].\s]|$)/g;

/** Ano mais provável: o último válido, preferindo o que está entre parênteses/colchetes. */
function findYearMatch(s: string): { year: number; index: number } | null {
  const max = new Date().getFullYear() + 1;
  const all = [...s.matchAll(YEAR_RE)]
    .map((m) => ({ year: Number(m[1]), index: m.index ?? 0, wrapped: m[0][0] === "(" || m[0][0] === "[" }))
    .filter((m) => m.year <= max);
  if (!all.length) return null;
  return all.find((m) => m.wrapped) ?? all[all.length - 1];
}

function findYear(s: string): number | null {
  return findYearMatch(s)?.year ?? null;
}

/** Remove acentos para os regex com \b funcionarem ("Episódio" -> "Episodio"). */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Número de ordem no começo do nome da pasta, com separador explícito: "10. Nome", "01 - Nome", "3) Nome".
 * Exige o espaço depois do separador para não confundir com "12.Monkeys" nem com anos ("2001 - ...").
 */
const ORDER_PREFIX = /^\s*\d{1,3}\s*[.)\-–]\s+(?=\S)/;

export function stripOrderPrefix(name: string): string {
  const rest = name.replace(ORDER_PREFIX, "");
  return /\p{L}/u.test(rest) ? rest : name; // "1. 2024" ficaria sem título: mantém
}

export function cleanTitle(raw: string): string {
  // Detecção roda sobre a versão sem acento (mesmos índices, pois NFC é 1:1); o corte usa o texto original.
  let s = raw.normalize("NFC");
  s = s.replace(/^\s*(\[[^\]]*\]\s*)+/, ""); // tags de fansub no início: [SubsPlease]
  s = stripOrderPrefix(s);
  const f = fold(s);
  const cuts: number[] = [];
  const y = findYearMatch(f);
  if (y && y.index > 0) cuts.push(y.index);
  const j = f.match(JUNK);
  if (j?.index) cuts.push(j.index); // índice 0 = nome começa com a palavra (ex.: "Hevc Show"): não corta
  for (const p of EPISODE_PATTERNS) {
    const m = f.match(p.re);
    if (m?.index !== undefined) cuts.push(m.index);
  }
  const dash = f.match(/\s-\s\d{1,4}(?:v\d)?(?=\s|\.|\[|\(|$)/);
  if (dash?.index !== undefined) cuts.push(dash.index);
  if (cuts.length) s = s.slice(0, Math.min(...cuts));
  return s
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s+-\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Título suspeito: vazio, curto demais ou só números/símbolos. */
export function isSuspectTitle(name: string): boolean {
  const t = name.trim();
  if (t.length < 2) return true;
  return !/\p{L}/u.test(t);
}

function parseEpisode(rawBase: string): { season: number | null; episode: number | null } {
  const base = fold(rawBase);
  for (const p of EPISODE_PATTERNS) {
    const m = base.match(p.re);
    if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  }
  for (const re of EPISODE_ONLY_PATTERNS) {
    const m = base.match(re);
    if (m) return { season: null, episode: Number(m[1]) };
  }
  return { season: null, episode: null };
}

/**
 * @param segments caminho do arquivo relativo à pasta-mãe, ex.:
 *   ["Breaking Bad", "Season 2", "Breaking.Bad.S02E03.720p.mkv"]
 */
export function parseVideoPath(segments: string[]): ParsedFile {
  const file = segments[segments.length - 1];
  const base = path.parse(file).name;
  const dirs = segments.slice(0, -1);

  const parsed = parseEpisode(base);
  const { episode } = parsed;
  let { season } = parsed;

  // Temporada pela pasta ("Season 2", "S02", "Temporada 3") quando o arquivo não traz.
  const titleDir: string | undefined = dirs[0];
  if (dirs.length > 0) {
    const last = dirs[dirs.length - 1];
    const sm = last.match(SEASON_FOLDER);
    if (sm && dirs.length > 1) {
      if (season === null) season = Number(sm[1]);
    }
  }
  // Série de temporada única sem pasta de temporada, mas com episódio: assume T1.
  if (episode !== null && season === null) season = 1;

  const fromDir = titleDir && !SEASON_FOLDER.test(titleDir) ? cleanTitle(titleDir) : "";
  const fromFile = cleanTitle(base);
  const title = fromDir && !isSuspectTitle(fromDir) ? fromDir : fromFile;
  const year = (titleDir ? findYear(titleDir) : null) ?? findYear(base);

  return { title, year, season, episode };
}
