/** O app é de uso local: operações que expõem o disco só respondem para localhost. */
export function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** Rejeita requisições disparadas por outro site: se há Origin, ele precisa ser o próprio host. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // chamadas sem Origin (curl, testes) não vêm de uma página de terceiros
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
