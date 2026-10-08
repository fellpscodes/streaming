/** O app é de uso local: operações que expõem o disco só respondem para localhost. */
export function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
