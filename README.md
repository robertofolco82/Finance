# Dashboard Portafoglio

Dashboard personale per monitorare un portafoglio titoli reale (28 posizioni). Ricostruita
da zero su Claude Code a partire dal prototipo React monofile descritto in [`SPEC.md`](./SPEC.md)
— quel documento resta la fonte di verità su requisiti, formule e decisioni prese; questo
README copre solo setup e deploy.

## Architettura

```
Tu premi "Aggiorna prezzi"  (nessun automatismo: parte solo su tua richiesta)
        │
        ▼
il browser chiama /api/refresh/lotto una volta per lotto, in parallelo
        │            └─► fonti gratuite: Borsa Italiana + stockanalysis.com + BCE
        ▼
/api/refresh/salva  ──►  quarantena al 60%, poi scrive
        ▼
data/*.json nel repo GitHub  ◄── letti/scritti via GitHub Contents API (Octokit)
        │                        (in locale: filesystem diretto, vedi sotto)
        ▼
Next.js API routes  ──►  frontend React (nessuna chiave lato client)
```

Decisioni chiave (motivate in `SPEC.md` §2, §6, §13):

- **Costo zero.** Nessun servizio a pagamento: prezzi da Borsa Italiana e
  stockanalysis.com, cambio dalla BCE, consenso analisti da stockanalysis.com. Non serve
  nessuna chiave API se non il token GitHub per lo store dati.
- **Vercel** invece di verificare cosa supporta l'hosting personale: gratuito, deploy
  diretto da questo repo, funzioni serverless per l'API.
- **Niente Yahoo Finance.** Funziona da un browser ma risponde 429 alle chiamate
  dai server Vercel, che escono da indirizzi di datacenter: verificato in
  produzione, tutti gli 11 titoli che passavano da lì fallivano. Sostituito con
  Borsa Italiana (che da Vercel funziona) e stockanalysis.com.
- **Fonti dirette, non ricerca via LLM.** La ricerca web impiegava oltre 35 secondi
  per 5 titoli e costava a ogni giro; le fonti dirette rispondono in frazioni di
  secondo, gratis, e non possono "leggere male" un numero — l'errore da 24× che aveva
  falsato il prototipo nasceva proprio lì. Copertura verificata sui 28 ISIN reali: **Borsa Italiana 19** (titoli di Stato su MOT, certificati SeDeX, ETF
  ed ETC su ETFplus), **stockanalysis.com 4** (azioni estere e l'ETF quotato solo
  su XETRA), **BCE** per il cambio EUR/USD. I **5 rimanenti** — i 4 strutturati
  EuroTLX e l'ETP SK Hynix — non sono quotati da nessuna fonte gratuita e hanno un
  campo di inserimento manuale nella scheda (§6.3). Resta la quarantena
  obbligatoria sopra il 60% di scostamento dall'ultimo prezzo *scaricato*,
  applicata anche ai prezzi inseriti a mano.
