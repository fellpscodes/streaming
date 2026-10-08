import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { mergeMarks, resolveSkip, segmentsFromChapters } from "@/lib/media/skip";

const ch = (title: string, start: number, end: number) => ({ title, start, end });

describe("abertura e encerramento pelos capítulos", () => {
  it("usa os capítulos reais de um episódio (OP e ED, como nos seus arquivos)", () => {
    const chapters = [
      ch("Chapter 1", 0, 78.995), ch("OP", 78.995, 168.96), ch("Title", 168.96, 171.963), ch("Chapter 2", 171.963, 245.536),
      ch("Chapter 9", 801.759, 1449.99), ch("ED", 1449.99, 1539.955),
    ];
    const r = segmentsFromChapters(chapters, 1539.955);
    expect(r.intro).toEqual({ start: 78.995, end: 168.96, source: "chapters" });
    expect(r.outro).toEqual({ start: 1449.99, end: 1539.955, source: "chapters" });
  });

  it.each([
    ["OP", "ED"], ["OP1", "ED1"], ["Opening", "Ending"], ["Opening Theme", "Ending Theme"],
    ["Abertura", "Encerramento"], ["Intro", "Credits"], ["Introdução", "Créditos"], ["op 2", "End Credits"],
  ])("reconhece os nomes %s / %s", (a, b) => {
    const r = segmentsFromChapters([ch("Cena", 0, 60), ch(a, 60, 150), ch("Episódio", 150, 1300), ch(b, 1300, 1400)], 1400);
    expect(r.intro?.start).toBe(60);
    expect(r.outro?.start).toBe(1300);
  });

  it("não confunde capítulos comuns e ignora trechos implausíveis", () => {
    expect(segmentsFromChapters([ch("Operation Titan", 0, 90), ch("Opened door", 90, 200), ch("Chapter 3", 200, 400)], 400)).toEqual({ intro: null, outro: null });
    expect(segmentsFromChapters([ch("OP", 10, 20)], 1400).intro).toBeNull(); // 10 s: curto demais para ser abertura
    expect(segmentsFromChapters([ch("OP", 0, 1400)], 1400).intro).toBeNull(); // o vídeo inteiro
    expect(segmentsFromChapters([ch("ED", 0, 90)], 1400).outro).toBeNull(); // "encerramento" no início
    expect(segmentsFromChapters([], 1400)).toEqual({ intro: null, outro: null });
  });
});

describe("prioridade entre capítulos e marcas manuais", () => {
  const chapters = [ch("OP", 60, 150)];
  it("capítulos vencem; marcas cobrem o que o arquivo não tem", () => {
    const r = resolveSkip(chapters, 1400, { introStart: 5, introEnd: 40, outroStart: 1300 });
    expect(r.intro).toEqual({ start: 60, end: 150, source: "chapters" });
    expect(r.outro).toEqual({ start: 1300, end: 1400, source: "manual" });
  });
  it("sem capítulos, usa a marca manual; abertura só vale com início E fim", () => {
    expect(resolveSkip([], 1400, { introStart: 30, introEnd: 120 }).intro).toEqual({ start: 30, end: 120, source: "manual" });
    expect(resolveSkip([], 1400, { introStart: 30 }).intro).toBeNull();
    expect(resolveSkip([], 1400, null)).toEqual({ intro: null, outro: null });
  });
});

describe("validação das marcas", () => {
  it("junta, arredonda, apaga com null e rejeita valores inválidos", () => {
    expect(mergeMarks(null, { introStart: 30.04 })).toEqual({ introStart: 30 });
    expect(mergeMarks({ introStart: 30 }, { introEnd: 120 })).toEqual({ introStart: 30, introEnd: 120 });
    expect(mergeMarks({ introStart: 30, introEnd: 120 }, { introStart: null })).toEqual({ introEnd: 120 });
    expect(mergeMarks({ introStart: 30 }, { introEnd: 10 })).toHaveProperty("error");
    expect(mergeMarks(null, { outroStart: -1 })).toHaveProperty("error");
    expect(mergeMarks(null, { outroStart: Number.NaN })).toHaveProperty("error");
  });
});

