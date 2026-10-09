import fs from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";

/** Qual versão está rodando: a hora do build (produção) ou "desenvolvimento". Ajuda a saber se a aba/serviço está atualizado. */
export async function GET() {
  await connection();
  if (process.env.NODE_ENV !== "production") return Response.json({ mode: "desenvolvimento", builtAt: null });
  const st = await fs.stat(path.join(process.cwd(), process.env.NEXT_DIST_DIR ?? ".next", "BUILD_ID")).catch(() => null);
  return Response.json({ mode: "produção", builtAt: st ? st.mtime.toISOString() : null });
}
