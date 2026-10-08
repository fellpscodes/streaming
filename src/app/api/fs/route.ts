import { connection } from "next/server";
import { BrowseError, listDirs } from "@/lib/fs-browse";
import { isLocalRequest } from "@/lib/local";

/** GET /api/fs?path=/caminho — subpastas de um diretório, para escolher a pasta-mãe. */
export async function GET(req: Request) {
  await connection();
  if (!isLocalRequest(req)) return Response.json({ error: "Disponível apenas em localhost." }, { status: 403 });
  try {
    return Response.json(await listDirs(new URL(req.url).searchParams.get("path")));
  } catch (e) {
    if (e instanceof BrowseError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
