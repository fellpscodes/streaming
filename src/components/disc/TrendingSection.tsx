import { connection } from "next/server";
import { getTrendingForHome } from "@/lib/trending";
import { TrendingLane } from "./TrendingLane";

/** Fileira "Animes em Alta": busca no AniList no servidor e não aparece se não houver o que mostrar. */
export async function TrendingSection() {
  await connection();
  const items = await getTrendingForHome();
  return items.length ? <TrendingLane items={items} /> : null;
}
