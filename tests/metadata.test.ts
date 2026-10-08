import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-meta-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.TMDB_API_KEY = "test-key";
delete process.env.TMDB_READ_TOKEN;

let db: typeof import("@/lib/db").db;
let titles: typeof import("@/lib/db").titles;
let libraryFolders: typeof import("@/lib/db").libraryFolders;
let enrichPending: typeof import("@/lib/metadata").enrichPending;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });


function fakeFetch(url: string, init?: { body?: string }) {
  const u = new URL(url);
  if (u.host === "api.themoviedb.org") {
    const q = u.searchParams.get("query");
    if (u.pathname === "/3/search/tv") {
      if (q === "Breaking Bad") return Promise.resolve(json({ results: [{ id: 1396 }] }));
      if (q === "Frieren") return Promise.resolve(json({ results: [{ id: 209867 }] }));
      return Promise.resolve(json({ results: [] }));
    }
    if (u.pathname === "/3/search/movie") return Promise.resolve(json({ results: [] }));
    if (u.pathname === "/3/tv/1396")
      return Promise.resolve(json({
        id: 1396, overview: "Sinopse pt", poster_path: "/p.jpg", backdrop_path: "/b.jpg", vote_average: 8.9, vote_count: 100,
        genres: [{ id: 18, name: "Drama" }], original_language: "en", first_air_date: "2008-01-20",
        credits: { cast: [{ name: "Bryan Cranston", character: "Walter White", profile_path: "/c.jpg" }] },
      }));
    if (u.pathname === "/3/tv/209867")
      return Promise.resolve(json({
        id: 209867, overview: "Sinopse anime pt", poster_path: "/f.jpg", vote_average: 9, vote_count: 10,
        genres: [{ id: 16, name: "Animação" }], original_language: "ja", first_air_date: "2023-09-29", credits: { cast: [] },
      }));
  }
  if (u.host === "graphql.anilist.co") {
    const search = JSON.parse(init?.body ?? "{}").variables?.search;
    return Promise.resolve(json({ data: { Media: search === "Naruto" || search === "Frieren" ? {
      id: 1, idMal: 2, description: "Desc<br>en", coverImage: { extraLarge: "https://img/al.jpg" }, bannerImage: "https://img/ban.jpg",
      averageScore: 85, genres: ["Action", "Drama"], startDate: { year: 2002 }, characters: { edges: [] },
    } : null } }));
  }
  if (u.host === "api.jikan.moe") return Promise.resolve(json({ data: [] }));
  return Promise.resolve(json({}, 404));
}

beforeAll(async () => {
  ({ db, titles, libraryFolders } = await import("@/lib/db"));
  ({ enrichPending } = await import("@/lib/metadata"));
  db.insert(libraryFolders).values({ path: "/x" }).run();
  for (const name of ["Breaking Bad", "Frieren", "Naruto", "Zzz Inexistente"]) {
    db.insert(titles).values({ folderId: 1, sourceKey: name, name, category: "series" }).run();
  }
});
afterEach(() => vi.unstubAllGlobals());

const get = (name: string) => db.select().from(titles).where(eq(titles.name, name)).get()!;

describe("metadados e cache", () => {
  it("busca, classifica e grava no banco", async () => {
    vi.stubGlobal("fetch", (url: string, init?: { body?: string }) => fakeFetch(url, init));
    const r = await enrichPending();
    expect(r.skipped).toBe(0);

    const bb = get("Breaking Bad");
    expect(bb).toMatchObject({ metadataStatus: "found", metadataSource: "tmdb", category: "series", overview: "Sinopse pt", year: 2008 });
    expect(bb.posterUrl).toBe("https://image.tmdb.org/t/p/original/p.jpg");
    expect(bb.genres).toEqual(["Drama"]);
    expect(bb.cast?.[0]).toMatchObject({ name: "Bryan Cranston", role: "Walter White" });

    // japonês + animação no TMDB => anime, texto pt-BR do TMDB, capa do AniList
    expect(get("Frieren")).toMatchObject({ category: "anime", metadataSource: "anilist", overview: "Sinopse anime pt", posterUrl: "https://img/al.jpg" });
    // fora do TMDB mas no AniList => anime
    expect(get("Naruto")).toMatchObject({ category: "anime", metadataStatus: "found", genres: ["Ação", "Drama"] });
    // em lugar nenhum => not_found cacheado
    expect(get("Zzz Inexistente").metadataStatus).toBe("not_found");
  });

  it("recarregar de novo NÃO chama nenhuma API externa", async () => {
    const spy = vi.fn(() => Promise.reject(new Error("não deveria chamar")));
    vi.stubGlobal("fetch", spy);
    await enrichPending();
    await enrichPending();
    expect(spy).not.toHaveBeenCalled();
  });

  it("falha de rede não cacheia: continua pendente", async () => {
    db.insert(titles).values({ folderId: 1, sourceKey: "Novo", name: "Novo", category: "series" }).run();
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    const r = await enrichPending();
    expect(r.skipped).toBe(1);
    expect(get("Novo").metadataStatus).toBe("pending");
  });
});

describe("número de ordem no nome", () => {
  it('se "10 Naruto" não é achado, tenta de novo como "Naruto"', async () => {
    const { db: d, titles: t } = await import("@/lib/db");
    d.insert(t).values({ folderId: 1, sourceKey: "10 Naruto", name: "10 Naruto", category: "anime" }).run();
    const queries: string[] = [];
    vi.stubGlobal("fetch", (url: string, init?: { body?: string }) => {
      if (url.includes("anilist")) queries.push(JSON.parse(init?.body ?? "{}").variables?.search);
      return fakeFetch(url, init);
    });
    await enrichPending();
    expect(queries.filter((q) => /Naruto/.test(q))).toEqual(["10 Naruto", "Naruto"]);
    expect(get("10 Naruto")).toMatchObject({ metadataStatus: "found", metadataSource: "anilist" });
  });
});
