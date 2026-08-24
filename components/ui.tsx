"use client";

import type { CSSProperties, ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { MONO, OMBRA, R, T, UI, sg } from "@/lib/theme";

export function Card({ children, style, pad = 20 }: { children: ReactNode; style?: CSSProperties; pad?: number }) {
  return (
    <div style={{ background: T.surf, borderRadius: R, boxShadow: OMBRA, padding: pad, ...style }}>{children}</div>
  );
}

export function Label({ children, col = T.mut }: { children: ReactNode; col?: string }) {
  return (
    <div style={{ font: `600 10px/1 ${UI}`, letterSpacing: ".1em", textTransform: "uppercase", color: col }}>
      {children}
    </div>
  );
}

export function N({
  children,
  s = 14,
  c = T.ink,
  w = 600,
}: {
  children: ReactNode;
  s?: number;
  c?: string;
  w?: number;
}) {
  return (
    <span style={{ font: `${w} ${s}px/1.15 ${MONO}`, fontVariantNumeric: "tabular-nums", color: c }}>{children}</span>
  );
}

export function Chip({ v, s = 12, suffix = "%" }: { v: number | null | undefined; s?: number; suffix?: string }) {
  if (v == null) return <span style={{ color: T.faint, font: `400 ${s}px ${UI}` }}>—</span>;
  const bg = v > 0 ? T.posBg : v < 0 ? T.negBg : T.surf2;
  return (
    <span
      style={{
        background: bg,
        color: sg(v),
        font: `600 ${s}px/1 ${MONO}`,
        padding: "5px 8px",
        borderRadius: 7,
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {v >= 0 ? "+" : ""}
      {v.toFixed(2)}
      {suffix}
    </span>
  );
}

export function Tag({ children, col }: { children: ReactNode; col: string }) {
  return (
    <span
      style={{
        font: `600 9px/1 ${UI}`,
        letterSpacing: ".07em",
        textTransform: "uppercase",
        color: col,
        border: `1px solid ${col}33`,
        background: `${col}0F`,
        padding: "4px 6px",
        borderRadius: 5,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = "ghost",
  size = "m",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "accent" | "ghost";
  size?: "s" | "m";
  title?: string;
}) {
  const base: CSSProperties = {
    font: `600 ${size === "s" ? 10 : 11}px/1 ${UI}`,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    padding: size === "s" ? "7px 10px" : "10px 15px",
    borderRadius: 9,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "opacity .15s",
    opacity: disabled ? 0.45 : 1,
    whiteSpace: "nowrap",
  };
  const v: CSSProperties =
    variant === "primary"
      ? { background: T.ink, color: "#fff", border: `1px solid ${T.ink}` }
      : variant === "accent"
        ? { background: T.accBg, color: T.acc, border: `1px solid ${T.acc}33` }
        : { background: T.surf, color: T.mut, border: `1px solid ${T.line}` };
  return (
    <button title={title} onClick={onClick} disabled={disabled} style={{ ...base, ...v }}>
      {children}
    </button>
  );
}

export function NA({ motivo }: { motivo?: string }) {
  return (
    <span
      title={motivo}
      style={{ font: `400 11px ${UI}`, color: T.faint, cursor: "help", borderBottom: `1px dotted ${T.faint}` }}
    >
      n.a.
    </span>
  );
}

export function Spark({ dati, col }: { dati: { v: number }[]; col: string }) {
  if (!dati || dati.length < 2) return <div style={{ width: 78, height: 28 }} />;
  return (
    <div style={{ width: 78, height: 28 }}>
      <ResponsiveContainer>
        <LineChart data={dati} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={col} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Spinner({ testo }: { testo: string }) {
  return (
    <Card>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: `2px solid ${T.line}`,
            borderTopColor: T.acc,
            animation: "gira .8s linear infinite",
          }}
        />
        <span style={{ font: `500 13px ${UI}`, color: T.mut }}>{testo}</span>
      </div>
    </Card>
  );
}

export function ErroreCard({ messaggio }: { messaggio: string }) {
  return (
    <Card style={{ borderLeft: `3px solid ${T.neg}`, background: T.negBg }}>
      <div style={{ font: `400 13px/1.6 ${UI}`, color: T.ink }}>{messaggio}</div>
    </Card>
  );
}

export const Dato = ({ l, v, col }: { l: string; v?: string | null; col?: string }) => (
  <div>
    <div style={{ font: `600 9px ${UI}`, letterSpacing: ".09em", textTransform: "uppercase", color: T.faint, marginBottom: 5 }}>
      {l}
    </div>
    {v ? <N s={12} c={col || T.ink}>{v}</N> : <span style={{ color: T.faint, font: `400 12px ${UI}` }}>—</span>}
  </div>
);
