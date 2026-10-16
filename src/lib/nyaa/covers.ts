/** Capa de um anime, achada pelo nome no AniList. `name` é o título que o AniList associou, para conferência. */
export interface Cover {
  name: string;
  url: string;
}

const HIT_TTL = 24 * 3600_000;
const MISS_TTL = 3600_000;
const MAX_NAMES = 40;

const g = globalThis as unknown as { __covers?: Map<string, { at: number; cover: Cover | null }> };
const cache = (g.__covers ??= new Map());

const key = (name: string) => name.toLowerCase();

interface Resp {
  data?: Record<string, { media: Array<{ title: { romaji: string | null; english: string | null }; coverImage: { large: string | null } | null }> } | null>;
}

/**
 * Capas para vários nomes numa única consulta ao AniList. Usa `Page` (e não `Media`) porque um nome sem
 * correspondência em `Media` devolve 404 e derruba o lote inteiro; em `Page` vem só uma lista vazia.
 * Nome sem capa vem como null; falha de rede ou limite de uso deixa o nome de fora (e não é guardado).
 */
export async function lookupCovers(names: string[]): Promise<Record<string, Cover | null>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n && n.length <= 150))].slice(0, MAX_NAMES);
  const out: Record<string, Cover | null> = {};
  const missing: string[] = [];
  for (const n of unique) {
    const hit = cache.get(key(n));
    if (hit && Date.now() - hit.at < (hit.cover ? HIT_TTL : MISS_TTL)) out[n] = hit.cover;
    else missing.push(n);
  }
  if (missing.length === 0) return out;

  const query =
    `query(${missing.map((_, i) => `$s${i}:String`).join(",")}){` +
    missing.map((_, i) => `m${i}:Page(perPage:1){media(search:$s${i},type:ANIME,sort:SEARCH_MATCH){title{romaji english} coverImage{large}}}`).join(" ") +
    "}";
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: Object.fromEntries(missing.map((n, i) => [`s${i}`, n])) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return out;
    const data = ((await res.json()) as Resp).data;
    if (!data) return out;
    missing.forEach((n, i) => {
      const m = data[`m${i}`]?.media[0];
      const cover = m?.coverImage?.large ? { name: m.title.english ?? m.title.romaji ?? n, url: m.coverImage.large } : null;
      cache.set(key(n), { at: Date.now(), cover });
      out[n] = cover;
    });
  } catch {
    // sem capas desta vez; a próxima busca tenta de novo
  }
  return out;
}
