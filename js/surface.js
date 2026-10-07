/*
 * Yield surface and plastic strain path displays for tension–torsion.
 *
 * Stress plane (σ, √3 τ): the von Mises yield surface is a circle of radius σy + R
 * centred on the back stress (Xp, √3 Xq). Strain plane (εp, γp/√3): the plastic strain
 * increment is parallel to the outward normal of the circle (normality), so both plots
 * use equal axis scales and the flow arrow has the same angle in each.
 */
(function (root) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const S3 = Math.sqrt(3);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Build the panel inside container (a div). Returns a controller with update(models, sy). */
  function mount(container) {
    container.innerHTML = `
      <div class="surf">
        <h3 class="surf-title">Yield surface and plastic flow</h3>
        <div class="surf-ctrl">
          <label class="surf-model">Model <select></select></label>
          <button type="button" class="surf-play" aria-label="Play the loading history">Play</button>
          <input type="range" class="surf-step" min="0" max="1000" value="1000" step="1" aria-label="Loading step">
        </div>
        <p class="surf-read" aria-live="polite"></p>
        <div class="surf-grid">
          <div class="plotbox"><p class="cap">Stress plane (σ, √3 τ)</p><svg class="surf-ys" role="img" aria-label="Yield surface in the stress plane with the flow direction"></svg></div>
          <div class="plotbox"><p class="cap">Plastic strain path (ε<sup>p</sup>, γ<sup>p</sup>/√3)</p><svg class="surf-ps" role="img" aria-label="Plastic strain path with the current flow direction"></svg></div>
        </div>
        <p class="note surf-key"></p>
      </div>`;
    const sel = container.querySelector("select"), slider = container.querySelector(".surf-step");
    const play = container.querySelector(".surf-play"), read = container.querySelector(".surf-read");
    const ys = container.querySelector(".surf-ys"), ps = container.querySelector(".surf-ps");
    const key = container.querySelector(".surf-key");
    let models = [], sy = 0, anim = null;

    const draw = () => {
      const md = models[+sel.value];
      if (!md) return;
      const h = md.r.hist, n = h.length;
      const i = Math.round((+slider.value / 1000) * (n - 1));
      const cur = h[i];
      const Xs = cur.X.reduce((s, x) => [s[0] + x[0], s[1] + x[1]], [0, 0]);
      const k = sy + (cur.R || 0);
      const a1 = cur.sig - Xs[0], a2 = S3 * (cur.tau - Xs[1]);
      const J = Math.hypot(a1, a2) || 1;
      const plastic = i > 0 && cur.p > h[i - 1].p + 1e-12;
      const dir = [a1 / J, a2 / J];
      // stress plane: domain over the whole history (stable while scrubbing)
      let b1 = [Infinity, -Infinity, Infinity, -Infinity];
      h.forEach((s) => {
        const X = s.X.reduce((t, x) => [t[0] + x[0], t[1] + x[1]], [0, 0]), r = sy + (s.R || 0);
        b1 = [Math.min(b1[0], s.sig, X[0] - r), Math.max(b1[1], s.sig, X[0] + r), Math.min(b1[2], S3 * s.tau, S3 * X[1] - r), Math.max(b1[3], S3 * s.tau, S3 * X[1] + r)];
      });
      square(ys, b1, md.color, (g, X, Y, sc) => {
        el("circle", { cx: X(0), cy: Y(0), r: sy * sc, fill: "none", stroke: css("--ink2"), "stroke-width": 1, "stroke-dasharray": "4 4", opacity: 0.7 }, g);
        el("polyline", { points: h.map((s) => `${X(s.sig).toFixed(1)},${Y(S3 * s.tau).toFixed(1)}`).join(" "), fill: "none", stroke: css("--rule"), "stroke-width": 1 }, g);
        el("polyline", { points: h.slice(0, i + 1).map((s) => `${X(s.sig).toFixed(1)},${Y(S3 * s.tau).toFixed(1)}`).join(" "), fill: "none", stroke: css("--ink2"), "stroke-width": 1.2 }, g);
        el("circle", { cx: X(Xs[0]), cy: Y(S3 * Xs[1]), r: k * sc, fill: md.color, "fill-opacity": 0.08, stroke: md.color, "stroke-width": 2.2 }, g);
        const cx = X(Xs[0]), cy = Y(S3 * Xs[1]);
        el("path", { d: `M${cx - 5},${cy - 5}L${cx + 5},${cy + 5}M${cx - 5},${cy + 5}L${cx + 5},${cy - 5}`, stroke: md.color, "stroke-width": 2 }, g);
        el("line", { x1: X(0), y1: Y(0), x2: cx, y2: cy, stroke: md.color, "stroke-width": 1.2, "stroke-dasharray": "3 3" }, g);
        const px = X(cur.sig), py = Y(S3 * cur.tau);
        if (plastic) arrow(g, px, py, dir, true, md.color);
        el("circle", { cx: px, cy: py, r: 5, fill: css("--ink"), stroke: css("--panel"), "stroke-width": 2 }, g);
      }, "σ (MPa)", "√3 τ (MPa)");
      // plastic strain plane
      let b2 = [Infinity, -Infinity, Infinity, -Infinity];
      h.forEach((s) => { b2 = [Math.min(b2[0], 100 * s.epsp), Math.max(b2[1], 100 * s.epsp), Math.min(b2[2], 100 * s.gamp / S3), Math.max(b2[3], 100 * s.gamp / S3)]; });
      square(ps, b2, md.color, (g, X, Y) => {
        el("polyline", { points: h.map((s) => `${X(100 * s.epsp).toFixed(1)},${Y(100 * s.gamp / S3).toFixed(1)}`).join(" "), fill: "none", stroke: css("--rule"), "stroke-width": 1.2 }, g);
        el("polyline", { points: h.slice(0, i + 1).map((s) => `${X(100 * s.epsp).toFixed(1)},${Y(100 * s.gamp / S3).toFixed(1)}`).join(" "), fill: "none", stroke: md.color, "stroke-width": 2, "stroke-linejoin": "round" }, g);
        const px = X(100 * cur.epsp), py = Y(100 * cur.gamp / S3);
        if (plastic) arrow(g, px, py, dir, true, md.color);
        el("circle", { cx: px, cy: py, r: 5, fill: css("--ink"), stroke: css("--panel"), "stroke-width": 2 }, g);
      }, "εp (%)", "γp/√3 (%)");
      read.textContent = `Step ${i} of ${n - 1} · σ = ${Math.round(cur.sig)} MPa, τ = ${Math.round(cur.tau)} MPa · ` +
        `εp = ${(100 * cur.epsp).toFixed(3)} %, γp = ${(100 * cur.gamp).toFixed(3)} % · ` +
        (plastic ? "plastic flow along the normal" : "elastic: no plastic flow");
    };

    function arrow(g, x, y, d, active, color) {
      const L = 46;
      const x2 = x + L * d[0], y2 = y - L * d[1];
      el("line", { x1: x, y1: y, x2, y2, stroke: active ? color : css("--ink2"), "stroke-width": active ? 2.5 : 1.5,
        "stroke-dasharray": active ? "none" : "3 3", opacity: active ? 1 : 0.6 }, g);
      const ang = Math.atan2(-(y2 - y), x2 - x), s = 9;
      const p1 = [x2 - s * Math.cos(ang - 0.45), y2 + s * Math.sin(ang - 0.45)], p2 = [x2 - s * Math.cos(ang + 0.45), y2 + s * Math.sin(ang + 0.45)];
      el("polygon", { points: `${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`, fill: active ? color : css("--ink2"), opacity: active ? 1 : 0.6 }, g);
    }

    // equal-scale square plot; draws axes then calls body(g, X, Y, scale)
    function square(svg, b, color, body, xl, yl) {
      svg.innerHTML = "";
      const avail = (svg.parentNode && svg.parentNode.clientWidth) || 420;
      const Wd = Math.max(280, Math.min(Math.round(avail), 520)), Hd = Wd;
      const L = 58, R = 14, T = 12, B = 44;
      svg.setAttribute("viewBox", `0 0 ${Wd} ${Hd}`);
      const cxv = (b[0] + b[1]) / 2, cyv = (b[2] + b[3]) / 2;
      let span = Math.max(b[1] - b[0], b[3] - b[2]) * 1.12;
      if (!(span > 0)) span = 1;
      const pw = Wd - L - R, ph = Hd - T - B, side = Math.min(pw, ph);
      const x0 = L + (pw - side) / 2, y0 = T + (ph - side) / 2;
      const sc = side / span;
      const X = (v) => x0 + (v - (cxv - span / 2)) * sc;
      const Y = (v) => y0 + side - (v - (cyv - span / 2)) * sc;
      const ink2 = css("--ink2"), grid = css("--grid"), rule = css("--rule");
      const ticks = root.Plot.niceDomain(cxv - span / 2, cxv + span / 2, 5, false);
      const ticksY = root.Plot.niceDomain(cyv - span / 2, cyv + span / 2, 5, false);
      ticks.ticks.forEach((v) => { if (X(v) < x0 - 0.5 || X(v) > x0 + side + 0.5) return;
        el("line", { x1: X(v), x2: X(v), y1: y0, y2: y0 + side, stroke: grid }, svg);
        el("text", { x: X(v), y: y0 + side + 16, "text-anchor": "middle", "font-size": 11.5, fill: ink2 }, svg).textContent = root.Plot.fmt(v, ticks.step); });
      ticksY.ticks.forEach((v) => { if (Y(v) < y0 - 0.5 || Y(v) > y0 + side + 0.5) return;
        el("line", { x1: x0, x2: x0 + side, y1: Y(v), y2: Y(v), stroke: grid }, svg);
        el("text", { x: x0 - 6, y: Y(v) + 4, "text-anchor": "end", "font-size": 11.5, fill: ink2 }, svg).textContent = root.Plot.fmt(v, ticksY.step); });
      if (X(0) > x0 && X(0) < x0 + side) el("line", { x1: X(0), x2: X(0), y1: y0, y2: y0 + side, stroke: rule, "stroke-width": 1.2 }, svg);
      if (Y(0) > y0 && Y(0) < y0 + side) el("line", { x1: x0, x2: x0 + side, y1: Y(0), y2: Y(0), stroke: rule, "stroke-width": 1.2 }, svg);
      el("rect", { x: x0, y: y0, width: side, height: side, fill: "none", stroke: rule }, svg);
      el("text", { x: x0 + side / 2, y: Hd - 8, "text-anchor": "middle", "font-size": 12.5, fill: ink2 }, svg).textContent = xl;
      el("text", { x: 14, y: y0 + side / 2, "text-anchor": "middle", "font-size": 12.5, fill: ink2, transform: `rotate(-90 14 ${y0 + side / 2})` }, svg).textContent = yl;
      const id = "c" + Math.random().toString(36).slice(2, 8);
      el("rect", { x: x0, y: y0, width: side, height: side }, el("clipPath", { id }, el("defs", {}, svg)));
      body(el("g", { "clip-path": `url(#${id})` }, svg), X, Y, sc);
    }

    sel.addEventListener("change", draw);
    slider.addEventListener("input", () => { stop(); draw(); });
    const stop = () => { if (anim) { cancelAnimationFrame(anim); anim = null; play.textContent = "Play"; } };
    play.addEventListener("click", () => {
      if (anim) return stop();
      if (+slider.value >= 1000) slider.value = 0;
      play.textContent = "Pause";
      let last = performance.now();
      const tick = (t) => {
        const v = Math.min(1000, +slider.value + (t - last) / 10); // full history in about 10 s
        last = t; slider.value = v; draw();
        if (v >= 1000) return stop();
        anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    });
    let rt = null;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(draw, 150); });

    return {
      update(list, sigmaY, preferred) {
        stop();
        const prev = sel.value;
        models = list; sy = sigmaY;
        sel.innerHTML = list.map((m, i) => `<option value="${i}">${m.name}</option>`).join("");
        sel.value = prev && +prev < list.length ? prev : String(preferred === undefined ? list.length - 1 : preferred);
        slider.value = 1000;
        key.innerHTML = "Dashed circle: initial yield surface. Coloured circle: current yield surface, centred on the back stress (×). " +
          "The arrow is the outward normal at the stress point; the plastic strain increment follows the same direction in the right-hand plot. " +
          "Use the slider or Play to follow the loading history.";
        draw();
      },
    };
  }

  root.Surface = { mount };
})(this);
