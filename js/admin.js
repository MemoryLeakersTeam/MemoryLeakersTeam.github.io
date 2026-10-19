/* Pannello admin: modifica data/site-data.js e carica i PDF nel repository tramite le API di GitHub.
   Il token inserito resta solo in memoria (o in sessionStorage se l'utente lo chiede) e viene inviato soltanto a api.github.com. */
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => n.append(c));
    return n;
  };
  const MAX_MB = 25, STORE = "ml-admin";
  let cfg = null, data = null, original = "", sha = null;
  const pending = new Map(); // percorso nel repo -> File da caricare
  let docEdit = null;

  /* ---------- utilità ---------- */
  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");
  const bytesToB64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const textToB64 = (t) => bytesToB64(new TextEncoder().encode(t));
  const b64ToText = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const fileToB64 = async (f) => bytesToB64(new Uint8Array(await f.arrayBuffer()));
  const serialize = (d) => "/* File gestito dal pannello admin (admin.html): puoi anche modificarlo a mano, ma rispetta il formato JSON. */\nwindow.SITE_DATA = " + JSON.stringify(d, null, 2) + ";\n";
  const parse = (t) => JSON.parse(t.match(/window\.SITE_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)[1]);
  const setMsg = (node, text, kind = "") => { node.textContent = text; node.className = "msg" + (kind ? " " + kind : ""); };
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "");

  async function api(path, opts = {}) {
    let r;
    try {
      r = await fetch("https://api.github.com" + path, {
        ...opts,
        headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + cfg.token, "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
      });
    } catch { const e = new Error("rete"); e.status = 0; throw e; }
    if (!r.ok) { const e = new Error("http"); e.status = r.status; e.body = await r.json().catch(() => ({})); throw e; }
    return r.status === 204 ? null : r.json();
  }
  const explain = (e) => {
    if (e.status === 0) return "Impossibile contattare GitHub: controlla la connessione.";
    if (e.status === 401) return "Token non valido o scaduto.";
    if (e.status === 403) return "Permessi insufficienti: il token deve avere «Contents: Read and write» su questo repository.";
    if (e.status === 404) return "Repository o ramo non trovato, oppure il token non ha accesso a questo repository.";
    if (e.status === 409 || e.status === 422) return "Il file sul repository è stato modificato da qualcun altro nel frattempo. Premi «Annulla modifiche» per ricaricare e poi rifai la modifica.";
    return e.message === "http" ? `Errore di GitHub (${e.status}).` : e.message;
  };

  const normalize = (d) => {
    d.categories ||= ["Generale", "Documenti esterni", "Documenti interni", "Verbali esterni", "Verbali interni", "Diapositive"];
    d.baselines ||= []; d.baselines.forEach((b) => (b.items ||= []));
    d.glossary ||= []; d.members ||= []; d.contacts ||= [];
    return d;
  };
  const dirty = () => JSON.stringify(data) !== original || pending.size > 0;
  function updateDirty() {
    const d = dirty();
    $("btn-save").disabled = !d; $("btn-discard").disabled = !d;
    if (d && !$("save-msg").textContent.startsWith("Modifiche")) setMsg($("save-msg"), "Modifiche non ancora pubblicate. Premi «Salva e pubblica» quando hai finito.");
  }
  addEventListener("beforeunload", (e) => { if (cfg && dirty()) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- accesso ---------- */
  async function loadData() {
    try {
      const f = await api(`/repos/${cfg.repo}/contents/data/site-data.js?ref=${encodeURIComponent(cfg.branch)}`);
      sha = f.sha; data = normalize(parse(b64ToText(f.content)));
    } catch (e) {
      if (e.status !== 404) throw e;
      sha = null; data = normalize(structuredClone(window.SITE_DATA)); // primo salvataggio: parte dai dati del sito
    }
    original = JSON.stringify(data); pending.clear();
  }
  async function login(c, remember) {
    setMsg($("login-msg"), "Accesso in corso…");
    cfg = c;
    try {
      let who = c.repo;
      try { who = (await api("/user")).login + " · " + c.repo; } catch (e) { if (e.status === 401) throw e; }
      const repo = await api("/repos/" + c.repo);
      if (!repo.permissions || !repo.permissions.push) throw Object.assign(new Error("Questo token non ha permesso di scrittura sul repository."), { status: -1 });
      await loadData();
      remember ? sessionStorage.setItem(STORE, JSON.stringify(c)) : sessionStorage.removeItem(STORE);
      $("who").textContent = `Collegato come ${who} (ramo ${c.branch})`;
      $("login").hidden = true; $("panel").hidden = false; $("f-token").value = "";
      setMsg($("login-msg"), ""); setMsg($("save-msg"), "");
      renderAll(); $("tabs").querySelector("[aria-selected=true]").focus();
    } catch (e) { cfg = null; setMsg($("login-msg"), explain(e), "err"); }
  }
  $("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    login({ repo: $("f-repo").value.trim(), branch: $("f-branch").value.trim(), token: $("f-token").value.trim() }, $("f-remember").checked);
  });
  $("btn-logout").addEventListener("click", () => {
    if (dirty() && !confirm("Ci sono modifiche non pubblicate: uscendo andranno perse. Uscire?")) return;
    cfg = null; data = null; pending.clear(); sessionStorage.removeItem(STORE);
    $("panel").hidden = true; $("login").hidden = false; $("f-token").focus();
  });
  $("btn-discard").addEventListener("click", async () => {
    if (!confirm("Annullare tutte le modifiche non pubblicate?")) return;
    try { await loadData(); resetForms(); renderAll(); setMsg($("save-msg"), "Modifiche annullate: dati ricaricati dal repository.", "ok"); } catch (e) { setMsg($("save-msg"), explain(e), "err"); }
  });

  /* ---------- salvataggio ---------- */
  $("btn-save").addEventListener("click", async () => {
    const btn = $("btn-save"); btn.disabled = true; $("btn-discard").disabled = true;
    const r = encodeURIComponent(cfg.branch), base = `/repos/${cfg.repo}/contents/`;
    try {
      let i = 0;
      for (const [path, file] of pending) {
        setMsg($("save-msg"), `Carico il file ${++i} di ${pending.size}: ${path}…`);
        let fsha; try { fsha = (await api(base + encPath(path) + "?ref=" + r)).sha; } catch (e) { if (e.status !== 404) throw e; }
        await api(base + encPath(path), { method: "PUT", body: JSON.stringify({ message: `Admin: carica ${path}`, content: await fileToB64(file), branch: cfg.branch, sha: fsha }) });
      }
      setMsg($("save-msg"), "Salvo i contenuti del sito…");
      const res = await api(base + "data/site-data.js", { method: "PUT", body: JSON.stringify({ message: "Admin: aggiorna i contenuti del sito", content: textToB64(serialize(data)), branch: cfg.branch, sha: sha || undefined }) });
      sha = res.content.sha; original = JSON.stringify(data); pending.clear();
      setMsg($("save-msg"), "Modifiche pubblicate. Il sito si aggiorna in uno o due minuti.", "ok");
    } catch (e) { setMsg($("save-msg"), explain(e), "err"); }
    updateDirty();
    if (!dirty()) setMsg($("save-msg"), "Modifiche pubblicate. Il sito si aggiorna in uno o due minuti.", "ok");
  });

  /* ---------- schede (tab) ---------- */
  const tabs = [...$("tabs").querySelectorAll("[role=tab]")];
  const selectTab = (t, focus) => tabs.forEach((x) => {
    const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1;
    $(x.getAttribute("aria-controls")).hidden = !on; if (on && focus) x.focus();
  });
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t));
    t.addEventListener("keydown", (e) => {
      const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (k !== undefined) { e.preventDefault(); selectTab(tabs[(k + tabs.length) % tabs.length], true); }
    });
  });

  /* ---------- elementi comuni delle liste ---------- */
  const btn = (label, aria, fn, cls = "") => el("button", { type: "button", class: "btn ghost small " + cls, "aria-label": aria, onclick: fn }, label);
  const row = (main, meta, actions) => el("div", { class: "item" }, el("div", { class: "main" }, main, meta ? el("div", { class: "meta" }, meta) : ""), el("div", { class: "actions" }, actions));
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const emptyNote = (t) => el("p", { class: "empty" }, t);

  /* ---------- documenti ---------- */
  const curBaseline = () => data.baselines.find((b) => b.id === $("d-baseline").value) || data.baselines[0];
  function fillSelects() {
    const keep = $("d-baseline").value, keepCat = $("d-cat").value;
    $("d-baseline").replaceChildren(...data.baselines.map((b) => el("option", { value: b.id }, b.title)));
    $("d-cat").replaceChildren(...data.categories.map((c) => el("option", { value: c }, c)));
    if (keep && data.baselines.some((b) => b.id === keep)) $("d-baseline").value = keep;
    if (keepCat) $("d-cat").value = keepCat;
  }
  const gcPending = () => {
    const used = new Set(data.baselines.flatMap((b) => b.items.map((i) => i.url)));
    for (const p of [...pending.keys()]) if (!used.has(p)) pending.delete(p);
  };
  function renderDocs() {
    fillSelects();
    const b = curBaseline(), box = $("doc-list"); box.replaceChildren();
    $("doc-list-title").textContent = `Documenti pubblicati · ${b.title}`;
    const cats = [...data.categories, ...new Set(b.items.map((i) => i.cat).filter((c) => !data.categories.includes(c)))];
    let any = false;
    for (const c of cats) {
      const items = b.items.map((it, idx) => ({ it, idx })).filter((x) => x.it.cat === c)
        .sort((a, z) => (a.it.date || "9999").localeCompare(z.it.date || "9999") || a.it.name.localeCompare(z.it.name, "it"));
      if (!items.length) continue; any = true;
      box.append(el("div", { class: "list-group" }, c), el("div", { class: "list" }, items.map(({ it, idx }) => row(
        el("b", {}, it.name),
        [fmtDate(it.date), fmtDate(it.date) ? " · " : "", it.url, pending.has(it.url) ? el("span", { class: "tag" }, "da caricare") : ""],
        [btn("Modifica", `Modifica ${it.name}`, () => editDoc(idx)),
         btn("Elimina", `Elimina ${it.name}`, () => { if (confirm(`Eliminare «${it.name}» dall'elenco?\n(Il file eventualmente già caricato resta nel repository.)`)) { b.items.splice(idx, 1); gcPending(); renderDocs(); updateDirty(); } }, "danger")]))));
    }
    if (!any) box.append(emptyNote("Nessun documento in questa tappa."));
    updateDirty();
  }
  $("d-baseline").addEventListener("change", renderDocs);
  document.querySelectorAll("input[name=d-src]").forEach((r) => r.addEventListener("change", () => {
    const f = document.querySelector("input[name=d-src]:checked").value === "file";
    $("src-file").hidden = !f; $("src-url").hidden = f;
  }));
  function resetDocForm() {
    docEdit = null; $("doc-form").reset(); $("src-file").hidden = false; $("src-url").hidden = true;
    $("d-baseline").disabled = false; $("doc-submit").textContent = "Aggiungi documento"; $("doc-form-title").textContent = "Aggiungi un documento";
    $("doc-cancel").hidden = true; $("d-file-hint").textContent = `Il file viene salvato nel repository in pdf/tappa/categoria/. Massimo ${MAX_MB} MB.`;
  }
  function editDoc(idx) {
    const it = curBaseline().items[idx]; docEdit = idx;
    $("d-name").value = it.name; $("d-date").value = it.date || ""; $("d-cat").value = it.cat;
    const ext = /^https?:/i.test(it.url);
    document.querySelector(`input[name=d-src][value=${ext ? "url" : "file"}]`).checked = true;
    $("src-file").hidden = ext; $("src-url").hidden = !ext; $("d-url").value = ext ? it.url : ""; $("d-file").value = "";
    $("d-file-hint").textContent = ext ? "" : `File attuale: ${it.url}. Lascia vuoto per mantenerlo, oppure scegline uno nuovo per sostituirlo.`;
    $("d-baseline").disabled = true; $("doc-submit").textContent = "Salva modifica"; $("doc-cancel").hidden = false;
    $("doc-form-title").textContent = "Modifica documento"; $("doc-form-title").scrollIntoView({ block: "center" }); $("d-name").focus();
  }
  $("doc-cancel").addEventListener("click", resetDocForm);
  $("doc-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("doc-msg"), b = curBaseline(), cat = $("d-cat").value, name = $("d-name").value.trim();
    const old = docEdit !== null ? b.items[docEdit] : null; let url;
    try {
      if (document.querySelector("input[name=d-src]:checked").value === "file") {
        const f = $("d-file").files[0];
        if (f) {
          if (f.size > MAX_MB * 1048576) throw new Error(`Il file supera ${MAX_MB} MB.`);
          const head = new TextDecoder().decode(new Uint8Array(await f.slice(0, 5).arrayBuffer()));
          if (head !== "%PDF-") throw new Error("Il file scelto non è un PDF valido.");
          url = `pdf/${b.id}/${slug(cat).toLowerCase()}/${slug(f.name.replace(/\.pdf$/i, "")) || "documento"}.pdf`;
          if (b.items.some((x) => x.url === url && x !== old)) throw new Error("Esiste già un documento che usa un file con questo nome: rinomina il file e riprova.");
          pending.set(url, f);
        } else if (old && !/^https?:/i.test(old.url)) url = old.url;
        else throw new Error("Scegli un file PDF da caricare.");
      } else {
        url = $("d-url").value.trim();
        if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("Inserisci un indirizzo che inizi con http:// o https://.");
      }
      const item = { cat, name, date: $("d-date").value || "", url };
      if (old) b.items[docEdit] = item; else b.items.push(item);
      gcPending(); setMsg(msg, old ? "Documento aggiornato." : "Documento aggiunto all'elenco.", "ok");
      resetDocForm(); renderDocs(); $("d-name").focus();
    } catch (err) { setMsg(msg, err.message, "err"); }
  });

  /* ---------- modulo generico (glossario, componenti, contatti) ---------- */
  function crud(o) {
    let editing = null;
    const form = $(o.form), submit = $(o.submit), cancel = $(o.cancel), title = $(o.title);
    const reset = () => { editing = null; form.reset(); submit.textContent = o.addLabel; title.textContent = o.titleAdd; cancel.hidden = true; };
    const edit = (idx) => {
      editing = idx; o.fill(o.arr()[idx]); submit.textContent = "Salva modifica"; title.textContent = o.titleEdit; cancel.hidden = false;
      title.scrollIntoView({ block: "center" }); form.querySelector("input,textarea").focus();
    };
    cancel.addEventListener("click", reset);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let item; try { item = o.read(editing); } catch (err) { alert(err.message); return; }
      editing === null ? o.arr().push(item) : (o.arr()[editing] = item);
      reset(); render(); form.querySelector("input,textarea").focus();
    });
    function render() {
      const arr = o.arr(), list = $(o.list);
      const order = arr.map((x, i) => i); if (o.sort) order.sort((a, b) => o.sort(arr[a], arr[b]));
      list.replaceChildren(order.length ? el("div", { class: "list" }, order.map((i) => {
        const x = arr[i], { main, meta } = o.row(x), acts = [];
        if (o.reorder) acts.push(btn("↑", `Sposta su ${main}`, () => { move(arr, i, -1); render(); }), btn("↓", `Sposta giù ${main}`, () => { move(arr, i, 1); render(); }));
        acts.push(btn("Modifica", `Modifica ${main}`, () => edit(i)), btn("Elimina", `Elimina ${main}`, () => { if (confirm(`Eliminare «${main}»?`)) { arr.splice(i, 1); reset(); render(); } }, "danger"));
        return row(el("b", {}, main), meta, acts);
      })) : emptyNote("Nessun elemento."));
      updateDirty();
    }
    return { render, reset };
  }
  const glo = crud({
    form: "g-form", list: "g-list", submit: "g-submit", cancel: "g-cancel", title: "g-form-title",
    addLabel: "Aggiungi termine", titleAdd: "Aggiungi un termine", titleEdit: "Modifica termine",
    arr: () => data.glossary, sort: (a, b) => a.term.localeCompare(b.term, "it"),
    fill: (x) => { $("g-term").value = x.term; $("g-def").value = x.def; $("g-en").checked = x.lang === "en"; },
    read: (idx) => {
      const term = $("g-term").value.trim(), def = $("g-def").value.trim();
      if (data.glossary.some((x, i) => i !== idx && x.term.toLowerCase() === term.toLowerCase())) throw new Error("Esiste già un termine con questo nome.");
      return { term, ...($("g-en").checked ? { lang: "en" } : {}), def };
    },
    row: (x) => ({ main: x.term, meta: x.def }),
  });
  const mem = crud({
    form: "m-form", list: "m-list", submit: "m-submit", cancel: "m-cancel", title: "m-form-title",
    addLabel: "Aggiungi componente", titleAdd: "Aggiungi un componente", titleEdit: "Modifica componente", reorder: true,
    arr: () => data.members,
    fill: (x) => { $("m-name").value = x.name; $("m-role").value = x.role || ""; $("m-email").value = x.email || ""; $("m-github").value = x.github || ""; },
    read: () => ({ name: $("m-name").value.trim(), ...($("m-role").value.trim() ? { role: $("m-role").value.trim() } : {}), github: $("m-github").value.trim(), email: $("m-email").value.trim() }),
    row: (x) => ({ main: x.name, meta: [x.role, x.email, x.github && "GitHub: " + x.github].filter(Boolean).join(" · ") || "nessun recapito pubblico" }),
  });
  const con = crud({
    form: "c-form", list: "c-list", submit: "c-submit", cancel: "c-cancel", title: "c-form-title",
    addLabel: "Aggiungi contatto", titleAdd: "Aggiungi un contatto del gruppo", titleEdit: "Modifica contatto", reorder: true,
    arr: () => data.contacts,
    fill: (x) => { $("c-label").value = x.label; $("c-value").value = x.value; $("c-url").value = x.url; },
    read: () => {
      const url = $("c-url").value.trim();
      if (!/^(https?:\/\/\S+|mailto:\S+@\S+)$/i.test(url)) throw new Error("Il link deve iniziare con https://, http:// oppure mailto:");
      return { label: $("c-label").value.trim(), value: $("c-value").value.trim(), url };
    },
    row: (x) => ({ main: x.label, meta: `${x.value} → ${x.url}` }),
  });

  function resetForms() { resetDocForm(); glo.reset(); mem.reset(); con.reset(); }
  function renderAll() { renderDocs(); glo.render(); mem.render(); con.render(); }

  /* ---------- riaccesso nella stessa scheda ---------- */
  try { const s = JSON.parse(sessionStorage.getItem(STORE) || "null"); if (s) { $("f-repo").value = s.repo; $("f-branch").value = s.branch; login(s, true); } } catch { /* ignora */ }
})();