- **Nessun automatismo.** Ogni aggiornamento parte da un tuo clic. Non c'è cron: se in
  futuro ne volessi uno, va aggiunto a `vercel.json` con un endpoint che orchestri i
  lotti (il limite di 60s vale anche lì, dove non c'è un browser a spezzarli).
- **Store dati = questo repo.** I file in `data/*.json` sono lo storico versionato
  (§2.1: "anche solo JSON versionati su disco"). Zero database esterni da configurare.

## Setup

### 1. Variabili d'ambiente

Serve **solo** l'accesso allo store dati. Nessuna chiave a pagamento.

| Variabile | Cosa serve |
|---|---|
| `GITHUB_TOKEN` | Fine-grained personal access token con **Contents: Read and write** solo su questo repo (Settings → Developer settings → Fine-grained tokens). Le funzioni Vercel lo usano per leggere/scrivere `data/*.json`. |
| `GITHUB_REPO` | `robertofolco82/finance` |
| `GITHUB_BRANCH` | Il branch che Vercel sta servendo (le scritture vanno lì). |

### 2. Deploy su Vercel

1. Importa questo repository su [vercel.com/new](https://vercel.com/new).
2. Imposta le tre variabili sopra.
3. Deploy, poi apri l'URL `*.vercel.app` da iPhone Safari (dispositivo primario, §1.1).

### 3. Sviluppo locale

```bash
npm install
npm run dev     # in locale lo store usa direttamente data/*.json
npm test        # 36 test su calcoli, parser xls, consenso, timeout
npm run build   # stesso comando che gira su Vercel
```

Gli script in `scripts/` riverificano la copertura delle fonti sui 28 ISIN reali:

```bash
node scripts/verifica-fonti.mjs           # prezzi: dice quale fonte si è rotta
node scripts/verifica-stockanalysis.mjs   # consenso analisti
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
  richiesta HTTP*, non per l'operazione nel suo insieme. "Aggiorna prezzi" perciò non
  è un'unica richiesta lunga: il browser chiama `/api/refresh/lotto` una volta per
  lotto, in parallelo e con progresso visibile, poi `/api/refresh/salva` una volta
  sola. Con le fonti gratuite un giro completo sui 28 titoli si chiude in circa 5
  secondi. **"Aggiorna rating"** interroga in sequenza gli 8 titoli analizzabili e si
  chiude ampiamente entro il limite.
- **ETP SK Hynix (XS3388190996) a −90%** resta in portafoglio di default (§13,
  decisione non ancora presa nella spec). Rimuoverlo dai calcoli in versioni future
  volesse dire eliminare le sue righe da `strumenti.json`/`movimenti.json`.
- **Storico rating vuoto all'avvio.** Non è acquistabile a posteriori (dato
  licenziato FactSet/LSEG/Visible Alpha, §3.2): si popola da oggi in avanti, una
  rilevazione alla volta, premendo "Aggiorna rating".
- **Fonti prezzi non ufficiali.** Borsa Italiana e stockanalysis.com vengono lette
  dalle pagine pubbliche: se cambiano struttura, quei prezzi smettono di arrivare.
  Non è un rischio silenzioso — i titoli non aggiornati vengono elencati con il
  motivo, e restano l'inserimento manuale e la quarantena a impedire che un valore
  sbagliato entri nei totali. In più, i prezzi da stockanalysis.com sono verificati
  contro il range di giornata della stessa pagina: un'estrazione presa dal punto
  sbagliato viene scartata invece che applicata. La mappatura sta in
  `data/strumenti.json` (`percorso_borsait`, `percorso_stockanalysis`) e
  `node scripts/verifica-fonti.mjs` dice in un colpo solo quale fonte si è rotta.
- **`npm audit` segnala alcune vulnerabilità** in dipendenze transitive: `postcss`/
  `sharp` (interne a Next.js 15, corrette solo in Next 16 — non riguardano
  funzionalità usate qui, niente `next/image` né CSS da input utente) e `uuid` (via
  `exceljs`, per "Importa xls" — usata solo per generare ID a caso con `uuid.v4()`,
  non dal percorso vulnerabile dell'advisory che riguarda `v3/v5/v6` con un buffer
  esplicito). Nessuna richiede azione urgente per questo caso d'uso a utente singolo.

## Funzioni rimosse

Il prototipo prevedeva anche **analisi completa per ISIN**, **chat sul titolo** ed
**estrazione delle call da PDF** (§8, §9 della spec). Erano le uniche funzioni che
richiedevano un modello linguistico a pagamento e sono state rimosse su richiesta,
insieme al selettore del modello e allo scheduler: la dashboard oggi non ha alcun
percorso che possa generare una spesa. Il track record delle call (§9) resta quindi
non implementato — reintrodurlo richiederebbe o una chiave a pagamento o un form di
inserimento manuale.

La ripartizione **buy/hold/sell** della ciambella (§7.2) non è disponibile dalla fonte
gratuita, che espone solo il giudizio sintetico e il numero di analisti: si mostra
quello, senza inventare i conteggi.

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
  prezzi-fonti.ts         Borsa Italiana / stockanalysis / BCE — lib/prezzi-fonti.test.ts
  consenso.ts             consenso analisti da stockanalysis.com — lib/consenso.test.ts
  fondamentali.ts         orchestrazione rating + storico rilevazioni
  xls.ts, importa-portafoglio.ts lettura xls + riallineamento movimenti — lib/xls.test.ts
data/                    store versionato (strumenti, movimenti, prezzi, snapshot, ...)
SPEC.md                 documento di consegna originale — requisiti e decisioni
```
