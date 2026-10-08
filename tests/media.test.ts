import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-media-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.CACHE_DIR = path.join(tmp, "cache");
const dir = path.join(tmp, "midia", "Show");
const mkv = path.join(dir, "Show - 01.mkv");
const FONT = "/usr/share/fonts/noto/NotoSansDuployan-Bold.ttf";

const ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1
Style: Sign,Noto Sans Duployan,40,&H0000FFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.50,0:00:02.50,Default,,0,0,0,,Olá {\\i1}mundo{\\i0}
Dialogue: 1,0:00:00.50,0:00:02.50,Sign,,0,0,0,,{\\pos(320,60)\\c&H0000FF&}Placa no topo
`;

const ff = (...a: string[]) => execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", ...a]);
const md5 = (file: string) =>
  execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-i", file, "-map", "0:v:0", "-c", "copy", "-f", "md5", "-"]).toString().trim();

let db: typeof import("@/lib/db").db;
let episodes: typeof import("@/lib/db").episodes;
let titles: typeof import("@/lib/db").titles;
let libraryFolders: typeof import("@/lib/db").libraryFolders;
let epId = 0;

beforeAll(async () => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(tmp, "sub.ass"), ASS);
  // H.264 + AC3 (navegador não toca AC3) + ASS + fonte anexada, num MKV
  ff("-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-i", path.join(tmp, "sub.ass"), "-map", "0:v", "-map", "1:a", "-map", "2:s",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "ac3", "-c:s", "copy",
    "-attach", FONT, "-metadata:s:t", "mimetype=application/x-truetype-font", mkv);
  // legenda externa SRT em Windows-1252 com itálico e posição
  fs.writeFileSync(path.join(dir, "Show - 01.pt-BR.srt"), Buffer.from("1\n00:00:00,500 --> 00:00:02,000\n{\\an8}<i>Ação</i> no topo\n", "latin1"));

  ({ db, episodes, titles, libraryFolders } = await import("@/lib/db"));
  db.insert(libraryFolders).values({ path: path.join(tmp, "midia") }).run();
  db.insert(titles).values({ folderId: 1, sourceKey: "Show", name: "Show", category: "series" }).run();
  epId = db.insert(episodes).values({ titleId: 1, filePath: mkv, season: 1, episode: 1 }).returning({ id: episodes.id }).get().id;
});

async function waitReady(opts = {}) {
  const { prepare } = await import("@/lib/media/prepare");
  for (let i = 0; i < 100; i++) {
    const s = await prepare(epId, mkv, opts);
    if (s.state === "ready") return s;
    if (s.state === "error") throw new Error(s.error);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timeout");
}

describe("remux sem perda", () => {
  it("copia o vídeo bit a bit e só converte o áudio AC3 para AAC", async () => {
    const s = await waitReady();
    expect(s.plan).toMatchObject({ direct: false, video: "copy", audio: "aac" });
    const { playablePath } = await import("@/lib/media/prepare");
    const { probe } = await import("@/lib/media/ffprobe");
    const out = await playablePath(epId, mkv, await probe(mkv), s.plan);
    const p = await probe(out);
    expect(p.video?.codec).toBe("h264");
    expect(p.audio[0].codec).toBe("aac");
    expect(md5(out)).toBe(md5(mkv)); // mesmos pacotes de vídeo = zero perda
  });

  it("chamadas simultâneas não corrompem o arquivo (um único ffmpeg)", async () => {
    const { prepare, playablePath } = await import("@/lib/media/prepare");
    const { probe } = await import("@/lib/media/ffprobe");
    const { makePlan } = await import("@/lib/media/plan");
    const opts = { audioIndex: 1, mode: "compat" as const }; // variante ainda não gerada
    const states = await Promise.all([prepare(epId, mkv, opts), prepare(epId, mkv, opts), prepare(epId, mkv, opts)]);
    expect(states.every((s) => s.state === "preparing" || s.state === "ready")).toBe(true);
    await waitReady(opts);
    const plan = makePlan(mkv, await probe(mkv), opts);
    const out = await playablePath(epId, mkv, await probe(mkv), plan);
    const p = await probe(out); // lança se o arquivo estiver corrompido
    expect(p.video?.codec).toBe("h264");
    expect(p.duration).toBeGreaterThan(2);
  });

  it("segunda chamada não refaz o trabalho", async () => {
    const { prepare } = await import("@/lib/media/prepare");
    expect((await prepare(epId, mkv)).state).toBe("ready");
  });
});

describe("stream com HTTP Range", () => {
  it("responde 206 com o trecho pedido, 200 sem Range e 416 fora do arquivo", async () => {
    const { GET } = await import("@/app/api/stream/[episodeId]/route");
    const ctx = { params: Promise.resolve({ episodeId: String(epId) }) } as never;
    const url = `http://x/api/stream/${epId}?audio=&mode=auto`;

    const full = await GET(new Request(url), ctx);
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    const size = Number(full.headers.get("content-length"));
    await full.body?.cancel();

    const part = await GET(new Request(url, { headers: { Range: "bytes=100-199" } }), ctx);
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 100-199/${size}`);
    expect((await part.arrayBuffer()).byteLength).toBe(100);

    const bad = await GET(new Request(url, { headers: { Range: `bytes=${size + 10}-` } }), ctx);
    expect(bad.status).toBe(416);
  });
});

describe("legendas", () => {
  it("lista a faixa ASS embutida, o SRT externo e a fonte anexada", async () => {
    const { listSubtitles } = await import("@/lib/media/subtitles");
    const { tracks, fonts } = await listSubtitles(mkv);
    expect(tracks.map((t) => [t.origin, t.format])).toEqual([["embedded", "ass"], ["external", "ass"]]);
    expect(tracks[1].label).toBe("Português (Brasil)");
    expect(fonts).toEqual([{ name: "NotoSansDuployan-Bold.ttf" }]);
  });

  it("ASS embutido sai com estilos, posição e efeitos idênticos ao original", async () => {
    const { subtitleFile } = await import("@/lib/media/subtitles");
    const f = await subtitleFile(epId, mkv, "e2");
    const out = fs.readFileSync(f!.path, "utf8");
    expect(out).toContain("Style: Sign,Noto Sans Duployan,40,&H0000FFFF");
    expect(out).toContain("{\\pos(320,60)\\c&H0000FF&}Placa no topo");
    expect(out).toContain("Olá {\\i1}mundo{\\i0}");
    expect(out).toContain("PlayResX: 640");
  });

  it("SRT em Windows-1252 vira ASS em UTF-8 mantendo itálico e posição", async () => {
    const { subtitleFile } = await import("@/lib/media/subtitles");
    const f = await subtitleFile(epId, mkv, "x0");
    const out = fs.readFileSync(f!.path, "utf8");
    expect(out).toContain("Ação");
    expect(out).toMatch(/\\an8/);
    expect(out).toMatch(/\\i1/);
  });

  it("extrai a fonte anexada e rejeita nomes que não existem no arquivo", async () => {
    const { fontFile } = await import("@/lib/media/subtitles");
    const f = await fontFile(epId, mkv, "NotoSansDuployan-Bold.ttf");
    expect(fs.statSync(f!).size).toBe(fs.statSync(FONT).size);
    expect(await fontFile(epId, mkv, "../../etc/passwd")).toBeNull();
  });
});

describe("planejamento", () => {
  it("decide copiar, recodificar ou tocar direto", async () => {
    const { makePlan } = await import("@/lib/media/plan");
    const base = { duration: 1, audio: [{ index: 1, codec: "aac", channels: 2, lang: null, title: null, isDefault: true }], subs: [], attachments: [] };
    const v = (codec: string, pixFmt: string) => ({ ...base, video: { index: 0, codec, pixFmt, width: 1920, height: 1080 } });
    expect(makePlan("a.mkv", v("h264", "yuv420p")).video).toBe("copy");
    expect(makePlan("a.mkv", v("hevc", "yuv420p10le")).video).toBe("copy"); // HEVC: copia; recodifica só se falhar no navegador
    expect(makePlan("a.mkv", v("h264", "yuv420p10le")).video).toBe("x264"); // Hi10P não roda no navegador
    expect(makePlan("a.mkv", v("mpeg4", "yuv420p")).video).toBe("x264");
    expect(makePlan("a.mp4", v("h264", "yuv420p")).direct).toBe(true);
    expect(makePlan("a.mkv", v("h264", "yuv420p")).direct).toBe(false);
    expect(makePlan("a.mp4", v("h264", "yuv420p"), { mode: "compat" })).toMatchObject({ direct: false, video: "x264" });
  });
});

describe("progresso", () => {
  it("salva, marca como concluído e sugere o próximo episódio", async () => {
    const { saveProgress, getProgress, listContinueWatching } = await import("@/lib/progress");
    const ep2 = db.insert(episodes).values({ titleId: 1, filePath: "/x/Show - 02.mkv", season: 1, episode: 2 }).returning({ id: episodes.id }).get().id;

    saveProgress(epId, 120, 1400);
    expect(getProgress(epId)).toMatchObject({ positionSec: 120, completed: false });
    expect(listContinueWatching()[0]).toMatchObject({ episodeId: epId, positionSec: 120 });

    saveProgress(epId, 1390, 1400); // terminou
    expect(getProgress(epId)?.completed).toBe(true);
    expect(listContinueWatching()[0]).toMatchObject({ episodeId: ep2, positionSec: 0 });

    saveProgress(ep2, 1300, 1400);
    expect(listContinueWatching()).toHaveLength(0); // acabou o último episódio
    expect(saveProgress(epId, NaN, 10)).toBe(false);
  });
});
