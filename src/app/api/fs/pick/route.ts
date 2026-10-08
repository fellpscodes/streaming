import path from "node:path";
import { DialogBusy, DialogUnsupported, pickFolderNative } from "@/lib/native-dialog";
import { isLocalRequest, isSameOrigin } from "@/lib/local";

/**
 * POST /api/fs/pick — abre o explorador de arquivos do sistema (no computador onde o servidor roda)
 * e devolve a pasta escolhida: { path } ou { cancelled: true }.
 */
export async function POST(req: Request) {
  // Abre uma janela na sua tela: só localhost e só a partir do próprio site (nada de outras origens).
  if (!isLocalRequest(req) || !isSameOrigin(req)) return Response.json({ error: "Disponível apenas em localhost." }, { status: 403 });
  const { path: initial } = (await req.json().catch(() => ({}))) as { path?: string };
  try {
    const picked = await pickFolderNative(initial && path.isAbsolute(initial) ? initial : undefined);
    return Response.json(picked ? { path: picked } : { cancelled: true });
  } catch (e) {
    if (e instanceof DialogUnsupported) return Response.json({ error: e.message }, { status: 501 });
    if (e instanceof DialogBusy) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
