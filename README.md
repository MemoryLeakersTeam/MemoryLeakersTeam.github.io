# Sito MemoryLeakers

Sito statico (HTML, CSS, JavaScript, nessuna dipendenza da installare) del gruppo MemoryLeakers.

## Provarlo in locale

```bash
python3 tools/serve.py
```

poi aprire <http://localhost:8000>. Lo script serve le pagine con gli stessi indirizzi puliti di GitHub Pages (`/glossario` invece di `/glossario.html`). Serve un server: aprendo i file direttamente il browser non carica tutto correttamente.

## Cosa modificare

| Cosa | Dove |
|---|---|
| Documenti del repository [Documenti](https://github.com/MemoryLeakersTeam/Documenti) | **nulla**: si pubblicano da soli (vedi «Pubblicazione automatica dei documenti») |
| Altri documenti, glossario, componenti, contatti | pannello admin (`/admin`) oppure a mano `data/site-data.js`; i PDF stanno in `pdf/<tappa>/<categoria>/` |
| Componenti del gruppo | `chi-siamo.html` |
| Contatti | `contatti.html` |

## Pannello admin (documenti, glossario, componenti, contatti)

Aprire `/admin` (link «Area riservata» nel footer). Serve un token personale di GitHub con permesso **Contents: Read and write** solo su questo repository (guida nella pagina stessa). Il pannello salva i cambiamenti con un commit sul ramo `main`: GitHub Pages pubblica dal ramo e il sito si aggiorna in 1–2 minuti.

- I documenti del repository Documenti compaiono da soli con l'etichetta «da Documenti». Si possono rinominare e mettere in evidenza: la sincronizzazione non sovrascrive queste scelte. Se se ne elimina uno, finisce in «Esclusi dalla pubblicazione automatica» e non viene ripubblicato finché non lo si ripristina.
- **Gli altri PDF si inseriscono a mano**: si copiano nella cartella `pdf/` del repository (per esempio `pdf/rtb/documenti-esterni/nome.pdf`, con `git` o dal sito di GitHub) e poi, dal pannello, si sceglie il file dall'elenco e lo si collega a una tappa e a una categoria. Il pannello non carica file.
- In alternativa si può indicare un link esterno.
- Il token resta nel browser di chi lo inserisce e viene inviato solo a `api.github.com`. Non condividerlo e usa una scadenza breve.
- Le tappe non hanno numeri e compaiono nell'ordine scelto dal pannello (di default RTB, PoC, PB, Candidatura): nella scheda **Documenti**, sezione «Sezioni visibili sul sito», le frecce ↑↓ cambiano l'ordine. Sempre da lì si sceglie quali tappe mostrare: all'inizio è visibile solo la Candidatura; RTB, PoC e PB si attivano con l'avanzare delle attività (le tappe nascoste spariscono anche dal menu, i loro documenti restano salvati).
- Nella scheda **Documenti** un documento si può **mettere in evidenza**: resta nella sua categoria ma compare per primo lì dentro con l'etichetta «In evidenza», e la categoria sale in cima alla tappa (casella nel modulo, oppure pulsante «In evidenza» nell'elenco).
- Ogni termine del glossario ha un link diretto, per esempio `…/glossario#capitolato`: l'identificativo nasce dal termine (o lo si fissa nel pannello) e il pulsante «Copia link» lo copia.
- Tutti i dati stanno in `data/site-data.js`: il pannello lo riscrive, ma si può anche modificare a mano (formato JSON).

## Pubblicazione automatica dei documenti

Il repository [Documenti](https://github.com/MemoryLeakersTeam/Documenti) compila i suoi `.typ` a ogni push su `main` e pubblica qui i PDF con `tools/sync_documenti.py`, che aggiorna `pdf/` e `data/site-data.js` e committa su `main` (job `pubblica` del workflow `compila-pdf.yml` di Documenti).

- Si pubblicano solo i documenti con stato «Approvato»; i verbali esterni solo quando c'è la versione firmata (`*-signed.pdf`).
- Un PDF già pubblicato viene sostituito solo quando cambia la `versione` del documento; i verbali firmati non vengono mai sostituiti né rimossi.
- Un documento senza metadati o con dati non validi (cartella o tappa sconosciuta, data mancante) viene saltato con un avviso nella pagina del workflow: non si pubblica e, se era già online, resta com'è. Gli altri documenti si pubblicano lo stesso.
- Un documento spostato in un'altra cartella o tappa sposta la sua voce sul sito, senza duplicarla.
- Percorsi e nomi: `Candidatura/Verbali_interni/2026-10-13.typ` → `pdf/candidatura/verbali_interni/2026-10-13.pdf`, «Verbale interno 13/10/2026». Le categorie: `Verbali_interni` → Verbali interni, `Verbali_esterni` → Verbali esterni, `Generali` → Generale, `Diario_di_bordo` → Diapositive.
- Le voci pubblicate così hanno i campi `sorgente` e `versione`; le voci senza `sorgente` (inserite a mano) non vengono mai toccate.

Per provarlo in locale con i PDF compilati da Documenti (`bash Scripts/compila.sh` crea `pdf/` lì):

```bash
python3 tools/sync_documenti.py ../Documenti/pdf --dry-run   # mostra cosa cambierebbe
```

## Controlli

```bash
python3 tools/check_links.py             # link interni, ancore e PDF indicati nei dati
python3 tools/check_links.py --external  # controlla anche i link esterni
```

Lo stesso controllo (senza `--external`) gira alla fine di ogni sincronizzazione con Documenti.

## Struttura

- `index.html`, `glossario.html`, `chi-siamo.html`, `contatti.html`, `404.html`, `admin.html`: pagine (online hanno indirizzi puliti: `/`, `/glossario`, `/chi-siamo`, `/contatti`, `/admin`)
- `pdf/`: i PDF pubblicati
- `css/`, `js/`: stile e script (`js/head.js` disegna la testa a rete neurale)
- `fonts/`: Inter e Fraunces, ospitati da noi (licenza OFL, vedi i file `OFL-*.txt`)
- `img/`: logo, icone e immagine di anteprima social
- `assets/`, `tools/`, `logo/`: materiale di lavoro, **non** pubblicato

## Rigenerare la testa 3D

```bash
python3 tools/build_head_graph.py 900   # numero di neuroni
```

Richiede `numpy` e `scipy`. Legge `assets/LeePerrySmith.glb` e scrive `js/head-data.js`.

## Crediti

- Modello 3D della testa: [Lee Perry-Smith](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/LeePerrySmith) (Infinite Realities), licenza [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). La citazione è nel footer del sito e va mantenuta.
- Font: Inter e Fraunces, licenza SIL OFL 1.1.
