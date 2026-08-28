/** Design tokens — tema Modernist: ink su fondo chiaro, un solo accento rosso, raggio 0. */

export const T = {
  bg: "var(--bg)",
  surf: "var(--surf)",
  surf2: "var(--surf2)",
  ink: "var(--ink)",
  mut: "var(--mut)",
  faint: "var(--faint)",
  line: "var(--line)",
  pos: "var(--pos)",
  posBg: "var(--posBg)",
  neg: "var(--neg)",
  negBg: "var(--negBg)",
  acc: "var(--acc)",
  accBg: "var(--accBg)",
  accSolid: "var(--accSolid)",
  warn: "var(--warn)",
  warnBg: "var(--warnBg)",
} as const;

export const R = 0;
export const OMBRA = "none";
export const UI = "var(--font-archivo), system-ui, sans-serif";
export const MONO = "var(--font-archivo), system-ui, sans-serif";

// Sistema mono: nessuna seconda tinta. Solo gli strumenti a leva/turbo (rischio)
// usano l'accento; il resto resta su grigi neutri — l'accento si nota perché è raro.
export const MACRO_COL: Record<string, string> = {
  Azioni: "#ae1800",
  Obbligazioni: "#2d2b2b",
  Monetario: "#bab6b6",
  Commodities: "#7d7979",
};

export const CLASSE_COL: Record<string, string> = {
  Azione: "#605d5d",
  "ETF azionario": "#605d5d",
  Turbo: "#ae1800",
  "Leva fissa": "#ae1800",
  "ETP leva": "#ae1800",
  Strutturato: "#605d5d",
  Governativo: "#605d5d",
  "ETF obbligazionario": "#605d5d",
  Monetario: "#605d5d",
  ETC: "#605d5d",
};

export const nf = (n: number | null | undefined, d = 0): string =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);

export const pc = (n: number | null | undefined, d = 2): string =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;

export const sg = (n: number | null | undefined): string => (n == null ? T.mut : n > 0 ? T.pos : n < 0 ? T.neg : T.mut);
