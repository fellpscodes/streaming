import type { CastMember } from "@/lib/db/schema";

export interface Metadata {
  source: "tmdb" | "anilist" | "jikan";
  tmdbId?: number;
  anilistId?: number;
  malId?: number;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  /** 0–10 */
  rating: number | null;
  genres: string[];
  cast: CastMember[];
  year: number | null;
  /** Japonês + animação: usado para reclassificar série/filme como anime. */
  looksLikeAnime?: boolean;
}

export interface Query {
  name: string;
  year: number | null;
}

/** API fora do ar, limite de uso ou chave ausente: NÃO cacheia, tenta de novo num próximo scan. */
export class Unavailable extends Error {}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new Unavailable(`Falha de rede: ${new URL(url).host}`, { cause: e });
  }
  if (res.status === 404) return null as T;
  if (!res.ok) throw new Unavailable(`${new URL(url).host} respondeu ${res.status}`);
  return (await res.json()) as T;
}

export const stripHtml = (s: string | null | undefined) =>
  s ? s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() || null : null;

// AniList/Jikan devolvem gêneros em inglês; o TMDB (pt-BR) usa estes nomes, então o filtro fica unificado.
const GENRE_PT: Record<string, string> = {
  Action: "Ação",
  Adventure: "Aventura",
  Comedy: "Comédia",
  Fantasy: "Fantasia",
  Horror: "Terror",
  "Mahou Shoujo": "Garotas mágicas",
  Music: "Música",
  Mystery: "Mistério",
  Psychological: "Psicológico",
  "Sci-Fi": "Ficção científica",
  Sports: "Esportes",
  Supernatural: "Sobrenatural",
  Thriller: "Suspense",
  "Award Winning": "Premiado",
  "Avant Garde": "Vanguarda",
  Gourmet: "Gastronomia",
  "Boys Love": "Boys Love",
  "Girls Love": "Girls Love",
};
export const ptGenre = (g: string) => GENRE_PT[g] ?? g;
