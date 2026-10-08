import { execFile } from "node:child_process";

export class DialogUnsupported extends Error {}
export class DialogBusy extends Error {}

const TITLE = "Escolher a pasta-mãe";
const TIMEOUT_MS = 10 * 60 * 1000;

interface Result {
  code: number | string | null;
  stdout: string;
  stderr: string;
}

/** Executa sem shell (o caminho inicial vai como argumento, nunca interpolado em comando). */
function run(cmd: string, args: string[]): Promise<Result> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: TIMEOUT_MS, windowsHide: false }, (err, stdout, stderr) => {
      const code = err ? ((err as NodeJS.ErrnoException).code ?? (err as { code?: number }).code ?? 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

const trimmed = (s: string) => s.replace(/[\r\n]+$/, "");

async function linux(initial?: string): Promise<string | null> {
  const start = initial ? (initial.endsWith("/") ? initial : `${initial}/`) : undefined;
  // zenity (GNOME/GTK e a maioria dos ambientes) e kdialog (KDE).
  const zen = await run("zenity", ["--file-selection", "--directory", `--title=${TITLE}`, ...(start ? [`--filename=${start}`] : [])]);
  if (zen.code !== "ENOENT") return zen.code === 0 ? trimmed(zen.stdout) || null : null; // código 1 = cancelou
  const kde = await run("kdialog", ["--title", TITLE, "--getexistingdirectory", start ?? "."]);
  if (kde.code !== "ENOENT") return kde.code === 0 ? trimmed(kde.stdout) || null : null;
  throw new DialogUnsupported("Instale o zenity ou o kdialog para abrir o explorador de arquivos.");
}

async function mac(initial?: string): Promise<string | null> {
  const script = ["on run argv", `set p to choose folder with prompt "${TITLE}"${initial ? " default location (POSIX file (item 1 of argv))" : ""}`, "return POSIX path of p", "end run"];
  const r = await run("osascript", script.flatMap((l) => ["-e", l]).concat(initial ? [initial] : []));
  if (r.code === "ENOENT") throw new DialogUnsupported("osascript não encontrado.");
  return r.code === 0 ? trimmed(r.stdout) || null : null; // cancelar devolve erro -128
}

async function windows(initial?: string): Promise<string | null> {
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$d.Description = '${TITLE}'`,
    "if ($args.Count -gt 0) { $d.SelectedPath = $args[0] }",
    "if ($d.ShowDialog() -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
  ].join("; ");
  const r = await run("powershell", ["-NoProfile", "-STA", "-Command", ps, ...(initial ? [initial] : [])]);
  if (r.code === "ENOENT") throw new DialogUnsupported("PowerShell não encontrado.");
  return r.code === 0 ? trimmed(r.stdout) || null : null;
}

let busy = false;

/** Abre o seletor de pasta do sistema operacional. Devolve o caminho absoluto ou null se cancelado. */
export async function pickFolderNative(initial?: string): Promise<string | null> {
  if (busy) throw new DialogBusy("Já existe uma janela de seleção aberta.");
  busy = true;
  try {
    if (process.platform === "darwin") return await mac(initial);
    if (process.platform === "win32") return await windows(initial);
    return await linux(initial);
  } finally {
    busy = false;
  }
}
