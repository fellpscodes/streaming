/**
 * Versão leve (WebVTT) de uma legenda ASS, para telas onde o desenho por cima do vídeo não funciona (celulares).
 * Mantém por estilo a cor, o contorno, o itálico, o negrito e o topo/base; perde fontes, posições exatas e efeitos.
 * Os eventos de efeito (quadro a quadro, desenhos, movimento) são descartados.
 */
interface Style {
  color: string;
  outline: string;
  bold: boolean;
  italic: boolean;
  top: boolean;
}

/** &HAABBGGRR (ou &HBBGGRR&) -> #RRGGBB */
function hex(c: string | undefined, fallback: string): string {
  const m = /&?H?([0-9a-f]{6,8})&?/i.exec(c ?? "");
  if (!m) return fallback;
  const v = m[1].slice(-6);
  return `#${v.slice(4, 6)}${v.slice(2, 4)}${v.slice(0, 2)}`.toLowerCase();
}

const MIN_SECONDS = 0.3;

function seconds(t: string): number {
  const [h, m, s] = t.trim().split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}
function stamp(t: number): string {
  const ms = Math.round(t * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
}

export function assToVtt(ass: string): string {
  const lines = ass.replace(/^﻿/, "").split(/\r?\n/);
  let section = "";
  let cols: string[] = [];
  let styleCols: string[] = [];
  const styles = new Map<string, { id: number; s: Style }>();
  const cues: Array<{ start: number; end: number; text: string; top: boolean; cls: number }> = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) {
      section = line.toLowerCase();
      continue;
    }
    if (/^\[v4\+? styles\]$/.test(section)) {
      if (/^format:/i.test(line)) styleCols = line.slice(7).split(",").map((c) => c.trim().toLowerCase());
      else if (/^style:/i.test(line) && styleCols.length) {
        const v = line.slice(6).split(",");
        const get = (k: string) => v[styleCols.indexOf(k)]?.trim();
        const align = Number(get("alignment"));
        styles.set(get("name") ?? "", {
          id: styles.size,
          s: { color: hex(get("primarycolour"), "#ffffff"), outline: hex(get("outlinecolour"), "#000000"), bold: get("bold") === "-1" || get("bold") === "1", italic: get("italic") === "-1" || get("italic") === "1", top: align >= 7 && align <= 9 },
        });
      }
      continue;
    }
    if (section !== "[events]") continue;
    if (/^format:/i.test(line)) {
      cols = line.slice(7).split(",").map((c) => c.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue:/i.test(line) || cols.length === 0) continue;
    // o texto é o último campo e pode ter vírgulas
    const parts = line.slice(9).split(",");
    const textAt = cols.indexOf("text");
    const f = parts.slice(0, textAt);
    const body = parts.slice(textAt).join(",");
    const start = seconds(f[cols.indexOf("start")] ?? "");
    const end = seconds(f[cols.indexOf("end")] ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_SECONDS) continue;
    if (/\\(move|org|clip|iclip|t\(|p[1-9])/.test(body)) continue; // efeitos e desenhos
    const st = styles.get(f[cols.indexOf("style")]?.trim() ?? "");
    const an = /\\an([1-9])/.exec(body);
    const top = an ? Number(an[1]) >= 7 : !!st?.s.top;
    const text = body
      .replace(/\{[^}]*\}/g, (tags) => (/\\i1/.test(tags) ? "\u0001" : /\\i0/.test(tags) ? "\u0002" : ""))
      .replace(/\\[Nn]/g, "\n")
      .replace(/\\h/g, " ")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\u0001/g, "<i>")
      .replace(/\u0002/g, "</i>")
      .trim();
    if (text) cues.push({ start, end, text, top, cls: st?.id ?? -1 });
  }

  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  // o mesmo texto repetido ao mesmo tempo (camadas de sombra/contorno) vira um só
  const out: typeof cues = [];
  for (const c of cues) {
    if (out.some((o) => o.text === c.text && o.start <= c.end && c.start <= o.end)) continue;
    out.push(c);
  }
  // uma classe por estilo do arquivo (cor, contorno, itálico, negrito), aplicada pelo bloco STYLE
  const css = [...styles.values()]
    .map(({ id, s: st }) => {
      const o = st.outline;
      const shadow = [`-1px -1px 0 ${o}`, `1px -1px 0 ${o}`, `-1px 1px 0 ${o}`, `1px 1px 0 ${o}`, `0 0 4px ${o}`].join(",");
      return `::cue(.s${id}){color:${st.color};text-shadow:${shadow};background-color:transparent;font-weight:${st.bold ? 700 : 400};font-style:${st.italic ? "italic" : "normal"}}`;
    })
    .join("\n");
  const cue = (c: (typeof out)[number]) => `${stamp(c.start)} --> ${stamp(c.end)}${c.top ? " line:8%" : ""}\n${c.cls >= 0 ? `<c.s${c.cls}>${c.text}</c>` : c.text}\n`;
  return `WEBVTT\n\n${css ? `STYLE\n${css}\n\n` : ""}${out.map(cue).join("\n")}`;
}
