import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Reply = { code?: number | string; stdout?: string; delay?: number } | undefined;
const replies = new Map<string, Reply>();
const calls: Array<{ cmd: string; args: string[] }> = [];

vi.mock("node:child_process", () => ({
  execFile: (cmd: string, args: string[], _opts: unknown, cb: (e: unknown, out: string, err: string) => void) => {
    calls.push({ cmd, args });
    const r = replies.get(cmd);
    const finish = () => {
      if (!r) return cb(Object.assign(new Error("spawn"), { code: "ENOENT" }), "", "");
      if (r.code) return cb(Object.assign(new Error("exit"), { code: r.code }), "", "");
      cb(null, r.stdout ?? "", "");
    };
    if (r?.delay) setTimeout(finish, r.delay);
    else finish();
  },
}));

const setPlatform = (p: NodeJS.Platform) => Object.defineProperty(process, "platform", { value: p });
const original = process.platform;

beforeEach(() => {
  replies.clear();
  calls.length = 0;
});
afterEach(() => setPlatform(original));

describe("explorador de arquivos nativo", () => {
  it("Linux: devolve a pasta escolhida no zenity, sem o \\n final", async () => {
    setPlatform("linux");
    replies.set("zenity", { stdout: "/mnt/hd/Animes\n" });
    const { pickFolderNative } = await import("@/lib/native-dialog");
    expect(await pickFolderNative()).toBe("/mnt/hd/Animes");
    expect(calls[0].args).toContain("--directory");
  });

  it("passa a pasta inicial como argumento (nunca por shell)", async () => {
    setPlatform("linux");
    replies.set("zenity", { stdout: "/x\n" });
    const { pickFolderNative } = await import("@/lib/native-dialog");
    await pickFolderNative("/home/u/Vídeos; rm -rf ~");
    expect(calls[0].args).toContain("--filename=/home/u/Vídeos; rm -rf ~/"); // texto literal em um único argumento
  });

  it("cancelar a janela devolve null", async () => {
    setPlatform("linux");
    replies.set("zenity", { code: 1 });
    const { pickFolderNative } = await import("@/lib/native-dialog");
    expect(await pickFolderNative()).toBeNull();
  });

  it("sem zenity cai para o kdialog", async () => {
    setPlatform("linux");
    replies.set("kdialog", { stdout: "/home/u/Series\n" });
    const { pickFolderNative } = await import("@/lib/native-dialog");
    expect(await pickFolderNative()).toBe("/home/u/Series");
    expect(calls.map((c) => c.cmd)).toEqual(["zenity", "kdialog"]);
  });

  it("sem nenhuma ferramenta avisa o que instalar", async () => {
    setPlatform("linux");
    const { pickFolderNative, DialogUnsupported } = await import("@/lib/native-dialog");
    await expect(pickFolderNative()).rejects.toBeInstanceOf(DialogUnsupported);
  });

  it("macOS usa osascript e Windows usa PowerShell", async () => {
    const { pickFolderNative } = await import("@/lib/native-dialog");
    setPlatform("darwin");
    replies.set("osascript", { stdout: "/Users/u/Midia/\n" });
    expect(await pickFolderNative()).toBe("/Users/u/Midia/");
    setPlatform("win32");
    replies.set("powershell", { stdout: "D:\\Midia" });
    expect(await pickFolderNative()).toBe("D:\\Midia");
  });

  it("não abre duas janelas ao mesmo tempo", async () => {
    setPlatform("linux");
    replies.set("zenity", { stdout: "/a\n", delay: 50 });
    const { pickFolderNative, DialogBusy } = await import("@/lib/native-dialog");
    const first = pickFolderNative();
    await expect(pickFolderNative()).rejects.toBeInstanceOf(DialogBusy);
    expect(await first).toBe("/a");
    expect(await pickFolderNative()).toBe("/a"); // liberou depois de terminar
  });
});

describe("rota /api/fs/pick", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/fs/pick", { method: "POST", headers, body: JSON.stringify({}) });

  it("abre para o próprio site em localhost", async () => {
    setPlatform("linux");
    replies.set("zenity", { stdout: "/dados/Midia\n" });
    const { POST } = await import("@/app/api/fs/pick/route");
    const res = await POST(req({ host: "localhost:3000", origin: "http://localhost:3000" }));
    expect(await res.json()).toEqual({ path: "/dados/Midia" });
  });

  it("recusa outro host (rede) e outro site (Origin diferente) sem abrir janela", async () => {
    setPlatform("linux");
    replies.set("zenity", { stdout: "/x\n" });
    const { POST } = await import("@/app/api/fs/pick/route");
    expect((await POST(req({ host: "192.168.0.23:3000" }))).status).toBe(403);
    expect((await POST(req({ host: "localhost:3000", origin: "https://site-malicioso.com" }))).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("cancelado e sem ferramenta têm respostas próprias", async () => {
    setPlatform("linux");
    const { POST } = await import("@/app/api/fs/pick/route");
    const h = { host: "localhost:3000" };
    expect((await POST(req(h))).status).toBe(501); // nada instalado
    replies.set("zenity", { code: 1 });
    expect(await (await POST(req(h))).json()).toEqual({ cancelled: true });
  });
});
