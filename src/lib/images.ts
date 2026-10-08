const TMDB = /^(https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+(\/.+)$/;

export type TmdbSize = "w342" | "w500" | "w780" | "w1280" | "original";

/** Troca o tamanho de uma imagem do TMDB (o banco guarda `original`). Outras URLs passam intactas. */
export function sized(url: string | null, size: TmdbSize): string | null {
  if (!url) return null;
  return TMDB.test(url) ? url.replace(TMDB, `$1${size}$2`) : url;
}

/** srcset para o navegador escolher a menor imagem que ainda fica nítida (inclusive em telas 2x). */
export function posterSrcSet(url: string | null): string | undefined {
  if (!url || !TMDB.test(url)) return undefined;
  return (["w342", "w500", "w780"] as const).map((s) => `${sized(url, s)} ${s.slice(1)}w`).join(", ");
}
