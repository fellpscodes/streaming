"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { clearFlight, REVEAL_KEY } from "@/lib/disc-flight";
import { ArcDefs, DiscArt } from "./disc/DiscArt";
import { IconBack, IconFull, IconMarks, IconMute, IconPause, IconPlayO, IconSkipNext, IconSkipPrev, IconVol } from "./disc/icons";
import "./disc/disc.css";
import "./disc/watch.css";

interface SubTrack {
  id: string;
  label: string;
  format: "ass" | "vtt";
  isDefault: boolean;
  url: string;
}
interface AudioTrack {
  index: number;
  label: string;
  isDefault: boolean;
}

interface Props {
  episodeId: number;
  title: string;
  subtitle: string;
  backHref: string;
  prevHref: string | null;
  nextHref: string | null;
  startAt: number;
  /** Capa e texto em arco do disco que gira enquanto o vídeo é preparado. */
  cover: string | null;
  discText: string;
}

interface Segment {
  start: number;
  end: number;
  source: "chapters" | "manual";
}
interface SkipData {
  intro: Segment | null;
  outro: Segment | null;
  marks: { introStart?: number; introEnd?: number; outroStart?: number };
}

type JassubInstance = { destroy: () => Promise<void> | void; resize?: (forceRepaint?: boolean) => Promise<void> };