// ---- integração: arquivos reais, um com capítulos e outro sem ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-skip-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.CACHE_DIR = path.join(tmp, "cache");
const dir = path.join(tmp, "midia", "Show");
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", ...a]);
let withChapters = 0;
let without = 0;

describe("API /api/skip", () => {
  beforeAll(async () => {
    fs.mkdirSync(dir, { recursive: true });
    const meta = path.join(tmp, "meta.txt");
    const chap = (s: number, e: number, t: string) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${s * 1000}\nEND=${e * 1000}\ntitle=${t}\n`;
    fs.writeFileSync(meta, `;FFMETADATA1\n${chap(0, 8, "Chapter 1")}${chap(8, 28, "OP")}${chap(28, 70, "Chapter 2")}${chap(70, 90, "ED")}`);
    const video = (out: string, extra: string[]) =>
      ff("-f", "lavfi", "-i", "color=c=black:s=320x180:r=10:d=90", ...extra, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "10", out);
    video(path.join(dir, "Show - 01.mkv"), ["-i", meta, "-map", "0:v", "-map_metadata", "1", "-map_chapters", "1"]);
    video(path.join(dir, "Show - 02.mkv"), []);
    const { db, episodes, titles, libraryFolders } = await import("@/lib/db");
    db.insert(libraryFolders).values({ path: path.join(tmp, "midia") }).run();
    db.insert(titles).values({ folderId: 1, sourceKey: "Show", name: "Show", category: "series" }).run();
    [withChapters, without] = [1, 2].map((n) => db.insert(episodes).values({ titleId: 1, filePath: path.join(dir, `Show - 0${n}.mkv`), season: 1, episode: n }).returning({ id: episodes.id }).get().id);
  });

  const ctx = (id: number) => ({ params: Promise.resolve({ episodeId: String(id) }) }) as never;
  const route = () => import("@/app/api/skip/[episodeId]/route");
  const put = async (id: number, body: unknown) =>
    (await route()).PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body) }), ctx(id));

  it("episódio com capítulos: detecta OP e ED sozinho", async () => {
    const r = await (await (await route()).GET(new Request("http://x"), ctx(withChapters))).json();
    expect(r.intro).toMatchObject({ start: 8, end: 28, source: "chapters" });
    expect(r.outro).toMatchObject({ start: 70, source: "chapters" });
  });

  it("episódio sem capítulos: nada detectado até você marcar", async () => {
    const r = await (await (await route()).GET(new Request("http://x"), ctx(without))).json();
    expect(r.intro).toBeNull();
    expect(r.outro).toBeNull();
  });

  it("marcar à mão vale para o título; capítulos continuam mandando onde existem", async () => {
    expect((await put(without, { introStart: 5 })).status).toBe(200); // só o início: ainda não é uma abertura
    expect((await (await put(without, { introStart: 5 })).json()).intro).toBeNull();
    const done = await (await put(without, { introEnd: 25, outroStart: 75 })).json();
    expect(done.intro).toMatchObject({ start: 5, end: 25, source: "manual" });
    expect(done.outro).toMatchObject({ start: 75, source: "manual" });
    const other = await (await (await route()).GET(new Request("http://x"), ctx(withChapters))).json();
    expect(other.intro).toMatchObject({ start: 8, end: 28, source: "chapters" }); // o arquivo com capítulos não muda
    expect(other.outro).toMatchObject({ start: 70, source: "chapters" });
  });

  it("rejeita marca inválida e episódio inexistente; DELETE limpa", async () => {
    expect((await put(without, { introEnd: 2 })).status).toBe(400); // fim antes do início (5)
    expect((await put(9999, { introStart: 1 })).status).toBe(404);
    const cleared = await (await (await route()).DELETE(new Request("http://x", { method: "DELETE" }), ctx(without))).json();
    expect(cleared.intro).toBeNull();
    expect(cleared.marks).toEqual({});
  });
});
