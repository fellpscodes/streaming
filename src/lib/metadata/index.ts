import { eq } from "drizzle-orm";
import { db, libraryFolders, titles } from "@/lib/db";
import { searchAniList } from "./anilist";
import { searchJikan } from "./jikan";
import { searchTmdb } from "./tmdb";
import { Unavailable, type Metadata, type Query } from "./types";

type Title = typeof titles.$inferSelect;

const GAP_MS = process.env.NODE_ENV === "test" ? 0 : 400; // respeita limites do Jikan/AniList
const sleep = (ms: number) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Anime: AniList primeiro, Jikan como fallback. */
async function animeLookup(q: Query): Promise<Metadata | null> {
  const al = await searchAniList(q);
  if (al) return al;
  return searchJikan(q);
}

interface Lookup {
  meta: Metadata;
  category: Title["category"];
}

/** locked = categoria definida pelo usuário (título corrigido à mão ou pasta com tipo): não reclassifica. */
async function lookup(t: Title, locked: boolean): Promise<Lookup | null> {
  const found = await lookupByName(t, t.name, locked);
  if (found) return found;
  // "12 Alguma Coisa" pode ser número de ordem da pasta: tenta de novo sem o número antes de desistir.
  const bare = t.name.replace(/^\d{1,3}\s+(?=\S)/, "");
  return bare !== t.name && /\p{L}/u.test(bare) ? lookupByName(t, bare, locked) : null;
}

async function lookupByName(t: Title, name: string, locked: boolean): Promise<Lookup | null> {
  const q: Query = { name, year: t.year };

  if (t.category === "anime") {
    const a = await animeLookup(q);
    if (a) return { meta: a, category: "anime" };
    const tv = await searchTmdb("tv", q); // último recurso
    return tv ? { meta: tv, category: "anime" } : null;
  }

  const tmdb = await searchTmdb(t.category === "movie" ? "movie" : "tv", q);
  if (tmdb) {
    // Japonês + animação no TMDB => anime. Texto em pt-BR do TMDB, imagens/nota/elenco do AniList.
    if (tmdb.looksLikeAnime && !locked) {
      const a = await animeLookup(q);
      if (a) return { meta: { ...a, tmdbId: tmdb.tmdbId, overview: tmdb.overview ?? a.overview }, category: "anime" };
      return { meta: tmdb, category: "anime" };
    }
    return { meta: tmdb, category: t.category };
  }

  // Fora do TMDB: pode ser um anime que só existe no AniList/Jikan.
  if (!locked) {
    const a = await animeLookup(q);
    if (a) return { meta: a, category: "anime" };
  }
  return null;
}

export interface EnrichResult {
  fetched: number;
  skipped: number;
  warnings: string[];
}

/**
 * Busca metadados só dos títulos `pending`. Resultado (found ou not_found) é gravado no banco,
 * então chamar de novo não gera nenhuma requisição externa para os mesmos títulos.
 */
export async function enrichPending(onProgress?: (done: number, total: number, name: string) => void): Promise<EnrichResult> {
  const pending = db.select().from(titles).where(eq(titles.metadataStatus, "pending")).all();
  const kinds = new Map(db.select().from(libraryFolders).all().map((f) => [f.id, f.kind]));
  const result: EnrichResult = { fetched: 0, skipped: 0, warnings: [] };
  const pendingBy = new Map<string, number>(); // mensagem -> quantos títulos ficaram pendentes por causa dela

  let done = 0;
  for (const t of pending) {
    onProgress?.(done, pending.length, t.name);
    try {
      const r = await lookup(t, t.manual || (kinds.get(t.folderId) ?? "auto") !== "auto");
      if (r) {
        db.update(titles)
          .set({
            metadataStatus: "found",
            metadataSource: r.meta.source,
            tmdbId: r.meta.tmdbId ?? null,
            anilistId: r.meta.anilistId ?? null,
            malId: r.meta.malId ?? null,
            overview: r.meta.overview,
            posterUrl: r.meta.posterUrl,
            backdropUrl: r.meta.backdropUrl,
            rating: r.meta.rating,
            genres: r.meta.genres,
            cast: r.meta.cast,
            year: t.year ?? r.meta.year,
            category: r.category,
          })
          .where(eq(titles.id, t.id))
          .run();
      } else {
        db.update(titles).set({ metadataStatus: "not_found" }).where(eq(titles.id, t.id)).run();
      }
      result.fetched++;
    } catch (e) {
      if (!(e instanceof Unavailable)) throw e;
      result.skipped++; // continua "pending": será tentado no próximo scan
      pendingBy.set(e.message, (pendingBy.get(e.message) ?? 0) + 1);
    }
    done++;
    await sleep(GAP_MS);
  }
  result.warnings = [...pendingBy].map(
    ([msg, n]) => `${msg}. ${n} título(s) ficaram sem metadado por isso e serão tentados de novo no próximo scan.`,
  );
  onProgress?.(done, pending.length, "");
  return result;
}

/** Força nova busca de um título (após corrigir o nome, por exemplo). */
export function resetMetadata(titleId: number) {
  db.update(titles).set({ metadataStatus: "pending" }).where(eq(titles.id, titleId)).run();
}
