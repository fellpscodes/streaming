/**
 * Animação do clique: a caixa e o CD vão juntos para o centro da tela, a tampa abre e o CD sai girando até virar a tela.
 * A tela de assistir (próxima página) retoma dali e abre o círculo. Só roda no navegador.
 */
import { sized } from "./images";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const REVEAL_KEY = "disc-reveal";

interface Origin {
  /** Caixa (`.dc-pack`) de onde tudo sai: a do catálogo, ou a capa da prévia quando a caixa não está na tela. */
  pack: HTMLElement | null;
  /** Disco que já está na tela (caixa aberta), ou null para sair da capa da prévia. */
  disc: HTMLElement | null;
  cover: string | null;
  /** Markup do disco quando não há caixa aberta. */
  fallbackHTML: string;
  reduced: boolean;
}

const smooth = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};
const bez = (a: number, b: number, c: number, d: number, u: number) => {
  const v = 1 - u;
  return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
};
/** Curva de tempo cubic-bezier(x1,y1,x2,y2), igual à do CSS. */
function cubic(x1: number, y1: number, x2: number, y2: number) {
  return (t: number) => {
    let u = t;
    for (let i = 0; i < 8; i++) {
      const x = bez(0, x1, x2, 1, u) - t;
      const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(x) < 1e-5 || !dx) break;
      u = Math.min(1, Math.max(0, u - x / dx));
    }
    return bez(0, y1, y2, 1, u);
  };
}
const EASE_MOVE = "cubic-bezier(.32,.72,.16,1)";
const release = cubic(0.45, 0, 0.18, 1);

/** O CD sai da bandeja e vai ao centro: sobe, faz um arco, cresce e gira cada vez mais rápido. Quadros calculados de antemão. */
function releaseFrames(o: { x0: number; y0: number; s0: number; s1: number; a1: number; lift: number; T: number; at: (x: number, y: number, s: number, r: number) => string }) {
  const { x0, y0, s0, s1, a1, lift, T, at } = o;
  const cx = x0 * 0.75, cy = Math.min(y0, 0) - lift;
  const frames: Keyframe[] = [];
  for (let i = 0, N = 60; i <= N; i++) {
    const t = i / N, u = release(t), v = 1 - u;
    const x = v * v * x0 + 2 * v * u * cx;
    const y = v * v * y0 + 2 * v * u * cy;
    const rot = a1 + 0.00032 * t * t * T * T; // parte parado e acelera aos poucos
    frames.push({ offset: t, transform: at(x, y, s0 + (s1 - s0) * smooth(u), rot) });
  }
  return frames;
}

