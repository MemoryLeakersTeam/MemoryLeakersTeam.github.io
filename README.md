# Sito MemoryLeakers

Sito statico (HTML, CSS, JavaScript, nessuna dipendenza da installare) del gruppo MemoryLeakers.

## Provarlo in locale

```bash
python3 -m http.server 8000
```

poi aprire <http://localhost:8000>. Serve un server: aprendo i file direttamente il browser non carica tutto correttamente.

## Cosa modificare

| Cosa | Dove |
|---|---|
| Documenti, verbali, diapositive, glossario, componenti, contatti | pannello admin (`/admin.html`) oppure a mano `data/site-data.js`; i PDF stanno in `pdf/<tappa>/<categoria>/` |
| Componenti del gruppo | `chi-siamo.html` |
| Contatti | `contatti.html` |

## Pannello admin (documenti, glossario, componenti, contatti)

Aprire `admin.html` (link «Area riservata» nel footer). Serve un token personale di GitHub con permesso **Contents: Read and write** solo su questo repository (guida nella pagina stessa). Il pannello salva i cambiamenti con un commit sul ramo `main`: il workflow `pages.yml` parte da solo e il sito si aggiorna in 1–2 minuti.

- **I PDF si inseriscono a mano**: si copiano nella cartella `pdf/` del repository (per esempio `pdf/rtb/documenti-esterni/nome.pdf`, con `git` o dal sito di GitHub) e poi, dal pannello, si sceglie il file dall'elenco e lo si collega a una tappa e a una categoria. Il pannello non carica file.
- In alternativa si può indicare un link esterno.
- Il token resta nel browser di chi lo inserisce e viene inviato solo a `api.github.com`. Non condividerlo e usa una scadenza breve.
- Dalla scheda **Documenti** si sceglie quali tappe mostrare: all'inizio è visibile solo la Candidatura; RTB, PoC e PB si attivano con l'avanzare delle attività (le tappe nascoste spariscono anche dal menu, i loro documenti restano salvati).
- Ogni termine del glossario ha un link diretto, per esempio `…/glossario#capitolato`: l'identificativo nasce dal termine (o lo si fissa nel pannello) e il pulsante «Copia link» lo copia.
- Tutti i dati stanno in `data/site-data.js`: il pannello lo riscrive, ma si può anche modificare a mano (formato JSON).

## Controlli

```bash
python3 tools/check_links.py             # link interni, ancore e PDF indicati nei dati
python3 tools/check_links.py --external  # controlla anche i link esterni
```

Lo stesso controllo (senza `--external`) gira nel workflow `.github/workflows/pages.yml` prima di ogni pubblicazione.

## Struttura

- `index.html`, `glossario.html`, `chi-siamo.html`, `contatti.html`, `404.html`, `admin.html`: pagine
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
