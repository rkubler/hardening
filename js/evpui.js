/*
 * Page logic shared by the elastoviscoplastic simulators EVP1–EVP5 and PB-EVP1–PB-EVP6.
 * EVPPage({ mat, models(m) -> [{ name, make() }], tests: ['rates', 'creep', ...], defaults: { field: value },
 *           check(m, test, v), extra: { relaxRef(m, v, s0) -> pts, creepRate(m, s) -> analytic rate },
 *           thermal(m) -> [{ name, make(T) }]   (tests 'temps' and 'zener'),
 *           zener: { Q(m) (J/mol), ss(m, rate, T) -> steady flow stress },  dstrain: strain step of the ramps })
 * Needs plot.js, ui.js and evp.js. The page holds #stats, #p1, #p2 (+ caps, tips), #matFields, #testSel, ...
 */
(function (root) {
  "use strict";
  const V = () => root.Viscoplastic;
  const $ = (id) => document.getElementById(id);
  const COLS = () => ["--s1", "--s2", "--s3", "--s4"].map(UI.color);
  const DASH = [null, "7 4", "2 3"];
  const lg = (x) => Math.log10(x);
  const fmtRate = (r) => { const e = Math.floor(lg(r) + 1e-9), mant = r / Math.pow(10, e); return Math.abs(mant - 1) < 1e-6 ? `1e${e}` : r.toPrecision(2); };
  const sweep = (a, b, n) => { const out = []; for (let i = 0; i < n; i++) out.push(Math.pow(10, lg(a) + (lg(b) - lg(a)) * i / (n - 1))); return out; };

  const TESTS = {
    rates: (d) => ({ label: "Tension at several strain rates", desc: "Strain-controlled tension to εmax at three constant strain rates. The second plot sweeps the rate from ε̇1 to ε̇3.",
      spec: [{ id: "emax", label: "ε<sub>max</sub>", name: "εmax", unit: "%", value: d.emax ?? 2, gt: 0, max: 50 },
             { id: "r1", label: "ε̇<sub>1</sub>", name: "ε̇1", unit: "1/s", value: d.r1 ?? 1e-5, gt: 0, max: 1e10 },
             { id: "r2", label: "ε̇<sub>2</sub>", name: "ε̇2", unit: "1/s", value: d.r2 ?? 1e-3, gt: 0, max: 1e10 },
             { id: "r3", label: "ε̇<sub>3</sub>", name: "ε̇3", unit: "1/s", value: d.r3 ?? 1e-1, gt: 0, max: 1e10 }],
      check: (v) => (v.r1 < v.r2 && v.r2 < v.r3 ? null : "Give the three rates in increasing order.") }),
    creep: (d) => ({ label: "Creep (constant stress)", desc: "Loading at a constant stress rate to σ, then the stress is held constant. Three stress levels.",
      spec: [{ id: "c1", label: "σ<sub>1</sub>", name: "σ1", unit: "MPa", value: d.c1 ?? 150, gt: 0 },
             { id: "c2", label: "σ<sub>2</sub>", name: "σ2", unit: "MPa", value: d.c2 ?? 200, gt: 0 },
             { id: "c3", label: "σ<sub>3</sub>", name: "σ3", unit: "MPa", value: d.c3 ?? 250, gt: 0 },
             { id: "csr", label: "Loading rate", name: "Loading rate", unit: "MPa/s", value: d.csr ?? 100, gt: 0 },
             { id: "ct", label: "Hold time", name: "Hold time", unit: "s", value: d.ct ?? 3600, gt: 0, max: 1e9 }],
      check: (v) => (v.c1 < v.c2 && v.c2 < v.c3 ? null : "Give the three stresses in increasing order.") }),
    relax: (d) => ({ label: "Relaxation (constant strain)", desc: "Loading at a constant strain rate to ε0, then the strain is held constant.",
      spec: [{ id: "e0", label: "ε<sub>0</sub>", name: "ε0", unit: "%", value: d.e0 ?? 1, gt: 0, max: 50 },
             { id: "rr", label: "Loading rate", name: "Loading rate", unit: "1/s", value: d.rr ?? 1e-3, gt: 0, max: 1e6 },
             { id: "rt", label: "Hold time", name: "Hold time", unit: "s", value: d.rt ?? 3600, gt: 0, max: 1e9 }] }),
    cycles: (d) => ({ label: "Strain cycles at two rates", desc: "Symmetric strain cycles ±εa at a slow and a fast strain rate, with an optional hold at each peak.",
      spec: [{ id: "ea", label: "ε<sub>a</sub>", name: "εa", unit: "%", value: d.ea ?? 0.5, gt: 0, max: 10 },
             { id: "q1", label: "Slow rate", name: "Slow rate", unit: "1/s", value: d.q1 ?? 1e-5, gt: 0, max: 1e6 },
             { id: "q2", label: "Fast rate", name: "Fast rate", unit: "1/s", value: d.q2 ?? 1e-2, gt: 0, max: 1e6 },
             { id: "qN", label: "Cycles", name: "Cycles", unit: "", value: d.qN ?? 5, min: 1, max: 100 },
             { id: "qh", label: "Hold at peaks", name: "Hold time", unit: "s", value: d.qh ?? 0, min: 0, max: 1e7 }],
      check: (v) => (v.q1 < v.q2 ? null : "The slow rate must be smaller than the fast rate.") }),
    temps: (d) => ({ label: "Tension at several temperatures", desc: "Strain-controlled tension to εmax at three temperatures, at the slow rate. The second plot sweeps the temperature from T1 to T3 at both rates.",
      spec: [{ id: "emax", label: "ε<sub>max</sub>", name: "εmax", unit: "%", value: d.emax ?? 20, gt: 0, max: 100 },
             { id: "T1", label: "T<sub>1</sub>", name: "T1", unit: "K", value: d.T1 ?? 77, gt: 0 },
             { id: "T2", label: "T<sub>2</sub>", name: "T2", unit: "K", value: d.T2 ?? 300, gt: 0 },
             { id: "T3", label: "T<sub>3</sub>", name: "T3", unit: "K", value: d.T3 ?? 600, gt: 0 },
             { id: "tr1", label: "Slow rate", name: "Slow rate", unit: "1/s", value: d.tr1 ?? 1e-3, gt: 0, max: 1e10 },
             { id: "tr2", label: "Fast rate", name: "Fast rate", unit: "1/s", value: d.tr2 ?? 1e3, gt: 0, max: 1e10 }],
      check: (v) => (!(v.T1 < v.T2 && v.T2 < v.T3) ? "Give the three temperatures in increasing order." : v.tr1 >= v.tr2 ? "The slow rate must be smaller than the fast rate." : null) }),
    jump: (d) => ({ label: "Strain-rate jump test", desc: "Tension at the slow rate to ε1, at the fast rate to ε2, then again at the slow rate to ε3, compared with monotonic tension at each rate.",
      spec: [{ id: "ja", label: "Slow rate", name: "Slow rate", unit: "1/s", value: d.ja ?? 1e-3, gt: 0, max: 1e10 },
             { id: "jb", label: "Fast rate", name: "Fast rate", unit: "1/s", value: d.jb ?? 1e3, gt: 0, max: 1e10 },
             { id: "j1", label: "ε<sub>1</sub> (up-jump)", name: "ε1", unit: "%", value: d.j1 ?? 10, gt: 0, max: 100 },
             { id: "j2", label: "ε<sub>2</sub> (down-jump)", name: "ε2", unit: "%", value: d.j2 ?? 20, gt: 0, max: 100 },
             { id: "j3", label: "ε<sub>3</sub> (end)", name: "ε3", unit: "%", value: d.j3 ?? 30, gt: 0, max: 100 }],
      check: (v) => (v.ja >= v.jb ? "The slow rate must be smaller than the fast rate." : !(v.j1 < v.j2 && v.j2 < v.j3) ? "Give ε1 < ε2 < ε3." : null) }),
    zener: (d) => ({ label: "Steady flow stress and Zener–Hollomon parameter", desc: "Tension to εmax (long enough to reach the steady state) at several rates and three temperatures. The second plot uses Z = ε̇ exp(Q/RT).",
      spec: [{ id: "emax", label: "ε<sub>max</sub>", name: "εmax", unit: "%", value: d.emax ?? 50, gt: 0, max: 200 },
             { id: "z1", label: "Lowest rate", name: "Lowest rate", unit: "1/s", value: d.z1 ?? 1e-3, gt: 0, max: 1e6 },
             { id: "z2", label: "Highest rate", name: "Highest rate", unit: "1/s", value: d.z2 ?? 10, gt: 0, max: 1e6 },
             { id: "T1", label: "T<sub>1</sub>", name: "T1", unit: "K", value: d.T1 ?? 573, gt: 0 },
             { id: "T2", label: "T<sub>2</sub>", name: "T2", unit: "K", value: d.T2 ?? 673, gt: 0 },
             { id: "T3", label: "T<sub>3</sub>", name: "T3", unit: "K", value: d.T3 ?? 773, gt: 0 }],
      check: (v) => (!(v.T1 < v.T2 && v.T2 < v.T3) ? "Give the three temperatures in increasing order." : v.z1 >= v.z2 ? "The lowest rate must be smaller than the highest rate." : null) }),
    ratchet: (d) => ({ label: "Stress cycles at two rates (ratcheting)", desc: "Cycles between σmax and σmin at a slow and a fast stress rate, starting in tension.",
      spec: [{ id: "smax", label: "σ<sub>max</sub>", name: "σmax", unit: "MPa", value: d.smax ?? 350 },
             { id: "smin", label: "σ<sub>min</sub>", name: "σmin", unit: "MPa", value: d.smin ?? -250 },
             { id: "w1", label: "Slow rate", name: "Slow rate", unit: "MPa/s", value: d.w1 ?? 1, gt: 0 },
             { id: "w2", label: "Fast rate", name: "Fast rate", unit: "MPa/s", value: d.w2 ?? 1000, gt: 0 },
             { id: "wN", label: "Cycles", name: "Cycles", unit: "", value: d.wN ?? 20, min: 1, max: 200 }],
      check: (v) => (v.smax <= v.smin ? "σmax must be greater than σmin." : v.w1 >= v.w2 ? "The slow rate must be smaller than the fast rate." : null) }),
  };

  function EVPPage(cfg) {
    const d = cfg.defaults || {};
    const tests = {};
    cfg.tests.forEach((k) => { tests[k] = TESTS[k](d); });
    const p1 = $("p1"), p1Tip = $("p1Tip"), p1Cap = $("p1Cap"), p2 = $("p2"), p2Tip = $("p2Tip"), p2Cap = $("p2Cap");
    const VP = V();
    // style: one model -> colour by level; several models -> colour by model, dash by level
    const style = (nm, i, k) => (nm === 1 ? { color: COLS()[k], dash: null } : { color: COLS()[i], dash: DASH[k] });
    const lab = (models, i, txt) => (models.length === 1 ? txt : `${models[i].name}, ${txt}`);

    UI.page({
      mat: cfg.mat, tests,
      check: cfg.check,
      run(m, test, v) {
        const models = cfg.models(m), P = VP.programs, statsEl = $("stats");
        const ro = cfg.dstrain ? { strainStep: cfg.dstrain } : {};
        const run = (i, prog, opts) => VP.runVP(models[i].make(), prog, Object.assign({}, ro, opts));
        const runM = (mk, prog) => VP.runVP(mk(), prog, ro);
        const sigAt = (r, e) => { const h = r.hist; for (let j = 1; j < h.length; j++) if (h[j].eps >= e) { const a = h[j - 1], b = h[j]; return a.sig + (b.sig - a.sig) * (e - a.eps) / (b.eps - a.eps || 1); } return h[h.length - 1].sig; };
        const s1 = [], s2 = [], tiles = [];
        if (test === "rates") {
          const rates = [v.r1, v.r2, v.r3], e = v.emax / 100;
          models.forEach((md, i) => rates.forEach((rt, k) => {
            const r = run(i, P.tension(e, rt));
            s1.push(Object.assign({ name: lab(models, i, `ε̇ = ${fmtRate(rt)} /s`), pts: r.hist.map((h) => [100 * h.eps, h.sig]) }, style(models.length, i, k)));
          }));
          const sw = sweep(v.r1, v.r3, 9);
          models.forEach((md, i) => {
            const pts = sw.map((rt) => { const r = run(i, P.tension(e, rt)); return [lg(rt), r.ends[0].sig]; });
            s2.push({ name: md.name, pts, color: COLS()[i], marks: pts.map((_, j) => j) });
            const msr = Math.log(pts[pts.length - 1][1] / pts[0][1]) / Math.log(v.r3 / v.r1);
            tiles.push({ label: `${models.length > 1 ? md.name + ": σ" : "σ"} at εmax, ε̇1 → ε̇3`, value: `${Math.round(pts[0][1])} → ${Math.round(pts[pts.length - 1][1])} MPa` });
            tiles.push({ label: `${models.length > 1 ? md.name + ": r" : "R"}ate sensitivity d ln σ / d ln ε̇`, value: UI.fix(msr, 3) });
          });
          p1Cap.textContent = "Stress–strain curves at the three strain rates";
          Plot.draw(p1, p1Tip, { xlabel: "Strain (%)", ylabel: "Stress (MPa)", xzero: true, series: s1,
            tip: (n, x, y) => `${n}: ε ${x.toFixed(3)} %, σ ${Math.round(y)} MPa` });
          p2Cap.textContent = `Stress at ε = ${v.emax} % against the strain rate (log scale)`;
          Plot.draw(p2, p2Tip, { xlabel: "log₁₀ strain rate (1/s)", ylabel: "Stress at εmax (MPa)", yzero: false, series: s2,
            tip: (n, x, y) => `${n}: ε̇ ${fmtRate(Math.pow(10, x))} /s, σ ${Math.round(y)} MPa` });
        } else if (test === "creep") {
          const lv = [v.c1, v.c2, v.c3];
          models.forEach((md, i) => lv.forEach((sg, k) => {
            const r = run(i, P.creep(sg, v.csr, v.ct)), st = style(models.length, i, k);
            const hold = r.hist.filter((h) => h.seg === 1);
            const base = r.ends[0];
            s1.push(Object.assign({ name: lab(models, i, `σ = ${sg} MPa`), pts: [[0, 100 * base.eps]].concat(hold.map((h) => [h.th, 100 * h.eps])) }, st));
            s2.push(Object.assign({ name: lab(models, i, `σ = ${sg} MPa`), pts: hold.filter((h) => h.rate > 1e-14 && h.th > 0).map((h) => [lg(h.th), lg(h.rate)]) }, st));
            const end = r.ends[1];
            if (i === 0 || models.length > 1) {
              const ref = cfg.extra && cfg.extra.creepRate ? cfg.extra.creepRate(m, sg) : null;
              tiles.push({ label: `${lab(models, i, `σ = ${sg} MPa`)}: creep strain, final rate`,
                value: `${UI.fix(100 * (end.eps - base.eps), 3)} %, ${end.rate > 1e-10 ? end.rate.toExponential(2) : "0"} /s` + (ref !== null ? ` (Norton: ${ref.toExponential(2)})` : "") });
            }
          }));
          p1Cap.textContent = "Creep: strain against time during the hold";
          Plot.draw(p1, p1Tip, { xlabel: "Time during the hold (s)", ylabel: "Strain (%)", xzero: true, series: s1,
            tip: (n, x, y) => `${n}: t ${x.toPrecision(3)} s, ε ${y.toFixed(3)} %` });
          p2Cap.textContent = "Plastic strain rate against time, both on log scales (no line: the material does not creep)";
          Plot.draw(p2, p2Tip, { xlabel: "log₁₀ time during the hold (s)", ylabel: "log₁₀ plastic strain rate (1/s)", yzero: false, series: s2,
            tip: (n, x, y) => `${n}: t ${Math.pow(10, x).toPrecision(3)} s, ε̇p ${Math.pow(10, y).toExponential(2)} /s` });
        } else if (test === "relax") {
          const e0 = v.e0 / 100;
          models.forEach((md, i) => {
            const r = run(i, P.relaxation(e0, v.rr, v.rt)), st = { color: COLS()[i], dash: null };
            const hold = r.hist.filter((h) => h.seg === 1 && h.th > 0);
            s1.push(Object.assign({ name: md.name, pts: hold.map((h) => [lg(h.th), h.sig]) }, st));
            s2.push(Object.assign({ name: md.name, pts: r.hist.map((h) => [100 * h.eps, h.sig]) }, st));
            const s0 = r.ends[0].sig, sEnd = r.ends[1].sig;
            tiles.push({ label: `${models.length > 1 ? md.name + ": s" : "S"}tress at the start and end of the hold`, value: `${Math.round(s0)} → ${Math.round(sEnd)} MPa` });
            if (cfg.extra && cfg.extra.relaxRef && i === 0) {
              const ref = cfg.extra.relaxRef(m, v, s0, hold.map((h) => h.th));
              if (ref) s1.push({ name: ref.name, pts: ref.pts, color: UI.color("--ink2"), dash: "6 4", noTip: false });
            }
          });
          p1Cap.textContent = "Relaxation: stress against time during the hold (log scale)";
          Plot.draw(p1, p1Tip, { xlabel: "log₁₀ time during the hold (s)", ylabel: "Stress (MPa)", series: s1,
            tip: (n, x, y) => `${n}: t ${Math.pow(10, x).toPrecision(3)} s, σ ${y.toFixed(1)} MPa` });
          p2Cap.textContent = "Stress–strain path: loading, then the vertical drop during the hold";
          Plot.draw(p2, p2Tip, { xlabel: "Strain (%)", ylabel: "Stress (MPa)", xzero: true, series: s2,
            tip: (n, x, y) => `${n}: ε ${x.toFixed(3)} %, σ ${Math.round(y)} MPa` });
        } else if (test === "cycles") {
          const rates = [v.q1, v.q2], ea = v.ea / 100, N = Math.round(v.qN);
          models.forEach((md, i) => rates.forEach((rt, k) => {
            const r = run(i, P.strainCycles(ea, rt, N, v.qh)), st = style(models.length, i, k);
            const nm = lab(models, i, `ε̇ = ${fmtRate(rt)} /s`);
            s1.push(Object.assign({ name: nm, pts: r.hist.map((h) => [100 * h.eps, h.sig]), width: 1.6 }, st));
            const mx = UI.peaks(r.ends, "max", "sig");
            s2.push(Object.assign({ name: nm, pts: mx.map((s, j) => [j + 1, s]), marks: mx.map((_, j) => j) }, st));
            const mn = UI.peaks(r.ends, "min", "sig");
            tiles.push({ label: `${nm}: stress range, last cycle`, value: `${Math.round(mx[mx.length - 1] - mn[mn.length - 1])} MPa` });
            if (v.qh > 0) {
              const dw = r.ends.filter((e) => e.label === "dwell+").map((e) => e.sig);
              tiles.push({ label: `${nm}: relaxation in the last hold`, value: `${Math.round(mx[mx.length - 1] - dw[dw.length - 1])} MPa` });
            }
          }));
          p1Cap.textContent = "Stress–strain loops at the slow and the fast rate";
          Plot.draw(p1, p1Tip, { xlabel: "Strain (%)", ylabel: "Stress (MPa)", series: s1,
            tip: (n, x, y) => `${n}: ε ${x.toFixed(3)} %, σ ${Math.round(y)} MPa` });
          p2Cap.textContent = "Peak tensile stress in each cycle";
          Plot.draw(p2, p2Tip, { xlabel: "Cycle (0 = first loading)", ylabel: "σmax (MPa)", yzero: false, series: s2.map((s) => Object.assign(s, { pts: s.pts.map((p) => [p[0] - 1, p[1]]) })),
            tip: (n, x, y) => `${n}, cycle ${x}: ${Math.round(y)} MPa` });
        } else if (test === "temps") {
          const mats = cfg.thermal(m), Ts = [v.T1, v.T2, v.T3], e = v.emax / 100;
          mats.forEach((mt, i) => Ts.forEach((T, k) => {
            const r = runM(() => mt.make(T), P.tension(e, v.tr1));
            s1.push(Object.assign({ name: lab(mats, i, `T = ${T} K`), pts: r.hist.map((h) => [100 * h.eps, h.sig]) }, style(mats.length, i, k)));
          }));
          const tw = []; for (let j = 0; j < 9; j++) tw.push(v.T1 + (v.T3 - v.T1) * j / 8);
          mats.forEach((mt, i) => {
            const at = [v.tr1, v.tr2].map((rt) => tw.map((T) => [T, runM(() => mt.make(T), P.tension(e, rt)).ends[0].sig]));
            at.forEach((pts, k) => s2.push({ name: lab(mats, i, `ε̇ = ${fmtRate([v.tr1, v.tr2][k])} /s`), pts, color: COLS()[mats.length === 1 ? k : i], dash: mats.length === 1 ? null : DASH[k], marks: pts.map((_, j) => j) }));
            const pre = mats.length > 1 ? mt.name + ": " : "";
            tiles.push({ label: `${pre}σ at εmax, T1 → T3 (slow rate)`, value: `${Math.round(at[0][0][1])} → ${Math.round(at[0][8][1])} MPa` });
            tiles.push({ label: `${pre}fast / slow rate, at T1 and T3`, value: `${UI.fix(at[1][0][1] / at[0][0][1], 3)} and ${UI.fix(at[1][8][1] / at[0][8][1], 3)}` });
          });
          p1Cap.textContent = `Stress–strain curves at three temperatures, ε̇ = ${fmtRate(v.tr1)} /s`;
          Plot.draw(p1, p1Tip, { xlabel: "Strain (%)", ylabel: "Stress (MPa)", xzero: true, series: s1,
            tip: (n, x, y) => `${n}: ε ${x.toFixed(2)} %, σ ${Math.round(y)} MPa` });
          p2Cap.textContent = `Stress at ε = ${v.emax} % against the temperature, at both rates`;
          Plot.draw(p2, p2Tip, { xlabel: "Temperature (K)", ylabel: "Stress at εmax (MPa)", yzero: true, series: s2,
            tip: (n, x, y) => `${n}: T ${Math.round(x)} K, σ ${Math.round(y)} MPa` });
        } else if (test === "jump") {
          const ms = models.slice(0, 2), e1 = v.j1 / 100, e2 = v.j2 / 100, e3 = v.j3 / 100;
          ms.forEach((md, i) => {
            const c = COLS()[i], pre = ms.length > 1 ? md.name + ": " : "";
            const rj = run(i, P.jump(e1, e2, e3, v.ja, v.jb));
            const ra = run(i, P.tension(e3, v.ja)), rb = run(i, P.tension(e3, v.jb));
            s1.push({ name: `${pre}jump test`, pts: rj.hist.map((h) => [100 * h.eps, h.sig]), color: c, width: 2.2 });
            s1.push({ name: `${pre}monotonic, ${fmtRate(v.ja)} /s`, pts: ra.hist.map((h) => [100 * h.eps, h.sig]), color: c, dash: "2 3" });
            s1.push({ name: `${pre}monotonic, ${fmtRate(v.jb)} /s`, pts: rb.hist.map((h) => [100 * h.eps, h.sig]), color: c, dash: "7 4" });
            const jb = rj.ends[1].sig, mb = sigAt(rb, e2), ja = rj.ends[2].sig, ma = sigAt(ra, e3);
            tiles.push({ label: `${pre}at ε2: jump test / monotonic fast`, value: `${Math.round(jb)} / ${Math.round(mb)} MPa` });
            tiles.push({ label: `${pre}at ε3: jump test / monotonic slow`, value: `${Math.round(ja)} / ${Math.round(ma)} MPa` });
            [ra, rb].forEach((r, k) => {   // hardening rate θ = dσ/dεp against σ (Kocks–Mecking plot)
              const pts = []; let last = null;
              r.hist.forEach((h) => {
                if (h.p < 0.004) return;
                if (!last) { last = h; return; }
                if (h.p - last.p >= 0.004) { pts.push([0.5 * (h.sig + last.sig), (h.sig - last.sig) / (h.p - last.p)]); last = h; }
              });
              s2.push({ name: `${pre}${fmtRate([v.ja, v.jb][k])} /s`, pts: pts.filter((q) => q[1] > -1e5), color: c, dash: k ? "7 4" : null });
            });
          });
          p1Cap.textContent = "Strain-rate jump test (thick) and monotonic tension at both rates (dashed)";
          Plot.draw(p1, p1Tip, { xlabel: "Strain (%)", ylabel: "Stress (MPa)", xzero: true, series: s1,
            tip: (n, x, y) => `${n}: ε ${x.toFixed(2)} %, σ ${Math.round(y)} MPa` });
          p2Cap.textContent = "Hardening rate θ = dσ/dεp against the stress, monotonic tests (Kocks–Mecking plot)";
          Plot.draw(p2, p2Tip, { xlabel: "Stress (MPa)", ylabel: "θ = dσ/dεp (MPa)", xzero: true, yzero: true, series: s2,
            tip: (n, x, y) => `${n}: σ ${Math.round(x)} MPa, θ ${Math.round(y)} MPa` });
        } else if (test === "zener") {
          const mats = cfg.thermal(m).slice(0, 1), Ts = [v.T1, v.T2, v.T3], e = v.emax / 100, Q = cfg.zener.Q(m);
          const rates = sweep(v.z1, v.z2, 7), all = [];
          Ts.forEach((T, k) => {
            const pts = rates.map((rt) => [lg(rt), runM(() => mats[0].make(T), P.tension(e, rt)).ends[0].sig]);
            s1.push({ name: `T = ${T} K`, pts, color: COLS()[k], marks: pts.map((_, j) => j) });
            const ref = sweep(v.z1, v.z2, 40).map((rt) => [lg(rt), cfg.zener.ss(m, rt, T)]);
            s1.push({ name: `Garofalo, T = ${T} K`, pts: ref, color: COLS()[k], dash: "6 4" });
            const zp = pts.map((q) => [q[0] + Q / (VP.Rgas * T) / Math.LN10, q[1]]);
            s2.push({ name: `T = ${T} K`, pts: zp, color: COLS()[k], marks: zp.map((_, j) => j) });
            zp.forEach((q) => all.push(q));
            tiles.push({ label: `T = ${T} K: steady σ, lowest → highest rate`, value: `${Math.round(pts[0][1])} → ${Math.round(pts[pts.length - 1][1])} MPa` });
          });
          const zl = all.map((q) => q[0]), z0 = Math.min.apply(null, zl), z1 = Math.max.apply(null, zl), ref = [];
          for (let j = 0; j <= 40; j++) { const lz = z0 + (z1 - z0) * j / 40, T = v.T2; ref.push([lz, cfg.zener.ss(m, Math.pow(10, lz) * Math.exp(-Q / (VP.Rgas * T)), T)]); }
          s2.push({ name: "Garofalo: σ = asinh[(Z/A)^(1/n)] / α", pts: ref, color: UI.color("--ink2"), dash: "6 4" });
          tiles.push({ label: "Activation energy Q, ln Z range", value: `${Math.round(Q / 1000)} kJ/mol, ${(z0 * Math.LN10).toFixed(1)} → ${(z1 * Math.LN10).toFixed(1)}` });
          p1Cap.textContent = `Stress at ε = ${v.emax} % against the strain rate at three temperatures (dashed: steady-state equation)`;
          Plot.draw(p1, p1Tip, { xlabel: "log₁₀ strain rate (1/s)", ylabel: "Flow stress (MPa)", yzero: true, series: s1,
            tip: (n, x, y) => `${n}: ε̇ ${fmtRate(Math.pow(10, x))} /s, σ ${Math.round(y)} MPa` });
          p2Cap.textContent = "The same points against log₁₀ Z = log₁₀[ε̇ exp(Q/RT)]: one master curve";
          Plot.draw(p2, p2Tip, { xlabel: "log₁₀ Z (1/s)", ylabel: "Flow stress (MPa)", yzero: true, series: s2,
            tip: (n, x, y) => `${n}: log₁₀ Z ${x.toFixed(2)}, σ ${Math.round(y)} MPa` });
        } else if (test === "ratchet") {
          const rates = [v.w1, v.w2], N = Math.round(v.wN);
          models.forEach((md, i) => rates.forEach((rt, k) => {
            const r = run(i, P.stressCycles(v.smax, v.smin, rt, N)), st = style(models.length, i, k);
            const nm = lab(models, i, `${rt} MPa/s`);
            s1.push(Object.assign({ name: nm, pts: r.hist.map((h) => [100 * h.eps, h.sig]), width: 1.4 }, st));
            const mx = UI.peaks(r.ends, "max", "eps").map((e) => 100 * e);
            s2.push(Object.assign({ name: nm, pts: mx.map((e, j) => [j + 1, e]) }, st));
            const n = mx.length;
            tiles.push({ label: `${nm}: strain at σmax, last-cycle rate`, value: `${mx[n - 1].toFixed(2)} %, ${n > 1 ? UI.fix(mx[n - 1] - mx[n - 2], 4) : "—"} %/cyc` });
          }));
          p1Cap.textContent = "Stress–strain curves at the slow and the fast stress rate";
          Plot.draw(p1, p1Tip, { xlabel: "Strain (%)", ylabel: "Stress (MPa)", series: s1,
            tip: (n, x, y) => `${n}: ε ${x.toFixed(3)} %, σ ${Math.round(y)} MPa` });
          p2Cap.textContent = "Ratcheting: strain at σmax in each cycle";
          Plot.draw(p2, p2Tip, { xlabel: "Cycle", ylabel: "Strain at σmax (%)", yzero: true, series: s2,
            tip: (n, x, y) => `${n}, cycle ${x}: ${y.toFixed(3)} %` });
        }
        UI.stats(statsEl, tiles.slice(0, 6));
      },
    });
  }

  root.EVPPage = EVPPage;
})(this);
