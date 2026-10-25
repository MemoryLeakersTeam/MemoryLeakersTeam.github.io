/* Identificativi dei termini del glossario: servono per i link diretti (glossario#capitolato).
   Condiviso da glossario.html e dal pannello admin, così i due calcolano sempre lo stesso id. */
(() => {
  // id già usati nelle pagine: un termine non può prenderli
  const RESERVED = new Set(["contenuto", "top", "menu", "glossary", "glossary-search", "glossary-status", "glossary-empty", "letter-filter"]);
  const base = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "termine";
  // Restituisce una Map termine(oggetto) -> id. Gli id fissati a mano (g.id) hanno la precedenza.
  function termIds(list) {
    const ids = new Map(), used = new Set(RESERVED);
    list.forEach((g) => { if (g.id) { ids.set(g, g.id); used.add(g.id); } });
    [...list].filter((g) => !g.id).sort((a, b) => a.term.localeCompare(b.term, "it")).forEach((g) => {
      const b = base(g.term); let id = RESERVED.has(b) ? b + "-termine" : b, n = 2;
      while (used.has(id)) id = `${b}-${n++}`;
      used.add(id); ids.set(g, id);
    });
    return ids;
  }
  window.MLSlug = { termIds, reserved: RESERVED };
})();
