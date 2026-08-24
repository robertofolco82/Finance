/** Design tokens — SPEC.md §7.4. Card invece di tabelle, cifre in monospace tabulare. */

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
  warn: "var(--warn)",
  warnBg: "var(--warnBg)",
} as const;

export const R = 14;
export const OMBRA = "0 1px 2px rgba(11,15,23,.05), 0 6px 20px -8px rgba(11,15,23,.10)";
export const UI = "var(--font-manrope), -apple-system, system-ui, sans-serif";
export const MONO = "var(--font-jetbrains-mono), ui-monospace, monospace";

export const MACRO_COL: Record<string, string> = {
  Azioni: "#00A06B",
  Obbligazioni: "#2F4BFF",
  Monetario: "#8FA0C9",
  Commodities: "#B37400",
};

export const CLASSE_COL: Record<string, string> = {
  Azione: "#00A06B",
  "ETF azionario": "#1B8A66",
  Turbo: "#E0393E",
  "Leva fissa": "#E0393E",
  "ETP leva": "#E0393E",
  Strutturato: "#B37400",
  Governativo: "#2F4BFF",
  "ETF obbligazionario": "#5C79FF",
  Monetario: "#8FA0C9",
  ETC: "#8A6E3F",
};

export const nf = (n: number | null | undefined, d = 0): string =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);

export const pc = (n: number | null | undefined, d = 2): string =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;

export const sg = (n: number | null | undefined): string => (n == null ? T.mut : n > 0 ? T.pos : n < 0 ? T.neg : T.mut);
