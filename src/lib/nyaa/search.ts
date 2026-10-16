import { NYAA_PAGE_SIZE, parseNyaaHtml, type NyaaPage } from "./parse";

/** Categoria do Nyaa: 1_0 todo anime, 1_2 legendado em inglês, 1_3 legendado em outros idiomas, 1_4 raw. */
export type NyaaLang = "all" | "en" | "other" | "raw" | "ptbr" | "ptbr-sub" | "ptbr-dub";
export type NyaaSort = "auto" | "seeders" | "date" | "size" | "downloads";
export type NyaaResolution = "" | "2160p" | "1080p" | "720p" | "480p";

export interface NyaaSearch {
  q: string;
  lang: NyaaLang;
  resolution: NyaaResolution;
  trusted: boolean;
  sort: NyaaSort;
  page: number;
}

export const LANGS: NyaaLang[] = ["all", "en", "other", "raw", "ptbr", "ptbr-sub", "ptbr-dub"];
export const SORTS: NyaaSort[] = ["auto", "seeders", "date", "size", "downloads"];
export const RESOLUTIONS: NyaaResolution[] = ["", "2160p", "1080p", "720p", "480p"];

const CATEGORY: Record<NyaaLang, string> = { all: "1_0", en: "1_2", other: "1_3", raw: "1_4", ptbr: "1_0", "ptbr-sub": "1_0", "ptbr-dub": "1_0" };
const SORT_FIELD: Record<Exclude<NyaaSort, "auto">, string> = { seeders: "seeders", date: "id", size: "size", downloads: "downloads" };
/** O Nyaa entende `(a|b)` como "a ou b". Em português nem todo release escreve "PT-BR" do mesmo jeito. */
const PTBR_TERMS = "(pt-br|ptbr|por-br|portuguese|português|portugues)";
/** Termos extras: dublado exige uma marca de dublagem; legendado tira o que se diz "dublado" (o resto é refinado pelo título). */
const LANG_TERMS: Partial<Record<NyaaLang, string>> = {
  ptbr: PTBR_TERMS,
  "ptbr-sub": `${PTBR_TERMS} -dublado -dublagem`,
  "ptbr-dub": `${PTBR_TERMS} (dublado|dublagem|dual|dub)`,
};

export class NyaaUnavailable extends Error {}

export const nyaaBase = () => (process.env.NYAA_URL ?? "https://nyaa.si").replace(/\/+$/, "");

export function buildNyaaUrl(s: NyaaSearch, base = nyaaBase()): string {
  const terms = [LANG_TERMS[s.lang] ?? "", s.q.trim(), s.resolution].filter(Boolean).join(" ");
  const sort = s.sort === "auto" ? (s.q.trim() ? "seeders" : "date") : s.sort;
  const u = new URL(`${base}/`);
  u.searchParams.set("f", s.trusted ? "2" : "0");
  u.searchParams.set("c", CATEGORY[s.lang]);
  if (terms) u.searchParams.set("q", terms);
  u.searchParams.set("s", SORT_FIELD[sort]);
  u.searchParams.set("o", "desc");
  if (s.page > 1) u.searchParams.set("p", String(s.page));
  return u.toString();
}

// Cache curto em memória: trocar de página/filtro e voltar não vai ao site de novo, e o Nyaa não é sobrecarregado.
const TTL = 2 * 60_000;
const g = globalThis as unknown as { __nyaaCache?: Map<string, { at: number; page: NyaaPage }> };
const cache = (g.__nyaaCache ??= new Map());

export async function searchNyaa(s: NyaaSearch): Promise<NyaaPage> {
  const url = buildNyaaUrl(s);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.page;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Streaming/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new NyaaUnavailable("Não foi possível acessar o Nyaa agora (sem resposta). Pode estar fora do ar ou bloqueado pelo provedor.", { cause: e });
  }
  // sem resultados em páginas além da última o Nyaa responde 404
  if (res.status === 404) return { items: [], total: 0, page: s.page, pages: 1 };
  if (!res.ok) throw new NyaaUnavailable(`O Nyaa respondeu ${res.status}. Tente de novo em instantes.`);

  const html = await res.text();
  const page = parseNyaaHtml(html, s.page, nyaaBase());
  if (page.items.length === 0 && /<tr class="(default|success|danger)">/.test(html)) {
    throw new NyaaUnavailable("Não consegui ler a página do Nyaa: o formato mudou.");
  }
  if (cache.size >= 60) cache.delete(cache.keys().next().value!);
  cache.set(url, { at: Date.now(), page });
  return page;
}

export { NYAA_PAGE_SIZE };
