/* Menu mobile accessibile, header con sfondo allo scroll, apertura della tappa indicata dall'URL (#rtb, #poc…). */
(() => {
  // indirizzi puliti: /index.html → /  e  /glossario.html → /glossario (sulla stessa pagina, senza ricaricarla)
  const clean = location.pathname.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");
  if (clean !== location.pathname && !/^\/404/.test(clean)) history.replaceState(null, "", clean + location.search + location.hash);

  const btn = document.querySelector(".menu-btn");
  const menu = document.getElementById("menu");
  const header = document.querySelector(".nav");

  if (btn && menu) {
    const set = (open) => { menu.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") { set(false); btn.focus(); }
    });
  }

  // le tappe nascoste dal pannello admin spariscono anche dal menu
  const hidden = ((window.SITE_DATA && window.SITE_DATA.baselines) || []).filter((b) => b.visible === false).map((b) => b.id);
  document.querySelectorAll("#menu a").forEach((a) => {
    const m = (a.getAttribute("href") || "").match(/#([\w-]+)$/);
    if (m && hidden.includes(m[1])) a.closest("li").remove();
  });

  const onScroll = () => header && header.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  const openFromHash = () => {
    const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el && el.matches("details.baseline")) { el.open = true; el.scrollIntoView(); }
  };
  addEventListener("hashchange", openFromHash); openFromHash();
})();
