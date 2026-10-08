import type { Category } from "@/lib/db/schema";
import { cleanTitle, isSuspectTitle, parseVideoPath } from "./parser";

export interface FoundFile {
  absPath: string;
  /** Relativo à pasta-mãe. */
  segments: string[];
}

export interface GroupedEpisode {
  filePath: string;
  season: number | null;
  episode: number | null;
}

export interface TitleGroup {
  sourceKey: string;
  name: string;
  year: number | null;
  category: Category;
  episodes: GroupedEpisode[];
}

/** Agrupa arquivos por título: uma subpasta = um título; arquivos soltos na raiz viram o próprio título. */
export function groupFiles(files: FoundFile[]): TitleGroup[] {
  const groups = new Map<string, TitleGroup>();

  for (const f of files) {
    const parsed = parseVideoPath(f.segments);
    const inFolder = f.segments.length > 1;
    let key: string;
    if (inFolder) key = f.segments[0];
    else if (parsed.episode !== null) key = `~${parsed.title.toLowerCase()}`; // episódios soltos do mesmo título
    else key = f.segments[0];

    let g = groups.get(key);
    if (!g) {
      g = {
        sourceKey: key,
        name: parsed.title,
        year: parsed.year,
        category: "movie",
        episodes: [],
      };
      groups.set(key, g);
    }
    if (g.year === null) g.year = parsed.year;
    g.episodes.push({ filePath: f.absPath, season: parsed.season, episode: parsed.episode });
  }

  for (const g of groups.values()) {
    const hasEpisodeInfo = g.episodes.some((e) => e.episode !== null);
    g.category = hasEpisodeInfo || g.episodes.length > 1 ? "series" : "movie";
    g.episodes.sort((a, b) => (a.season ?? 99) - (b.season ?? 99) || (a.episode ?? 9999) - (b.episode ?? 9999));
  }
  return [...groups.values()];
}

export interface Evaluation {
  status: "ok" | "needs_review";
  reason: string | null;
}

/** Decide se um título precisa de correção manual. Compartilhado entre scan e edição manual. */
export function evaluateTitle(t: {
  name: string;
  manual: boolean;
  category: Category;
  episodes: Array<{ season: number | null; episode: number | null }>;
}): Evaluation {
  const reasons: string[] = [];
  if (!t.manual && isSuspectTitle(t.name)) reasons.push("Nome do título não reconhecido");

  if (t.category !== "movie") {
    // Um único arquivo sem número (filme/OVA numa pasta de séries ou animes) é normal, não é erro.
    const missing = t.episodes.length > 1 ? t.episodes.filter((e) => e.episode === null || e.season === null).length : 0;
    if (missing > 0) reasons.push(`${missing} arquivo(s) sem temporada/episódio reconhecido`);
    const seen = new Set<string>();
    let dup = 0;
    for (const e of t.episodes) {
      if (e.episode === null || e.season === null) continue;
      const k = `${e.season}:${e.episode}`;
      if (seen.has(k)) dup++;
      seen.add(k);
    }
    if (dup > 0) reasons.push(`${dup} episódio(s) duplicado(s)`);
  } else if (t.episodes.length > 1) {
    reasons.push("Vários vídeos em um título marcado como filme");
  }

  return reasons.length ? { status: "needs_review", reason: reasons.join("; ") } : { status: "ok", reason: null };
}

export { cleanTitle };
