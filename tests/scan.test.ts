import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-test-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
const media = path.join(tmp, "midia");

const FILES = [
  // bem formatados
  "Breaking Bad/Season 1/Breaking.Bad.S01E01.720p.BluRay.x264.mkv",
  "Breaking Bad/Season 2/Breaking Bad - S02E03 - Bit by a Dead Bee.mkv",
  "Attack on Titan/[SubsPlease] Attack on Titan - 05 (1080p) [ABCD1234].mkv",
  "Friends/Friends 1x05.mkv",
  "Inception (2010)/Inception.2010.1080p.BluRay.x264.mkv",
  "The.Matrix.1999.720p.mkv",
  "Dark.S01E01.mkv",
  "Dark.S01E02.mkv",
  // mal formatados -> correção manual
  "Random Show/video1.mkv",
  "Random Show/video2.mkv",
  "!!!/!!!.mkv",
  "Dup Show/Dup.Show.S01E01.mkv",
  "Dup Show/Dup.Show.S01E01.720p.mkv",
  // devem ser ignorados
  "Inception (2010)/sample.mkv",
  "Inception (2010)/Extras/making-of.mkv",
  "Inception (2010)/notes.txt",
];

let titles: typeof import("@/lib/db").titles;
let episodes: typeof import("@/lib/db").episodes;
let db: typeof import("@/lib/db").db;
let startScan: typeof import("@/lib/scanner/scan").startScan;
let getScanState: typeof import("@/lib/scanner/state").getScanState;
let libraryFolders: typeof import("@/lib/db").libraryFolders;

beforeAll(async () => {
  for (const f of FILES) {
    const full = path.join(media, f);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "");
  }
  ({ db, titles, episodes, libraryFolders } = await import("@/lib/db"));
  ({ startScan } = await import("@/lib/scanner/scan"));
  ({ getScanState } = await import("@/lib/scanner/state"));
  db.insert(libraryFolders).values({ path: media }).run();
  await startScan();
  while (getScanState().running) await new Promise((r) => setTimeout(r, 20));
});

describe("scan de pasta de teste", () => {
  const byName = () => Object.fromEntries(db.select().from(titles).all().map((t) => [t.sourceKey, t]));

  it("termina sem erro e reporta progresso", () => {
    const s = getScanState();
    expect(s.phase).toBe("done");
    
    expect(s.filesFound).toBe(13);
  });

  it("reconhece corretamente os bem formatados", () => {
    const t = byName();
    expect(t["Breaking Bad"]).toMatchObject({ name: "Breaking Bad", category: "series", status: "ok" });
    expect(t["Attack on Titan"]).toMatchObject({ name: "Attack on Titan", category: "series", status: "ok" });
    expect(t["Friends"]).toMatchObject({ status: "ok" });
    expect(t["Inception (2010)"]).toMatchObject({ name: "Inception", year: 2010, category: "movie", status: "ok" });
    expect(t["The.Matrix.1999.720p.mkv"]).toMatchObject({ name: "The Matrix", year: 1999, category: "movie", status: "ok" });
    expect(t["~dark"]).toMatchObject({ name: "Dark", category: "series", status: "ok" });
    const bb = db.select().from(episodes).all().filter((e) => e.filePath.includes("Breaking Bad"));
    expect(bb.map((e) => [e.season, e.episode]).sort()).toEqual([[1, 1], [2, 3]]);
  });

  it("ignora sample, extras e arquivos que não são vídeo", () => {
    const inc = db.select().from(episodes).all().filter((e) => e.filePath.includes("Inception"));
    expect(inc).toHaveLength(1);
  });

  it("só manda para correção manual o que tem NOME ilegível", () => {
    const t = byName();
    expect(t["!!!"].status).toBe("needs_review");
    const review = Object.values(t).filter((x) => x.status === "needs_review").map((x) => x.sourceKey);
    expect(review).toEqual(["!!!"]);
  });

  it("arquivos sem EP/temporada não pedem configuração: o nome do arquivo vira o episódio", () => {
    const t = byName();
    // "Random Show/video1.mkv" e "video2.mkv": nada reconhecido, e está tudo bem
    expect(t["Random Show"]).toMatchObject({ status: "ok", category: "series" });
    const eps = db.select().from(episodes).all().filter((e) => e.titleId === t["Random Show"].id);
    expect(eps.map((e) => [e.season, e.episode])).toEqual([[null, null], [null, null]]);
    // duas versões do mesmo S01E01 também não travam o catálogo
    expect(t["Dup Show"].status).toBe("ok");
  });

  it("re-scan preserva correção manual e remove arquivos apagados", async () => {
    const { eq } = await import("drizzle-orm");
    const { refreshTitleStatus } = await import("@/lib/scanner/scan");
    const rs = byName()["Random Show"];
    db.update(titles).set({ name: "Meu Show", manual: true }).where(eq(titles.id, rs.id)).run();
    const eps = db.select().from(episodes).where(eq(episodes.titleId, rs.id)).all();
    eps.forEach((e, i) => db.update(episodes).set({ season: 1, episode: i + 1, manual: true }).where(eq(episodes.id, e.id)).run());
    refreshTitleStatus(rs.id);
    expect(byName()["Random Show"].status).toBe("ok");

    fs.rmSync(path.join(media, "Friends"), { recursive: true });
    const { startScan: again } = await import("@/lib/scanner/scan");
    await again();
    while (getScanState().running) await new Promise((r) => setTimeout(r, 20));

    const t = byName();
    expect(t["Random Show"]).toMatchObject({ name: "Meu Show", status: "ok" });
    expect(t["Friends"]).toBeUndefined();
  });
});

describe("números de ordem compartilhados", () => {
  const f = (...segs: string[]) => ({ absPath: "/m/" + segs.join("/"), segments: segs });
  it("tira o número quando a coleção inteira é numerada, mas preserva '12 Monkeys' num catálogo comum", async () => {
    const { groupFiles } = await import("@/lib/scanner/group");
    const numerada = groupFiles([f("10 Koimonogatari", "a.mkv"), f("11 Tsukimonogatari", "b.mkv"), f("12 Koyomimonogatari", "c.mkv"), f("13 Owarimonogatari", "d.mkv")]);
    expect(numerada.map((g) => g.name)).toEqual(["Koimonogatari", "Tsukimonogatari", "Koyomimonogatari", "Owarimonogatari"]);

    const comum = groupFiles([f("12 Monkeys", "a.mkv"), f("Breaking Bad", "b.mkv"), f("Death Note", "c.mkv"), f("Dark", "d.mkv")]);
    expect(comum.find((g) => g.sourceKey === "12 Monkeys")?.name).toBe("12 Monkeys");
  });
});
