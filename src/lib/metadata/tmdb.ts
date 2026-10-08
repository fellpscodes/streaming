import { getJson, Unavailable, type Metadata, type Query } from "./types";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const ANIMATION_GENRE = 16;

interface Credits {
  cast?: Array<{ name: string; character?: string; profile_path?: string | null }>;
}
interface Details {
  id: number;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  genres?: Array<{ id: number; name: string }>;
  original_language?: string;
  release_date?: string;
  first_air_date?: string;
  credits?: Credits;
}
interface SearchResult {
  results: Array<{ id: number; popularity?: number }>;
}

function auth(): { headers: Record<string, string>; key: string } {
  const token = process.env.TMDB_READ_TOKEN;
  const key = process.env.TMDB_API_KEY;
  if (token) return { headers: { Authorization: `Bearer ${token}` }, key: "" };
  if (key) return { headers: {}, key: `&api_key=${encodeURIComponent(key)}` };
  throw new Unavailable("TMDB_API_KEY não configurada");
}

export const tmdbConfigured = () => Boolean(process.env.TMDB_READ_TOKEN || process.env.TMDB_API_KEY);

async function call<T>(path: string, lang: string): Promise<T> {
  const a = auth();
  const sep = path.includes("?") ? "&" : "?";
  return getJson<T>(`${API}${path}${sep}language=${lang}${a.key}`, { headers: a.headers });
}

/** Busca no TMDB em pt-BR, com sinopse em inglês se a tradução estiver vazia. */
export async function searchTmdb(kind: "movie" | "tv", q: Query): Promise<Metadata | null> {
  const yearParam = q.year ? `&${kind === "movie" ? "year" : "first_air_date_year"}=${q.year}` : "";
  const enc = encodeURIComponent(q.name);
  let search = await call<SearchResult>(`/search/${kind}?query=${enc}${yearParam}`, "pt-BR");
  // Ano do arquivo pode estar errado: tenta sem o filtro antes de desistir.
  if (!search?.results?.length && q.year) search = await call<SearchResult>(`/search/${kind}?query=${enc}`, "pt-BR");
  // O 1º resultado pode ser um homônimo obscuro: entre os 5 primeiros, vale o mais popular.
  const hit = search?.results?.slice(0, 5).reduce<SearchResult["results"][number] | undefined>(
    (best, r) => (!best || (r.popularity ?? 0) > (best.popularity ?? 0) ? r : best),
    undefined,
  );
  if (!hit) return null;

  const d = await call<Details>(`/${kind}/${hit.id}?append_to_response=credits`, "pt-BR");
  if (!d) return null;
  let overview = d.overview?.trim() || null;
  if (!overview) overview = (await call<Details>(`/${kind}/${hit.id}`, "en-US"))?.overview?.trim() || null;

  const date = d.release_date ?? d.first_air_date;
  const genres = d.genres?.map((g) => g.name) ?? [];
  return {
    source: "tmdb",
    tmdbId: d.id,
    overview,
    posterUrl: d.poster_path ? `${IMG}/original${d.poster_path}` : null,
    backdropUrl: d.backdrop_path ? `${IMG}/original${d.backdrop_path}` : null,
    rating: d.vote_count ? Math.round((d.vote_average ?? 0) * 10) / 10 : null,
    genres,
    cast: (d.credits?.cast ?? []).slice(0, 12).map((c) => ({
      name: c.name,
      role: c.character || null,
      photoUrl: c.profile_path ? `${IMG}/w342${c.profile_path}` : null,
    })),
    year: date ? Number(date.slice(0, 4)) || null : null,
    looksLikeAnime: d.original_language === "ja" && Boolean(d.genres?.some((g) => g.id === ANIMATION_GENRE)),
  };
}
