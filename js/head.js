/* Testa a "rete neurale" rotante + reti neurali ai lati, in canvas 2D, senza dipendenze.
   I nodi e le connessioni della testa vengono da una scansione 3D reale (vedi js/head-data.js,
   generato da tools/build_head_graph.py). Modello: Lee Perry-Smith, CC BY 3.0. */
(() => {
  const canvas = document.getElementById("scene");
  const D = window.HEAD_DATA;
  if (!canvas || !D) return;
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // WCAG 2.2.2: l'animazione si può mettere in pausa (e parte ferma se l'utente preferisce meno movimento)
  let paused = reduce;
  const toggle = document.getElementById("motion-toggle");
  const label = () => { if (toggle) toggle.textContent = paused ? "Riprendi l'animazione" : "Metti in pausa l'animazione"; };
  if (toggle) { label(); toggle.addEventListener("click", () => { paused = !paused; label(); }); }
  const INK = "79,138,132"; // teal
  const DARK = "38,57,58";

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (t) => t * t * (3 - 2 * t);

  /* ---------- testa: nodi, normali, archi ---------- */
  const N = D.n, EL = D.e.length / 2;
  const hx = Float32Array.from(D.p.filter((_, i) => i % 3 === 0));
  const hy = Float32Array.from(D.p.filter((_, i) => i % 3 === 1));
  const hz = Float32Array.from(D.p.filter((_, i) => i % 3 === 2));
  const nx = Float32Array.from(D.nr.filter((_, i) => i % 3 === 0));
  const ny = Float32Array.from(D.nr.filter((_, i) => i % 3 === 1));
  const nz = Float32Array.from(D.nr.filter((_, i) => i % 3 === 2));
  const E = Uint16Array.from(D.e);
  let ymin = Infinity;
  for (let i = 0; i < N; i++) ymin = Math.min(ymin, hy[i]);
  // dissolvenza verso il collo
  const nodeFade = new Float32Array(N);
  for (let i = 0; i < N; i++) nodeFade[i] = smooth(clamp((hy[i] - ymin) / 1.15));

  /* ---------- rete neurale attorno ---------- */
  const layers = [4, 6, 6, 4]; // per lato
  const net = { pts: [], edges: [], pulses: [] };
  [-1, 1].forEach((side) => {
    let prev = [];
    layers.forEach((n, li) => {
      const cur = [];
      const x = side * (2.2 + li * 0.72);
      for (let j = 0; j < n; j++) {
        const y = (j - (n - 1) / 2) * 0.62 + Math.sin(li * 2 + j) * 0.12;
        const z = Math.sin(li * 3.1 + j * 1.7 + side) * 0.5;
        net.pts.push([x, y, z]);
        cur.push(net.pts.length - 1);
      }
      prev.forEach((p) => cur.forEach((c) => net.edges.push([p, c])));
      prev = cur;
    });
  });

  /* ---------- rendering ---------- */
  const CY = 0.41; // altezza (frazione di H) del centro della testa
  let W, H, S, KX = 1, mx = 0, my = 0, tmx = 0, tmy = 0;
  let clock = 0, last = performance.now();
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(H / 5.5, W / 3.8);
    KX = Math.min(1, (W * 0.46) / (4.8 * S));
  }
  addEventListener("resize", resize); resize();
  addEventListener("pointermove", (e) => {
    tmx = e.clientX / innerWidth - 0.5; tmy = e.clientY / innerHeight - 0.5;
  });

  function project(p, ang, tilt, kx = 1) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const x = p[0] * ca + p[2] * sa, z = -p[0] * sa + p[2] * ca, y = p[1];
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const y2 = y * ct - z * st, z2 = y * st + z * ct;
    const f = 1 / (1 - z2 * 0.12);
    return [W / 2 + x * f * S * kx, H * CY - y2 * f * S, z2];
  }

  const px = new Float32Array(N), py = new Float32Array(N), fc = new Float32Array(N);
  const BUCKETS = 8, buckets = Array.from({ length: BUCKETS }, () => []);
  const headPulses = [];

  function drawHead(ang, tilt, t) {
    const ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let i = 0; i < N; i++) {
      const x0 = hx[i], y0 = hy[i], z0 = hz[i];
      const x = x0 * ca + z0 * sa, z = -x0 * sa + z0 * ca;
      const y2 = y0 * ct - z * st, z2 = y0 * st + z * ct;
      const f = 1 / (1 - z2 * 0.12);
      px[i] = W / 2 + x * f * S; py[i] = H * CY - y2 * f * S;
      // quanto la superficie guarda l'osservatore
      const az = -nx[i] * sa + nz[i] * ca;
      fc[i] = ny[i] * st + az * ct;
    }
    const alphaOf = (f, fade) => (0.035 + 0.5 * Math.pow(clamp((f + 0.1) / 1.1), 1.3)) * fade;

    buckets.forEach((b) => (b.length = 0));
    for (let e = 0; e < EL; e++) {
      const a = E[2 * e], b = E[2 * e + 1];
      const al = alphaOf((fc[a] + fc[b]) / 2, Math.min(nodeFade[a], nodeFade[b]));
      const bi = Math.min(BUCKETS - 1, Math.floor((al * BUCKETS) / 0.55));
      if (bi > 0) buckets[bi].push(a, b);
    }
    ctx.lineWidth = 0.8;
    for (let b = 1; b < BUCKETS; b++) {
      const arr = buckets[b];
      if (!arr.length) continue;
      ctx.strokeStyle = `rgba(${b > 5 ? DARK : INK},${(b * 0.55) / BUCKETS})`;
      ctx.beginPath();
      for (let n = 0; n < arr.length; n += 2) { ctx.moveTo(px[arr[n]], py[arr[n]]); ctx.lineTo(px[arr[n + 1]], py[arr[n + 1]]); }
      ctx.stroke();
    }
    // neuroni: più grandi e scuri sul lato rivolto verso l'osservatore, alcuni pulsano
    for (let i = 0; i < N; i++) {
      const f = fc[i];
      if (f < -0.05) continue;
      const fade = nodeFade[i], front = clamp(f);
      const glow = 0.5 + 0.5 * Math.sin(t * 1.4 + i * 2.3);
      const lit = glow > 0.93 ? 1 : 0;
      ctx.fillStyle = `rgba(${INK},${Math.min(1, (0.25 + 0.6 * front + lit * 0.4) * fade)})`;
      ctx.beginPath(); ctx.arc(px[i], py[i], (0.9 + 1.6 * front) * (1 + lit * 0.5), 0, 7); ctx.fill();
    }

    // impulsi che viaggiano lungo le connessioni
    if (!paused && headPulses.length < 22 && Math.random() < 0.25) {
      const e = (Math.random() * EL) | 0;
      if (fc[E[2 * e]] > 0.15) headPulses.push({ a: E[2 * e], b: E[2 * e + 1], p: 0, v: 0.02 + Math.random() * 0.03 });
    }
    for (let i = headPulses.length - 1; i >= 0; i--) {
      const q = headPulses[i];
      if (!paused) q.p += q.v;
      if (q.p >= 1) { headPulses.splice(i, 1); continue; }
      const x = lerp(px[q.a], px[q.b], q.p), y = lerp(py[q.a], py[q.b], q.p);
      const k = clamp(fc[q.a]) * nodeFade[q.a];
      const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
      g.addColorStop(0, `rgba(${INK},${0.7 * k})`); g.addColorStop(1, `rgba(${INK},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
    }
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused) clock += dt;
    const t = clock;
    mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;
    ctx.clearRect(0, 0, W, H);

    /* rete laterale: quasi ferma, con leggero parallasse */
    const np = net.pts.map((p) => project(p, mx * 0.5, my * 0.2 + 0.05, KX));
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${INK},0.10)`;
    ctx.beginPath();
    for (const [a, b] of net.edges) { ctx.moveTo(np[a][0], np[a][1]); ctx.lineTo(np[b][0], np[b][1]); }
    ctx.stroke();
    if (!paused && net.pulses.length < 14 && Math.random() < 0.08) {
      net.pulses.push({ e: net.edges[(Math.random() * net.edges.length) | 0], p: 0, v: 0.006 + Math.random() * 0.008 });
    }
    net.pulses = net.pulses.filter((q) => (paused ? q.p : (q.p += q.v)) < 1);
    for (const q of net.pulses) {
      const [a, b] = q.e;
      const x = lerp(np[a][0], np[b][0], q.p), y = lerp(np[a][1], np[b][1], q.p);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, `rgba(${INK},0.55)`); g.addColorStop(1, `rgba(${INK},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
    }
    np.forEach((p, i) => {
      const glow = 0.5 + 0.5 * Math.sin(t * 1.2 + i);
      ctx.fillStyle = `rgba(${INK},${0.35 + glow * 0.3})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill();
    });

    /* testa */
    drawHead(t * 0.3 + 0.7 + mx * 0.8, 0.05 + my * 0.2, t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
