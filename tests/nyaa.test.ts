import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseNyaaHtml, showName } from "@/lib/nyaa/parse";
import { parseRelease } from "@/lib/nyaa/release";
import { buildNyaaUrl } from "@/lib/nyaa/search";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-nyaa-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.CACHE_DIR = path.join(tmp, "cache");
vi.mock("next/server", () => ({ connection: async () => {} }));

const HASH = "530198ca831ad9d24e9b8a5ad01bbdd9762f1170";
const row = (cls: string, id: number, title: string, seeders: number, hash = HASH) => `
  <tr class="${cls}">
    <td><a href="/?c=1_2" title="Anime - English-translated"><img src="/x.png"></a></td>
    <td colspan="2">
      <a href="/view/${id}#comments" class="comments" title="3 comments"><i></i>3</a>
      <a href="/view/${id}" title="${title}">${title}</a>
    </td>
    <td class="text-center">
      <a href="/download/${id}.torrent"></a>
      <a href="magnet:?xt=urn:btih:${hash}&amp;dn=x&amp;tr=udp%3A%2F%2Ft%3A80"></a>
    </td>
    <td class="text-center">1.4 GiB</td>
    <td class="text-center" data-timestamp="1699023690">2023-11-03 15:01</td>
    <td class="text-center">${seeders}</td>
    <td class="text-center">2</td>
    <td class="text-center">73210</td>
  </tr>`;

describe("parseRelease", () => {
  it("episódio avulso de fansub", () => {
    expect(parseRelease("[SubsPlease] Sousou no Frieren - 09 (1080p) [40376E5A].mkv")).toMatchObject({
      group: "SubsPlease", resolution: "1080p", kind: "episode", episode: 9,
    });
  });
  it("pacote com intervalo, codec e legendas múltiplas", () => {
    expect(parseRelease("[Erai-raws] Sousou no Frieren - 01 ~ 28 [1080p][HEVC][BATCH][Multiple Subtitle] [ENG][POR-BR]")).toMatchObject({
      kind: "batch", codec: "HEVC", multiSub: true, ptBr: true, episode: null,
    });
  });
  it("estilo scene: S02E08 e grupo no final", () => {
    const r = parseRelease("Show.S02E08.1080p.WEB-DL.DUAL.AAC2.0.H.264-VARYG");
    expect(r).toMatchObject({ kind: "episode", episode: 8, resolution: "1080p", source: "WEB", dualAudio: true, group: "VARYG" });
  });
  it("S01E20v2 é episódio; temporada inteira e BD são pacotes; resto é 'other'", () => {
    expect(parseRelease("[LostYears] Frieren - S01E20v2 (WEB 1080p x265)").kind).toBe("episode");
    expect(parseRelease("Frieren S02 1080p CR WEB-DL").kind).toBe("batch");
    expect(parseRelease("[PMR] Frieren (BD Remux 1080p AVC FLAC)")).toMatchObject({ kind: "batch", source: "BD", codec: "AVC" });
    expect(parseRelease("[Grupo] Kimi no Na wa 1080p").kind).toBe("other");
  });
  it("resolução não vira intervalo nem episódio", () => {
    expect(parseRelease("[G] Algo - 1080p").kind).toBe("other");
    expect(parseRelease("[G] Algo 4K")).toMatchObject({ resolution: "2160p" });
    expect(parseRelease("[G] Algo 1920x1080")).toMatchObject({ resolution: "1080p" });
  });
});

