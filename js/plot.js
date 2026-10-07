/* Minimal SVG line plots with nice ticks, legend and hover read-out. No dependencies. */
(function (root) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function niceStep(range, target) {
    const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const r = raw / mag;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  }
  function niceDomain(min, max, target, includeZero) {
    if (includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (max - min < 1e-12) { const d = Math.abs(max) * 0.1 || 1; min -= d; max += d; }
    const step = niceStep(max - min, target);
    const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(+v.toPrecision(12));
    return { min: lo, max: hi, ticks, step };
  }
  function fmt(v, step) {
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    if (Math.abs(v) < step * 1e-6) v = 0;
    return v.toFixed(Math.min(dec, 4));
  }

  /**
   * draw(svg, tipEl, cfg)
   * cfg = { xlabel, ylabel, xdomain?, ydomain?, xzero?, yzero?, height?,
   *         series: [{ name, pts: [[x, y], ...], color, dash, width, marks: [index], shape }],
   *         hlines: [{ y, color, dash, label }], tip: (seriesName, x, y) => string }
   */
  function draw(svg, tipEl, cfg) {
    svg._plot = { tipEl, cfg };
    const avail = (svg.parentNode && svg.parentNode.clientWidth) || 720;
    const W = Math.max(300, Math.min(Math.round(avail), 980));
    const H = cfg.height || Math.round(Math.max(230, Math.min(320, W * 0.42)));
    const L = 66, R = 16, T = 14, B = 46;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = "";
    const INK2 = css("--ink2"), GRID = css("--grid"), RULE = css("--rule"), PANEL = css("--panel"), INK = css("--ink");
    let xs = [], ys = [];
    cfg.series.forEach((s) => s.pts.forEach((p) => { if (isFinite(p[0]) && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); } }));
    (cfg.hlines || []).forEach((h) => ys.push(h.y));
    const minmax = (a) => a.reduce((m, v) => [Math.min(m[0], v), Math.max(m[1], v)], [Infinity, -Infinity]);
    const [x0, x1] = cfg.xdomain || minmax(xs), [y0, y1] = cfg.ydomain || minmax(ys);
    const xd = niceDomain(x0, x1, W < 520 ? 4 : 7, cfg.xzero), yd = niceDomain(y0, y1, W < 520 ? 5 : 6, cfg.yzero !== false);
    const X = (v) => L + (v - xd.min) / (xd.max - xd.min) * (W - L - R);
    const Y = (v) => H - B - (v - yd.min) / (yd.max - yd.min) * (H - T - B);

    xd.ticks.forEach((v) => {
      el("line", { x1: X(v), x2: X(v), y1: T, y2: H - B, stroke: GRID }, svg);
      el("text", { x: X(v), y: H - B + 18, "text-anchor": "middle", "font-size": 12, fill: INK2 }, svg).textContent = fmt(v, xd.step);
    });
    yd.ticks.forEach((v) => {
      el("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: GRID }, svg);
      el("text", { x: L - 8, y: Y(v) + 4, "text-anchor": "end", "font-size": 12, fill: INK2 }, svg).textContent = fmt(v, yd.step);
    });
    if (yd.min < 0 && yd.max > 0) el("line", { x1: L, x2: W - R, y1: Y(0), y2: Y(0), stroke: RULE, "stroke-width": 1.2 }, svg);
    if (xd.min < 0 && xd.max > 0) el("line", { x1: X(0), x2: X(0), y1: T, y2: H - B, stroke: RULE, "stroke-width": 1.2 }, svg);
    el("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "none", stroke: RULE }, svg);
    el("text", { x: (L + W - R) / 2, y: H - 8, "text-anchor": "middle", "font-size": 12.5, fill: INK2 }, svg).textContent = cfg.xlabel;
    const yc = (T + H - B) / 2;
    el("text", { x: 16, y: yc, "text-anchor": "middle", "font-size": 12.5, fill: INK2, transform: `rotate(-90 16 ${yc})` }, svg).textContent = cfg.ylabel;

    const clip = "clip" + Math.random().toString(36).slice(2, 8);
    const defs = el("defs", {}, svg);
    el("rect", { x: L, y: T, width: W - L - R, height: H - T - B }, el("clipPath", { id: clip }, defs));
    const g = el("g", { "clip-path": `url(#${clip})` }, svg);

    (cfg.hlines || []).forEach((h) => {
      el("line", { x1: L, x2: W - R, y1: Y(h.y), y2: Y(h.y), stroke: h.color || INK2, "stroke-width": 1.5, "stroke-dasharray": h.dash || "6 4" }, g);
      if (h.label) {
        const tx = el("text", { x: W - R - 6, y: Y(h.y) - 6, "text-anchor": "end", "font-size": 12, fill: INK2 }, svg);
        tx.textContent = h.label;
        tx.setAttribute("style", `paint-order:stroke;stroke:${PANEL};stroke-width:4px`);
      }
    });
    const shape = (s, x, y, c) => (s === 1
      ? el("polygon", { points: `${x},${y - 6} ${x + 6},${y + 5} ${x - 6},${y + 5}`, fill: c, stroke: PANEL, "stroke-width": 2 }, svg)
      : s === 2 ? el("rect", { x: x - 5, y: y - 5, width: 10, height: 10, rx: 1, fill: c, stroke: PANEL, "stroke-width": 2 }, svg)
      : el("circle", { cx: x, cy: y, r: 5, fill: c, stroke: PANEL, "stroke-width": 2 }, svg));
    cfg.series.forEach((s) => {
      const pts = s.pts.filter((p) => isFinite(p[0]) && isFinite(p[1]));
      if (!pts.length) return;
      el("polyline", { points: pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" "), fill: "none",
        stroke: s.color, "stroke-width": s.width || 2, "stroke-linejoin": "round", "stroke-linecap": "round",
        "stroke-dasharray": s.dash || "none" }, g);
      (s.marks || []).forEach((i) => { const p = s.pts[i < 0 ? s.pts.length + i : i]; if (p) shape(s.shape || 0, X(p[0]), Y(p[1]), s.color); });
    });

    const dot = el("circle", { r: 4, fill: "none", stroke: INK, "stroke-width": 1.5, visibility: "hidden" }, svg);
    const hide = () => { dot.setAttribute("visibility", "hidden"); if (tipEl) tipEl.style.display = "none"; };
    svg.onmousemove = (ev) => {
      if (!tipEl) return;
      const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width, sy = (ev.clientY - r.top) * H / r.height;
      let best = null, bd = 1e9;
      cfg.series.forEach((s) => { if (s.noTip) return; s.pts.forEach((p) => { const d = (X(p[0]) - sx) ** 2 + (Y(p[1]) - sy) ** 2; if (d < bd) { bd = d; best = { s, p }; } }); });
      if (!best || bd > 900) return hide();
      dot.setAttribute("cx", X(best.p[0])); dot.setAttribute("cy", Y(best.p[1])); dot.setAttribute("visibility", "visible");
      tipEl.textContent = cfg.tip ? cfg.tip(best.s.name, best.p[0], best.p[1]) : `${best.s.name}: ${best.p[0].toPrecision(4)}, ${best.p[1].toPrecision(4)}`;
      tipEl.style.display = "block";
      const px = X(best.p[0]) * r.width / W, py = Y(best.p[1]) * r.height / H;
      tipEl.style.left = Math.max(0, Math.min(px + 12, r.width - tipEl.offsetWidth - 4)) + "px";
      tipEl.style.top = Math.max(py - 36, 0) + "px";
    };
    svg.onmouseleave = hide;
    const lg = svg.parentNode && svg.parentNode.querySelector(".legend");
    if (lg) legend(lg, cfg.series.length > 1 ? cfg.series.filter((s) => !s.noLegend).map((s) => ({ name: s.name, color: s.color, dash: !!s.dash })) : []);
  }

  /** Legend: items = [{ name, color, dash, shape }] */
  function legend(container, items) {
    const sym = ["border-radius:50%", "clip-path:polygon(50% 0,100% 100%,0 100%)", "border-radius:1px"];
    container.innerHTML = items.map((it) => it.dash
      ? `<span><span class="lg-line" style="border-top:2px dashed ${it.color}"></span>${it.name}</span>`
      : `<span><span class="lg-line" style="border-top:2px solid ${it.color}"></span>${it.name}</span>`).join("");
  }

  // redraw at the new width when the window is resized
  let timer = null;
  if (typeof window !== "undefined") window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => document.querySelectorAll("svg").forEach((s) => { if (s._plot) draw(s, s._plot.tipEl, s._plot.cfg); }), 150);
  });

  root.Plot = { draw, legend, css, niceDomain, fmt };
})(this);
