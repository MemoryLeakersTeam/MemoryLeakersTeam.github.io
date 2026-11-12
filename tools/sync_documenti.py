#!/usr/bin/env python3
"""Pubblica sul sito i PDF compilati dal repository Documenti.
Uso:  python3 tools/sync_documenti.py <cartella-artifact> [--sito DIR] [--dry-run]
La cartella è l'artifact «pdf» di Documenti: contiene i PDF e elenco.json (generato da Scripts/compila.sh).

Regole:
- si pubblicano solo i documenti «Approvato»; i verbali esterni solo se c'è il PDF firmato (*-signed.pdf);
- un documento già pubblicato che torna in revisione (stato diverso da «Approvato», per esempio «Verificato»
  dopo una modifica) resta pubblicato con nome, data, versione e PDF dell'ultima versione approvata, senza avvisi;
  si sostituisce quando torna «Approvato» con una nuova versione e si rimuove solo se il suo sorgente
  sparisce da Documenti. Se nel frattempo è stato spostato in un'altra cartella o tappa, la vecchia voce si rimuove;
- una voce già pubblicata non si tocca finché non cambia la sua «versione»: ricompilare non basta;
- i verbali firmati non vengono mai sostituiti né rimossi in automatico (solo un avviso);
- un documento senza metadati o con dati non validi viene saltato con un avviso: non si pubblica
  e, se era già pubblicato, non si rimuove (lo stato non si conosce);
- un documento spostato in un'altra cartella o tappa sposta la sua voce, senza duplicarla;
- le voci senza «sorgente» (inserite a mano) non vengono mai toccate; se il file è lo stesso di Documenti
  vengono «adottate»: si aggiungono «sorgente» e «versione», il resto resta com'è;
- le voci eliminate dal pannello finiscono in «esclusi»: non vengono ricreate e il loro PDF viene tolto;
- un nome cambiato dal pannello («nomeManuale») non viene sovrascritto.
Esce con codice 1 se il controllo dei link fallisce."""
import argparse, filecmp, json, os, re, shutil, subprocess, sys
from pathlib import Path

HEADER = "/* File gestito dal pannello admin (admin.html): puoi anche modificarlo a mano, ma rispetta il formato JSON. */\n"
# cartella in Documenti → categoria sul sito
CATEGORIE = {
    "Verbali_interni": "Verbali interni",
    "Verbali_esterni": "Verbali esterni",
    "Generali": "Generale",
    "Diario_di_bordo": "Diapositive",
}
TITOLI = {"aggiunti": "Aggiunti", "aggiornati": "Aggiornati", "spostati": "Spostati", "adottati": "Adottati (invariati)",
          "ricopiati": "PDF mancanti ricopiati", "rimossi": "Rimossi", "puliti": "PDF esclusi tolti dal sito",
          "mantenuti": "Mantenuti all'ultima versione approvata", "avvisi": "Avvisi"}

def leggi_dati(path):
    return json.loads(re.search(r"window\.SITE_DATA\s*=\s*(\{.*\})\s*;?\s*$", path.read_text(), re.S).group(1))

def scrivi_dati(path, data):   # stesso formato di serialize() in js/admin.js
    path.write_text(HEADER + "window.SITE_DATA = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n")

def gg_mm_aaaa(data):
    a, m, g = data.split("-"); return f"{g}/{m}/{a}"

def nome_sito(v):
    """Nome della voce secondo la convenzione del sito."""
    c = v["cartella"]
    if c == "Verbali_interni": return f"Verbale interno {gg_mm_aaaa(v['data'])}"
    if c == "Verbali_esterni": return f"Verbale esterno {gg_mm_aaaa(v['data'])} {v['azienda']} firmato"
    if c == "Diario_di_bordo": return f"Diario di bordo {gg_mm_aaaa(v['data'])}"
    return v.get("titolo") or v["nome"]

def pdf_e_url(v):
    """PDF da pubblicare (quello firmato, se c'è) e il suo indirizzo sul sito."""
    pdf = v.get("firmato") or v["percorso"]
    return pdf, f"pdf/{v['tappa'].lower()}/{v['cartella'].lower()}/{Path(pdf).name}"