describe("showName", () => {
  it("tira fansub, episódio, resolução e tags", () => {
    expect(showName("[SubsPlease] Sousou no Frieren - 09 (1080p) [40376E5A].mkv")).toBe("Sousou no Frieren");
    expect(showName("[Erai-raws] One Piece - 0892 ~ 1089 [1080p][HEVC][BATCH]")).toBe("One Piece");
    expect(showName("[WF] Oshi no Ko 3rd Season - 04 [BD 1080p x265 OPUS][PT-BR] (S03E28)")).toBe("Oshi no Ko 3rd Season");
    expect(showName("Frieren Beyond Journeys End S02E08 A Magnificent End 1080p CR WEB-DL")).toBe("Frieren Beyond Journeys End");
  });
  it("intervalos de episódios e colchetes abertos não entram no nome (era 'Samurai Champloo 1-26 [')", () => {
    expect(showName("[Anime Time] Samurai Champloo 1-26 [BD][1080p][HEVC 10bit x265][Dual Audio]")).toBe("Samurai Champloo");
    expect(showName("[Judas] Samurai Champloo - 01-26 (BD 1080p)")).toBe("Samurai Champloo");
    expect(showName("[SubsPlease] Sousou no Frieren (01-28) (1080p) [V2] [Batch]")).toBe("Sousou no Frieren");
    expect(showName("[Group] 86 Eighty-Six 01-11 [1080p]")).toBe("86 Eighty-Six");
    expect(showName("[Group] Mob Psycho 100 S01-S03 [BD]")).toBe("Mob Psycho 100");
    expect(showName("Cowboy Bebop 1998 Complete Series [1080p")).toBe("Cowboy Bebop");
  });
  it("estilo [Grupo][Nome][tags]: pega o nome entre colchetes", () => {
    expect(showName("[philosophy-raws][Samurai Champloo][BDRIP][1080p 10bit][TV 01-26+SP+CD][dual audio]")).toBe("Samurai Champloo");
    expect(showName("[Fussoir][Neon Genesis Evangelion][TV 01-26][BDRip][1080p][AVC 10bit AAC&AC3]")).toBe("Neon Genesis Evangelion");
    expect(showName("[GM-Team][国漫][镇魂街 第4季 天武风雷篇][Rakshasa Street Ⅳ][2024][01-26 Fin][AVC][GB][1080P]")).toBe("Rakshasa Street Ⅳ");
    expect(showName("[Erai-raws] Black Clover (TV) - 001 ~ 170 [1080p][BATCH]")).toBe("Black Clover"); // um colchete só: segue o caminho normal
  });
  it("não mexe em títulos com número ou hífen que fazem parte do nome", () => {
    expect(showName("[Group] Ranma 1/2 (2024) - 03 [1080p]")).toBe("Ranma 1/2");
    expect(showName("[Group] Yu-Gi-Oh! 5D's - 12 [1080p]")).toBe("Yu-Gi-Oh! 5D's");
    expect(showName("[Group] Oshi no Ko 3rd Season - 04 [1080p]")).toBe("Oshi no Ko 3rd Season");
  });
  it("nunca devolve vazio", () => {
    expect(showName("[G] 1080p")).toBeTruthy();
  });
});

