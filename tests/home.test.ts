import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-home-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.CACHE_DIR = path.join(tmp, "cache");
vi.mock("next/server", () => ({ connection: async () => {} }));

const DAY = 24 * 3600 * 1000;

describe("fileiras da Home", () => {
  let getHomeData: typeof import("@/lib/home").getHomeData;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    const { db, titles, episodes, libraryFolders } = await import("@/lib/db");
    ({ getHomeData } = await import("@/lib/home"));
    const { saveProgress } = await import("@/lib/progress");
    db.insert(libraryFolders).values({ path: "/m" }).run();
    const add = (name: string, over: Partial<typeof titles.$inferInsert>, files = 1) => {
      const id = db.insert(titles).values({ folderId: 1, sourceKey: name, name, category: "anime", metadataStatus: "found", ...over }).returning({ id: titles.id }).get().id;
      for (let i = 1; i <= files; i++) db.insert(episodes).values({ titleId: id, filePath: `/m/${name}/${i}.mkv`, season: 1, episode: i }).run();
      ids[name] = id;
    };
    add("Alfa", { rating: 9.1, year: 1998, genres: ["Ação", "Drama"], backdropUrl: "http://x/b.jpg", createdAt: Date.now() - 2 * DAY }, 3);
    add("Beta", { rating: 8.4, year: 2005, genres: ["Ação", "Drama"], createdAt: Date.now() - 40 * DAY });
    add("Gama", { rating: 8.0, year: 1995, genres: ["Ação", "Mistério"] });
    add("Delta", { rating: 6.0, year: 2020, genres: ["Drama"], category: "series" });
    add("Ômega", { rating: null, year: 2021, genres: [], category: "movie" });
    saveProgress(db.select().from(episodes).all().find((e) => e.titleId === ids.Beta)!.id, 300, 1400);
  });

  it("monta as fileiras só com o que tem conteúdo e na ordem esperada", () => {
    const d = getHomeData();
    expect(d.lanes.map((l) => l.id)).toEqual(["continuar", "novos", "anime", "movie", "series"]);
  });

  it("continuar traz só o que está em andamento; novos só os últimos 14 dias", () => {
    const d = getHomeData();
    const lane = (id: string) => d.lanes.find((l) => l.id === id)!.ids;
    expect(lane("continuar")).toEqual([ids.Beta]);
    expect(lane("novos")).toEqual([ids.Alfa]);
  });

  it("só separa por Animes, Filmes e Séries (sem fileiras de gênero, nota ou década), cada uma por nota", () => {
    const d = getHomeData();
    const lane = (id: string) => d.lanes.find((l) => l.id === id)!.ids;
    expect(lane("anime")).toEqual([ids.Alfa, ids.Beta, ids.Gama]);
    expect(lane("movie")).toEqual([ids.Ômega]);
    expect(lane("series")).toEqual([ids.Delta]);
    for (const extra of ["top", "g-Ação", "g-Drama", "classicos"]) expect(d.lanes.find((l) => l.id === extra)).toBeUndefined();
    expect(d.lanes.filter((l) => !["continuar", "novos"].includes(l.id)).map((l) => l.label)).toEqual(["Animes", "Filmes", "Séries"]);
  });

  it("uma categoria grande não é cortada", async () => {
    const { db, titles } = await import("@/lib/db");
    for (let i = 0; i < 30; i++) db.insert(titles).values({ folderId: 1, sourceKey: `extra${i}`, name: `Extra ${i}`, category: "movie", metadataStatus: "found" }).run();
    expect(getHomeData().lanes.find((l) => l.id === "movie")!.ids).toHaveLength(31);
  });

  it("cada título leva episódio para assistir, progresso e etiqueta de novo", () => {
    const d = getHomeData();
    const t = (n: string) => d.titles.find((x) => x.id === ids[n])!;
    expect(t("Beta").progress).toMatchObject({ started: true });
    expect(Math.round(t("Beta").progress!.pct)).toBe(21);
    expect(t("Alfa")).toMatchObject({ episodes: 3, isNew: true, preview: false });
    expect(t("Alfa").playEpisodeId).not.toBeNull();
    expect(t("Beta").isNew).toBe(false);
  });

  it("o destaque é o que está em andamento; sem isso, o mais bem avaliado com imagem de fundo", () => {
    expect(getHomeData().heroId).toBe(ids.Beta);
  });
});
