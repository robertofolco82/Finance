# Dashboard Portafoglio — Specifica di build per Claude Code

> Documento di consegna. Contiene requisiti, dati reali, decisioni già prese, errori già
> commessi e da non ripetere. Il prototipo di partenza è un artifact React monofile
> funzionante ma limitato dalla sandbox: questo documento serve a rifarlo bene, con backend.

**Versione:** 1.0 — 22 agosto 2026
**Autore funzionale:** Roberto
**Stato prototipo:** funzionante con riserve, vedi §11

---

## 1. Obiettivo

Una dashboard personale, uso singolo, non distribuita, per monitorare un portafoglio titoli
reale di circa **632.000 €** su 28 posizioni.

Il gesto quotidiano da servire è uno solo:

> Apro la dashboard la mattina, vedo il valore aggiornato del portafoglio, il P&L di oggi e
> quello complessivo, e capisco a colpo d'occhio cosa si è mosso e perché.

Tutto il resto (analisi per titolo, rating analisti, track record di call ricevute) è
secondario rispetto a questo.

### 1.1 Vincoli dichiarati

| Vincolo | Valore |
|---|---|
| Utenti | 1 (uso privato, nessuna autenticazione multiutente necessaria) |
| Budget dati di mercato | Solo fonti gratuite o piani free tier |
| Lingua interfaccia | Italiano |
| Dispositivo primario | iPhone (Safari), secondario desktop |
| Hosting | Spazio hosting personale già disponibile — da verificare se supporta server-side |

### 1.2 Non-obiettivi

- Non è uno strumento di trading, non invia ordini.
- Non deve dare raccomandazioni di acquisto o vendita. Riporta il **consenso degli
  analisti** etichettandolo come tale, mai un giudizio proprio.
- Non serve real-time tick-by-tick. Un aggiornamento al giorno, on demand, è sufficiente.

---

## 2. Architettura target

Il prototipo attuale è un file React che gira dentro un artifact Claude.ai. **Questa
architettura ha tre limiti insuperabili** che il nuovo progetto deve risolvere:

1. **Nessuno scheduler.** L'artifact esiste solo mentre è aperto a schermo. Se si chiude la
   scheda o si cambia app, ogni chiamata in corso muore. Impossibile accumulare storico
   automaticamente.
2. **Nessuna chiave API custodibile.** L'ambiente artifact inietta la chiave Anthropic senza
   esporla. Su un hosting proprio, mettere una chiave nel JavaScript client-side la rende
   leggibile a chiunque apra il DevTools.
3. **Prezzi inaffidabili.** Il prototipo ricava i prezzi chiedendo a un LLM di cercarli sul
   web. È lento (28 ricerche in sequenza), costoso, soggetto a rate limit e **produce errori
   grossolani** — un caso reale ha restituito un prezzo 24 volte superiore al reale.

### 2.1 Architettura raccomandata