def problema(v, tappe, artifact):
    if v["tappa"].lower() not in tappe: return f"tappa sconosciuta «{v['tappa']}» (id attesi: {', '.join(sorted(tappe))})"
    if v["cartella"] not in CATEGORIE: return f"cartella senza categoria sul sito «{v['cartella']}»"
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v.get("data") or ""): return "data mancante o non valida (attesa AAAA-MM-GG)"
    if v["cartella"] == "Verbali_esterni" and not v.get("azienda"): return "manca «azienda» nel verbale esterno"
    if not (artifact / pdf_e_url(v)[0]).is_file(): return "PDF assente nell'artifact"
    return None

def documenti_da_pubblicare(elenco, tappe, artifact):
    """Dall'elenco di Documenti ai documenti da pubblicare.
    Restituisce (documenti, sospesi, in_lavorazione, avvisi). Le voci già pubblicate di queste sorgenti non vanno rimosse:
    - «sospesi»: sorgenti il cui stato non si conosce (niente metadati o dati non validi);
    - «in_lavorazione»: sorgente → (stato, versione) dei documenti non «Approvato», per esempio in revisione."""
    docs, sospesi, in_lavorazione, avvisi = [], set(), {}, []
    for v in elenco:
        sorgente = v.get("sorgente") or v["percorso"]
        if "stato" not in v:
            sospesi.add(sorgente); avvisi.append(f"{v['percorso']}: nessun metadato <documento>, saltato"); continue
        if v["stato"] != "Approvato":
            in_lavorazione[sorgente] = (v["stato"], v.get("versione") or "?"); continue
        firmato = bool(v.get("firmato"))
        if v["cartella"] == "Verbali_esterni" and not firmato: continue   # i verbali esterni si pubblicano solo firmati
        p = problema(v, tappe, artifact)
        if p: sospesi.add(sorgente); avvisi.append(f"{v['percorso']}: {p}, saltato"); continue
        pdf, url = pdf_e_url(v)
        docs.append({"pdf": pdf, "url": url, "tappa": v["tappa"].lower(), "firmato": firmato,
                     "voce": {"cat": CATEGORIE[v["cartella"]], "name": nome_sito(v), "date": v["data"],
                              "sorgente": sorgente, "versione": v.get("versione") or ""}})
    return docs, sospesi, in_lavorazione, avvisi

