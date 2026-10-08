import { eq } from "drizzle-orm";
import { db, episodes } from "@/lib/db";

/** O cliente só manda o id do episódio; o caminho do arquivo vem sempre do banco. */
export function episodeFile(id: number) {
  return Number.isInteger(id) ? (db.select().from(episodes).where(eq(episodes.id, id)).get() ?? null) : null;
}