```
┌─────────────────────────────────────────────────────────────┐
│  SCHEDULER (cron)                                            │
│  GitHub Actions / Cloudflare Cron / cron dell'hosting        │
│  Esecuzione: ogni giorno feriale alle 22:30 CET              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FETCHER (Node / Python, server-side)                        │
│  • legge portfolio.json (posizioni, quantità, PMC)           │
│  • per ogni ISIN interroga il provider dati                  │
│  • salva prezzo, chiusura precedente, timestamp, fonte       │
│  • append di uno snapshot giornaliero                        │
│  • settimanalmente: snapshot consenso analisti               │
│  LA CHIAVE API VIVE SOLO QUI                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STORE                                                       │
│  SQLite / Postgres / anche solo JSON versionati su disco     │
│  Tabelle: strumenti, movimenti, prezzi, snapshot,            │
│           fondamentali, rating_log, call, chat               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  API interna (REST, poche rotte)                             │
│  GET /api/portafoglio · GET /api/titolo/:isin                │
│  POST /api/refresh · POST /api/analisi/:isin · POST /api/chat│
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (React o anche HTML+JS statico)                    │
│  Legge dati già pronti. Nessuna chiave. Caricamento istantaneo│
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Fallback se l'hosting è solo statico

Se lo spazio hosting non supporta codice server-side:

- Lo scheduler diventa una **GitHub Action** su repo privata (cron gratuito).
- L'output è un `dati.json` committato nel repo e servito via GitHub Pages o copiato
  sull'hosting via FTP dalla action stessa.
- Il frontend statico fa `fetch('dati.json')` — nessuna chiave lato client.
- Le funzioni che richiedono un LLM (analisi per titolo, chat) diventano o pre-generate
  dallo scheduler, oppure girano su una singola funzione serverless gratuita
  (Cloudflare Workers, Vercel Functions) che fa da proxy custodendo la chiave.

**Questa è la domanda aperta da chiarire prima di iniziare:** l'hosting supporta
Node/PHP o è solo statico?

---

## 3. Modello dati

### 3.1 Principio fondante

> **Si registrano i movimenti, non le posizioni.** Le posizioni si derivano.

Il prototipo attuale non lo fa (memorizza posizioni con PMC già calcolato) ed è una
debolezza da correggere. Registrando i movimenti si ottengono gratis: PMC corretto,
realizzato vs non realizzato, e il tracking delle **minusvalenze compensabili** — rilevante
avendo in portafoglio certificati, la cui fiscalità (redditi diversi) consente la
compensazione entro 4 anni.

### 3.2 Tabelle

#### `strumenti` — anagrafica, una riga per ISIN

| Campo | Tipo | Note |
|---|---|---|
| `isin` | TEXT PK | chiave primaria. **Mai usare il nome**: in portafoglio esistono due certificati con denominazione identica su ISIN diversi |
| `nome` | TEXT | denominazione leggibile |
| `simbolo` | TEXT | ticker di negoziazione |
| `mercato` | TEXT | MOT, SeDeX, ETFplus, EuroTLX, NASDAQ, NYSE, XETRA |
| `tipo` | TEXT | Azione, ETF, ETC, ETN, Certificate, Obbligazione |
| `classe` | TEXT | Azione, ETF azionario, ETF obbligazionario, Governativo, Monetario, Turbo, Leva fissa, ETP leva, Strutturato, ETC |
| `macro` | TEXT | **Azioni · Obbligazioni · Monetario · Commodities** — vedi §3.3 |
| `valuta` | TEXT | EUR, USD |
| `sottostante` | TEXT | look-through: il titolo o indice effettivo |
| `sottostante_verificato` | BOOL | true se confermato su fonte ufficiale |
| `emittente` | TEXT | per certificati |
| `cedola` | REAL | solo obbligazioni, % annua |
| `scadenza` | DATE | obbligazioni e certificati |
| `frequenza_cedolare` | INT | 2 per BTP (semestrale), 1 per gli altri |
| `barriera` | REAL | certificati strutturati, % |
| `analizzabile` | BOOL | false se rating analisti non applicabile |
| `motivo_na` | TEXT | perché non è analizzabile — mostrato in tooltip |
| `nota` | TEXT | dettagli da scheda/KID |
| `fonte_scheda` | TEXT | URL della scheda ufficiale |

#### `movimenti` — ogni acquisto/vendita

| Campo | Tipo | Note |
|---|---|---|
| `id` | INT PK | |
| `isin` | TEXT FK | |
| `data` | DATE | data di esecuzione |
| `segno` | TEXT | `acquisto` / `vendita` |
| `quantita` | REAL | nominale per obbligazioni |
| `prezzo` | REAL | in valuta strumento |
| `cambio` | REAL | tasso EUR/valuta alla data — **necessario, non usare il cambio corrente** |
| `commissioni` | REAL | |

#### `prezzi` — serie storica

| Campo | Tipo | Note |
|---|---|---|
| `isin` | TEXT | |
| `data` | DATE | |
| `chiusura` | REAL | |
| `chiusura_precedente` | REAL | serve al P&L giornaliero, vedi §5.2 |
| `valuta` | TEXT | |
| `fonte` | TEXT | provider o URL |
| `raccolto_il` | TIMESTAMP | |

PK composita `(isin, data)`.

#### `snapshot` — foto del portafoglio

| Campo | Tipo |
|---|---|
| `ts` | TIMESTAMP PK |
| `totale_eur` | REAL |
| `righe` | JSON — array di `{isin, prezzo, valore_eur}` |

#### `fondamentali` — consenso analisti e calendario, per ISIN

| Campo | Tipo | Note |
|---|---|---|
| `isin` | TEXT PK | |
| `rating` | TEXT | Strong Buy / Buy / Hold / Sell |
| `buy`, `hold`, `sell` | INT | conteggi per la ciambella |
| `periodo` | TEXT | es. "ultimi 3 mesi" |
| `pt_medio`, `pt_max`, `pt_min` | REAL | numeri puri, senza simboli |
| `upside_medio`, `upside_max`, `upside_min` | REAL | percentuali |
| `valuta` | TEXT | |
| `data_rilevazione` | DATE | |
| `prossimi_utili` | DATE | |
| `attese` | TEXT | EPS e ricavi attesi |
| `guidance` | TEXT | |
| `fonte` | TEXT | |

#### `rating_log` — storico rilevazioni

Append-only, una riga per ogni rilevazione. **Lo storico delle variazioni di rating non è
acquistabile a posteriori** (è dato licenziato FactSet/LSEG/Visible Alpha): si costruisce da
oggi in avanti, una rilevazione alla volta. Cadenza consigliata: settimanale.

Campi: `isin`, `ts`, `rating`, `pt_medio`, `buy`, `hold`, `sell`.

#### `call` — track record dei report ricevuti da terzi

| Campo | Tipo | Note |
|---|---|---|
| `id` | INT PK | |
| `titolo`, `ticker` | TEXT | |
| `direzione` | TEXT | long / short / neutrale |
| `strumento` | TEXT | azione / covered warrant / certificato / altro |
| `target` | TEXT | |
| `orizzonte` | TEXT | |
| `data_report` | DATE | **è il t0, non la data di caricamento** |
| `rating_autore` | TEXT | il giudizio di chi ha scritto il report |
| `benchmark_ticker` | TEXT | indice di settore per il confronto |
| `rendimento` | REAL | del sottostante da t0 |
| `rendimento_strumento` | REAL | dello strumento a leva, se diverso |
| `benchmark` | REAL | dell'indice sullo stesso identico intervallo |
| `file` | TEXT | nome del PDF originale |

#### `chat` — conversazioni per titolo

`isin`, `ts`, `ruolo` (`user`/`assistant`), `testo`.

### 3.3 Classificazione macro — look-through obbligatorio

Requisito esplicito: **lo split del portafoglio è per natura del sottostante, non per tipo
di strumento.** Il certificato come categoria sparisce; conta cosa c'è dentro.

Quattro categorie, nessun'altra:

| macro | Cosa ci finisce |
|---|---|
| **Azioni** | azioni dirette, ETF azionari, certificati e turbo su azioni, certificati su indici azionari, ETP a leva su azioni |
| **Obbligazioni** | governativi diretti, ETF obbligazionari, cat bond |
| **Monetario** | ETF monetari (€STR) |
| **Commodities** | ETC su oro, certificati su future su materie prime |

Effetto sui dati reali: l'esposizione azionaria passa da un apparente **15,9%** (contando
solo azioni ed ETF azionari) a un reale **29,9%**, perché 80.000 € di certificati
strutturati su indici e i turbo su Micron e JD.com sono esposizione azionaria a tutti gli
effetti. E i 92.000 € di monetario escono dal reddito fisso, dove si nascondevano.

Ripartizione attuale: Obbligazioni 54,4% · Azioni 29,9% · Monetario 14,6% · Commodities 1,1%.

---

## 4. Dati reali del portafoglio

Prezzi allineati all'export del 22/08/2026. Cambio EUR/USD di riferimento: **1,1682**.

Cedole e scadenze delle obbligazioni sono **dedotte dalla denominazione dell'export**
(es. «BTP-1AG31 0,6» → 01/08/2031, 0,60%). **Vanno riverificate su scheda ufficiale prima di
usare YTM e duration per decidere.**

### 4.1 Azioni dirette

| ISIN | Nome | Ticker | Mercato | Val | Qtà | PMC | Prezzo |
|---|---|---|---|---|---|---|---|
| US20451W1018 | Compass Pathways | CMPS | NASDAQ | USD | 200 | 10,388223 | 13,53 |
| US8740391003 | Taiwan Semiconductor ADR | TSM | NYSE | USD | 12 | 255,542047 | 418,65 |
| NL0010273215 | ASML Holding | ASML | XETRA | EUR | 4 | 969,9875 | 1505,60 |

### 4.2 ETF azionari

| ISIN | Nome | Ticker | Qtà | PMC | Prezzo | Sottostante |
|---|---|---|---|---|---|---|
| IE00BFMXXD54 | Vanguard S&P 500 Acc | VUAA | 275 | 89,84 | 127,16 | S&P 500 |
| IE00B3XXRP09 | Vanguard S&P 500 Dis | VUSA | 256 | 97,37 | 124,80 | S&P 500 |
| IE00BLDGHT92 | UBS Euro Equity Put Write | UIQ4 | 130 | 151,38 | 161,84 | Euro Stoxx 50 (put write) |

> **Esposizione duplicata da segnalare in UI:** VUAA e VUSA replicano lo stesso indice
> (accumulo e distribuzione). Insieme valgono circa 66.900 €, il 10,6% del portafoglio.
> In allocazione vanno letti come una sola esposizione all'S&P 500.

### 4.3 Certificati a leva e turbo

| ISIN | Nome | Emittente | Qtà | PMC | Prezzo | Sottostante | macro |
|---|---|---|---|---|---|---|---|
| DE000VY3NBZ6 | Vontobel Turbo Long | Vontobel | 1709 | 2,93582 | 3,19 | **Micron Technology (MU)** | Azioni |
| NLBNPIT3MRU4 | BNP Turbo Long | BNP Paribas | 100 | 5,1195 | 5,16 | **JD.com (JD)** | Azioni |
| NLBNPIT37C90 | BNP Turbo Open-End Long | BNP Paribas | 206 | 10,2583 | 8,89 | **JD.com ADR (JD)** | Azioni |
| NLBNPIT3MA79 | BNP Constant Leverage Long 7x | BNP Paribas | 38 | 73,06184 | 62,00 | **Brent Crude Oil (future)** | Commodities |
| XS3388190996 | Leverage Shares 3x Long SK Hynix | Leverage Shares | 254 | 9,86917 | 0,9902 | **SK Hynix (000660.KS)** | Azioni |

Note:
- **NLBNPIT3MRU4**: Turbo Unlimited Long, strike/KO USD 25,7263 — KID BNP, 03.08.2026.
- **XS3388190996**: posizione a **−89,97% dal carico**, valore residuo circa 251 €.
  Contabilmente è una voce residuale, non una posizione.
- **NLBNPIT3MA79**: sottostante materia prima → `analizzabile = false`.

### 4.4 Certificati strutturati (worst-of)

Tutti e quattro verificati su scheda Borsa Italiana / EuroTLX. Insieme valgono circa
**80.300 €, il 12,7% del portafoglio** — quattro volte le azioni singole.

| ISIN | Emittente | Qtà | PMC | Prezzo | Sottostanti | Barriera | Scadenza |
|---|---|---|---|---|---|---|---|
| CH1358858129 | Leonteq | 20 | 1003,8975 | 1003,79 | EURO STOXX 50 / FTSE MIB / NASDAQ 100 / NIKKEI 225 | 60% | 25/07/2028 |
| CH1336232371 | Leonteq | 20 | 981,0775 | 998,47 | Banco BPM / Barclays / Commerzbank | 50% | 10/04/2029 |
| IT0006775073 | Marex | 20 | 1006,0575 | 1012,50 | EURO STOXX 50 / S&P 500 / NIKKEI 225 | 50% | 25/04/2029 |
| DE000UR0A4S0 | UniCredit Bank GmbH | 200 | 100,45975 | 100,20 | S&P 500 / NIKKEI 225 / EURO STOXX 50 | 50% | 17/05/2029 |

Dettagli aggiuntivi:
- **CH1358858129** — Express a capitale condizionatamente protetto.
- **IT0006775073** — Worst-of Memory Phoenix Autocall 36 mesi, cedola **8,00% p.a.**
- **DE000UR0A4S0** — Express / Cash Collect memory, premi trimestrali 1,6% (**6,4% annuo**),
  autocall da febbraio 2027 con trigger decrescente dal 95%.
- **Solo CH1336232371 ha sottostanti azionari singoli** (i tre bancari) e quindi supporta
  rating analisti. Gli altri tre sono su indici → `analizzabile = false`.

### 4.5 Commodity e monetario

| ISIN | Nome | Ticker | Qtà | PMC | Prezzo | macro | Nota |
|---|---|---|---|---|---|---|---|
| IE00B579F325 | Invesco Physical Gold | SGLD | 12 | 413,88916 | 379,40 | Commodities | nessun analista copre un lingotto |
| LU0290358497 | Xtrackers EUR Overnight | XEON | 615 | 144,39596 | 149,9881 | Monetario | rende il tasso overnight, no utili né rating |

### 4.6 ETF obbligazionari

| ISIN | Nome | Ticker | Qtà | PMC | Prezzo |
|---|---|---|---|---|---|
| IE00B3VWN179 | iShares $ Treasury 1-3y | CSBGU3 | 115 | 110,58 | 108,06 |
| LU1287023185 | Amundi Euro Gov 7-10y | EM710 | 598 | 167,50 | 167,71 |
| IE000UWJUW87 | HANetf KRC Cat Bond | CATB | 2750 | 8,8194 | 9,15 |

### 4.7 Obbligazioni governative

Quotano in **percentuale del nominale**: il valore di mercato è `prezzo × (quantità / 100)`.

| ISIN | Emittente | Cedola | Scadenza | Freq | Qtà nom. | PMC | Prezzo |
|---|---|---|---|---|---|---|---|
| IT0005436693 | Italia (BTP) | 0,60% | 01/08/2031 | 2 | 30.000 | 88,06 | 87,36 |
| BE0000351602 | Belgio | 0% | 22/10/2027 | 1 | 7.000 | 95,94 | 96,86 |
| AT0000A2VB47 | Austria | 0% | 20/10/2028 | 1 | 38.000 | 93,80 | 94,03 |
| EU000A283859 | Unione Europea | 0% | 04/10/2030 | 1 | 30.000 | 88,46 | 88,53 |
| DE0001102523 | Germania | 0% | 15/11/2027 | 1 | 27.000 | 94,73 | 96,76 |
| FR0014007L00 | Francia | 0% | 25/05/2032 | 1 | 30.000 | 82,30 | 81,90 |
| XS1503043694 | BEI | 0,25% | 14/09/2029 | 1 | 30.000 | 92,60 | 92,22 |
| XS2388495942 | BEI | 0% | 22/12/2026 | 1 | 33.000 | 96,73242 | 99,45 |

---

## 5. Calcoli — formule esatte

### 5.1 Valore di mercato

```
valore_eur(posizione, prezzo):
    se tipo == "Obbligazione":  return prezzo * (quantita / 100)
    se valuta == "USD":         return (prezzo * quantita) / cambio_eurusd
    altrimenti:                 return prezzo * quantita
