import { getJson, ptGenre, stripHtml, type Metadata, type Query } from "./types";

const QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    id idMal
    description(asHtml: false)
    coverImage { extraLarge }
    bannerImage
    averageScore
    genres
    startDate { year }
    characters(sort: ROLE, perPage: 12) {
      edges { role node { name { full } image { medium } } }
    }
  }
}`;

interface Resp {
  data?: {
    Media: {
      id: number;
      idMal: number | null;
      description: string | null;
      coverImage: { extraLarge: string | null } | null;
      bannerImage: string | null;
      averageScore: number | null;
      genres: string[];
      startDate: { year: number | null } | null;
      characters: { edges: Array<{ role: string; node: { name: { full: string }; image: { medium: string | null } | null } }> } | null;
    } | null;
  };
}

export async function searchAniList(q: Query): Promise<Metadata | null> {
  const r = await getJson<Resp>("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { search: q.name } }),
  });
  const m = r?.data?.Media;
  if (!m) return null;
  return {
    source: "anilist",
    anilistId: m.id,
    malId: m.idMal ?? undefined,
    overview: stripHtml(m.description),
    posterUrl: m.coverImage?.extraLarge ?? null,
    backdropUrl: m.bannerImage,
    rating: m.averageScore != null ? m.averageScore / 10 : null,
    genres: m.genres.map(ptGenre),
    cast: (m.characters?.edges ?? []).map((e) => ({
      name: e.node.name.full,
      role: e.role === "MAIN" ? "Principal" : "Coadjuvante",
      photoUrl: e.node.image?.medium ?? null,
    })),
    year: m.startDate?.year ?? null,
  };
}
