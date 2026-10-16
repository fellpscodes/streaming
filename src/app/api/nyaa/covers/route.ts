import { connection } from "next/server";
import { lookupCovers } from "@/lib/nyaa/covers";
import { guardLocal } from "@/lib/nyaa/guard";

/** POST { names: string[] } — capa de cada nome (AniList), numa consulta só. Nome sem capa vem como null. */
export async function POST(req: Request) {
  await connection();
  const denied = guardLocal(req, true);
  if (denied) return denied;
  const { names } = (await req.json().catch(() => ({}))) as { names?: unknown };
  if (!Array.isArray(names) || !names.every((n) => typeof n === "string")) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  return Response.json(await lookupCovers(names));
}
