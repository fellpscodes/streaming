import { connection } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, libraryFolders } from "@/lib/db";

export async function GET() {
  await connection();
  return Response.json(db.select().from(libraryFolders).all());
}

export async function POST(req: Request) {
  const { path: raw } = (await req.json().catch(() => ({}))) as { path?: string };
  if (!raw || !path.isAbsolute(raw)) {
    return Response.json({ error: "Informe um caminho absoluto." }, { status: 400 });
  }
  const p = path.resolve(raw);
  const st = await fs.stat(p).catch(() => null);
  if (!st?.isDirectory()) {
    return Response.json({ error: "Pasta não encontrada." }, { status: 400 });
  }
  const dup = db.select().from(libraryFolders).where(eq(libraryFolders.path, p)).get();
  if (dup) return Response.json({ error: "Pasta já cadastrada." }, { status: 409 });
  const row = db.insert(libraryFolders).values({ path: p }).returning().get();
  return Response.json(row, { status: 201 });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "id inválido" }, { status: 400 });
  db.delete(libraryFolders).where(eq(libraryFolders.id, id)).run(); // cascade remove títulos/episódios
  return new Response(null, { status: 204 });
}
