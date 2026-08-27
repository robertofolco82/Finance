/**
 * Store dati versionato su disco — §2.1: "SQLite / Postgres / anche solo JSON
 * versionati su disco". Qui: JSON nel repo stesso, sotto /data.
 *
 * Due backend dietro la stessa interfaccia:
 *  - "fs":     legge/scrive /data/*.json sul filesystem locale. Usato in `next dev`
 *              e per i test, dove il filesystem è persistente.
 *  - "github": legge/scrive via GitHub Contents API. Necessario su Vercel, dove il
 *              filesystem delle funzioni serverless è effimero e sola lettura fuori
 *              da /tmp. Ogni scrittura è un commit — il repo stesso è lo storico.
 *
 * Backend scelto da DATA_BACKEND, o auto: "github" se gira su Vercel (VERCEL=1),
 * altrimenti "fs".
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  Fondamentali,
  Movimento,
  PrezzoRecord,
  PrezzoSospetto,
  RatingLogEntry,
  Snapshot,
  Strumento,
} from "./types";

export const DATA_FILES = {
  strumenti: "strumenti.json",
  movimenti: "movimenti.json",
  prezzi: "prezzi.json",
  snapshot: "snapshot.json",
  fondamentali: "fondamentali.json",
  rating_log: "rating_log.json",
  sospetti: "sospetti.json",
} as const;

export type DataFileKey = keyof typeof DATA_FILES;

interface DataFileShape {
  strumenti: Strumento[];
  movimenti: Movimento[];
  prezzi: PrezzoRecord[];
  snapshot: Snapshot[];
  fondamentali: Record<string, Fondamentali>;
  rating_log: Record<string, RatingLogEntry[]>;
  sospetti: PrezzoSospetto[];
}

function backend(): "fs" | "github" {
  const forced = process.env.DATA_BACKEND;
  if (forced === "fs" || forced === "github") return forced;
  return process.env.VERCEL ? "github" : "fs";
}

const DATA_DIR = path.join(process.cwd(), "data");

async function readFs<K extends DataFileKey>(key: K): Promise<DataFileShape[K]> {
  const p = path.join(DATA_DIR, DATA_FILES[key]);
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw) as DataFileShape[K];
}

async function writeFs<K extends DataFileKey>(key: K, data: DataFileShape[K]): Promise<void> {
  const p = path.join(DATA_DIR, DATA_FILES[key]);
  await writeFile(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

interface GithubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

function githubConfig(): GithubConfig {
  const repoFull = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!repoFull || !token) {
    throw new Error(
      "Store GitHub non configurato: servono GITHUB_REPO (owner/repo) e GITHUB_TOKEN come variabili d'ambiente su Vercel."
    );
  }
  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) throw new Error(`GITHUB_REPO malformato: «${repoFull}», atteso "owner/repo".`);
  return { owner, repo, branch, token };
}

async function getOctokit() {
  const { Octokit } = await import("@octokit/rest");
  const { token } = githubConfig();
  return new Octokit({ auth: token });
}

async function readGithub<K extends DataFileKey>(key: K): Promise<DataFileShape[K]> {
  const octokit = await getOctokit();
  const { owner, repo, branch } = githubConfig();
  const filePath = `data/${DATA_FILES[key]}`;
  const res = await octokit.repos.getContent({ owner, repo, path: filePath, ref: branch });
  const data = res.data;
  if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
    throw new Error(`${filePath} non è un file su GitHub (${branch}).`);
  }
  const raw = Buffer.from(data.content, "base64").toString("utf8");
  return JSON.parse(raw) as DataFileShape[K];
}

async function writeGithub<K extends DataFileKey>(
  key: K,
  data: DataFileShape[K],
  message: string
): Promise<void> {
  const octokit = await getOctokit();
  const { owner, repo, branch } = githubConfig();
  const filePath = `data/${DATA_FILES[key]}`;

  let sha: string | undefined;
  try {
    const res = await octokit.repos.getContent({ owner, repo, path: filePath, ref: branch });
    const existing = res.data;
    if (!Array.isArray(existing) && existing.type === "file") sha = existing.sha;
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 404) throw e;
  }

  const content = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64");
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content,
    branch,
    ...(sha ? { sha } : {}),
  });
}

export async function readData<K extends DataFileKey>(key: K): Promise<DataFileShape[K]> {
  return backend() === "github" ? readGithub(key) : readFs(key);
}

export async function writeData<K extends DataFileKey>(
  key: K,
  data: DataFileShape[K],
  message: string
): Promise<void> {
  if (backend() === "github") await writeGithub(key, data, message);
  else await writeFs(key, data);
}

/** L'ultimo prezzo noto (chiusura) per ISIN, dallo storico prezzi. */
export function ultimoPrezzo(prezzi: PrezzoRecord[], isin: string): PrezzoRecord | null {
  const dello = prezzi.filter((p) => p.isin === isin);
  if (dello.length === 0) return null;
  return dello.reduce((a, b) => (a.data > b.data ? a : b));
}

/** Cambio EUR/USD più recente, dalla pseudo-riga "EURUSD" nello storico prezzi. */
export function cambioEurUsdCorrente(prezzi: PrezzoRecord[]): number {
  const r = ultimoPrezzo(prezzi, "EURUSD");
  return r?.chiusura ?? 1.1682;
}
