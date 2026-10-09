import type { Category } from "@/lib/db/schema";

/** Rótulos das categorias. Módulo puro (sem banco), para poder ser usado também em componentes de cliente. */
export const CATEGORY_LABEL: Record<Category, string> = { movie: "Filmes", series: "Séries", anime: "Animes" };
