"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { HomeData } from "@/lib/home-types";
import { clearFlight, flyDisc } from "@/lib/disc-flight";
import { ArcDefs, discLabel } from "./DiscArt";
import { CaseTile } from "./CaseTile";
import { HeroInfo, HeroLayer } from "./Hero";
import { Lane } from "./Lane";
import { useReducedMotion } from "./useReducedMotion";
import "./disc.css";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Início: prévia no topo e fileiras de caixas de CD. Passar o mouse abre a caixa e troca a prévia; clicar leva ao player. */
export function HomeBrowser({ data }: { data: HomeData }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const byId = useMemo(() => new Map(data.titles.map((t) => [t.id, t])), [data.titles]);
  const first = data.heroId ?? data.titles[0].id;

  // Duas camadas na prévia: a nova entra por trás e a antiga some num fade.
  const [slots, setSlots] = useState<[number, number]>([first, first]);
  const [front, setFront] = useState<0 | 1>(0);
  const heroId = slots[front];
  const [textId, setTextId] = useState(first); // o texto troca um instante depois, com um fade curto
  const [swap, setSwap] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);

  const busy = useRef(false);
  const dwell = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rowT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heroEl = useRef<HTMLElement>(null);
  const asked = useRef(new Set<number>());

  function showHero(id: number) {
    if (id === heroId) return;
    const back = front === 0 ? 1 : 0;
    setSlots((s) => (back === 0 ? [id, s[1]] : [s[0], id]));
    setFront(back);
    setSwap(true);
    setTimeout(() => {
      setTextId(id);
      setSwap(false);
    }, reduced ? 0 : 170);
    // título sem prévia ainda: pede a geração em segundo plano (aparece na próxima visita)
    if (!byId.get(id)?.preview && !asked.current.has(id)) {
      asked.current.add(id);
      void fetch(`/api/preview/${id}`, { method: "POST" }).catch(() => {});
    }
  }

  // A prévia encolhe um pouco quando a página rola, e as fileiras passam por baixo dela.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => heroEl.current?.style.setProperty("--p", Math.min(1, scrollY / 320).toFixed(3)));
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Ao voltar para esta tela (o Next a mantém montada) ou ao remontar: nada do voo do disco pode ter sobrado.
  useEffect(() => {
    busy.current = false;
    clearFlight();
  }, []);

  const onTileEnter = (key: string, id: number) => (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || busy.current) return;
    clearTimeout(dwell.current);
    clearTimeout(rowT.current);
    dwell.current = setTimeout(() => { setOpenKey(key); showHero(id); }, 150);
  };
  const onTileLeave = () => clearTimeout(dwell.current);
  const onTileFocus = (key: string, id: number) => (e: React.FocusEvent) => {
    if (!busy.current && (e.currentTarget as HTMLElement).matches(":focus-visible")) { setOpenKey(key); showHero(id); }
  };
  // a caixa só fecha quando o mouse sai da fileira, e não ao passar pelo vão entre duas caixas
  const onLaneLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(dwell.current);
    clearTimeout(rowT.current);
    rowT.current = setTimeout(() => { if (!busy.current) setOpenKey(null); }, 260);
  };
  const onLaneEnter = () => clearTimeout(rowT.current);

  async function choose(id: number, key: string | null) {
    const t = byId.get(id);
    if (busy.current || !t || t.playEpisodeId == null) return;
    busy.current = true;
    clearTimeout(dwell.current);
    clearTimeout(rowT.current);
    try {
      document.querySelectorAll("video").forEach((v) => v.pause());
      let disc: HTMLElement | null = null;
      if (key) {
        // a caixa fica onde está; se ainda estiver fechada, o disco desliza para fora primeiro
        if (openKey !== key) { setOpenKey(key); await sleep(reduced ? 50 : 800); }
        disc = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"] .dc-dart`);
      }
      await flyDisc({
        disc,
        heroCase: document.querySelector<HTMLElement>(".dc-hcase"),
        cover: t.poster,
        fallbackHTML: `<svg class="arc" viewBox="0 0 120 120" aria-hidden="true"><text><textPath href="#dc-arc">${esc(discLabel(t))}</textPath></text></svg>`,
        reduced,
      });
      router.push(`/assistir/${t.playEpisodeId}`);
    } catch {
      clearFlight();
      busy.current = false;
    }
  }

  function onTileClick(key: string, id: number) {
    if (busy.current) return;
    clearTimeout(dwell.current);
    // no toque: o 1º toque abre a caixa e troca a prévia, o 2º assiste
    if (openKey !== key) {
      setOpenKey(key);
      showHero(id);
      if (matchMedia("(hover: none)").matches) return;
    }
    void choose(id, key);
  }

  function playFromHero() {
    // Assistir da prévia: usa a caixa do título se ela estiver visível; senão o disco sai da capa da prévia
    const vis = [...document.querySelectorAll<HTMLElement>(`[data-tile="${heroId}"]`)].find((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    });
    void choose(heroId, vis?.dataset.key ?? null);
  }

  const shown = byId.get(textId) ?? byId.get(heroId)!;
  return (
    <>
      <ArcDefs />
      <section ref={heroEl} className="dc-hero" aria-label="Destaque">
        {[0, 1].map((i) => (
          <HeroLayer key={i} t={byId.get(slots[i])!} on={front === i} muted={muted} reduced={reduced} />
        ))}
        <div className="dc-hshade" />
        <HeroInfo t={shown} swap={swap} muted={muted} onMute={() => setMuted((m) => !m)} onPlay={playFromHero} />
      </section>

      <div className="dc-main">
        {data.lanes.map((lane) => (
          <Lane key={lane.id} id={lane.id} label={lane.label} count={lane.ids.length} onPointerEnter={onLaneEnter} onPointerLeave={onLaneLeave}>
            {lane.ids.map((id) => {
              const t = byId.get(id)!;
              const key = `${lane.id}:${id}`;
              return (
                <CaseTile
                  key={key}
                  t={t}
                  tileKey={key}
                  open={openKey === key}
                  current={id === heroId}
                  onClick={() => onTileClick(key, id)}
                  onPointerEnter={onTileEnter(key, id)}
                  onPointerLeave={onTileLeave}
                  onFocus={onTileFocus(key, id)}
                />
              );
            })}
          </Lane>
        ))}
      </div>
      <div id="dc-veil" className="dc-veil" />
    </>
  );
}
