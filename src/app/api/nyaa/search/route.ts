import { connection } from "next/server";
import { guardLocal } from "@/lib/nyaa/guard";
import { LANGS, NyaaUnavailable, RESOLUTIONS, searchNyaa, SORTS, type NyaaLang, type NyaaResolution, type NyaaSort } from "@/lib/nyaa/search";

/** GET /api/nyaa/search?q=&lang=&res=&trusted=1&sort=&page= — uma página de resultados do Nyaa (75 por página). */
export async function GET(req: Request) {
  await connection();
  const denied = guardLocal(req, false);
  if (denied) return denied;
  const p = new URL(req.url).searchParams;
  const pick = <T extends string>(v: string | null, all: readonly T[], fallback: T) => (all.includes(v as T) ? (v as T) : fallback);
  try {
    const page = await searchNyaa({
      q: (p.get("q") ?? "").slice(0, 200),
      lang: pick<NyaaLang>(p.get("lang"), LANGS, "all"),
      resolution: pick<NyaaResolution>(p.get("res"), RESOLUTIONS, ""),
      trusted: p.get("trusted") === "1",
      sort: pick<NyaaSort>(p.get("sort"), SORTS, "auto"),
      page: Math.min(200, Math.max(1, Number(p.get("page")) || 1)),
    });
    return Response.json(page);
  } catch (e) {
    if (e instanceof NyaaUnavailable) return Response.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
