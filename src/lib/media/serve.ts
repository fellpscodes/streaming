import fs from "node:fs";
import { Readable } from "node:stream";
import { parseRange } from "./range";

/** Entrega um arquivo com HTTP Range: o navegador pede só o trecho de que precisa. */
export function serveFile(req: Request, file: string, size: number, type: string, cacheControl = "private, no-cache"): Response {
  const range = parseRange(req.headers.get("range"), size);
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });

  const { start, end } = range ?? { start: 0, end: size - 1 };
  const stream = fs.createReadStream(file, { start, end });
  req.signal.addEventListener("abort", () => stream.destroy()); // aba fechada / seek: para de ler o disco

  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "Content-Length": String(end - start + 1),
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
}