```

### 5.2 P&L giornaliero — attenzione, qui il prototipo sbagliava

**Approccio sbagliato (da non replicare):** confrontare il totale con l'ultimo snapshot
precedente alla mezzanotte. Se non si è aggiornato ieri, non esiste base di partenza e il
dato resta vuoto — mentre il broker lo mostra comunque.

**Approccio corretto:** il fetcher recupera, insieme al prezzo, anche la **chiusura
precedente di ogni singolo titolo**. Il P&L giornaliero non dipende più dallo storico locale.

```
pnl_giorno:
    titoli = posizioni con chiusura_precedente disponibile
    oggi  = Σ valore_eur(t, t.prezzo)              per t in titoli
    ieri  = Σ valore_eur(t, t.chiusura_precedente) per t in titoli
    eur = oggi - ieri
    pct = (oggi - ieri) / ieri * 100
```

**Mostrare sempre la copertura**: «su 24/28 titoli con chiusura precedente». Se il dato è
parziale l'utente deve saperlo, non scoprirlo.

### 5.3 P&L complessivo dal carico

```
carico_eur(p):
    se tipo == "Obbligazione":  return pmc * (quantita / 100)
    se valuta == "USD":         return (pmc * quantita) / cambio_al_carico
    altrimenti:                 return pmc * quantita

