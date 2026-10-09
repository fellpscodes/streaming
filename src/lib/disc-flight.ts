/**
 * Animação do voo do disco: ele escapa da caixa, sobe girando até o centro da tela e fica lá, sobre uma cortina escura.
 * A tela de assistir (próxima página) retoma dali e abre o círculo. Só roda no navegador.
 */
import { sized } from "./images";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const REVEAL_KEY = "disc-reveal";

interface Origin {
  /** Disco que já está na tela (caixa aberta), ou null para sair da capa da prévia. */
  disc: HTMLElement | null;
  heroCase: HTMLElement | null;
  cover: string | null;
  /** Markup do disco quando não há caixa aberta. */
  fallbackHTML: string;
  reduced: boolean;
}

export async function flyDisc({ disc, heroCase, cover, fallbackHTML, reduced }: Origin): Promise<void> {
  let cx: number, cy: number, D: number, a0 = 0;
  if (disc) {
    const r = disc.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2; D = r.width;
    // continua do ângulo em que o disco já estava girando
    const m = getComputedStyle(disc).transform;
    if (m && m !== "none") { const [a, b] = m.slice(7, -1).split(",").map(Number); a0 = (Math.atan2(b, a) * 180) / Math.PI; }
  } else {
    const r = (heroCase ?? document.body).getBoundingClientRect();
    cx = r.left + r.width * 0.55; cy = r.top + r.height / 2; D = r.height * 0.9;
  }

  const fd = document.createElement("span");
  fd.className = "dc-dart flying";
  fd.innerHTML = disc ? disc.innerHTML : fallbackHTML;
  const big = sized(cover, "w780");
  if (big) fd.style.setProperty("--art", `url(${JSON.stringify(big)})`);
  Object.assign(fd.style, { left: `${cx - D / 2}px`, top: `${cy - D / 2}px`, width: `${D}px`, height: `${D}px` });
  document.body.appendChild(fd);
  if (disc) disc.style.visibility = "hidden";
  document.getElementById("dc-veil")?.classList.add("on");

  const X = innerWidth / 2, Y = innerHeight / 2, target = Math.min(innerWidth, innerHeight) * 0.5, k = target / D;
  const endT = `translate(${X - cx}px,${Y - cy}px) scale(${k},${k}) rotate(${a0 + 720}deg)`;
  const anim = fd.animate(
    [
      { transform: `translate(0px,0px) scale(1,1) rotate(${a0}deg)` },
      // primeiro escapa da caixa para a direita e para cima, depois voa girando até o centro
      { transform: `translate(${D * 0.35}px,${-D * 0.18}px) scale(1.08,1.08) rotate(${a0 + 120}deg)`, offset: 0.22 },
      { transform: `translate(${(X - cx) * 0.55 + D * 0.2}px,${(Y - cy) * 0.55 - 50}px) scale(${(1 + k) / 2},${(1 + k) / 2}) rotate(${a0 + 400}deg)`, offset: 0.6 },
      { transform: endT },
    ],
    { duration: reduced ? 1 : 1100, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" },
  );
  await anim.finished;
  if (!reduced) await sleep(40);
  try {
    sessionStorage.setItem(REVEAL_KEY, "1");
  } catch {
    /* sem armazenamento: a tela de assistir abre sem o reveal */
  }
}

/** Desfaz o que o voo deixou na tela (volta para a Home, ou falha ao navegar). */
export function clearFlight() {
  document.querySelectorAll(".dc-dart.flying").forEach((e) => e.remove());
  document.getElementById("dc-veil")?.classList.remove("on");
  document.querySelectorAll<HTMLElement>(".dc-dart").forEach((d) => (d.style.visibility = ""));
}
