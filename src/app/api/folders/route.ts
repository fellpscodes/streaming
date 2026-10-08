import fs from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { db, libraryFolders, titles, type FolderKind } from "@/lib/db";

const KINDS: FolderKind[] = ["auto", "movie", "series", "anime"];

export async function GET() {
  await connection();
  const counts = new Map(
    db.select({ id: titles.folderId, n: count() }).from(titles).groupBy(titles.folderId).all().map((r) => [r.id, r.n]),
  );
  return Response.json(db.select().from(libraryFolders).all().map((f) => ({ ...f, titleCount: counts.get(f.id) ?? 0 })));
}

export async function POST(req: Request) {
  const { path: raw, kind = "auto" } = (await req.json().catch(() => ({}))) as { path?: string; kind?: FolderKind };
  if (!raw || !path.isAbsolute(raw)) {
    return Response.json({ error: "Informe um caminho absoluto." }, { status: 400 });
  }
  if (!KINDS.includes(kind)) return Response.json({ error: "Tipo de conteúdo inválido." }, { status: 400 });
  const p = path.resolve(raw);
  const st = await fs.stat(p).catch(() => null);
  if (!st?.isDirectory()) {
    return Response.json({ error: "Pasta não encontrada." }, { status: 400 });
  }
  const dup = db.select().from(libraryFolders).where(eq(libraryFolders.path, p)).get();
  if (dup) return Response.json({ error: "Pasta já cadastrada." }, { status: 409 });
  const row = db.insert(libraryFolders).values({ path: p, kind }).returning().get();
  return Response.json(row, { status: 201 });
}

/** Muda o tipo de conteúdo de uma pasta. O próximo scan reclassifica os títulos dela. */
export async function PATCH(req: Request) {
  const { id, kind } = (await req.json().catch(() => ({}))) as { id?: number; kind?: FolderKind };
  if (!Number.isInteger(id) || !kind || !KINDS.includes(kind)) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const res = db.update(libraryFolders).set({ kind }).where(eq(libraryFolders.id, id!)).run();
  if (!res.changes) return Response.json({ error: "Pasta não encontrada." }, { status: 404 });
  // O tipo mudou: o que os metadados tinham classificado como anime volta a ser decidido no próximo scan.
  db.update(titles)
    .set({ category: "series", metadataStatus: "pending" })
    .where(and(eq(titles.folderId, id!), eq(titles.manual, false), eq(titles.category, "anime")))
    .run();
  return Response.json(db.select().from(libraryFolders).where(eq(libraryFolders.id, id!)).get());
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "id inválido" }, { status: 400 });
  db.delete(libraryFolders).where(eq(libraryFolders.id, id)).run(); // cascade remove títulos/episódios
  return new Response(null, { status: 204 });
}
