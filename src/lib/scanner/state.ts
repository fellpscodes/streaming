export interface ScanState {
  running: boolean;
  phase: "idle" | "walking" | "saving" | "metadata" | "done" | "error";
  filesFound: number;
  processed: number;
  total: number;
  current: string | null;
  error: string | null;
  warnings: string[];
  titlesNeedingReview: number;
}

type Listener = (s: ScanState) => void;

const initial: ScanState = {
  running: false,
  phase: "idle",
  filesFound: 0,
  processed: 0,
  total: 0,
  current: null,
  error: null,
  warnings: [],
  titlesNeedingReview: 0,
};

// Estado em memória (processo único, usuário único): sem fila nem tabela de jobs.
const g = globalThis as unknown as { __scan?: { state: ScanState; listeners: Set<Listener> } };
const store = (g.__scan ??= { state: { ...initial }, listeners: new Set() });

export const getScanState = () => store.state;

export function updateScanState(patch: Partial<ScanState>) {
  store.state = { ...store.state, ...patch };
  for (const l of store.listeners) l(store.state);
}

export function resetScanState() {
  store.state = { ...initial };
}

export function subscribeScan(l: Listener) {
  store.listeners.add(l);
  return () => store.listeners.delete(l);
}
