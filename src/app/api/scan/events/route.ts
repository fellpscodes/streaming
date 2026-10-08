import { connection } from "next/server";
import { getScanState, subscribeScan } from "@/lib/scanner/state";

/** Progresso do scan via Server-Sent Events. */
export async function GET(req: Request) {
  await connection();
  const enc = new TextEncoder();
  let unsub: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(s)}\n\n`));
      send(getScanState());
      unsub = subscribeScan(send);
      req.signal.addEventListener("abort", () => {
        unsub?.();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      unsub?.();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