pnl_totale_eur = Σ valore_eur - Σ carico_eur
pnl_totale_pct = pnl_totale_eur / Σ carico_eur * 100
```

> **Nota sul cambio.** Il prototipo usa il cambio corrente anche per il carico, il che
> introduce un errore sulle posizioni USD. Con la tabella `movimenti` e il campo `cambio`
> alla data il calcolo diventa corretto. Riferimento di verifica: il broker riporta
> **+25.077,38 € (+4,13%)** su un carico di circa 607.364 €.

### 5.4 YTM — bisezione

Prezzo tel quel su 100 di nominale. Il BTP paga cedola **semestrale** (freq 2), gli altri
titoli in portafoglio annuale (freq 1).

```
ytm(prezzo, cedola, anni_residui, freq):
    n = max(1, round(anni_residui * freq))
    c = cedola / freq
    pv(y) = Σ[i=1..n] c/(1+y/freq)^i  +  100/(1+y/freq)^n
    bisezione su y in [-0.5, 1.0], 200 iterazioni
    return y * 100
```

### 5.5 Duration modificata

```
duration_modificata(prezzo, cedola, anni, freq):
    y = ytm(...) / 100 / freq
    n = max(1, round(anni * freq)); c = cedola / freq
    per i in 1..n:
        cf = (i == n) ? c + 100 : c
        pv = cf / (1+y)^i
        pv_totale += pv
        ponderato += (i/freq) * pv
    macaulay = ponderato / pv_totale
    return macaulay / (1 + y)
