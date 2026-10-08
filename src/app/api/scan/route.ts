import { connection } from "next/server";
import { getScanState } from "@/lib/scanner/state";
import { startMetadata, startScan } from "@/lib/scanner/scan";

export async function GET() {
  await connection();
  return Response.json(getScanState());
}

/** POST /api/scan inicia o scan; POST /api/scan?only=metadata só busca metadados pendentes. */
export async function POST(req: Request) {
  const only = new URL(req.url).searchParams.get("only");
  const started = only === "metadata" ? startMetadata() : await startScan();
  return Response.json(getScanState(), { status: started ? 202 : 409 });
}
