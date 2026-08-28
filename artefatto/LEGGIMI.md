# Portafoglio del Mattino — versione artefatto

Sorgente della dashboard pubblicata come artefatto su claude.ai. Un unico file:
nessuna libreria esterna, nessuna rete, nessuna chiave. Le formule sono la porta
esatta di `lib/calc.ts` (SPEC §5) e i totali coincidono alla quarta cifra
decimale, verificato eseguendo i due motori sugli stessi prezzi.

## Cosa contiene

Dati incorporati al momento della creazione: 28 strumenti, 28 movimenti, i
prezzi scaricati da Borsa Italiana e stockanalysis.com, il cambio EUR/USD dalla
BCE. Da lì la pagina calcola valore, P&L di giornata sulla chiusura precedente,
P&L dal carico, attribuzione, composizione, YTM e duration.

## Cosa NON può fare, e perché

Un artefatto non ha accesso alla rete: la Content Security Policy della pagina
pubblicata blocca ogni `fetch` verso l'esterno. Quindi non può aggiornare i
prezzi da solo. Le due strade:

- correggere un prezzo a mano dalla riga del titolo (resta nel browser, con la
  quarantena al 60% della spec §5.7 a fare da rete di sicurezza);
- chiedere a Claude in chat di ripubblicare l'artefatto con i prezzi freschi,
  rigenerando il blocco dati con `scripts/` di questo repo.

## Rigenerare il blocco dati

Il file ha i dati inseriti al posto del segnaposto `/*__DATI__*/null`. Per
aggiornarli si riesegue la raccolta prezzi e si sostituisce quel blocco.
