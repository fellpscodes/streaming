import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// connection() só existe dentro de uma requisição do Next.
vi.mock("next/server", () => ({ connection: async () => {} }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-folders-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
const root = path.join(tmp, "midia");

const touch = (rel: string) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "");
};

beforeAll(() => {
  touch("Serie A/Serie.A.S01E01.mkv");
  touch("Serie A/Serie.A.S01E02.mkv");
  touch("Filme B (2020)/Filme.B.2020.mkv");
  touch(".oculta/x.mkv");
  fs.writeFileSync(path.join(root, "arquivo.txt"), "");
  fs.symlinkSync(path.join(root, "Serie A"), path.join(root, "Atalho"));
});

describe("navegador de pastas", () => {
  it("lista só subpastas visíveis (inclui link para pasta), ordenadas, sem arquivos", async () => {
    const { listDirs } = await import("@/lib/fs-browse");
    const l = await listDirs(root);
    expect(l.dirs).toEqual(["Atalho", "Filme B (2020)", "Serie A"]);
    expect(l.parent).toBe(tmp);
  });

  it("sem caminho abre a pasta do usuário; caminho inexistente ou relativo é tratado", async () => {
    const { listDirs, BrowseError } = await import("@/lib/fs-browse");
    expect((await listDirs(undefined)).path).toBe(os.homedir());
    expect((await listDirs("relativo/qualquer")).path).toBe(os.homedir());
    await expect(listDirs(path.join(tmp, "nao-existe"))).rejects.toBeInstanceOf(BrowseError);
    expect((await listDirs("/")).parent).toBeNull();
  });

  it("a rota só responde para localhost", async () => {
    const { GET } = await import("@/app/api/fs/route");
    const ok = await GET(new Request(`http://localhost:3000/api/fs?path=${encodeURIComponent(root)}`, { headers: { host: "localhost:3000" } }));
    expect(ok.status).toBe(200);
    const lan = await GET(new Request("http://192.168.0.23:3000/api/fs", { headers: { host: "192.168.0.23:3000" } }));
    expect(lan.status).toBe(403);
  });
});

describe("tipo de conteúdo da pasta", () => {
  it("cadastra com tipo, valida e conta títulos", async () => {
    const { POST, PATCH, GET } = await import("@/app/api/folders/route");
    const post = (body: unknown) => POST(new Request("http://x/api/folders", { method: "POST", body: JSON.stringify(body) }));
    expect((await post({ path: root, kind: "xyz" })).status).toBe(400);
    expect((await post({ path: "relativo" })).status).toBe(400);
    const created = await post({ path: root, kind: "anime" });
    expect(created.status).toBe(201);
    expect((await created.json()).kind).toBe("anime");
    expect((await post({ path: root })).status).toBe(409);

    const patch = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ id: 1, kind: "auto" }) }));
    expect((await patch.json()).kind).toBe("auto");
    const list = await (await GET()).json();
    expect(list[0]).toMatchObject({ kind: "auto", titleCount: 0 });
  });

  async function scanWith(kind: "auto" | "anime" | "series" | "movie") {
    const { db, titles } = await import("@/lib/db");
    const { persistFolder } = await import("@/lib/scanner/scan");
    const { PATCH } = await import("@/app/api/folders/route");
    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ id: 1, kind }) }));
    const files = [
      { absPath: path.join(root, "Serie A/Serie.A.S01E01.mkv"), segments: ["Serie A", "Serie.A.S01E01.mkv"] },
      { absPath: path.join(root, "Serie A/Serie.A.S01E02.mkv"), segments: ["Serie A", "Serie.A.S01E02.mkv"] },
      { absPath: path.join(root, "Filme B (2020)/Filme.B.2020.mkv"), segments: ["Filme B (2020)", "Filme.B.2020.mkv"] },
    ];
    persistFolder(1, files);
    return Object.fromEntries(db.select().from(titles).all().map((t) => [t.sourceKey, t]));
  }

  it("automático detecta filme e série", async () => {
    const t = await scanWith("auto");
    expect(t["Serie A"].category).toBe("series");
    expect(t["Filme B (2020)"].category).toBe("movie");
  });

  it("pasta de animes classifica tudo como anime e um arquivo único sem número não vira erro", async () => {
    const t = await scanWith("anime");
    expect(t["Serie A"]).toMatchObject({ category: "anime", status: "ok" });
    expect(t["Filme B (2020)"]).toMatchObject({ category: "anime", status: "ok" });
  });

  it("voltar para automático desfaz a classificação forçada", async () => {
    const t = await scanWith("auto");
    expect(t["Filme B (2020)"].category).toBe("movie");
    expect(t["Serie A"].category).toBe("series");
  });

  it("pasta de animes invalida o cache de metadados ao reclassificar", async () => {
    const { db, titles } = await import("@/lib/db");
    db.update(titles).set({ metadataStatus: "found" }).run();
    await scanWith("anime");
    expect(db.select().from(titles).all().every((t) => t.metadataStatus === "pending")).toBe(true);
  });
});
