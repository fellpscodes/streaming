import { db, episodes } from "@/lib/db";
import { CATEGORY_LABEL, listTitles, type TitleRow } from "@/lib/catalog";
import { compareEpisodes } from "@/lib/episodes";
import type { CardTitle, HomeData, HomeLane } from "@/lib/home-types";
import { previewReady } from "@/lib/media/preview";
import { listContinueWatching } from "@/lib/progress";

const DAY = 24 * 3600 * 1000;
const byRating = (a: TitleRow, b: TitleRow) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name, "pt-BR");

/** Transforma linhas do banco no formato leve que vai ao navegador (com progresso, prévia e primeiro episódio). */
export function toCards(rows: TitleRow[]): CardTitle[] {
  const eps = db.select().from(episodes).all();
  const byTitle = new Map<number, typeof eps>();
  for (const e of eps) byTitle.set(e.titleId, [...(byTitle.get(e.titleId) ?? []), e]);
  const cont = new Map(listContinueWatching(undefined, 500).map((c) => [c.titleId, c]));
  const recent = Date.now() - 14 * DAY;

  return rows.map((t) => {
    const list = (byTitle.get(t.id) ?? []).sort(compareEpisodes);
    const c = cont.get(t.id);
    return {
      id: t.id,
      name: t.name,
      year: t.year,
      rating: t.rating,
      category: t.category,
      genres: t.genres ?? [],
      overview: t.overview ? (t.overview.length > 360 ? `${t.overview.slice(0, 357)}…` : t.overview) : null,
      poster: t.posterUrl,
      backdrop: t.backdropUrl,
      episodes: list.length,
      playEpisodeId: c?.episodeId ?? list[0]?.id ?? null,
      progress: c
        ? { label: c.isMovie ? "Filme" : c.label, pct: c.durationSec ? Math.min(100, (c.positionSec / c.durationSec) * 100) : 0, started: c.positionSec > 0 }
        : null,
      preview: previewReady(t.id),
      isNew: t.createdAt > recent,
    };
  });
}

/** Fileiras da Home: "Continuar", "Adicionados recentemente" e as três categorias (só as que têm títulos). */
export function getHomeData(): HomeData {
  const rows = listTitles();
  if (rows.length === 0) return { titles: [], lanes: [], heroId: null };
  const titles = toCards(rows);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const lanes: HomeLane[] = [];
  const add = (id: string, label: string, list: TitleRow[], min = 1, max = 24) => {
    if (list.length >= min) lanes.push({ id, label, ids: list.slice(0, max).map((r) => r.id) });
  };

  const continueIds = titles.filter((t) => t.progress).map((t) => t.id);
  add("continuar", "Continuar assistindo", continueIds.map((i) => rowById.get(i)!), 1);
  add("novos", "Adicionados recentemente", rows.filter((r) => r.createdAt > Date.now() - 14 * DAY).sort((a, b) => b.createdAt - a.createdAt), 1);
  // As fileiras de categoria são só estas três, na ordem: Animes, Filmes, Séries (sem limite: a Home mostra todos).
  for (const cat of ["anime", "movie", "series"] as const) {
    add(cat, CATEGORY_LABEL[cat], rows.filter((r) => r.category === cat).sort(byRating), 1, Infinity);
  }

  const hero = titles.find((t) => t.progress)?.id ?? [...rows].filter((r) => r.backdropUrl).sort(byRating)[0]?.id ?? rows[0].id;
  return { titles, lanes, heroId: hero };
}
