import { isLocalRequest, isSameOrigin } from "@/lib/local";

/** Download e conexão com o qBittorrent só valem para quem usa o app na própria máquina e a partir da própria página. */
export function guardLocal(req: Request, mutating: boolean): Response | null {
  if (!isLocalRequest(req)) return Response.json({ error: "Disponível apenas em localhost." }, { status: 403 });
  if (mutating && !isSameOrigin(req)) return Response.json({ error: "Origem não permitida." }, { status: 403 });
  return null;
}
