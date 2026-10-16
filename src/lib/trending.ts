import { db, titles } from "@/lib/db";
import { getJson, ptGenre, stripHtml } from "@/lib/metadata/types";

/** Anime em alta, no formato leve que vai ao navegador. */
export interface TrendingAnime {
  id: number;
  /** Nome para exibir. */
  name: string;
  /** Nome em romaji: é como as releases do Nyaa costumam escrever o título. */
  searchName: string;
  year: number | null;
  /** 0–10 */
  rating: number | null;
  genres: string[];
  overview: string | null;
  poster: string;
  episodes: number | null;
  /** Último episódio já exibido, para animes em exibição. */
  aired: number | null;
  status: "RELEASING" | "FINISHED" | "NOT_YET_RELEASED" | string;
  format: string | null;
  studio: string | null;
}

const QUERY = `
query ($perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(type: ANIME, sort: TRENDING_DESC, isAdult: false, status_in: [RELEASING, FINISHED]) {
      id
      title { romaji english }
      coverImage { extraLarge large }
      description(asHtml: false)
      averageScore
      genres
      episodes
      status
      format
      seasonYear
      startDate { year }
      studios(isMain: true) { nodes { name } }
      nextAiringEpisode { episode }
    }
  }
}`;

interface Media {
  id: number;
  title: { romaji: string | null; english: string | null };
  coverImage: { extraLarge: string | null; large: string | null } | null;
  description: string | null;
  averageScore: number | null;
  genres: string[];
  episodes: number | null;
  status: string;
  format: string | null;
  seasonYear: number | null;
  startDate: { year: number | null } | null;
  studios: { nodes: Array<{ name: string }> } | null;
  nextAiringEpisode: { episode: number } | null;
}

export function toTrending(m: Media): TrendingAnime | null {
  const poster = m.coverImage?.extraLarge ?? m.coverImage?.large;
  const searchName = m.title.romaji ?? m.title.english;
  if (!poster || !searchName) return null;
  const overview = stripHtml(m.description)?.replace(/\n\s*\n(?:\s*\n)*/g, "\n\n") ?? null;
  return {
    id: m.id,
    name: m.title.english ?? searchName,
    searchName,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    rating: m.averageScore != null ? m.averageScore / 10 : null,
    genres: m.genres.slice(0, 4).map(ptGenre),
    overview: overview ? (overview.length > 520 ? `${overview.slice(0, 517)}…` : overview) : null,
    poster,
    episodes: m.episodes,
    aired: m.nextAiringEpisode ? Math.max(0, m.nextAiringEpisode.episode - 1) : null,
    status: m.status,
    format: m.format,
    studio: m.studios?.nodes[0]?.name ?? null,
  };
}

const TTL = 60 * 60_000;
const g = globalThis as unknown as { __trending?: { at: number; items: TrendingAnime[] } };

/** Os animes mais em alta no AniList (cache de 1 h; se o AniList falhar, usa o último resultado ou devolve vazio). */
export async function fetchTrending(): Promise<TrendingAnime[]> {
  const hit = g.__trending;
  if (hit && Date.now() - hit.at < TTL) return hit.items;
  try {
    const r = await getJson<{ data?: { Page: { media: Media[] } } }>("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { perPage: 40 } }),
    });
    const items = (r?.data?.Page.media ?? []).map(toTrending).filter((x): x is TrendingAnime => x !== null);
    if (items.length) g.__trending = { at: Date.now(), items };
    return items;
  } catch {
    return hit?.items ?? [];
  }
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** "Animes em Alta" sem o que o usuário já tem na biblioteca (por id do AniList ou pelo nome). */
export async function getTrendingForHome(limit = 20): Promise<TrendingAnime[]> {
  const mine = db.select({ name: titles.name, anilistId: titles.anilistId }).from(titles).all();
  const ids = new Set(mine.map((t) => t.anilistId).filter((x): x is number => x != null));
  const names = new Set(mine.map((t) => norm(t.name)));
  return (await fetchTrending())
    .filter((a) => !ids.has(a.id) && !names.has(norm(a.name)) && !names.has(norm(a.searchName)))
    .slice(0, limit);
}
