/**
 * Client Anthropic server-side — unica fonte dati per prezzi, sottostanti, rating,
 * analisi e chat (§2, §6). La chiave vive solo qui (ANTHROPIC_API_KEY su Vercel),
 * mai nel bundle client.
 *
 * Irrobustisce esattamente i difetti noti del prototipo (§11):
 *  - retry con backoff esponenziale su 429/500/502/503/504/529, non trattati come fatali
 *  - messaggi che distinguono "problema del servizio" da "problema della richiesta"
 *  - errori con fase esplicita (ricerca sottostante / fetch prezzi / analisi / chat...)
 *  - JSON troncato distinto da JSON malformato
 */

import Anthropic from "@anthropic-ai/sdk";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

/**
 * claude-opus-5 di default (il modello più capace, indicato per ricerca+estrazione
 * accurata). Configurabile via ANTHROPIC_MODEL per chi preferisce contenere i costi
 * su un uso quotidiano e ripetuto (es. claude-sonnet-5) — vedi README.
 */
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

function client(): Anthropic {
  // maxRetries:0 — il retry lo gestiamo noi esplicitamente, con i codici e i
  // messaggi richiesti dalla spec (529 incluso, non standard nei retry di default).
  return new Anthropic({ maxRetries: 0 });
}

const attesa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ChiediOpzioni {
  ricerca?: boolean;
  maxTokens?: number;
  tentativi?: number;
  system?: string;
  effort?: Effort;
}

/**
 * Interroga Claude, con o senza web search, ritentando sugli errori transitori.
 * Ritorna il testo concatenato dei blocchi di risposta.
 */
export async function chiedi(
  contenuto: Anthropic.MessageParam["content"],
  opzioni: ChiediOpzioni = {}
): Promise<string> {
  const { ricerca = true, maxTokens = 2000, tentativi = 5, system, effort = "medium" } = opzioni;
  const anthropic = client();
  let ultimoErrore: Error = new Error("errore sconosciuto");

  for (let tentativo = 0; tentativo < tentativi; tentativo++) {
    try {
      const response = await anthropic.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        output_config: { effort },
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: contenuto }],
        ...(ricerca
          ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] }
          : {}),
      });
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionError) {
        ultimoErrore = new Error(`rete: ${e.message}`);
        await attesa(1500 * 2 ** tentativo + Math.random() * 600);
        continue;
      }
      if (e instanceof Anthropic.APIError && e.status != null && RETRYABLE_STATUS.has(e.status)) {
        ultimoErrore =
          e.status === 429
            ? new Error("troppe richieste ravvicinate (429).")
            : new Error(`servizio temporaneamente sovraccarico (${e.status}).`);
        await attesa(1500 * 2 ** tentativo + Math.random() * 600);
        continue;
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
  throw new Error(
    `${ultimoErrore.message} Ho ritentato ${tentativi} volte. È un problema momentaneo del servizio, non della richiesta: riprova fra un minuto.`
  );
}

/**
 * Estrae il primo oggetto JSON bilanciato dal testo (che può contenere fence
 * ```json, prosa attorno, ecc.). Distingue esplicitamente "troncato" da "malformato".
 */
export function estraiJSON<T = unknown>(testo: string): T {
  const grezzo = (testo || "").slice(0, 200);
  const pulito = (testo || "").replace(/```json/gi, "").replace(/```/g, "");
  const i = pulito.indexOf("{");
  if (i < 0) throw new Error(`nessun JSON nella risposta. Ricevuto: «${grezzo}»`);

  let livello = 0;
  let inStringa = false;
  let escape = false;
  for (let k = i; k < pulito.length; k++) {
    const ch = pulito[k];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inStringa = !inStringa;
      continue;
    }
    if (inStringa) continue;
    if (ch === "{") livello++;
    else if (ch === "}") {
      livello--;
      if (livello === 0) {
        try {
          return JSON.parse(pulito.slice(i, k + 1)) as T;
        } catch (e) {
          throw new Error(`JSON malformato: ${(e as Error).message}`);
        }
      }
    }
  }
  throw new Error("risposta troncata prima della chiusura del JSON.");
}

/** Errore con fase esplicita (§11: "instrumentare ogni fase con etichette proprie"). */
export function erroreFase(fase: string, e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  const nome = e instanceof Error && e.name !== "Error" ? ` [${e.name}]` : "";
  return new Error(`non riuscito in fase «${fase}»: ${msg}${nome}`);
}

export { attesa };
export type { Anthropic };
