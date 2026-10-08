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

  stripSharedNumbering([...groups.values()]);

  for (const g of groups.values()) {
    const hasEpisodeInfo = g.episodes.some((e) => e.episode !== null);
    g.category = hasEpisodeInfo || g.episodes.length > 1 ? "series" : "movie";
    g.episodes.sort((a, b) => (a.season ?? 99) - (b.season ?? 99) || (a.episode ?? 9999) - (b.episode ?? 9999));
  }
  return [...groups.values()];
}

const NUMBER_SPACE = /^\d{1,3}\s+(?=\S)/;

/**
 * Pastas numeradas só para ordenar ("10 Nome", "11 Outro", sem ponto nem traço): como "12 Monkeys" é um título
 * legítimo, só tira o número quando é claramente um padrão da coleção (3+ pastas e 60% ou mais delas).
 */
function stripSharedNumbering(groups: TitleGroup[]) {
  const folders = groups.filter((g) => !g.sourceKey.startsWith("~")); // episódios soltos na raiz não contam
  const numbered = folders.filter((g) => NUMBER_SPACE.test(g.name) && /\p{L}/u.test(g.name.replace(NUMBER_SPACE, "")));
  if (numbered.length < 3 || numbered.length / folders.length < 0.6) return;
  for (const g of numbered) g.name = g.name.replace(NUMBER_SPACE, "");
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

  // Episódio sem temporada/número NÃO precisa de correção: o nome do arquivo vira o título dele e a
  // lista fica em ordem de nome. Só o nome do título e "vários vídeos em um filme" pedem revisão.
  if (t.category === "movie" && t.episodes.length > 1) {
    reasons.push("Vários vídeos em um título marcado como filme");
  }

  return reasons.length ? { status: "needs_review", reason: reasons.join("; ") } : { status: "ok", reason: null };
}

export { cleanTitle };
