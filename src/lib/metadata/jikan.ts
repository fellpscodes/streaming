import { getJson, ptGenre, type Metadata, type Query } from "./types";

const API = "https://api.jikan.moe/v4";

interface Search {
  data: Array<{
    mal_id: number;
    synopsis: string | null;
    images?: { jpg?: { large_image_url?: string | null } };
    score: number | null;
    genres: Array<{ name: string }>;
    year: number | null;
  }>;
}
interface Chars {
  data: Array<{ role: string; character: { name: string; images?: { jpg?: { image_url?: string | null } } } }>;
}

/** Fallback quando o AniList não acha o anime. */
export async function searchJikan(q: Query): Promise<Metadata | null> {
  const s = await getJson<Search>(`${API}/anime?q=${encodeURIComponent(q.name)}&limit=1&order_by=popularity`);
  const a = s?.data?.[0];
  if (!a) return null;
  const chars = await getJson<Chars>(`${API}/anime/${a.mal_id}/characters`).catch(() => null);
  return {
    source: "jikan",
    malId: a.mal_id,
    overview: a.synopsis?.trim() || null,
    posterUrl: a.images?.jpg?.large_image_url ?? null,
    backdropUrl: null,
    rating: a.score,
    genres: a.genres.map((g) => ptGenre(g.name)),
    cast: (chars?.data ?? []).slice(0, 12).map((c) => ({
      name: c.character.name,
      role: c.role,
      photoUrl: c.character.images?.jpg?.image_url ?? null,
    })),
    year: a.year,
  };
}