```

Sensibilità da mostrare: `+100 bp ≈ −duration_media × valore_obbligazionario / 100`.

### 5.6 Attribuzione — chi ha mosso il totale

Per ogni posizione, rispetto allo snapshot precedente:

```
delta_eur = valore_attuale - valore_precedente
delta_pct = delta_eur / valore_precedente * 100
```

Visualizzazione: barra orizzontale unica, un segmento per titolo, **larghezza proporzionale
al peso** in portafoglio e **intensità del colore proporzionale al contributo** al movimento
(normalizzata sul massimo assoluto). Verde sopra zero, rosso sotto. Hover mostra nome, peso,
delta % e delta €.

### 5.7 Validazione prezzi — obbligatoria

Un prezzo in arrivo che si scosta oltre il **60%** dall'ultimo prezzo noto va messo in
**quarantena**, non applicato. La UI lo mostra come `vecchio → nuovo`, con variazione %,
fonte, e due pulsanti: **Applica** / **Scarta**.

Motivazione: durante lo sviluppo la ricerca web ha restituito per l'ETP SK Hynix un prezzo
circa 24 volte superiore al reale (probabilmente pre-consolidamento o strumento omonimo),
producendo un falso +2.395% e falsando il totale di portafoglio.

**Con un provider dati serio la soglia va confrontata con l'ultimo prezzo scaricato, non con
quello dell'ultimo export**, altrimenti un movimento legittimo su un titolo volatile viene
bloccato come anomalia.

---

## 6. Fonti dati

### 6.1 Provider di quotazioni — da scegliere

Requisito: piano gratuito, copertura mercati europei (MOT, SeDeX, EuroTLX, ETFplus) oltre a
US. La copertura dei **certificati italiani è il punto critico**: quasi nessun provider
retail li espone.

| Provider | Free tier | Copertura | Note |
|---|---|---|---|
| Twelve Data | ~800 richieste/giorno | buona su azioni/ETF, debole su certificati | candidato principale |
| Alpha Vantage | 25 richieste/giorno | US forte, EU parziale | troppo stretto per 28 titoli/giorno |
| Financial Modeling Prep | limitato | US forte | |
| Stooq | senza chiave, CSV | storico daily, copertura EU discreta | utile come fallback |
| Borsa Italiana (scraping schede) | — | **unica fonte per SeDeX/EuroTLX** | verificare ToS |

**Strategia consigliata:** provider API per azioni, ETF, ETC e obbligazioni governative;
scraping della scheda Borsa Italiana per i certificati, che rappresentano 8 posizioni su 28.

### 6.2 Fonti per fondamentali e consenso

In ordine di autorevolezza:

- **Date trimestrali**: calendario Investor Relations della società. Mai da aggregatori.
- **Bilanci e numeri**: SEC EDGAR per emittenti US, comunicati regolamentati per gli europei.
- **Consenso analisti**: Google Finance, MarketScreener, StockAnalysis, Nasdaq.
- **Operazioni insider**: **SEC EDGAR Form 4** — è l'unica parte del quadro interamente
  verificabile a costo zero. Riportare sempre il link al filing.
- **News**: Reuters, FT, Il Sole 24 Ore, comunicati regolamentati (SDIR eMarket, RNS).
- **Certificati**: KID dell'emittente, scheda Borsa Italiana SeDeX/EuroTLX, ACEPI.

### 6.3 Lezione operativa sulla ricerca degli ISIN

Durante lo sviluppo, la risoluzione dei sottostanti dei certificati ha funzionato solo dopo
aver capito **quale sequenza funziona**. Va codificata, non lasciata all'improvvisazione:

1. Interrogare con l'ISIN **in forma di domanda** («`<ISIN>` qual è il sottostante?»),
   non come parola chiave isolata. Cambia radicalmente i risultati.
2. Se non basta, cercare il **nome dello strumento** invece dell'ISIN e aprire la
   **scheda Borsa Italiana**, che espone il campo «Sottostante» in chiaro.
3. Non fermarsi al primo ostacolo. Alcune fonti (es. Websim) bloccano l'accesso automatico
   via robots.txt pur essendo indicizzate da Google; in quel caso si cambia strada, non si
   conclude che il dato non esista.
4. **Non imporre al modello vincoli del tipo «solo fonti ufficiali, non dedurre»**: rende la
   ricerca sterile e produce risposte «non trovato» su ISIN in realtà documentati.

Prevedere sempre un **campo di inserimento manuale** del sottostante come fallback: più
veloce di qualsiasi tentativo automatico quando il dato è già sotto gli occhi dell'utente.

---

## 7. Interfaccia

Tre tab. **Nessuna suddivisione per tipo di strumento**: requisito esplicito, la
differenziazione per asset class come struttura di navigazione è stata respinta.

### 7.1 Tab «Portafoglio»

**Blocco hero:**
- Valore di mercato totale, cifra grande
- **P&L complessivo** (€ e %), con sotto il carico totale
- **P&L di oggi** (€ e %), con sotto la copertura `n/28`
- Variazione dall'ultimo refresh
- Pulsanti: `Aggiorna prezzi` · `Aggiorna rating`
- Grafico a linea dell'andamento tra snapshot
- Barra di allocazione unica a quattro segmenti con legenda: Obbligazioni · Azioni ·
  Monetario · Commodities

**Quarantena prezzi** (solo se presente): card con bordo di allerta, elenco anomalie,
Applica/Scarta per riga.

**Filtri:** Tutti · Azioni · Obbligazioni · Monetario · Commodities (per macro, non per
strumento).

**Elenco posizioni** — una card per titolo:
- Nome (cliccabile → tab Titolo), tag macro colorato, tipo strumento in piccolo, ISIN
- Sottostante in evidenza; se assente, pulsante `Trova sottostante` **più campo di input
  manuale** affiancato
- Sparkline dell'andamento prezzo tra snapshot
- Valore €, peso %, chip variazione dal carico, chip variazione dal refresh
- Riga dati: Rating · PT medio · Upside · Prossimi utili · YTM · Duration
- Dove il dato non si applica: **`n.a.` con tooltip che spiega il motivo**, non una cella
  vuota. Distinguere sempre «non esiste» (`n.a.`) da «non ancora recuperato» (`—`).

### 7.2 Tab «Titolo»

- Selettore titolo
- Intestazione: nome, tag macro, mercato, valuta, sottostante, nota da scheda
- Pulsanti: `Rating e utili` · `Analisi completa`
  - `Rating e utili` **disabilitato** se `analizzabile = false` o sottostante ignoto, con
    il motivo scritto sotto, non solo in tooltip
- Grafico prezzo tra snapshot
- **Rating analisti in stile Google Finance** (richiesta esplicita):
  - **ciambella** Buy/Hold/Sell con conteggio totale analisti al centro ed etichetta
    sintetica sotto («Acquisto forte», «Acquisto», «Mantieni», «Vendita»)
  - **tre barre orizzontali** Massimo / Medio / Minimo, ciascuna con prezzo target e
    percentuale di upside, larghezza proporzionale al target
  - riga con data di rilevazione e fonte
- **Storico rilevazioni** rating, in ordine cronologico inverso
- Trimestrale e attese
- **Analisi completa**, persistente: resta salvata finché non viene rigenerata, con data e
  ora di salvataggio visibili e pulsante `Rigenera`
- **Chat sul titolo**: campo testo per approfondire, con contesto della posizione
  precaricato (sottostante, quantità, carico, prezzo, consenso, sintesi analisi).
  Conversazioni salvate per ISIN. Risposte brevi, senza ricerca web, per contenere il costo.

**Tutto avviene dentro il tab.** Nessun salto automatico verso altri tab: requisito
esplicito dopo che il prototipo lo faceva.

### 7.3 Tab «Analisi»

- Campo ISIN libero + `Analizza`
- Report strutturato (vedi §8)
- **Track record delle call ricevute** (vedi §9)

### 7.4 Linguaggio visivo

Il primo tentativo è stato giudicato «cheap, solo testo». La versione accettata usa:

| Token | Valore |
|---|---|
| Sfondo | `#F5F6F9` |
| Superficie | `#FFFFFF`, raggio 14, ombra `0 1px 2px rgba(11,15,23,.05), 0 6px 20px -8px rgba(11,15,23,.10)` |
| Testo primario | `#0B0F17` |
| Testo secondario | `#69738A` — attenuato `#98A1B3` |
| Bordi | `#E4E8EF` |
| Positivo | `#00A06B` su `#E4F6EF` |
| Negativo | `#E0393E` su `#FDEBEB` |
| Accento | `#2F4BFF` su `#EDF0FF` |
| Allerta | `#B37400` su `#FFF6E3` |

