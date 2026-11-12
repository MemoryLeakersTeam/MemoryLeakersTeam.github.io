/* Ore produttive: calcolo dei riepiloghi da data/ore.json e pagina pubblica /ore. Usato anche dal pannello admin (window.MLOre). */
(() => {
  const ROLES = [["responsabile", "Responsabile"], ["amministratore", "Amministratore"], ["analista", "Analista"], ["progettista", "Progettista"], ["programmatore", "Programmatore"], ["verificatore", "Verificatore"]];
  const ISSUE_RE = /^([A-Za-z0-9_.-]+)#(\d+)$/;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => (Math.round(n * 100) / 100).toLocaleString("it-IT");
  const euro = (n) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const day = (d) => new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  const sprintOf = (ore, date) => (ore.sprint || []).find((s) => s.dal <= date && date <= s.al) || null;
  const issueUrl = (ref) => { const m = ISSUE_RE.exec(ref || ""); return m ? `https://github.com/MemoryLeakersTeam/${m[1]}/issues/${m[2]}` : ""; };

  /* Riepilogo: totali per persona, per ruolo, per sprint. Le voci sono solo in aggiunta, quindi tutto si calcola in lettura. */
  function summarize(ore) {
    const voci = ore.voci || [], prev = ore.preventivo || { ruoli: {}, persone: {} };
    const perRuolo = Object.fromEntries(ROLES.map(([id]) => [id, { prevista: (prev.ruoli[id] || {}).ore || 0, tariffa: (prev.ruoli[id] || {}).tariffa || 0, svolta: 0 }]));
    const perPersona = Object.fromEntries(Object.entries(prev.persone || {}).map(([p, r]) => [p, { prevista: sum(Object.values(r)), svolta: 0 }]));
    const perSprint = (ore.sprint || []).map((s) => ({ ...s, svolta: 0, voci: 0 }));
    let fuoriSprint = 0;
    for (const v of voci) {
      if (perRuolo[v.ruolo]) perRuolo[v.ruolo].svolta += v.ore;
      (perPersona[v.persona] ||= { prevista: 0, svolta: 0 }).svolta += v.ore;
      const s = perSprint.find((x) => x.dal <= v.data && v.data <= x.al);
      if (s) { s.svolta += v.ore; s.voci++; } else fuoriSprint++;
    }
    const prevista = sum(Object.values(perRuolo).map((r) => r.prevista));
    const svolta = sum(voci.map((v) => v.ore));
    const costoPrevisto = sum(Object.values(perRuolo).map((r) => r.prevista * r.tariffa));
    const costo = sum(Object.values(perRuolo).map((r) => r.svolta * r.tariffa));
    return { perRuolo, perPersona, perSprint, prevista, svolta, costoPrevisto, costo, fuoriSprint };
  }

  const csvCell = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCsv(ore, voci, nameOf) {
    const head = ["sprint", "data", "persona", "nome", "ruolo", "ore", "issue", "nota"];
    const rows = [...voci].sort((a, b) => a.data.localeCompare(b.data) || a.persona.localeCompare(b.persona)).map((v) => {
      const s = sprintOf(ore, v.data);
      return [s ? s.id : "", v.data, v.persona, nameOf(v.persona), v.ruolo, v.ore, v.issue || "", v.nota || ""];
    });
    return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
  }

  window.MLOre = { ROLES, ISSUE_RE, summarize, sprintOf, issueUrl, toCsv, today, num, esc };

  /* ---------- pagina pubblica ---------- */
  const root = document.getElementById("ore-root");
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const members = (window.SITE_DATA && window.SITE_DATA.members) || [];
  const nameOf = (login) => (members.find((m) => (m.github || "").toLowerCase() === login.toLowerCase()) || {}).name || login;
  const roleName = (id) => (ROLES.find(([r]) => r === id) || [, id])[1];
  const bar = (done, max, label) => `<progress max="${max || 1}" value="${Math.min(done, max || 1)}" aria-label="${esc(label)}"></progress>`;

  function draw(ore) {
    const s = summarize(ore), t = today();
    const current = (ore.sprint || []).find((x) => x.dal <= t && t <= x.al);
    $("ore-summary").innerHTML = [
      ["Ore svolte", `${num(s.svolta)} <small>su ${num(s.prevista)}</small>`, bar(s.svolta, s.prevista, `Ore svolte ${num(s.svolta)} su ${num(s.prevista)}`)],
      ["Costo delle ore svolte", `${euro(s.costo)} <small>su ${euro(s.costoPrevisto)}</small>`, bar(s.costo, s.costoPrevisto, `Costo ${euro(s.costo)} su ${euro(s.costoPrevisto)}`)],
      ["Ore residue", `${num(Math.max(s.prevista - s.svolta, 0))}`, current ? `<span class="hint">Sprint in corso: ${esc(current.id)}, dal ${day(current.dal)} al ${day(current.al)}</span>` : ""],
    ].map(([k, v, extra]) => `<div class="stat"><div class="stat-k">${k}</div><div class="stat-v">${v}</div>${extra}</div>`).join("");

    $("ore-persone").innerHTML = Object.entries(s.perPersona).sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0]), "it")).map(([p, x]) =>
      `<tr><th scope="row">${esc(nameOf(p))}</th><td class="n">${num(x.svolta)}</td><td class="n">${num(x.prevista)}</td><td class="n">${num(Math.max(x.prevista - x.svolta, 0))}</td><td class="bar-cell">${bar(x.svolta, x.prevista, `${nameOf(p)}: ${num(x.svolta)} ore su ${num(x.prevista)}`)}</td></tr>`).join("");

    $("ore-ruoli").innerHTML = ROLES.map(([id, label]) => { const r = s.perRuolo[id];
      return `<tr><th scope="row">${label}</th><td class="n">${num(r.svolta)}</td><td class="n">${num(r.prevista)}</td><td class="n">${num(Math.max(r.prevista - r.svolta, 0))}</td><td class="n">${euro(r.svolta * r.tariffa)}</td><td class="bar-cell">${bar(r.svolta, r.prevista, `${label}: ${num(r.svolta)} ore su ${num(r.prevista)}`)}</td></tr>`; }).join("");

    $("ore-sprint").innerHTML = s.perSprint.map((x) =>
      `<tr${current && current.id === x.id ? ' aria-current="true"' : ""}><th scope="row">${esc(x.id)}</th><td>${day(x.dal)} – ${day(x.al)}</td><td class="n">${num(x.svolta)}</td><td class="n">${x.voci}</td></tr>`).join("");

    const voci = [...(ore.voci || [])].sort((a, b) => b.data.localeCompare(a.data) || a.persona.localeCompare(b.persona));
    $("ore-voci").innerHTML = voci.length ? voci.map((v) => { const u = issueUrl(v.issue);
      return `<tr><td>${day(v.data)}</td><td>${esc(nameOf(v.persona))}</td><td>${esc(roleName(v.ruolo))}</td><td class="n">${num(v.ore)}</td><td>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(v.issue)}<span class="sr-only"> (si apre in una nuova scheda)</span></a>` : ""}</td><td>${esc(v.nota)}</td></tr>`; }).join("")
      : '<tr><td colspan="6" class="empty">Nessuna ora registrata.</td></tr>';
    $("ore-voci-count").textContent = `(${voci.length})`;
    $("ore-warn").hidden = !s.fuoriSprint;
    if (s.fuoriSprint) $("ore-warn").textContent = `${s.fuoriSprint} ${s.fuoriSprint === 1 ? "registrazione ha" : "registrazioni hanno"} una data fuori dagli sprint definiti e ${s.fuoriSprint === 1 ? "non compare" : "non compaiono"} nella tabella per sprint.`;

    const sel = $("csv-sprint");
    sel.replaceChildren(new Option("Tutte le ore", ""), ...(ore.sprint || []).map((x) => new Option(`${x.id} · ${day(x.dal)} – ${day(x.al)}`, x.id)));
    if (current) sel.value = current.id;
    $("csv-btn").onclick = () => {
      const id = sel.value, list = id ? voci.filter((v) => (sprintOf(ore, v.data) || {}).id === id) : voci;
      const url = URL.createObjectURL(new Blob([toCsv(ore, list, nameOf)], { type: "text/csv;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `ore-${id || "tutte"}.csv` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $("ore-status").hidden = true; root.hidden = false;
  }

  fetch("data/ore.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(draw)
    .catch(() => { $("ore-status").textContent = "Non è stato possibile caricare le ore. Riprova tra qualche minuto."; });
})();