def sincronizza(artifact, sito, dry_run=False):
    """Allinea data/site-data.js e pdf/ all'artifact. Restituisce il rapporto delle modifiche."""
    artifact, sito = Path(artifact), Path(sito)
    dati_path = sito / "data" / "site-data.js"
    data = leggi_dati(dati_path)
    tappe = {b["id"]: b for b in data["baselines"] if b.get("id")}
    elenco = json.loads((artifact / "elenco.json").read_text())
    docs, sospesi, in_lavorazione, avvisi = documenti_da_pubblicare(elenco, tappe, artifact)

    r = {k: [] for k in TITOLI}; r["avvisi"] = avvisi
    copie, cancellazioni, modificato = [], [], False
    uguale = lambda d: (sito / d["url"]).is_file() and filecmp.cmp(artifact / d["pdf"], sito / d["url"], shallow=False)
    voci = [(b, it) for b in data["baselines"] for it in b["items"]]
    per_url = {it["url"]: it for _, it in voci}
    pubblicati = {d["url"] for d in docs}
    # voci automatiche che non corrispondono più a nessun documento: rimosse, oppure spostate.
    # Non lo sono quelle di un documento sospeso o in revisione: restano come sono
    orfane = [(b, it) for b, it in voci if "sorgente" in it and it["url"] not in pubblicati
              and it["sorgente"] not in sospesi and it["sorgente"] not in in_lavorazione]

    # esclusi: si dimenticano quelli che Documenti non ha più, e i loro PDF (non visibili sul sito) si tolgono
    if "esclusi" in data:
        noti = {pdf_e_url(v)[1] for v in elenco}
        if any(u not in noti for u in data["esclusi"]):
            data["esclusi"] = [u for u in data["esclusi"] if u in noti]; modificato = True
        for u in data["esclusi"]:
            if u not in per_url and (sito / u).is_file(): cancellazioni.append(sito / u); r["puliti"].append(u)
    esclusi = set(data.get("esclusi", []))

    for d in docs:
        url, nuova = d["url"], d["voce"]
        if url in esclusi: continue
        it = per_url.get(url)
        if it is None:
            # stesso sorgente (o stesso file) di una voce rimasta orfana: è un documento spostato
            match = next((x for x in orfane if x[1]["sorgente"] == nuova["sorgente"]), None) \
                 or next((x for x in orfane if Path(x[1]["url"]).name == Path(url).name), None)
            if match:
                b, it = match; orfane.remove(match)
                b["items"].remove(it); tappe[d["tappa"]]["items"].append(it)
                cancellazioni.append(sito / it["url"]); r["spostati"].append(f"{it['name']}: {it['url']} → {url}")
                it.update(url=url, cat=nuova["cat"], sorgente=nuova["sorgente"])
                if not d["firmato"] and it.get("versione") != nuova["versione"]:
                    it.update(date=nuova["date"], versione=nuova["versione"])
                    if not it.get("nomeManuale"): it["name"] = nuova["name"]
            else:
                # un file già presente ma senza voce non è visibile sul sito: si può sostituire
                tappe[d["tappa"]]["items"].append({"cat": nuova["cat"], "name": nuova["name"], "date": nuova["date"], "url": url,
                                                   "sorgente": nuova["sorgente"], "versione": nuova["versione"]})
                r["aggiunti"].append(nuova["name"])
            copie.append(d); modificato = True
        elif "sorgente" not in it:   # voce inserita a mano con lo stesso file: si adotta senza cambiare nulla
            it["sorgente"], it["versione"] = nuova["sorgente"], nuova["versione"]
            if it["name"] != nuova["name"]: it["nomeManuale"] = True   # il nome scelto a mano resta
            if not (sito / url).exists(): copie.append(d); r["ricopiati"].append(url)
            r["adottati"].append(it["name"]); modificato = True
        elif d["firmato"]:           # i verbali firmati non si sostituiscono mai
            if not (sito / url).exists(): copie.append(d); r["ricopiati"].append(url)
            elif not uguale(d): r["avvisi"].append(f"{url}: il PDF firmato in Documenti è diverso da quello pubblicato, non lo sostituisco")
        elif it.get("versione") != nuova["versione"]:
            r["aggiornati"].append(f"{it['name']}: versione {it.get('versione') or '?'} → {nuova['versione']}")
            it.update(cat=nuova["cat"], date=nuova["date"], versione=nuova["versione"])
            if not it.get("nomeManuale"): it["name"] = nuova["name"]
            copie.append(d); modificato = True
        elif not (sito / url).exists():
            copie.append(d); r["ricopiati"].append(url)   # stessa versione ma file sparito dal sito

    for b, it in orfane:
        if it["url"].endswith("-signed.pdf"):
            r["avvisi"].append(f"{it['url']}: il verbale firmato non è più in Documenti, ma non lo rimuovo"); continue
        b["items"].remove(it); cancellazioni.append(sito / it["url"]); r["rimossi"].append(it["name"]); modificato = True
    for s in sospesi:
        if any(it.get("sorgente") == s for _, it in voci):
            r["avvisi"].append(f"{s}: già pubblicato, lo lascio com'è finché il problema non è risolto")
    for _, it in voci:
        if it.get("sorgente") in in_lavorazione:
            stato, versione = in_lavorazione[it["sorgente"]]
            r["mantenuti"].append(f"{it['name']}: versione {it.get('versione') or '?'} (in Documenti: {versione}, {stato})")

    if not dry_run:
        for f in cancellazioni:
            f.unlink(missing_ok=True)
        for d in copie:
            (sito / d["url"]).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(artifact / d["pdf"], sito / d["url"])
        if modificato: scrivi_dati(dati_path, data)
    return r

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("artifact", help="cartella con i PDF e elenco.json")
    ap.add_argument("--sito", default=Path(__file__).resolve().parent.parent, help="radice del sito (predefinita: questo repository)")
    ap.add_argument("--dry-run", action="store_true", help="mostra cosa cambierebbe senza modificare nulla")
    a = ap.parse_args()

    r = sincronizza(a.artifact, a.sito, a.dry_run)
    righe = [f"{'Simulazione: ' if a.dry_run else ''}sincronizzazione con Documenti"]
    for k, t in TITOLI.items():
        if r[k]: righe += [f"\n{t}:"] + [f"- {x}" for x in r[k]]
    if len(righe) == 1: righe.append("\nNessuna modifica.")
    print("\n".join(righe), flush=True)
    if os.environ.get("GITHUB_ACTIONS"):   # gli avvisi compaiono anche nella pagina del workflow
        for x in r["avvisi"]: print(f"::warning title=Pubblicazione sul sito::{x}", flush=True)

    check = Path(a.sito) / "tools" / "check_links.py"
    if not a.dry_run and check.exists(): sys.exit(subprocess.run([sys.executable, str(check)]).returncode)

if __name__ == "__main__":
    main()
