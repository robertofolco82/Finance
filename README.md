# Dashboard Portafoglio

Dashboard personale per monitorare un portafoglio titoli reale (28 posizioni). Ricostruita
da zero su Claude Code a partire dal prototipo React monofile descritto in [`SPEC.md`](./SPEC.md)
— quel documento resta la fonte di verità su requisiti, formule e decisioni prese; questo
README copre solo setup e deploy.

## Architettura

```
Vercel Cron (feriali, 22:30 CET/CEST)
        │
        ▼
/api/cron/refresh-prezzi  ──►  Claude (web search) per prezzo + chiusura precedente
        │                       ogni 28 ISIN, a lotti di 5, con quarantena al 60%
        ▼
data/*.json nel repo GitHub  ◄── letti/scritti via GitHub Contents API (Octokit)
        │                        (in locale: filesystem diretto, vedi sotto)
        ▼
Next.js API routes  ──►  frontend React (nessuna chiave lato client)
```

Decisioni chiave (motivate in `SPEC.md` §2, §6, §13):

- **Vercel** invece di verificare cosa supporta l'hosting personale: gratuito, deploy
  diretto da questo repo, funzioni serverless per l'API, cron incluso. La chiave
  Anthropic vive solo nelle env var del progetto Vercel.
- **Nessun provider dati di mercato a pagamento.** I prezzi si ricavano con la stessa
  tecnica del prototipo (Claude + ricerca web), ma irrobustita: batch da 5 titoli,
  retry con backoff su 429/5xx/529, chiusura precedente salvata per il P&L giornaliero,
  quarantena obbligatoria sopra il 60% di scostamento dall'ultimo prezzo *scaricato*
  (non dall'export).
- **Store dati = questo repo.** I file in `data/*.json` sono lo storico versionato
  (§2.1: "anche solo JSON versionati su disco"). Zero database esterni da configurare.

## Setup

### 1. Variabili d'ambiente

Copia `.env.example` e compila:

| Variabile | Cosa serve |
|---|---|
| `ANTHROPIC_API_KEY` | Prezzi, sottostanti, rating, analisi, chat, track record. Server-side only. |
| `ANTHROPIC_MODEL` | Scelta di partenza (default nel codice `claude-opus-5` se lasci vuoto). Una volta impostato un modello dal menù a tendina in dashboard, quella scelta ha sempre la priorità — vedi [Costi](#costi). |
| `GITHUB_TOKEN` | Fine-grained personal access token con **Contents: Read and write** solo su questo repo (Settings → Developer settings → Fine-grained tokens). Usato dalle funzioni Vercel per leggere/scrivere `data/*.json`. |
| `GITHUB_REPO` | `robertofolco82/finance` |
| `GITHUB_BRANCH` | Il branch che Vercel sta effettivamente servendo (le scritture vanno lì). |
| `CRON_SECRET` | Stringa casuale (`openssl rand -hex 32`); Vercel la invia da sola come header sulle chiamate cron. |

### 2. Deploy su Vercel

1. Importa questo repository su [vercel.com/new](https://vercel.com/new).
2. Imposta le variabili d'ambiente sopra nel progetto Vercel (Production **e** Preview
   se vuoi testare da branch diversi).
3. Deploy. Il cron in `vercel.json` si registra da solo (feriali, 22:30 CET/CEST —
   nota DST sotto).
4. Apri l'URL `*.vercel.app` da iPhone Safari (dispositivo primario, §1.1) o punta
   un tuo dominio.

**Nota fuso orario:** il cron è un orario UTC fisso (`30 20 * * 1-5` = 20:30 UTC),
non si adatta automaticamente all'ora legale. Corrisponde a 22:30 in CEST (estate);
in CET (inverno) scatta alle 21:30 locali. Per un aggiornamento giornaliero on-demand
questa deriva di un'ora due volte l'anno è irrilevante — se non lo è per te, aggiorna
manualmente `vercel.json` al cambio d'ora.

### 3. Sviluppo locale

```bash
npm install
cp .env.example .env.local   # compila almeno ANTHROPIC_API_KEY
npm run dev
```

In locale `DATA_BACKEND` non serve impostarla: senza la variabile `VERCEL` (assente
in sviluppo) lo store usa direttamente il filesystem (`data/*.json`), quindi le
modifiche restano locali finché non le committi tu.

```bash
npm test        # vitest sulle formule di calcolo (lib/calc.test.ts)
npm run build   # build di produzione, stesso comando che gira su Vercel
```

## Limiti noti

- **Movimenti sintetici.** `data/movimenti.json` contiene un solo movimento di
  acquisto per ISIN, ricostruito dal PMC dell'export del 22/08/2026 con un cambio
  EUR/USD aggregato (1,1682), non il cambio reale alla data di ogni acquisto. Il
  carico calcolato (§5.3) è quindi un'approssimazione — il broker riporta +25.077,38 €
  (+4,13%), qui risulta leggermente diverso. Se recuperi date e prezzi dei singoli
  acquisti, aggiungi righe reali a `movimenti.json`: il calcolo del carico li userà
  automaticamente (§3.1, il PMC si deriva, non si registra). Lo stesso vale per ogni
  posizione toccata da "Importa xls" (sotto): anche lì si sostituisce con un unico
  movimento sintetico, non con lo storico reale dei singoli acquisti/vendite — quindi
  **non traccia realizzato/minusvalenze compensabili** nonostante il modello a
  movimenti lo renda possibile in linea di principio (§3.1); è un'estensione futura,
  non ancora costruita.
- **"Importa xls"** (bottone in alto nel tab Portafoglio) riallinea quantità e PMC da
  un file con colonne ISIN/Quantità/PMC (nomi tollerati in più varianti, es. "Qta",
  "Prezzo di carico" — se non li riconosce te lo dice invece di indovinare). Tocca
  solo gli ISIN già in anagrafica: quelli nuovi vanno aggiunti a mano a
  `strumenti.json` prima (servono mercato/tipo/macro/sottostante, che l'xls non
  contiene). Le posizioni presenti in portafoglio ma assenti dal file vengono
  segnalate, non vendute in automatico.
- **Piano Vercel Hobby: funzioni limitate a 60s.** Il limite vale per *ogni singola
  richiesta HTTP*, non per l'operazione nel suo insieme. "Aggiorna prezzi" perciò
  non è più un'unica richiesta lunga: il browser chiama `/api/refresh/lotto` una
  volta per lotto (una richiesta = una chiamata a Claude, sempre breve), in
  parallelo e con progresso visibile, poi `/api/refresh/salva` una volta sola per
  quarantena e scritture. Così il limite non è più raggiungibile per costruzione,
  qualunque sia il numero di titoli. "Aggiorna rating" su tutti i titoli
  analizzabili resta invece una richiesta unica e sequenziale, e può superare il
  limite: se lì vedi un errore non-JSON (è la pagina d'errore di Vercel, non una
  risposta dell'app), lancia `POST /api/rating/:isin` titolo per titolo o passa al
  piano Pro. Lo scheduler notturno usa ancora `/api/refresh` in un colpo solo,
  perché lì non c'è un browser a orchestrare: se dovesse eccedere, va spezzato
  allo stesso modo.
- **ETP SK Hynix (XS3388190996) a −90%** resta in portafoglio di default (§13,
  decisione non ancora presa nella spec). Rimuoverlo dai calcoli in versioni future
  volesse dire eliminare le sue righe da `strumenti.json`/`movimenti.json`.
- **Storico rating vuoto all'avvio.** Non è acquistabile a posteriori (dato
  licenziato FactSet/LSEG/Visible Alpha, §3.2): si popola da oggi in avanti, una
  rilevazione alla volta, premendo "Aggiorna rating".
- **Cadenza rating consenso:** nessun cron automatico dedicato — "Aggiorna rating"
  va premuto manualmente dalla dashboard (o schedulato aggiungendo un secondo Vercel
  Cron verso `/api/rating/tutti` se vuoi automatizzarlo settimanalmente).
- **`npm audit` segnala alcune vulnerabilità** in dipendenze transitive: `postcss`/
  `sharp` (interne a Next.js 15, corrette solo in Next 16 — non riguardano
  funzionalità usate qui, niente `next/image` né CSS da input utente) e `uuid` (via
  `exceljs`, per "Importa xls" — usata solo per generare ID a caso con `uuid.v4()`,
  non dal percorso vulnerabile dell'advisory che riguarda `v3/v5/v6` con un buffer
  esplicito). Nessuna richiede azione urgente per questo caso d'uso a utente singolo.

## Costi

Il fetcher gira una volta al giorno nei feriali (28 ISIN, 7 chiamate a lotti + 1 per
il cambio) più le chiamate on-demand da UI (rating, analisi, chat).

Il modello si sceglie in due punti, con priorità a quello più vicino all'utente:

1. **Menù a tendina in dashboard** (in alto, accanto all'orario dell'ultimo
   aggiornamento) — salva la scelta in `data/impostazioni.json`, quindi vale per
   tutti i dispositivi da cui apri il sito, non solo quello su cui l'hai cambiata.
   Cambia effetto dalla chiamata successiva, senza bisogno di "Redeploy" su Vercel.
2. **`ANTHROPIC_MODEL` su Vercel** — usata solo finché dal menù non è stato scelto
   nulla ("Predefinito"). Utile come scelta di partenza per un deploy nuovo.

Il codice offre tre livelli (vedi `lib/modelli.ts` per l'elenco esatto): il più
capace (`claude-opus-5`), un buon compromesso qualità/costo (`claude-sonnet-5`,
quello impostato di default in `.env.example`), e il più economico
(`claude-haiku-4-5-20251001`) per chi vuole spendere il minimo indispensabile.

## Struttura del progetto

```
app/                    Next.js App Router — pagine e API routes
  api/                  route.ts per ogni endpoint (§2.1 dell'architettura)
  page.tsx              shell con le tre tab (Portafoglio, Titolo, Analisi)
components/             componenti React (un file per blocco UI di SPEC.md §7)
lib/
  types.ts              modello dati (§3.2)
  calc.ts                formule (§5) — coperte da lib/calc.test.ts
  store.ts               store JSON, backend fs/github
  portafoglio.ts          vista derivata (posizioni + P&L + attribuzione)
  anthropic.ts            client Claude con retry/backoff (§11)
  fetch-prezzi.ts         fetcher prezzi + quarantena + snapshot
  fondamentali.ts, analisi.ts, chat.ts, call.ts, sottostante.ts
  modelli.ts, settings.ts modelli selezionabili + impostazione scelta dall'utente
  xls.ts, importa-portafoglio.ts lettura xls + riallineamento movimenti — coperte da lib/xls.test.ts
data/                    store versionato (strumenti, movimenti, prezzi, snapshot, ...)
SPEC.md                 documento di consegna originale — requisiti e decisioni
```
