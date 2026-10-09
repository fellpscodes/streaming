import { asc, eq } from "drizzle-orm";
import { db, episodes, titles, type Category } from "@/lib/db";
import { compareEpisodes } from "@/lib/episodes";

export { CATEGORY_LABEL } from "@/lib/category";

export type TitleRow = typeof titles.$inferSelect;

export interface CatalogFilter {
  category?: Category;
  q?: string;
  genre?: string;
  year?: number;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Biblioteca pessoal (centenas de títulos): filtra em memória, sem SQL dinâmico. */
export function listTitles(f: CatalogFilter = {}): TitleRow[] {
  const q = f.q ? fold(f.q.trim()) : "";
  return db
    .select()
    .from(titles)
    .orderBy(asc(titles.name))
    .all()
    .filter(
      (t) =>
        (!f.category || t.category === f.category) &&
        (!q || fold(t.name).includes(q)) &&
        (!f.genre || t.genres?.includes(f.genre)) &&
        (!f.year || t.year === f.year),
    );
}

/** Gêneros e anos disponíveis na categoria, para montar os filtros. */
export function filterOptions(category?: Category) {
  const rows = listTitles({ category });
  const genres = [...new Set(rows.flatMap((t) => t.genres ?? []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const years = [...new Set(rows.map((t) => t.year).filter((y): y is number => y != null))].sort((a, b) => b - a);
  return { genres, years };
}

export function getTitleWithEpisodes(id: number) {
  const title = db.select().from(titles).where(eq(titles.id, id)).get();
  if (!title) return null;
  const eps = db
    .select()
    .from(episodes)
    .where(eq(episodes.titleId, id))
    .all()
    .sort(compareEpisodes);
  return { title, episodes: eps };
}

export function seasonsOf(eps: Array<typeof episodes.$inferSelect>) {
  const map = new Map<number | null, typeof eps>();
  for (const e of eps) map.set(e.season, [...(map.get(e.season) ?? []), e]);
  return [...map.entries()].map(([season, list]) => ({ season, episodes: list }));
}
