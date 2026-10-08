import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export type Category = "movie" | "series" | "anime";
export type TitleStatus = "ok" | "needs_review";
/** Tipo de conteúdo da pasta-mãe: "auto" deixa o scanner e os metadados decidirem. */
export type FolderKind = "auto" | Category;
export type MetadataStatus = "pending" | "found" | "not_found";
export interface CastMember {
  name: string;
  role: string | null;
  photoUrl: string | null;
}

export const libraryFolders = sqliteTable("library_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  kind: text("kind").$type<FolderKind>().notNull().default("auto"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const titles = sqliteTable(
  "titles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    folderId: integer("folder_id")
      .notNull()
      .references(() => libraryFolders.id, { onDelete: "cascade" }),
    // Pasta do título relativa à pasta-mãe (ou o arquivo, se solto na raiz).
    sourceKey: text("source_key").notNull(),
    name: text("name").notNull(),
    year: integer("year"),
    category: text("category").$type<Category>().notNull(),
    status: text("status").$type<TitleStatus>().notNull().default("ok"),
    reviewReason: text("review_reason"),
    // true = o usuário corrigiu à mão; o scan não sobrescreve nome/ano/categoria.
    manual: integer("manual", { mode: "boolean" }).notNull().default(false),
    // --- Metadados (cache local; ver lib/metadata) ---
    // pending = ainda não buscado; found/not_found = resultado cacheado, não consulta de novo.
    metadataStatus: text("metadata_status").$type<MetadataStatus>().notNull().default("pending"),
    metadataSource: text("metadata_source").$type<"tmdb" | "anilist" | "jikan">(),
    tmdbId: integer("tmdb_id"),
    anilistId: integer("anilist_id"),
    malId: integer("mal_id"),
    overview: text("overview"),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    rating: real("rating"), // 0–10
    genres: text("genres", { mode: "json" }).$type<string[]>(),
    cast: text("cast", { mode: "json" }).$type<CastMember[]>(),
  },
  (t) => [unique().on(t.folderId, t.sourceKey), index("titles_status").on(t.status)],
);

export const episodes = sqliteTable(
  "episodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull().unique(),
    season: integer("season"),
    episode: integer("episode"),
    // Preserva correção manual de temporada/episódio no re-scan.
    manual: integer("manual", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("episodes_title").on(t.titleId)],
);

export const watchProgress = sqliteTable("watch_progress", {
  episodeId: integer("episode_id")
    .primaryKey()
    .references(() => episodes.id, { onDelete: "cascade" }),
  positionSec: real("position_sec").notNull(),
  durationSec: real("duration_sec").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull(), // epoch ms
});
