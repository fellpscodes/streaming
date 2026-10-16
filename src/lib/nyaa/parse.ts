import { cleanTitle } from "@/lib/scanner/parser";
import { parseRelease, type ReleaseInfo } from "./release";

export interface NyaaItem {
  id: number;
  title: string;
  /** Nome do anime sem fansub, episódio e tags: serve para achar a capa. */
  show: string;
  /** Link da página da release no Nyaa. */
  url: string;
  magnet: string;
  infoHash: string;
  category: string;
  /** Tamanho como o Nyaa mostra ("1.4 GiB"). */
  size: string;
  /** Epoch em ms. */
  date: number;
  seeders: number;
  leechers: number;
  downloads: number;
  trusted: boolean;
  remake: boolean;
  info: ReleaseInfo;
}

export const NYAA_PAGE_SIZE = 75;

/**
 * Tira o que o `cleanTitle` do scanner deixa passar nas releases do Nyaa: intervalo de episódios
 * ("1-26", "01 ~ 28"), intervalo de temporadas ("S01-S03") e colchete/parêntese que ficou aberto.
 */
function tidy(name: string): string {
  const t = name
    .replace(/[\s(\[]*[-–~]?\s*\b\d{1,4}\s*[~–-]\s*\d{1,4}\b.*$/, "")
    .replace(/\s+S\d{1,2}\s*[-~+]\s*S?\d{1,2}\b.*$/i, "")
    .replace(/\s*[\[(][^\])]*$/, "")
    .replace(/[\s\-–~:,]+$/, "")
    .trim();
  return t || name;
}

const TAG = /\b(\d{3,4}p|bdrip|bd|web(?:rip|-dl)?|tv|hevc|avc|x26[45]|flac|aac|dual|multi|subs?|batch|fin|mkv|\d{1,4}\s*[-~+]\s*\d{1,4})\b/i;

/**
 * Estilo "[Grupo][Nome do Anime][BDRip][1080p]": o nome está entre colchetes, depois do grupo.
 * Devolve o primeiro colchete que parece nome (tem letras latinas e não é só tag), ou null.
 */
function bracketedName(title: string): string | null {
  if (!/^\s*(?:\[[^\]]*\]\s*){2,}/.test(title)) return null;
  const groups = [...title.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim()).slice(1, 6);
  return groups.find((g) => (g.match(/[A-Za-z]/g)?.length ?? 0) >= 3 && !TAG.test(g)) ?? null;
}

/** "[SubsPlease] Sousou no Frieren - 09 (1080p).mkv" → "Sousou no Frieren". */
export const showName = (title: string): string => {
  const base = title.replace(/\.(mkv|mp4|avi)$/i, "");
  const inBrackets = bracketedName(base);
  const cleaned = inBrackets ?? cleanTitle(base);
  return tidy(cleaned.replace(/\s+/g, " ").trim()) || title;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const decodeEntities = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (_, dec, hex, name) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()],
  );

export interface NyaaPage {
  items: NyaaItem[];
  total: number;
  page: number;
  pages: number;
}

/** Lê a tabela de resultados da página de busca do Nyaa. Linhas que não casam com o formato são ignoradas. */
export function parseNyaaHtml(html: string, page: number, base = "https://nyaa.si"): NyaaPage {
  // split com grupo de captura devolve [antes, classe, corpo, classe, corpo, ...]
  const parts = html.split(/<tr class="(default|success|danger)">/).slice(1);
  const items: NyaaItem[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const cls = parts[i];
    const body = parts[i + 1].split("</tr>")[0];
    const link = body.match(/<a href="\/view\/(\d+)"(?: class="[^"]*")? title="([^"]*)"/);
    const magnet = body.match(/href="(magnet:[^"]+)"/)?.[1];
    const hash = magnet?.match(/btih:([0-9a-f]{40})/i)?.[1];
    const size = body.match(/<td class="text-center">([\d.]+ [KMGT]?i?B)<\/td>/)?.[1];
    const ts = body.match(/data-timestamp="(\d+)"/)?.[1];
    const nums = [...body.slice(body.indexOf("data-timestamp")).matchAll(/<td class="text-center">(\d+)<\/td>/g)].map((m) => Number(m[1]));
    if (!link || !magnet || !hash || !size || !ts || nums.length < 3) continue;
    const title = decodeEntities(link[2]);
    items.push({
      id: Number(link[1]),
      title,
      show: showName(title),
      url: `${base}/view/${link[1]}`,
      magnet: decodeEntities(magnet),
      infoHash: hash.toLowerCase(),
      category: decodeEntities(body.match(/<a href="\/\?c=[\d_]+" title="([^"]*)"/)?.[1] ?? ""),
      size,
      date: Number(ts) * 1000,
      seeders: nums[0],
      leechers: nums[1],
      downloads: nums[2],
      trusted: cls === "success",
      remake: cls === "danger",
      info: parseRelease(title),
    });
  }
  const t = html.match(/Displaying results [\d,]+-[\d,]+ out of ([\d,]+) results/);
  const total = t ? Number(t[1].replace(/,/g, "")) : items.length;
  return { items, total, page, pages: Math.max(1, Math.ceil(total / NYAA_PAGE_SIZE)) };
}