Font: **Manrope** per l'interfaccia, **JetBrains Mono** per tutte le cifre, con
`font-variant-numeric: tabular-nums` — le colonne numeriche devono allinearsi.

Principi: card invece di tabelle a scorrimento orizzontale (l'uso primario è da telefono);
chip colorati per le variazioni; sparkline in riga; etichette in maiuscoletto spaziato.

---

## 8. Analisi per ISIN — struttura del report

Formato modellato su un report di riferimento fornito dall'utente. Struttura da mantenere,
**con tre correzioni rispetto all'originale**:

1. **Ogni numero deve portare fonte e data.** Il report di riferimento non ne aveva nessuna,
   e questo lo rende non verificabile né aggiornabile.
2. **Il price target va scomposto**: media, mediana, minimo, massimo, numero di analisti,
   data di rilevazione. Un intervallo «230–259 $» spacciato per media è un errore. **La
   dispersione dice più della media.**
3. **Nessun verdetto proprio.** Il report di riferimento chiudeva con «OVERWEIGHT / BULLISH»,
   che è il giudizio di chi lo ha scritto. Qui si riporta il **consenso degli analisti** con
   la sua distribuzione, etichettato come tale.

### 8.1 Sezioni

| Sezione | Contenuto |
|---|---|
| Intestazione | nome, ISIN, ticker, mercato |
| Sintesi | 3-4 frasi |
| Ultimo trimestre | tabella voce / valore / nota, ogni riga con fonte |
| Consenso analisti | rating, n. analisti, PT medio/mediano/min/max, distribuzione |
| Operazioni insider | data, persona, ruolo, tipo, importo — da SEC Form 4, con link |
| Prossima trimestrale | data e attese di consenso |
| Driver | elenco puntato |
| Rischi | elenco puntato |
| **Lacune** | ciò che non è stato verificato. **Non stimare mai un dato mancante** |
| Fonti | elenco con URL |

### 8.2 Comportamento su strumenti derivati

- Su certificati ed ETP, **l'analisi va sul sottostante**, non sul wrapper.
- Se il sottostante non è noto, **risolverlo automaticamente prima di analizzare**, senza
  chiedere all'utente di farlo a mano.
- Se resta irrisolvibile, **analizzare comunque il certificato** per quello che è: tipologia,
  barriera, scadenza, meccanismo cedolare, quanto risulta dalla scheda. **Non fallire.**

---

## 9. Track record delle call ricevute

L'utente riceve periodicamente report di analisi da un contatto esterno. Vuole due cose
distinte: **replicare quel metodo** sui propri ISIN, e **verificarne i risultati**.

Funzionamento: caricamento del PDF → estrazione automatica di titolo, ticker, direzione,
strumento, target, orizzonte, `data_report`, rating dell'autore, benchmark suggerito.

### 9.1 Quattro insidie metodologiche — vanno gestite, non ignorate

1. **Serve un benchmark, altrimenti si misura il mercato, non l'analista.** Sei call long su
   semiconduttori AI in un anno di corsa danno l'85% di successo anche se scelte a caso.
   Ogni call va confrontata con l'indice di settore **sullo stesso identico intervallo**.
   La metrica principale è l'**extra-rendimento**, non il segno.
2. **Il campione è auto-selezionato.** Se si caricano solo i report che hanno incuriosito, si
   misura il proprio filtro. La UI deve dirlo esplicitamente e invitare a registrare **tutte**
   le call ricevute, anche quelle non seguite.
3. **Sottostante e strumento sono due call diverse.** Si può aver ragione sul titolo e
   perdere sul covered warrant per decadimento temporale e strike. Tracciare **entrambi**
   separatamente.
4. **t0 = data del report**, mai la data di caricamento. Altrimenti si regala o si toglie
   all'analista il movimento intercorso.

Definizione di successo adottata come default: **sovraperformance rispetto al benchmark**.
Le altre due (target raggiunto entro l'orizzonte; rendimento positivo) restano visibili come
metriche di controllo.

---

## 10. Comportamenti richiesti — riepilogo operativo

- [ ] L'xls serve **solo** per posizioni, quantità e PMC. **I prezzi non entrano mai da lì**:
      si ricavano in rete. Il re-import serve a riallineare dopo acquisti o vendite.
- [ ] Ogni refresh salva prezzo, **chiusura precedente**, fonte e timestamp.
- [ ] Prezzi anomali in quarantena, mai applicati in automatico.
- [ ] Split del portafoglio per **natura del sottostante**, quattro categorie.
- [ ] `n.a.` con motivo dove il dato non esiste; `—` dove non è ancora stato recuperato.
- [ ] Rating e utili disabilitati su governativi, monetario, ETF obbligazionari, oro,
      certificati su indici e su commodity.
- [ ] Analisi persistente con data di salvataggio e pulsante rigenera.
- [ ] Nessuna navigazione automatica tra tab.
- [ ] Chiave API **mai** nel codice client-side.
- [ ] Chiave sull'ISIN, **mai sul nome** dello strumento.

---

## 11. Difetti noti del prototipo — da non ereditare

| Problema | Causa | Correzione |
|---|---|---|
| Errore `The string did not match the expected pattern` | eccezione DOM nativa non tracciata, comparsa su lettura PDF e su analisi | strumentare ogni fase (preparazione, rete, parsing, estrazione) con etichette proprie; sostituire `FileReader.readAsDataURL` con `arrayBuffer()` |
| HTTP 429 | chiamate sequenziali troppo ravvicinate | retry con backoff esponenziale e spaziatura fra chiamate; con backend il problema sparisce |
| HTTP 529 / 5xx | servizio LLM temporaneamente sovraccarico, trattato come errore fatale | includere `429, 500, 502, 503, 504, 529` fra gli stati **ritentabili**, con backoff esponenziale e messaggio che chiarisce che il problema è del servizio, non della richiesta. **In più: spezzare le chiamate pesanti.** Una richiesta da 7000 token con ricerca web è la prima a essere respinta sotto carico; due chiamate da 3000 e 2500 passano dove una grande fallisce, e se la seconda cade resta comunque la prima |
| JSON troncato a metà | schema di risposta troppo ampio per il budget di token | schemi più piccoli e chiamate separate; distinguere «troncato» da «malformato» nel messaggio d'errore |
| Prezzo errato di 24× | nessuna validazione sui dati in arrivo | soglia di quarantena al 60% |
| Sottostanti non trovati | prompt che imponevano solo fonti ufficiali e vietavano deduzioni | domanda diretta, sequenza di fallback documentata in §6.3, campo manuale |
| P&L giornaliero vuoto | dipendeva da uno snapshot del giorno precedente | usare la chiusura precedente per titolo |
| Carico su posizioni USD approssimato | usa il cambio corrente | tabella movimenti con cambio alla data |
| Nessuna esecuzione in background | limite invalicabile dell'artifact | scheduler server-side |

---

## 12. Ordine di lavoro suggerito

1. **Verificare se l'hosting supporta codice server-side.** Determina l'intera architettura.
2. Scegliere e testare il provider dati sui 28 ISIN reali — **partire dai certificati**, che
   sono il caso peggiore. Se non si coprono, decidere subito la strategia (scraping schede
   Borsa Italiana oppure prezzo manuale per quelle 8 posizioni).
3. Costruire schema dati e caricare l'anagrafica di §4, già completa e verificata.
4. Fetcher + scheduler. Verificare **un giro completo pulito su tutte e 28 le posizioni**:
   è il test che nel prototipo non è mai riuscito, ed è il cuore del progetto.
5. Frontend: prima il tab Portafoglio, che copre da solo il gesto quotidiano.
6. Poi tab Titolo, rating, analisi.
7. Per ultimo il track record delle call.

---

## 13. Da chiarire prima di iniziare

- L'hosting supporta Node, PHP o solo file statici?
- Sono recuperabili le **date e i prezzi dei singoli acquisti**? Servono per il calcolo
  corretto del carico su posizioni in valuta e per il tracking delle minusvalenze. Senza,
  si parte comunque dal PMC accettando l'approssimazione sul cambio.
- L'ETP SK Hynix a −90% resta in portafoglio o va chiuso? Al momento è una voce residuale
  che sporca l'attribuzione senza aggiungere informazione.
- Frequenza desiderata per lo snapshot del consenso analisti: settimanale è un buon default,
  ma determina il ritmo con cui si popola lo storico dei rating.