export async function flyDisc({ pack, disc, cover, fallbackHTML, reduced }: Origin): Promise<void> {
  const veil = document.getElementById("dc-veil");
  veil?.classList.add("on");
  const src = pack ?? document.body;
  const pr = src.getBoundingClientRect();
  const w = pr.width, h = pr.height;
  const X = innerWidth / 2, Y = innerHeight / 2;

  let dcx: number, dcy: number, D: number, a0 = 0;
  if (disc) {
    const dr = disc.getBoundingClientRect();
    dcx = dr.left + dr.width / 2; dcy = dr.top + dr.height / 2;
    D = disc.offsetWidth; // tamanho real (a caixa em volta de um disco girado é maior que ele)
    // continua do ângulo em que o disco já estava girando
    const m = getComputedStyle(disc).transform;
    if (m && m !== "none") { const mt = new DOMMatrix(m); a0 = (Math.atan2(mt.b, mt.a) * 180) / Math.PI; }
  } else {
    D = w * 0.8; dcx = pr.left + w * 0.535; dcy = pr.top + h / 2;
  }

  // onde a caixa para: no centro, um pouco à esquerda, para a tampa abrir e o CD sair para a direita
  const S = Math.min((innerHeight * 0.46) / h, (innerWidth * 0.4) / w);
  const L0 = X - w * S * 0.62, T0 = Y - (h * S) / 2;
  const caseFrom = `translate(${pr.left - L0}px,${pr.top - T0}px) scale(${1 / S})`;
  const seatX = L0 + w * 0.535 * S, seatY = T0 + h * 0.5 * S; // centro do encaixe da bandeja, já no centro da tela

  const big = sized(cover, "w780");
  const small = sized(cover, "w500");
  const mk = (cls: string, html: string) => {
    const el = document.createElement("span");
    el.className = cls; el.innerHTML = html;
    // montada já no tamanho final (nítida no centro) e reduzida por cima da caixa original
    Object.assign(el.style, { left: `${L0}px`, top: `${T0}px`, width: `${w * S}px`, height: `${h * S}px`, transform: caseFrom });
    document.body.appendChild(el);
    return el;
  };
  const base = mk("dc-flybase", `<span class="dc-base"><span class="dc-hub"></span></span>`);
  const lid = mk("dc-flylid", `<span class="dc-jc"><span class="dc-lf">${small ? `<img src="${small}" alt="" draggable="false">` : ""}</span><span class="dc-lb"></span></span>`);

  // o mesmo CD do começo ao fim, montado no tamanho que terá no centro e reduzido no lugar do CD do catálogo
  const target = Math.min(innerWidth, innerHeight) * 0.5;
  const cd = (x: number, y: number, d: number, r: number) => `translate(${(x - X).toFixed(2)}px,${(y - Y).toFixed(2)}px) scale(${(d / target).toFixed(4)}) rotate(${r.toFixed(2)}deg)`;
  const fd = document.createElement("span");
  fd.className = "dc-dart flying";
  fd.innerHTML = disc ? disc.innerHTML : fallbackHTML;
  if (big) fd.style.setProperty("--art", `url(${JSON.stringify(big)})`);
  Object.assign(fd.style, { left: `${X - target / 2}px`, top: `${Y - target / 2}px`, width: `${target}px`, height: `${target}px`, transform: cd(dcx, dcy, D, a0), zIndex: 55 });
  document.body.appendChild(fd);
  if (pack) pack.style.visibility = "hidden";

  // 1) caixa e CD vão juntos para o centro; no caminho o CD desliza de volta para dentro da caixa
  const t1 = reduced ? 1 : 720;
  for (const el of [base, lid]) el.animate([{ transform: caseFrom }, { transform: "translate(0px,0px) scale(1)" }], { duration: t1, easing: EASE_MOVE, fill: "forwards" });
  const a1 = a0 + 50;
  await fd.animate([{ transform: cd(dcx, dcy, D, a0) }, { transform: cd(seatX, seatY, D * S, a1) }], { duration: t1, easing: EASE_MOVE, fill: "forwards" }).finished;

  // 2) a tampa abre na dobradiça; o CD começa a sair antes de ela terminar
  const t2 = reduced ? 1 : 560;
  lid.querySelector<HTMLElement>(".dc-jc")!.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(-128deg)" }], { duration: t2, easing: "cubic-bezier(.3,.7,.2,1)", fill: "forwards" });
  await sleep(t2 * 0.55);

  // 3) o CD sai da bandeja e vai ao centro girando; a tela de assistir retoma dali
  fd.style.zIndex = "70";
  const F = reduced ? 1 : 950;
  fd.animate(releaseFrames({ x0: seatX - X, y0: seatY - Y, s0: (D * S) / target, s1: 1, a1, lift: Math.max(50, h * S * 0.25), T: F, at: (x, y, s, r) => `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${s.toFixed(4)}) rotate(${r.toFixed(2)}deg)` }), {
    duration: F, easing: "linear", fill: "forwards",
  });
  for (const el of [base, lid]) el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, delay: reduced ? 0 : 260, fill: "forwards" });
  await sleep(F);
  base.remove();
  lid.remove();
  try {
    sessionStorage.setItem(REVEAL_KEY, "1");
  } catch {
    /* sem armazenamento: a tela de assistir abre sem o reveal */
  }
}

/** Desfaz o que o voo deixou na tela (volta para a Home, ou falha ao navegar). */
export function clearFlight() {
  document.querySelectorAll(".dc-dart.flying, .dc-flybase, .dc-flylid").forEach((e) => e.remove());
  document.getElementById("dc-veil")?.classList.remove("on");
  document.querySelectorAll<HTMLElement>(".dc-pack").forEach((p) => (p.style.visibility = ""));
}
