/** Ícones do protótipo: traço fino, herdam a cor do texto. */
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconPlay = () => (
  <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor" /></svg>
);
export const IconVol = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><path d="M3 8v4h3l5 4V4L6 8zM14 7.5a3.5 3.5 0 0 1 0 5M16.5 5a7 7 0 0 1 0 10" /></svg>
);
export const IconMute = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><path d="M3 8v4h3l5 4V4L6 8zM14 8l4 4M18 8l-4 4" /></svg>
);
export const IconBack = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><path d="M12.5 4L6.5 10l6 6" /></svg>
);
export const IconNext = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><path d="M7.5 4l6 6-6 6" /></svg>
);

export const IconPause = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><path d="M6 4v12M14 4v12" /></svg>
);
export const IconPlayO = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><path d="M6 4l10 6-10 6z" /></svg>
);
export const IconFull = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5" /></svg>
);
export const IconSkipPrev = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><path d="M5 4v12M16 4.5v11L8 10z" /></svg>
);
export const IconSkipNext = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><path d="M15 4v12M4 4.5v11L12 10z" /></svg>
);
export const IconMarks = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...base}><circle cx="10" cy="11" r="6" /><path d="M10 11V7.5M8 2.5h4" /></svg>
);
