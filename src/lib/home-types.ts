import type { Category } from "@/lib/db/schema";

/** O que a Home (e o catálogo) precisam saber de cada título; leve o bastante para ir inteiro ao navegador. */
export interface CardTitle {
  id: number;
  name: string;
  year: number | null;
  rating: number | null;
  category: Category;
  genres: string[];
  overview: string | null;
  poster: string | null;
  backdrop: string | null;
  /** Quantos arquivos de vídeo o título tem. */
  episodes: number;
  /** Episódio que o botão Assistir abre: o que está em andamento, ou o primeiro. */
  playEpisodeId: number | null;
  /** Em andamento (ou o próximo, se o último foi concluído). */
  progress: { label: string; pct: number; started: boolean } | null;
  /** Prévia em vídeo já gerada. */
  preview: boolean;
  isNew: boolean;
}

export interface HomeLane {
  id: string;
  label: string;
  ids: number[];
}

export interface HomeData {
  titles: CardTitle[];
  lanes: HomeLane[];
  heroId: number | null;
}
