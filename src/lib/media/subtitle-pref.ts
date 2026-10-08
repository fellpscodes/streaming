import type { SubtitlePref } from "@/lib/db/schema";
import type { SubTrack } from "./subtitles";

/** Descrição da faixa escolhida (ou "sem legenda" quando não há faixa). */
export function prefFromTrack(track: SubTrack | null): SubtitlePref {
  return track ? { off: false, origin: track.origin, label: track.label, lang: track.lang } : { off: true };
}

/** Sem preferência: a faixa marcada como padrão no arquivo, senão a primeira em português, senão nenhuma. */
export function defaultTrack(tracks: SubTrack[]): SubTrack | undefined {
  return tracks.find((t) => t.isDefault) ?? tracks.find((t) => /portugu/i.test(t.label));
}

const norm = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Escolhe a legenda de um episódio a partir da preferência do título, do mais específico ao mais geral:
 * mesmo nome e origem → mesmo nome → mesmo idioma e origem → mesmo idioma. Se o episódio não tem nada
 * parecido, volta ao padrão. Devolve o id da faixa, ou "" para nenhuma legenda.
 */
export function pickTrack(tracks: SubTrack[], pref: SubtitlePref | null | undefined): string {
  if (!pref) return defaultTrack(tracks)?.id ?? "";
  if (pref.off) return "";
  const sameLabel = (t: SubTrack) => norm(t.label) === norm(pref.label);
  const sameLang = (t: SubTrack) => pref.lang != null && norm(t.lang) === norm(pref.lang);
  const sameOrigin = (t: SubTrack) => t.origin === pref.origin;
  const hit =
    tracks.find((t) => sameLabel(t) && sameOrigin(t)) ??
    tracks.find(sameLabel) ??
    tracks.find((t) => sameLang(t) && sameOrigin(t)) ??
    tracks.find(sameLang);
  return hit?.id ?? defaultTrack(tracks)?.id ?? "";
}
