/** O que dá para saber de uma release do Nyaa só pelo título (o site não tem esses campos). */
export interface ReleaseInfo {
  group: string | null;
  resolution: "2160p" | "1080p" | "720p" | "480p" | null;
  codec: "HEVC" | "AV1" | "AVC" | null;
  source: "BD" | "WEB" | "TV" | null;
  /** episode = um episódio avulso; batch = pacote (temporada/intervalo); other = filme, OVA, sem número. */
  kind: "episode" | "batch" | "other";
  episode: number | null;
  dualAudio: boolean;
  multiSub: boolean;
  /** Cita português do Brasil em algum lugar do título. */
  ptBr: boolean;
  /** Tem legenda em PT-BR (ex.: "[Multiple Subtitle][POR-BR]", "[SUB PT-BR]", ou "[PT-BR]" sem dublagem). */
  ptBrSub: boolean;
  /** Tem áudio dublado em PT-BR (ex.: "Dublado", "[DUAL][PT-BR]"). */
  ptBrDub: boolean;
}

const RESOLUTIONS = [2160, 1080, 720, 480] as const;

function resolutionOf(t: string): ReleaseInfo["resolution"] {
  const m = t.match(/\b(2160|1440|1080|720|576|480)p\b/i) ?? t.match(/\b\d{3,4}x(2160|1440|1080|720|576|480)\b/i);
  if (m) {
    const h = Number(m[1]);
    const near = RESOLUTIONS.find((r) => h >= r) ?? 480; // 1440p conta como 1080p, 576p como 480p
    return `${near}p`;
  }
  return /\b4k\b/i.test(t) ? "2160p" : null;
}

function kindOf(t: string): { kind: ReleaseInfo["kind"]; episode: number | null } {
  // intervalo "01 ~ 28" / "01-12" (o segundo número não pode ser resolução nem parte de um codec como x265-KAF)
  const range = t.match(/(?<![\w.])(\d{1,4})\s?[~–-]\s?(\d{1,4})(?![\w.]|\s?p\b)/);
  const isRange = range && Number(range[2]) > Number(range[1]);
  if (isRange || /\b(batch|complete|completo|collection)\b/i.test(t)) return { kind: "batch", episode: null };
  const ep =
    t.match(/\bS\d{1,2}E(\d{1,4})(?:v\d)?\b/i) ??
    t.match(/\s-\s(\d{1,4})(?:v\d)?(?=[\s\])[(.]|$)/) ??
    t.match(/\bE(?:P|pisode)?\.?\s?(\d{1,4})(?:v\d)?\b/i);
  if (ep) return { kind: "episode", episode: Number(ep[1]) };
  // temporada inteira ("S02", "Season 2") ou disco ("BD"): pacote
  if (/\bS\d{1,2}(?:v\d)?\b|\bseason\s*\d/i.test(t) || /\b(bd|blu-?ray)\b/i.test(t)) return { kind: "batch", episode: null };
  return { kind: "other", episode: null };
}

/** Legendado × dublado em português: o Nyaa não tem campo para isso, então vem dos padrões dos fansubs brasileiros. */
function ptBrKinds(t: string, ptBr: boolean, dualAudio: boolean, multiSub: boolean): { ptBrSub: boolean; ptBrDub: boolean } {
  if (!ptBr) return { ptBrSub: false, ptBrDub: false };
  const dub = /\b(dublad[oa]s?|dubbed|dublagem)\b/i.test(t) || dualAudio;
  const explicitSub = /\bsubs?[\s._-]*(pt|por)[\s._-]?br\b/i.test(t) || multiSub;
  return { ptBrDub: dub, ptBrSub: explicitSub || !dub };
}

export function parseRelease(title: string): ReleaseInfo {
  const bracket = title.match(/^\s*\[([^\]]+)\]/)?.[1];
  const scene = title.match(/(?:x26[45]|hevc|avc|h[\s.]?26[45]|blu-?ray|web-?dl|webrip)[^\s]*-([A-Za-z0-9]{2,12})\s*$/i)?.[1];
  const codec = /\b(hevc|x265|h[\s.]?265)\b/i.test(title) ? "HEVC" : /\bav1\b/i.test(title) ? "AV1" : /\b(avc|x264|h[\s.]?264)\b/i.test(title) ? "AVC" : null;
  const source = /\b(bd|bdrip|blu-?ray|remux)\b/i.test(title)
    ? "BD"
    : /\b(web|webrip|web-?dl|cr|amzn|nf|dsnp)\b/i.test(title)
      ? "WEB"
      : /\b(hdtv|tv)\b/i.test(title)
        ? "TV"
        : null;
  const dualAudio = /dual[\s-]?(audio|jap)|\[dual\]|\(dual\)|\bdual\b|multi[\s-]?audio/i.test(title);
  const multiSub = /multi[\s-]?sub|multiple subtitle/i.test(title);
  const ptBr = /\b(pt-?br|por-?br|portugu[eê]s)\b/i.test(title);
  return {
    group: bracket ?? scene ?? null,
    resolution: resolutionOf(title),
    codec,
    source,
    ...kindOf(title),
    dualAudio,
    multiSub,
    ptBr,
    ...ptBrKinds(title, ptBr, dualAudio, multiSub),
  };
}

/** Legenda ou dublagem em PT-BR não são campos do Nyaa: depois da busca, a página é filtrada pelo que o título diz. */
export const refineByLang = <T extends { info: { ptBrSub: boolean; ptBrDub: boolean } }>(items: T[], lang: string): T[] =>
  lang === "ptbr-sub" ? items.filter((i) => i.info.ptBrSub) : lang === "ptbr-dub" ? items.filter((i) => i.info.ptBrDub) : items;
