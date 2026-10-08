import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { pickTrack, prefFromTrack } from "@/lib/media/subtitle-pref";
import type { SubTrack } from "@/lib/media/subtitles";

const t = (id: string, label: string, over: Partial<SubTrack> = {}): SubTrack => ({
  id, label, format: "ass", isDefault: false, origin: "embedded", lang: null, ...over,
});

describe("escolha da legenda a partir da preferência", () => {
  const pt = t("e2", "Português", { lang: "Português" });
  const en = t("e3", "Inglês", { lang: "Inglês" });

  it("sem preferência: padrão do arquivo, senão português, senão nenhuma", () => {
    expect(pickTrack([en, pt], null)).toBe("e2");
    expect(pickTrack([pt, t("e4", "Inglês", { isDefault: true })], null)).toBe("e4");
    expect(pickTrack([en], null)).toBe("");
  });

  it('"Sem legenda" é lembrado e vence o padrão do arquivo', () => {
    expect(pickTrack([t("e2", "Português", { isDefault: true })], { off: true })).toBe("");
  });

  it("acha a mesma faixa mesmo com id diferente (a ordem das faixas muda entre arquivos)", () => {
    const pref = prefFromTrack(en); // escolhido no ep. 1, onde era e3
    expect(pickTrack([en, pt], pref)).toBe("e3");
    expect(pickTrack([pt, t("e7", "Inglês", { lang: "Inglês" })], pref)).toBe("e7"); // no ep. 2 virou e7
  });

  it("prefere o mesmo nome; depois o mesmo idioma; entre origens diferentes só se não houver igual", () => {
    const ext = t("x0", "Inglês", { origin: "external", lang: "Inglês" });
    expect(pickTrack([ext, en], prefFromTrack(en))).toBe("e3"); // mesma origem primeiro
    expect(pickTrack([ext, pt], prefFromTrack(en))).toBe("x0"); // só existe a externa: serve
    const fansub = t("e5", "Inglês · Fansub B", { lang: "Inglês" });
    expect(pickTrack([pt, fansub], prefFromTrack(t("e3", "Inglês · Fansub A", { lang: "Inglês" })))).toBe("e5"); // mesmo idioma
  });

  it("episódio sem nada parecido cai no padrão em vez de ficar sem legenda", () => {
    expect(pickTrack([pt], prefFromTrack(en))).toBe("e2");
    expect(pickTrack([], prefFromTrack(en))).toBe("");
  });

  it("ignora acentos e maiúsculas ao comparar", () => {
    expect(pickTrack([t("e9", "PORTUGUES")], { off: false, origin: "embedded", label: "Português", lang: null })).toBe("e9");
  });
});

// ---- integração: duas mídias reais com as faixas em ordem diferente ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-subpref-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.CACHE_DIR = path.join(tmp, "cache");
const dir = path.join(tmp, "midia", "Show");
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", ...a]);
let ids: number[] = [];

function makeEpisode(file: string, langs: Array<[string, string]>) {
  const subs = langs.map(([, text], i) => {
    const f = path.join(tmp, `${path.basename(file)}-${i}.srt`);
    fs.writeFileSync(f, `1\n00:00:00,000 --> 00:00:02,000\n${text}\n`);
    return f;
  });
  const inputs = subs.flatMap((f) => ["-i", f]);
  const maps = subs.flatMap((_, i) => ["-map", String(i + 1)]);
  const meta = langs.flatMap(([code], i) => [`-metadata:s:s:${i}`, `language=${code}`]);
  ff("-f", "lavfi", "-i", "color=c=black:s=320x180:r=10:d=1", ...inputs, "-map", "0:v", ...maps, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:s", "srt", ...meta, file);
}

describe("preferência de legenda por título (API)", () => {
  beforeAll(async () => {
    fs.mkdirSync(dir, { recursive: true });
    makeEpisode(path.join(dir, "Show - 01.mkv"), [["por", "Olá"], ["eng", "Hello"]]); // português primeiro
    makeEpisode(path.join(dir, "Show - 02.mkv"), [["eng", "Hello"], ["por", "Olá"]]); // inglês primeiro
    const { db, episodes, titles, libraryFolders } = await import("@/lib/db");
    db.insert(libraryFolders).values({ path: path.join(tmp, "midia") }).run();
    db.insert(titles).values({ folderId: 1, sourceKey: "Show", name: "Show", category: "series" }).run();
    ids = [1, 2].map((n) => db.insert(episodes).values({ titleId: 1, filePath: path.join(dir, `Show - 0${n}.mkv`), season: 1, episode: n }).returning({ id: episodes.id }).get().id);
  });

  const get = async (id: number) => {
    const { GET } = await import("@/app/api/subtitles/[episodeId]/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ episodeId: String(id) }) } as never);
    return res.json() as Promise<{ tracks: Array<{ id: string; label: string }>; selectedId: string; hasPreference: boolean }>;
  };
  const put = async (id: number, trackId: string) => {
    const { PUT } = await import("@/app/api/subtitle-preference/[episodeId]/route");
    return PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ trackId }) }), { params: Promise.resolve({ episodeId: String(id) }) } as never);
  };
  const labelOf = (d: Awaited<ReturnType<typeof get>>) => d.tracks.find((x) => x.id === d.selectedId)?.label ?? "(nenhuma)";

  it("antes de escolher: sem preferência, vem português", async () => {
    const d = await get(ids[0]);
    expect(d.hasPreference).toBe(false);
    expect(labelOf(d)).toBe("Português");
  });

  it("escolher inglês no ep. 1 seleciona inglês no ep. 2, mesmo com as faixas em outra ordem", async () => {
    const ep1 = await get(ids[0]);
    const eng = ep1.tracks.find((x) => x.label === "Inglês")!;
    expect((await put(ids[0], eng.id)).status).toBe(200);

    const ep2 = await get(ids[1]);
    expect(ep2.hasPreference).toBe(true);
    expect(labelOf(ep2)).toBe("Inglês");
    expect(ep2.selectedId).not.toBe(eng.id); // o id mudou de um arquivo para o outro
    expect(labelOf(await get(ids[0]))).toBe("Inglês"); // "sair e voltar": continua a mesma
  });

  it('"Sem legenda" também é lembrado', async () => {
    await put(ids[1], "");
    expect((await get(ids[0])).selectedId).toBe("");
    expect((await get(ids[1])).selectedId).toBe("");
  });

  it("rejeita faixa que não existe no arquivo e episódio inexistente", async () => {
    expect((await put(ids[0], "e99")).status).toBe(400);
    expect((await put(9999, "e1")).status).toBe(404);
    expect((await (await import("@/app/api/subtitles/[episodeId]/route")).GET(new Request("http://x"), { params: Promise.resolve({ episodeId: "9999" }) } as never)).status).toBe(404);
  });
});
