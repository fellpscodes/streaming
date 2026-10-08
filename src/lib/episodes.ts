/** Regras de exibição e ordem dos episódios, compartilhadas por catálogo, player e "continuar assistindo". */

interface EpLike {
  season: number | null;
  episode: number | null;
  filePath: string;
}

/** Nome do arquivo sem a extensão: é o título do episódio quando não há número reconhecido. */
export function fileTitle(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  return base.replace(/\.[^.]+$/, "");
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });

/** Numerados primeiro (temporada, episódio); os demais em ordem natural do nome do arquivo ("ep 2" < "ep 10"). */
export function compareEpisodes<T extends EpLike & { id: number }>(a: T, b: T): number {
  return (
    (a.season ?? 999) - (b.season ?? 999) ||
    (a.episode ?? 9999) - (b.episode ?? 9999) ||
    naturalCompare(fileTitle(a.filePath), fileTitle(b.filePath)) ||
    a.id - b.id
  );
}

/** "T1 E3" quando o episódio foi reconhecido; senão, o nome do arquivo. */
export function episodeLabel(e: EpLike): string {
  return e.episode != null ? `T${e.season ?? 1} E${e.episode}` : fileTitle(e.filePath);
}