describe("capas (AniList em lote)", () => {
  const media = (name: string) => ({ media: [{ title: { romaji: name, english: null }, coverImage: { large: `http://c/${name}.jpg` } }] });
  it("uma consulta para vários nomes; sem correspondência vira null; usa cache; falha não é guardada", async () => {
    const { lookupCovers } = await import("@/lib/nyaa/covers");
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const vars = JSON.parse(String(init!.body)).variables as Record<string, string>;
      const data = Object.fromEntries(Object.values(vars).map((n, i) => [`m${i}`, n === "Nada" ? { media: [] } : media(n)]));
      return new Response(JSON.stringify({ data }));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const a = await lookupCovers(["Alfa X", "Beta X", "Nada", "  Alfa X  ", ""]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(a).toEqual({ "Alfa X": { name: "Alfa X", url: "http://c/Alfa X.jpg" }, "Beta X": { name: "Beta X", url: "http://c/Beta X.jpg" }, Nada: null });
      await lookupCovers(["alfa x", "Nada"]); // mesmo nome em minúsculas e o "sem capa" vêm do cache
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 429 }));
      expect(await lookupCovers(["Gama X"])).toEqual({}); // limite de uso: fica de fora...
      expect((await lookupCovers(["Gama X"]))["Gama X"]).toMatchObject({ url: "http://c/Gama X.jpg" }); // ...e a próxima tenta de novo
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("legendado × dublado em PT-BR", () => {
  const kinds = (t: string) => {
    const r = parseRelease(t);
    return [r.ptBrSub, r.ptBrDub];
  };
  it("Erai-raws: legenda PT-BR entre várias (sem dublagem)", () => {
    expect(kinds("[Erai-raws] Sousou no Frieren - 01 ~ 28 [1080p][BATCH][Multiple Subtitle] [ENG][POR-BR][SPA-LA]")).toEqual([true, false]);
  });
  it("WF: [PT-BR] sozinho é legenda; [DUAL][PT-BR] / 'Dublado' é dublagem", () => {
    expect(kinds("[WF] Oshi no Ko 3rd Season - 04 [BD 1080p x265 OPUS][PT-BR] (S03E28)")).toEqual([true, false]);
    expect(kinds("[WF] Sousou no Frieren 2nd Season [BD 1080p x265 OPUS AAC][DUAL][PT-BR]")).toEqual([false, true]);
    expect(kinds("[Anipakku] Undead Unluck (S01) [BD 1080p x265 OPUS][DUAL][PT-BR] (Dublado)")).toEqual([false, true]);
  });
  it("Anitsu: dublado e legendado ao mesmo tempo", () => {
    expect(kinds("[Anitsu] Tokyo Revengers S01 [BD 1080p x265 Opus] [DUAL JAP PT-BR] [SUB PT-BR ENG]")).toEqual([true, true]);
  });
  it("sem português: nenhum dos dois", () => {
    expect(kinds("[SubsPlease] Sousou no Frieren - 09 (1080p) [40376E5A].mkv")).toEqual([false, false]);
  });
});

describe("parseNyaaHtml", () => {
  const html = `<div class="pagination-page-info">Displaying results 1-75 out of 937 results.</div><table><tbody>
    ${row("success", 111, "[SubsPlease] A &amp; B - 01 (1080p) [AAAA].mkv", 129)}
    ${row("danger", 222, "[X] Remake - 02", 0, "d4d18d7b59f4e3049e7a0744c606c711c66ecba6")}
    ${row("default", 333, "Sem &#39;aspas&#39;", 5, "5c286b8b6059fea71be70d9fb79e226510493f08")}
    <tr class="default"><td>linha quebrada</td></tr>
  </tbody></table>`;
  const page = parseNyaaHtml(html, 1);

  it("lê as linhas, ignora as quebradas e calcula o total de páginas", () => {
    expect(page.items.map((i) => i.id)).toEqual([111, 222, 333]);
    expect(page).toMatchObject({ total: 937, pages: 13, page: 1 });
  });
  it("extrai campos e decodifica entidades", () => {
    const [a, b, c] = page.items;
    expect(a).toMatchObject({
      title: "[SubsPlease] A & B - 01 (1080p) [AAAA].mkv", seeders: 129, leechers: 2, downloads: 73210,
      size: "1.4 GiB", trusted: true, remake: false, infoHash: HASH, url: "https://nyaa.si/view/111",
    });
    expect(a.magnet).toContain("&dn=x&tr=");
    expect(a.date).toBe(1699023690_000);
    expect(b).toMatchObject({ remake: true, trusted: false });
    expect(c.title).toBe("Sem 'aspas'");
  });
  it("sem a linha de total, usa a quantidade de itens", () => {
    expect(parseNyaaHtml(`<table>${row("default", 1, "x", 1)}</table>`, 1)).toMatchObject({ total: 1, pages: 1 });
  });
});

describe("buildNyaaUrl", () => {
  const base = { q: "frieren", lang: "all", resolution: "", trusted: false, sort: "auto", page: 1 } as const;
  it("busca com texto ordena por seeders; sem texto, por data", () => {
    expect(new URL(buildNyaaUrl(base)).searchParams.get("s")).toBe("seeders");
    expect(new URL(buildNyaaUrl({ ...base, q: "" })).searchParams.get("s")).toBe("id");
  });
  it("idioma vira categoria; português vira termos OU; resolução entra no texto", () => {
    expect(new URL(buildNyaaUrl({ ...base, lang: "en" })).searchParams.get("c")).toBe("1_2");
    const pt = new URL(buildNyaaUrl({ ...base, lang: "ptbr", resolution: "1080p" })).searchParams;
    expect(pt.get("c")).toBe("1_0");
    expect(pt.get("q")).toBe("(pt-br|ptbr|por-br|portuguese|português|portugues) frieren 1080p");
  });
  it("PT-BR legendado exclui 'dublado'; dublado exige marca de dublagem", () => {
    const sub = new URL(buildNyaaUrl({ ...base, lang: "ptbr-sub" })).searchParams.get("q")!;
    expect(sub).toContain("-dublado");
    const dub = new URL(buildNyaaUrl({ ...base, lang: "ptbr-dub" })).searchParams.get("q")!;
    expect(dub).toContain("(dublado|dublagem|dual|dub)");
    expect(new URL(buildNyaaUrl({ ...base, lang: "ptbr-dub" })).searchParams.get("c")).toBe("1_0");
  });
  it("só confiáveis e página", () => {
    const p = new URL(buildNyaaUrl({ ...base, trusted: true, page: 3 })).searchParams;
    expect(p.get("f")).toBe("2");
    expect(p.get("p")).toBe("3");
    expect(new URL(buildNyaaUrl(base)).searchParams.has("p")).toBe(false);
  });
});

describe("qBittorrent + download", () => {
  let server: http.Server;
  let url: string;
  const calls: Array<{ path: string; body: string }> = [];
  const torrents: Array<Record<string, unknown>> = [];
  let legacy = false; // true = comportamento do qBittorrent 4.x: "Ok." + cookie SID; false = v5: 204 + QBT_SID_<porta>
  let animeDir: string;
  let otherDir: string;

  beforeAll(async () => {
    // qBittorrent falso: exige login (SID) em tudo menos /auth/login
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const p = req.url!.split("?")[0];
        calls.push({ path: p, body });
        if (p === "/api/v2/auth/login") {
          const ok = new URLSearchParams(body).get("password") === "segredo";
          if (!ok) return legacy ? res.end("Fails.") : res.writeHead(401).end("Unauthorized");
          res.setHeader("Set-Cookie", `${legacy ? "SID" : "QBT_SID_8080"}=abc123; HttpOnly; path=/`);
          return legacy ? res.end("Ok.") : res.writeHead(204).end();
        }
        if (!req.headers.cookie?.includes("SID") || !req.headers.cookie.includes("=abc123")) return res.writeHead(403).end("Forbidden");
        if (p === "/api/v2/app/version") return res.end("v5.0.0");
        if (p === "/api/v2/torrents/createCategory") return res.writeHead(409).end();
        if (p === "/api/v2/torrents/info") return res.setHeader("Content-Type", "application/json").end(JSON.stringify(torrents));
        if (p === "/api/v2/torrents/add") {
          const f = new URLSearchParams(body);
          torrents.push({ hash: f.get("urls")!.match(/btih:(\w{40})/)![1].toLowerCase(), name: "x", progress: 0, state: "metaDL", dlspeed: 0, eta: 8640000, size: 1, save_path: f.get("savepath"), added_on: 1 });
          return res.end("Ok.");
        }
        res.writeHead(404).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    animeDir = fs.mkdirSync(path.join(tmp, "animes"), { recursive: true }) as string;
    otherDir = fs.mkdirSync(path.join(tmp, "filmes"), { recursive: true }) as string;
    const { db, libraryFolders } = await import("@/lib/db");
    db.insert(libraryFolders).values({ path: otherDir, kind: "movie" }).run(); // cadastrada primeiro, mas não é de animes
    db.insert(libraryFolders).values({ path: animeDir, kind: "anime" }).run();
  });
  afterAll(() => new Promise((r) => server.close(() => r(undefined))));

  it("login automático (403 → login → repete) e senha errada", async () => {
    const q = await import("@/lib/qbittorrent");
    await expect(q.qbtVersion({ url, username: "u", password: "errada" })).rejects.toThrow(/incorretos/);
    expect(await q.qbtVersion({ url, username: "u", password: "segredo" })).toBe("v5.0.0");
  });

  it("também entende o formato antigo (4.x): 200 \"Ok.\" e cookie SID", async () => {
    const q = await import("@/lib/qbittorrent");
    legacy = true;
    try {
      await expect(q.qbtVersion({ url, username: "outro", password: "errada" })).rejects.toThrow(/incorretos/);
      expect(await q.qbtVersion({ url, username: "legado", password: "segredo" })).toBe("v5.0.0");
    } finally {
      legacy = false;
    }
  });

  it("servidor desligado vira QbtError com instrução", async () => {
    const q = await import("@/lib/qbittorrent");
    await expect(q.qbtVersion({ url: "http://127.0.0.1:1", username: "", password: "" })).rejects.toThrow(/Interface Web/);
  });

  it("normaliza o endereço", async () => {
    const { normalizeQbtUrl } = await import("@/lib/qbittorrent");
    expect(normalizeQbtUrl("localhost:8080/")).toBe("http://localhost:8080");
    expect(() => normalizeQbtUrl("ftp://x")).toThrow();
  });

  it("baixa para <pasta de animes>/<nome limpo>, avisa duplicata e valida o magnet", async () => {
    const { saveQbtConfig } = await import("@/lib/qbittorrent");
    const { addDownload, DownloadError } = await import("@/lib/nyaa/download");
    saveQbtConfig({ url, username: "u", password: "segredo" });
    const magnet = `magnet:?xt=urn:btih:${HASH.toUpperCase()}&dn=x`;

    const r = await addDownload({ magnet, title: "[SubsPlease] Sousou no Frieren - 09 (1080p) [40376E5A].mkv" });
    expect(r).toEqual({ savePath: path.join(animeDir, "Sousou no Frieren"), alreadyAdded: false });
    const add = calls.filter((c) => c.path === "/api/v2/torrents/add").at(-1)!;
    expect(Object.fromEntries(new URLSearchParams(add.body))).toMatchObject({
      savepath: path.join(animeDir, "Sousou no Frieren"), category: "streaming", autoTMM: "false",
    });

    expect((await addDownload({ magnet, title: "qualquer" })).alreadyAdded).toBe(true);
    expect(calls.filter((c) => c.path === "/api/v2/torrents/add")).toHaveLength(1);

    await expect(addDownload({ magnet: "magnet:?xt=urn:btih:zzz", title: "x" })).rejects.toBeInstanceOf(DownloadError);
    await expect(addDownload({ magnet, title: "x", folderId: 999 })).rejects.toThrow(/não encontrada/);
  });

  it("nome da subpasta: sem caracteres inválidos e nunca vazio", async () => {
    const { showFolderName } = await import("@/lib/nyaa/download");
    expect(showFolderName("[G] Re:Zero / Season 2 - 05 (1080p).mkv")).not.toMatch(/[/:]/);
    expect(showFolderName("[G] 1080p")).toBeTruthy();
  });

  it("conclusão de download dispara a varredura uma vez (a primeira consulta só aprende o que já estava pronto)", async () => {
    const { listDownloads } = await import("@/lib/nyaa/download");
    const first = await listDownloads();
    expect(first.scanStarted).toBe(false);
    torrents[0].progress = 1;
    torrents[0].state = "stalledUP";
    const second = await listDownloads();
    expect(second.downloads[0]).toMatchObject({ phase: "done", label: "Concluído" });
    expect(second.scanStarted).toBe(true);
    // espera a varredura terminar para não vazar para outros testes
    const { getScanState } = await import("@/lib/scanner/state");
    for (let i = 0; i < 50 && getScanState().running; i++) await new Promise((r) => setTimeout(r, 100));
    expect((await listDownloads()).scanStarted).toBe(false);
  });
});

describe("Animes em Alta", () => {
  it("monta o card e ignora o que não tem capa; filtra o que já está na biblioteca", async () => {
    const { toTrending, fetchTrending, getTrendingForHome } = await import("@/lib/trending");
    const media = (id: number, romaji: string, english: string | null, cover: string | null) => ({
      id, title: { romaji, english }, coverImage: cover ? { extraLarge: cover, large: null } : null, description: "A<br><br>\n<br>B",
      averageScore: 84, genres: ["Action", "Sci-Fi"], episodes: null, status: "RELEASING", format: "TV", seasonYear: 2026,
      startDate: { year: 2026 }, studios: { nodes: [{ name: "Studio X" }] }, nextAiringEpisode: { episode: 6 },
    });
    expect(toTrending(media(1, "X", null, null))).toBeNull();
    expect(toTrending(media(1, "Sousou no Frieren", "Frieren", "http://c/1.jpg"))).toMatchObject({
      name: "Frieren", searchName: "Sousou no Frieren", rating: 8.4, genres: ["Ação", "Ficção científica"], aired: 5, studio: "Studio X", overview: "A\n\nB",
    });

    const list = [media(10, "Alpha", "Alpha", "http://c/a"), media(11, "Beta Romaji", "Beta", "http://c/b"), media(12, "Gamma", null, "http://c/c")];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { Page: { media: list } } })));
    vi.stubGlobal("fetch", fetchMock);
    const { db, titles, libraryFolders } = await import("@/lib/db");
    const folder = db.select().from(libraryFolders).get()!;
    db.insert(titles).values({ folderId: folder.id, sourceKey: "a", name: "Qualquer", category: "anime", anilistId: 10 }).run();
    db.insert(titles).values({ folderId: folder.id, sourceKey: "b", name: "Beta!", category: "anime" }).run();
    try {
      expect((await fetchTrending()).map((a) => a.id)).toEqual([10, 11, 12]);
      expect((await getTrendingForHome()).map((a) => a.id)).toEqual([12]); // 10 por id do AniList, 11 por nome
      expect(fetchMock).toHaveBeenCalledTimes(1); // segunda chamada vem do cache
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
