"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/** Passou disto (px) a barra ganha fundo próprio. */
const SCROLLED_AT = 40;
/** Antes disto (px) a barra nunca some. */
const HIDE_AFTER = 120;
/** Quanto rolar (px) na mesma direção para esconder ou mostrar: a barra não pisca com o trackpad. */
const SLACK = 8;

type BarState = "top" | "shown" | "hidden";
let state: BarState = "top";
let anchor = 0; // ponto extremo da direção atual: o mais alto enquanto visível, o mais baixo enquanto escondida
let lastY = 0;

function update() {
  const y = scrollY;
  if (y <= SCROLLED_AT) {
    state = "top";
    anchor = y;
  } else if (state === "hidden") {
    anchor = Math.max(anchor, y);
    if (anchor - y > SLACK) [state, anchor] = ["shown", y];
  } else {
    // saindo do topo, conta desde a posição anterior (um salto do topo direto para baixo, como PageDown, também esconde)
    if (state === "top") [state, anchor] = ["shown", lastY];
    anchor = Math.min(anchor, y);
    if (y > HIDE_AFTER && y - anchor > SLACK) [state, anchor] = ["hidden", y];
  }
  lastY = y;
}

const subscribe = (cb: () => void) => {
  const on = () => {
    update();
    cb();
  };
  update(); // a página pode ter voltado já rolada
  addEventListener("scroll", on, { passive: true });
  return () => removeEventListener("scroll", on);
};

/**
 * Casca do cabeçalho: acompanha a rolagem (fundo ao rolar; some ao descer e volta ao subir). O conteúdo continua vindo do
 * servidor. Estilos em globals.css (.site-header).
 */
export function HeaderBar({ overlay, className, children }: { overlay: boolean; className: string; children: ReactNode }) {
  const bar = useSyncExternalStore(subscribe, () => state, () => "top");
  return (
    <header
      className={`site-header ${className}`}
      data-overlay={overlay || undefined}
      data-scrolled={bar !== "top" || undefined}
      data-hidden={bar === "hidden" || undefined}
    >
      {children}
    </header>
  );
}