/** Sem capítulos nem marcas, o encerramento é considerado como os últimos 90 s (só em vídeos longos). */
const FALLBACK_OUTRO_SECONDS = 90;
const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function Player({ episodeId, title, subtitle, backHref, prevHref, nextHref, startAt, cover, discText }: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastVideo = useRef<HTMLVideoElement | null>(null); // o React solta videoRef ao esconder a tela; este guarda o elemento
  const jassubRef = useRef<JassubInstance | null>(null);
  const resumeAt = useRef(startAt);

  const [phase, setPhase] = useState<"preparing" | "ready" | "error">("preparing");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "compat">("auto");
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [audioIndex, setAudioIndex] = useState<number | null>(null);
  const [subs, setSubs] = useState<{ tracks: SubTrack[]; fonts: string[] } | null>(null);
  const [subId, setSubId] = useState<string>("");
  const [uiVisible, setUiVisible] = useState(true);
  const [ended, setEnded] = useState(false);
  const [skip, setSkip] = useState<SkipData | null>(null);
  const [now, setNow] = useState(0); // posição atual (s), para decidir quando mostrar "Pular abertura"
  const [dur, setDur] = useState(0);
  const [markOpen, setMarkOpen] = useState(false);
  // Estado da legenda ASS, para a falha nunca ser silenciosa.
  const [subStatus, setSubStatus] = useState<{ state: "off" | "loading" | "ready" | "error"; msg?: string }>({ state: "off" });
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const completedRef = useRef(false); // ao pular para o próximo, não deixa um save tardio desmarcar "concluído"
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Volta ao estado "preparando" ao trocar de áudio ou de modo. */
  function restart() {
    setPhase("preparing");
    setProgress(0);
    setStreamUrl(null);
  }
  function switchToCompat() {
    restart();
    setError(null);
    setMode("compat");
  }

  // 1) Prepara o vídeo (remux sem perda quando preciso) e espera ficar pronto.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        const res = await post(`/api/play/${episodeId}`, { audio: audioIndex, mode }).catch(() => null);
        const data = res ? await res.json().catch(() => null) : null;
        if (cancelled) return;
        if (!res?.ok || !data) {
          setError(data?.error ?? "Falha ao preparar o vídeo.");
          return setPhase("error");
        }
        setAudioTracks(data.audioTracks);
        if (data.state === "ready") {
          setAudioIndex((cur) => cur ?? data.audioIndex);
          setStreamUrl(data.streamUrl);
          return setPhase("ready");
        }
        setProgress(data.progress ?? 0);
        await new Promise((r) => setTimeout(r, 1000));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [episodeId, audioIndex, mode]);

  // 2) Lista de legendas (uma vez por episódio). O servidor já diz qual faixa vem selecionada:
  //    a que você escolheu antes neste título (ou "sem legenda"), senão a padrão do arquivo.
  useEffect(() => {
    fetch(`/api/subtitles/${episodeId}`)
      .then((r) => r.json())
      .then((d: { tracks: SubTrack[]; fonts: string[]; selectedId: string }) => {
        setSubs(d);
        setSubId(d.selectedId);
      })
      .catch(() => setSubs({ tracks: [], fonts: [] }));
  }, [episodeId]);

  /** Troca a legenda e lembra a escolha para os próximos episódios deste título. */
  function chooseSubtitle(id: string) {
    setSubId(id);
    void fetch(`/api/subtitle-preference/${episodeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: id }),
    });
  }

  // 3) Renderiza a legenda: ASS/SSA com libass (JASSUB) para manter estilo, posição e efeitos; VTT com <track> nativo.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || phase !== "ready" || !subs) return;
    const track = subs.tracks.find((t) => t.id === subId);
    let cancelled = false;
    let trackEl: HTMLTrackElement | null = null;

    (async () => {
      await jassubRef.current?.destroy();
      jassubRef.current = null;
      if (!track || cancelled) {
        setSubStatus({ state: "off" });
        return;
      }
      if (track.format === "vtt") {
        setSubStatus({ state: "ready" });
        trackEl = document.createElement("track");
        Object.assign(trackEl, { kind: "subtitles", label: track.label, src: track.url, default: true });
        video.appendChild(trackEl);
        trackEl.track.mode = "showing";
        return;
      }
      setSubStatus({ state: "loading" });
      try {
        // Cada etapa tem nome e limite de tempo: se algo travar, a tela diz qual etapa e não fica "carregando" para sempre.
        const t0 = performance.now();
        const stage = <T,>(name: string, p: Promise<T>, ms: number) =>
          Promise.race([
            p.then((v) => {
              console.info(`[legenda] ${name}: ${Math.round(performance.now() - t0)} ms`);
              return v;
            }),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`travou na etapa "${name}" (mais de ${ms / 1000} s)`)), ms)),
          ]);
        const content = await stage("baixar o arquivo", fetch(track.url, { signal: AbortSignal.timeout(30000) }).then((res) => {
          if (!res.ok) throw new Error(`o servidor respondeu ${res.status}`);
          return res.text();
        }), 30000);
        if (cancelled) return;
        const { default: JASSUB } = await stage("carregar o renderizador", import("jassub"), 20000);
        if (cancelled) return;
        const start = async (fonts: string[]) => {
          const i = new JASSUB({ video, subContent: content, fonts }) as unknown as JassubInstance & { ready?: Promise<void> };
          jassubRef.current = i;
          try {
            await stage(fonts.length ? "iniciar o renderizador" : "iniciar o renderizador (sem fontes)", Promise.resolve(i.ready), 15000);
          } catch (err) {
            await i.destroy?.();
            if (jassubRef.current === i) jassubRef.current = null;
            throw err;
          }
          return i;
        };
        let inst: JassubInstance;
        try {
          inst = await start(subs.fonts);
        } catch (err) {
          if (cancelled) return;
          console.warn("[legenda] falhou com as fontes do arquivo; tentando só com a fonte padrão", err);
          inst = await start([]);
        }
        if (cancelled) {
          void inst.destroy?.();
          return;
        }
        setSubStatus({ state: "ready" });
        // O JASSUB só desenha quando chega um quadro novo; pausado, nenhum chega. Empurra 1 ms para gerar um.
        setTimeout(() => {
          if (cancelled) return;
          if (video.paused && !video.seeking) video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 0.001);
          void inst.resize?.(true);
        }, 400);
      } catch (e) {
        if (cancelled) return;
        console.error("[legenda]", e);
        setSubStatus({ state: "error", msg: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      cancelled = true;
      trackEl?.remove();
    };
  }, [subId, subs, phase]);

  useEffect(() => () => void jassubRef.current?.destroy(), []);

  // Abertura e encerramento deste episódio (capítulos do arquivo ou marcas manuais do título).
  useEffect(() => {
    fetch(`/api/skip/${episodeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setSkip)
      .catch(() => setSkip(null));
  }, [episodeId]);

  async function saveMarks(patch: Record<string, number | null>) {
    const res = await fetch(`/api/skip/${episodeId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (res.ok) setSkip(await res.json());
  }
  async function clearMarks() {
    const res = await fetch(`/api/skip/${episodeId}`, { method: "DELETE" });
    if (res.ok) setSkip(await res.json());
  }

  /** Vai para o próximo episódio marcando este como concluído (o "Continuar assistindo" passa a oferecer o seguinte). */
  function goNext() {
    const v = videoRef.current;
    if (v && v.duration && Number.isFinite(v.duration)) {
      completedRef.current = true;
      void fetch("/api/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId, position: v.duration, duration: v.duration }),
        keepalive: true,
      });
    }
  }
  function skipIntro() {
    if (videoRef.current && skip?.intro) videoRef.current.currentTime = skip.intro.end;
  }

  // Chegando do voo do disco na Home: o círculo se abre a partir do disco, que se desfaz.
  useEffect(() => {
    let reveal = false;
    try {
      reveal = sessionStorage.getItem(REVEAL_KEY) === "1";
      sessionStorage.removeItem(REVEAL_KEY);
    } catch {
      /* sem armazenamento */
    }
    const wrap = wrapRef.current;
    const flying = document.querySelectorAll<HTMLElement>(".dc-dart.flying");
    if (!reveal || !wrap || matchMedia("(prefers-reduced-motion: reduce)").matches || flying.length === 0) {
      clearFlight();
      return;
    }
    const r0 = Math.min(innerWidth, innerHeight) * 0.25;
    const R = Math.hypot(innerWidth, innerHeight) / 2;
    wrap.animate([{ clipPath: `circle(${r0}px at 50% 50%)` }, { clipPath: `circle(${R}px at 50% 50%)` }], { duration: 800, easing: "cubic-bezier(.65,0,.2,1)" });
    flying.forEach((el) => el.animate([{ scale: "1", opacity: 1 }, { scale: "1.3", opacity: 0 }], { duration: 650, easing: "ease-in", fill: "forwards" }).finished.then(() => el.remove(), () => el.remove()));
    document.getElementById("dc-veil")?.classList.remove("on");
  }, []);

  // O Next mantém as telas anteriores montadas (ocultas) para voltar rápido a elas. Sem isto, o vídeo da tela
  // que você deixou continua tocando por trás. Esconder a tela desmonta os efeitos, então pausa aqui.
  useEffect(
    () => () => {
      lastVideo.current?.pause();
    },
    [],
  );

  // 4) Progresso: a cada 10 s tocando, ao pausar, ao sair da aba.
  const save = useCallback(
    (beacon = false) => {
      const v = videoRef.current;
      if (completedRef.current || !v || !v.duration || !Number.isFinite(v.duration)) return;
      const body = JSON.stringify({ episodeId, position: v.currentTime, duration: v.duration });
      if (beacon) navigator.sendBeacon("/api/progress", new Blob([body], { type: "application/json" }));
      else void fetch("/api/progress", { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    },
    [episodeId],
  );
  useEffect(() => {
    const iv = setInterval(() => videoRef.current && !videoRef.current.paused && save(), 10000);
    const onHide = () => document.visibilityState === "hidden" && save(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => save(true));
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onHide);
      save(true);
    };
  }, [save]);

  function onLoadedMetadata() {
    const v = videoRef.current!;
    setDur(v.duration);
    // HEVC sem suporte costuma tocar só o áudio (largura 0): refaz em H.264 de alta qualidade.
    if (v.videoWidth === 0 && mode === "auto") {
      resumeAt.current = v.currentTime || resumeAt.current;
      return switchToCompat();
    }
    if (resumeAt.current > 5 && resumeAt.current < v.duration - 5) v.currentTime = resumeAt.current;
    resumeAt.current = 0;
    void v.play().catch(() => {});
  }

  function onVideoError() {
    const v = videoRef.current;
    if (mode === "auto") {
      resumeAt.current = v?.currentTime || resumeAt.current;
      return switchToCompat();
    }
    setError("O navegador não conseguiu reproduzir este vídeo.");
    setPhase("error");
  }

  function changeAudio(idx: number) {
    resumeAt.current = videoRef.current?.currentTime ?? 0;
    restart();
    setAudioIndex(idx);
  }

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen();
  }, []);

  // A legenda ASS é um canvas ao lado do <video>: só aparece em tela cheia se o CONTÊINER for o elemento em tela cheia.
  // Duplo clique e menu do Chrome colocam só o <video> em tela cheia (e a legenda some); aqui isso é redirecionado.
  useEffect(() => {
    function onChange() {
      const wrap = wrapRef.current;
      if (document.fullscreenElement && document.fullscreenElement === videoRef.current && wrap) {
        // Troca direto para o contêiner, sem sair antes (sair gasta o gesto do usuário e o pedido seguinte falharia).
        // Se o navegador recusar, fica a tela cheia nativa em vez de expulsar o usuário dela.
        wrap.requestFullscreen().catch(() => {});
        return;
      }
      // O tamanho mudou: o canvas das legendas precisa se ajustar ao novo quadro.
      for (const ms of [50, 300, 800]) setTimeout(() => void jassubRef.current?.resize?.(true), ms);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const v = videoRef.current;
      if (!v || (e.target as HTMLElement).closest("select,input,textarea")) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.key === "ArrowRight") v.currentTime += 10;
      else if (e.key === "ArrowLeft") v.currentTime -= 10;
      else if (e.key === "f") toggleFullscreen();
      else if (e.key === "m") v.muted = !v.muted;
      else if (e.key === "n" && nextHref) {
        goNext();
        router.push(nextHref);
      }
      else if (e.key === "p" && prevHref) router.push(prevHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- goNext só usa refs e o episódio atual
  }, [toggleFullscreen, nextHref, prevHref, router]);

  function poke() {
    setUiVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => !videoRef.current?.paused && setUiVisible(false), 3000);
  }

  // Quando mostrar os botões de pulo.
  const introWindow = skip?.intro ? now >= skip.intro.start - 2 && now < skip.intro.end - 1 : false;
  const outroStart = skip?.outro?.start ?? (dur > 300 ? dur - FALLBACK_OUTRO_SECONDS : null);
  const showIntroButton = phase === "ready" && !ended && introWindow;
  const showNextButton = phase === "ready" && Boolean(nextHref) && (ended || (outroStart != null && now >= outroStart));

  const segStyle = (s: Segment | null) =>
    s && dur > 0 ? { left: `${(s.start / dur) * 100}%`, width: `${(Math.min(s.end, dur) - s.start) / dur * 100}%` } : { display: "none" };
  const pct = dur > 0 ? Math.min(100, (now / dur) * 100) : 0;

  return (
    <div
      ref={wrapRef}
      className={`dc-watch ${uiVisible || !playing ? "" : "cursor-none"}`}
      onMouseMove={poke}
      onTouchStart={poke}
      // Duplo clique no vídeo = tela cheia do CONTÊINER (com a legenda), não a nativa do <video>.
      onDoubleClickCapture={(e) => {
        if (e.target === videoRef.current) {
          e.stopPropagation();
          e.preventDefault();
          clearTimeout(clickTimer.current); // o primeiro clique do duplo clique não deve pausar
          toggleFullscreen();
        }
      }}
      onClick={(e) => {
        if (e.target !== videoRef.current) return;
        clearTimeout(clickTimer.current);
        clickTimer.current = setTimeout(togglePlay, 250);
      }}
    >
      <ArcDefs />
      <h1 className="sr-only">{title} — {subtitle}</h1>
      {streamUrl && (
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el) lastVideo.current = el;
          }}
          key={streamUrl}
          src={streamUrl}
          playsInline
          disablePictureInPicture
          preload="auto"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
          onSeeked={() => void jassubRef.current?.resize?.(true)}
          onDurationChange={(e) => setDur(e.currentTarget.duration)}
          onError={onVideoError}
          onPause={() => (setPlaying(false), save(), setUiVisible(true))}
          onPlay={() => (setPlaying(true), setEnded(false), poke())}
          onVolumeChange={(e) => (setVolume(e.currentTarget.volume), setMuted(e.currentTarget.muted))}
          onEnded={() => (save(), setEnded(true))}
          className="absolute inset-0 size-full bg-black object-contain"
        />
      )}

      {phase === "preparing" && (
        <div className="dc-prep" role="status" aria-live="polite">
          <span className="dc-spin">
            <DiscArt cover={cover} label={discText} />
          </span>
          <p>
            {mode === "compat" ? "Convertendo para H.264 em alta qualidade" : "Preparando o vídeo sem perda de qualidade"}
            {progress > 0 && <> · <b>{Math.round(progress * 100)}%</b></>}
          </p>
        </div>
      )}
      {phase === "error" && (
        <div className="dc-prep" role="alert">
          <p className="text-red-400">{error}</p>
          <button onClick={switchToCompat} className="dc-btn-play">Tentar modo compatível (H.264)</button>
        </div>
      )}

      <div className={`dc-wshade${uiVisible || !playing || phase !== "ready" ? "" : " idle"}`} aria-hidden="true" />
      <div className={`dc-wui${uiVisible || !playing || phase !== "ready" ? "" : " idle"}`}>
        <div className="dc-wtop">
          <div className="flex min-w-0 items-center gap-[18px]">
            <Link href={backHref} className="dc-wback"><IconBack />Voltar</Link>
            <div className="dc-wtitle">
              <b>{title}</b>
              <span>{subtitle}{mode === "compat" && " · modo compatível"}</span>
            </div>
          </div>
          <div className="dc-wtools">
            {audioTracks.length > 1 && (
              <select aria-label="Áudio" value={audioIndex ?? ""} onChange={(e) => changeAudio(Number(e.target.value))} className="dc-wsel">
                {audioTracks.map((a) => <option key={a.index} value={a.index}>Áudio: {a.label}</option>)}
              </select>
            )}
            {subStatus.state === "loading" && <span role="status" className="dc-wstat">Carregando legenda…</span>}
            {subs && subs.tracks.length > 0 && (
              <select aria-label="Legenda" value={subId} onChange={(e) => chooseSubtitle(e.target.value)} className="dc-wsel">
                <option value="">Sem legenda</option>
                {subs.tracks.map((t) => <option key={t.id} value={t.id}>Legenda: {t.label}</option>)}
              </select>
            )}
            {prevHref && <Link href={prevHref} className="dc-wicon" aria-label="Episódio anterior" title="Episódio anterior (p)"><IconSkipPrev /></Link>}
            {nextHref && <Link href={nextHref} onClick={goNext} className="dc-wicon" aria-label="Pular para o próximo episódio" title="Próximo episódio (n)"><IconSkipNext /></Link>}
            <button type="button" onClick={() => setMarkOpen((o) => !o)} className="dc-wicon" aria-label="Marcar abertura e encerramento" aria-expanded={markOpen} title="Abertura e encerramento"><IconMarks /></button>
          </div>
        </div>

        {streamUrl && (
        <div className="dc-wbottom">
          <div className="dc-wbar">
            <u style={segStyle(skip?.intro ?? null)} />
            <u style={segStyle(skip?.outro ? { ...skip.outro, end: dur } : null)} />
            <i style={{ width: `${pct}%` }} />
            <input
              type="range"
              aria-label="Posição do vídeo"
              aria-valuetext={`${fmt(now)} de ${fmt(dur)}`}
              min={0}
              max={dur || 0}
              step={0.1}
              value={Math.min(now, dur || 0)}
              onChange={(e) => {
                const v = videoRef.current;
                if (v) v.currentTime = Number(e.target.value);
                setNow(Number(e.target.value));
              }}
            />
          </div>
          <div className="dc-wctl">
            <button type="button" className="dc-wbtn" onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproduzir"} title="Reproduzir/pausar (espaço)">
              {playing ? <IconPause /> : <IconPlayO />}
            </button>
            <button
              type="button"
              className="dc-wbtn"
              onClick={() => {
                const v = videoRef.current;
                if (v) v.muted = !v.muted;
              }}
              aria-label={muted || volume === 0 ? "Ativar som" : "Silenciar"}
              title="Silenciar (m)"
            >
              {muted || volume === 0 ? <IconMute /> : <IconVol />}
            </button>
            <input
              type="range"
              className="dc-wvol"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = Number(e.target.value) === 0;
              }}
            />
            <span className="dc-wtime">{fmt(now)} / {fmt(dur)}</span>
            <span className="dc-wnote">{skip?.intro?.source === "chapters" ? "Abertura e encerramento detectados pelos capítulos" : ""}</span>
            <button type="button" className="dc-wbtn ml-auto sm:ml-0" onClick={toggleFullscreen} aria-label="Tela cheia" title="Tela cheia (f)">
              <IconFull />
            </button>
          </div>
        </div>
        )}
      </div>

      {markOpen && skip && (
        <div role="dialog" aria-label="Abertura e encerramento" className="dc-marks space-y-3">
          <div>
            <p className="font-bold">Abertura</p>
            {skip.intro ? (
              <p className="text-xs text-muted">
                {fmt(skip.intro.start)}–{fmt(skip.intro.end)}, {skip.intro.source === "chapters" ? "detectada pelos capítulos do arquivo" : "marcada por você (vale para a série)"}
              </p>
            ) : (
              <p className="text-xs text-muted">
                Não detectada.{skip.marks.introStart != null ? ` Início em ${fmt(skip.marks.introStart)}; falta marcar o fim.` : " Pause no começo e no fim dela e marque."}
              </p>
            )}
            {skip.intro?.source !== "chapters" && (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => saveMarks({ introStart: now })} className="flex-1 rounded-[3px] border border-border px-2 py-1.5 hover:border-foreground">Início aqui</button>
                <button type="button" onClick={() => saveMarks({ introEnd: now })} className="flex-1 rounded-[3px] border border-border px-2 py-1.5 hover:border-foreground">Fim aqui</button>
              </div>
            )}
          </div>
          <div>
            <p className="font-bold">Encerramento</p>
            {skip.outro ? (
              <p className="text-xs text-muted">
                a partir de {fmt(skip.outro.start)}, {skip.outro.source === "chapters" ? "detectado pelos capítulos do arquivo" : "marcado por você (vale para a série)"}
              </p>
            ) : (
              <p className="text-xs text-muted">
                Não detectado.{dur > 300 ? ` O botão de próximo episódio aparece nos últimos ${FALLBACK_OUTRO_SECONDS} s.` : " Marque onde ele começa."}
              </p>
            )}
            {skip.outro?.source !== "chapters" && (
              <button type="button" onClick={() => saveMarks({ outroStart: now })} className="mt-2 w-full rounded-[3px] border border-border px-2 py-1.5 hover:border-foreground">Início do encerramento aqui</button>
            )}
          </div>
          {(skip.marks.introStart != null || skip.marks.introEnd != null || skip.marks.outroStart != null) && (
            <button type="button" onClick={clearMarks} className="text-xs text-muted underline hover:text-white">Limpar marcas</button>
          )}
        </div>
      )}

      {subStatus.state === "error" && (
        <div role="alert" className="dc-wtoast">
          <b>Legenda indisponível.</b> {subStatus.msg}
          <button type="button" onClick={() => setSubId("")} className="dc-wtoast-x" aria-label="Fechar aviso">×</button>
        </div>
      )}
      {showIntroButton && (
        <button type="button" onClick={skipIntro} className="dc-wskip intro">Pular abertura</button>
      )}
      {showNextButton && nextHref && (
        <Link href={nextHref} onClick={goNext} className="dc-wskip next">Próximo episódio</Link>
      )}
    </div>
  );
}
