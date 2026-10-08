import { connection } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, episodes, titles } from "@/lib/db";

/** Títulos que o scanner não conseguiu reconhecer, com seus arquivos. */
export async function GET() {
  await connection();
  const list = db.select().from(titles).where(eq(titles.status, "needs_review")).all();
  const eps = list.length
    ? db.select().from(episodes).where(inArray(episodes.titleId, list.map((t) => t.id))).all()
    : [];
  return Response.json(list.map((t) => ({ ...t, episodes: eps.filter((e) => e.titleId === t.id) })));
}
