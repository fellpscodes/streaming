import { eq } from "drizzle-orm";
import { db, episodes, titles, watchProgress } from "@/lib/db";

export const COMPLETE_RATIO = 0.92;

export function saveProgress(episodeId: number, position: number, duration: number) {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return false;
  const pos = Math.min(Math.max(position, 0), duration);
  // Terminou: passou de 92% ou, em vídeos longos, faltam menos de 60s (créditos).
  const completed = pos / duration >= COMPLETE_RATIO || (duration > 600 && duration - pos < 60);
  const row = { positionSec: pos, durationSec: duration, completed, updatedAt: Date.now() };
  db.insert(watchProgress).values({ episodeId, ...row }).onConflictDoUpdate({ target: watchProgress.episodeId, set: row }).run();
  return true;
}

export const getProgress = (episodeId: number) =>
  db.select().from(watchProgress).where(eq(watchProgress.episodeId, episodeId)).get() ?? null;

type Ep = typeof episodes.$inferSelect;
const order = (a: Ep, b: Ep) => (a.season ?? 999) - (b.season ?? 999) || (a.episode ?? 9999) - (b.episode ?? 9999) || a.id - b.id;

export interface ContinueEntry {
  titleId: number;
  episodeId: number;
  name: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  season: number | null;
  episode: number | null;
  isMovie: boolean;
  positionSec: number;
  durationSec: number;
  updatedAt: number;
}

/**
 * Para cada título com progresso: o episódio em andamento, ou o próximo se o último foi concluído.
 * Mais recentes primeiro. Títulos totalmente assistidos não aparecem.
 */
export function listContinueWatching(onlyTitleId?: number, limit = 20): ContinueEntry[] {
  const rows = db
    .select({ p: watchProgress, e: episodes, t: titles })
    .from(watchProgress)
    .innerJoin(episodes, eq(episodes.id, watchProgress.episodeId))
    .innerJoin(titles, eq(titles.id, episodes.titleId))
    .all()
    .filter((r) => onlyTitleId === undefined || r.t.id === onlyTitleId);

  const latest = new Map<number, (typeof rows)[number]>();
  for (const r of rows.sort((a, b) => b.p.updatedAt - a.p.updatedAt)) if (!latest.has(r.t.id)) latest.set(r.t.id, r);

  const out: ContinueEntry[] = [];
  for (const { p, e, t } of latest.values()) {
    let ep: Ep | undefined = e;
    let pos = p.positionSec;
    let dur = p.durationSec;
    if (p.completed) {
      const all = db.select().from(episodes).where(eq(episodes.titleId, t.id)).all().sort(order);
      ep = all[all.findIndex((x) => x.id === e.id) + 1];
      pos = 0;
      dur = 0;
    }
    if (!ep) continue;
    out.push({
      titleId: t.id, episodeId: ep.id, name: t.name, posterUrl: t.posterUrl, backdropUrl: t.backdropUrl,
      season: ep.season, episode: ep.episode, isMovie: t.category === "movie",
      positionSec: pos, durationSec: dur, updatedAt: p.updatedAt,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}
