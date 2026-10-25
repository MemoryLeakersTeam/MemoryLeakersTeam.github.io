/* Disegna le parti dinamiche del sito a partire da data/site-data.js. */
(() => {
  const data = window.SITE_DATA;
  if (!data) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // accetta solo http(s), mailto o percorsi relativi (niente javascript:)
  const safeUrl = (u) => (/^(?:https?:|mailto:)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u || "") ? encodeURI(decodeURI(u || "#")) : "#");
  const fmt = (d) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  const when = (d) => (d ? `<time datetime="${esc(d)}">${fmt(d)}</time>` : "");
  const langAttr = (l) => (l ? ` lang="${esc(l)}"` : "");
  const NEWTAB = '<span class="sr-only"> (si apre in una nuova scheda)</span>';
  const external = (u) => /^https?:/i.test(u);
  const initials = (n) => n.split(/\s+/).filter((w) => /^[A-ZÀ-Ý]/.test(w)).map((w) => w[0]).join("").slice(0, 2) || n.slice(0, 2).toUpperCase();

  /* ---------- timeline dei documenti (home) ---------- */
  const tl = $("timeline");
  if (tl) {
    const cats = data.categories || [];
    tl.innerHTML = data.baselines.filter((b) => b.visible !== false).map((b, i) => {
      const items = b.items || [];
      const order = [...cats, ...new Set(items.map((x) => x.cat).filter((c) => !cats.includes(c)))];
      const body = order.map((c) => {
        const list = items.filter((x) => x.cat === c).sort((a, b2) => (a.date || "9999").localeCompare(b2.date || "9999") || a.name.localeCompare(b2.name, "it"));
        if (!list.length) return "";
        return `<div class="group-title">${esc(c)}</div>` + list.map((it) => {
          const url = safeUrl(it.url), isPdf = /\.pdf($|[?#])/i.test(it.url || "");
          return `<a class="doc" href="${esc(url)}" target="_blank" rel="noopener"><span>${esc(it.name)}</span><small>${when(it.date)}${it.date ? " · " : ""}${isPdf ? "PDF" : "Link"}${NEWTAB}</small></a>`;
        }).join("");
      }).join("");
      const badge = items.length ? `${items.length} ${items.length === 1 ? "documento" : "documenti"}` : "Nessun documento";
      return `
      <details class="baseline" ${i === 0 ? "open" : ""} id="${esc(b.id)}">
        <summary>
          <div class="step" aria-hidden="true">${esc(b.step)}</div>
          <div><h3><span${langAttr(b.titleLang)}>${esc(b.title)}</span><span class="badge">${badge}</span></h3><div class="sub">${esc(b.sub)}</div></div>
          <svg class="chev" aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m6 9 6 6 6-6"/></svg>
        </summary>
        <div class="body">${body || '<p class="empty">Nessun documento ancora pubblicato.</p>'}</div>
      </details>`;
    }).join("");
  }

  /* ---------- glossario (pagina dedicata) ---------- */
  const gl = $("glossary");
  if (gl) {
    const q = $("glossary-search"), status = $("glossary-status"), bar = $("letter-filter");
    const letterOf = (t) => { const c = t.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; };
    const sorted = [...data.glossary].sort((a, b) => a.term.localeCompare(b.term, "it"));
    const ids = window.MLSlug.termIds(data.glossary);
    const present = new Set(sorted.map((g) => letterOf(g.term)));
    let letter = "";
    const letters = [...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)), ...(present.has("#") ? ["#"] : [])];
    const drawBar = () => {
      bar.innerHTML = `<button type="button" class="letter-btn wide" data-l="" aria-pressed="${letter === ""}">Tutte</button>` +
        letters.map((l) => `<button type="button" class="letter-btn" data-l="${l}" aria-pressed="${letter === l}" ${present.has(l) ? "" : "disabled"}>${l}</button>`).join("");
    };
    const render = () => {
      const f = (q ? q.value : "").trim().toLowerCase();
      const list = sorted.filter((g) => (!letter || letterOf(g.term) === letter) && (!f || (g.term + " " + g.def).toLowerCase().includes(f)));
      const groups = {};
      list.forEach((g) => (groups[letterOf(g.term)] ||= []).push(g));
      gl.innerHTML = Object.keys(groups).map((l) => `
        <section class="letter-group" aria-labelledby="L-${l === "#" ? "num" : l}">
          <h2 class="letter-h" id="L-${l === "#" ? "num" : l}">${l}</h2>
          <dl class="glossary">${groups[l].map((g) => `<div class="term" id="${esc(ids.get(g))}"><dt${langAttr(g.lang)}>${esc(g.term)}<a class="permalink" href="#${esc(ids.get(g))}" aria-label="Link diretto al termine ${esc(g.term)}" lang="it">#</a></dt><dd>${esc(g.def)}</dd></div>`).join("")}</dl>
        </section>`).join("");
      $("glossary-empty").hidden = list.length > 0;
      status.textContent = f || letter ? (list.length ? `${list.length} ${list.length === 1 ? "termine trovato" : "termini trovati"}` : "Nessun termine trovato") : "";
    };
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || b.disabled) return;
      letter = b.dataset.l; drawBar(); render();
      bar.querySelector(`[data-l="${letter}"]`).focus();
    });
    q && q.addEventListener("input", render);
    // link diretto (glossario#parola): azzera i filtri, mostra il termine e lo porta in vista
    const goToHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const g = id && sorted.find((x) => ids.get(x) === id);
      if (!g) return;
      letter = ""; if (q) q.value = ""; drawBar(); render();
      document.querySelectorAll(".term.hl").forEach((x) => x.classList.remove("hl"));
      const node = $(id); node.classList.add("hl"); node.tabIndex = -1; const reveal = () => node.scrollIntoView({ block: "center", behavior: "instant" });
      const ensure = () => { const r = node.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) reveal(); };
      reveal(); node.focus({ preventScroll: true });
      // font e immagini caricati dopo possono spostare il layout: se il termine non è più in vista, lo si ricentra
      if (document.fonts) document.fonts.ready.then(ensure);
      if (document.readyState !== "complete") addEventListener("load", ensure, { once: true });
    };
    addEventListener("hashchange", goToHash);
    drawBar(); render(); goToHash();
  }

  /* ---------- componenti e contatti ---------- */
  const mem = $("members");
  if (mem) {
    const withContacts = mem.dataset.contacts === "true";
    const people = data.members || [];
    mem.innerHTML = people.map((m) => {
      const links = [];
      if (m.email) links.push(`<a href="mailto:${esc(m.email)}" aria-label="Email di ${esc(m.name)}">${esc(m.email)}</a>`);
      if (m.github) links.push(`<a href="https://github.com/${esc(m.github)}" target="_blank" rel="noopener" aria-label="GitHub di ${esc(m.name)}">GitHub: ${esc(m.github)}${NEWTAB}</a>`);
      if (withContacts && !links.length) return "";
      return `<li class="member"><div class="avatar" aria-hidden="true">${esc(initials(m.name))}</div><b>${esc(m.name)}</b>${m.role ? `<br><small>${esc(m.role)}</small>` : ""}${links.length ? `<div class="member-links">${links.join("")}</div>` : ""}</li>`;
    }).join("");
    if (withContacts && !mem.children.length) mem.outerHTML = '<p class="empty">I contatti dei singoli componenti non sono ancora stati pubblicati: scriveteci all\'indirizzo del gruppo.</p>';
  }
  const ct = $("contacts");
  if (ct) {
    ct.innerHTML = (data.contacts || []).map((c) => {
      const ext = external(c.url);
      return `<li><a href="${esc(safeUrl(c.url))}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(c.label)} <span>${esc(c.value)}${ext ? NEWTAB : ""}</span></a></li>`;
    }).join("");
  }
})();
