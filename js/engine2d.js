/*
 * Tension–torsion engine for the microstructure-based and distortional models (D1–D3).
 *
 * Everything is written in the normalised plane where the von Mises surface is a circle:
 *   stress  v = (σ, √3 τ)        strain  e = (ε, γ/√3)        v·de = σ dε + τ dγ
 * Elasticity: v = D (e − ep) with D = diag(E, 3G).
 * Each law gives a yield function φ(u) − Y, where u = v − centre and φ is homogeneous of degree 1
 * (φ = |u| for von Mises). Flow is associated: dep = dp ∂φ/∂v, so that v·dep = φ dp (dp is the
 * equivalent plastic strain increment by plastic work). The return is solved with a secant
 * iteration on dp, with the internal variables updated in the same iteration.
 *
 *   TeodosiuHu          Teodosiu–Hu (1995): back stress X, dislocation structure tensor S, polarity P
 *   HAH                 Barlat et al. (2011): homogeneous anisotropic hardening, microstructure deviator h
 *   FeigenbaumDafalias  Feigenbaum–Dafalias (2007): directional distortional hardening tensor A
 */
(function (root) {
  "use strict";
  const S3 = Math.sqrt(3);
  const MAXSUB = 2e-5;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const norm = (a) => Math.hypot(a[0], a[1]);
  const copy = (o) => { const c = {}; for (const k in o) c[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; return c; };
  // 2×2 symmetric matrices stored as [m11, m12, m22]
  const mq = (M, a) => M[0] * a[0] * a[0] + 2 * M[1] * a[0] * a[1] + M[2] * a[1] * a[1];
  const outer = (a) => [a[0] * a[0], a[0] * a[1], a[1] * a[1]];
  const mnorm = (M) => Math.sqrt(M[0] * M[0] + 2 * M[1] * M[1] + M[2] * M[2]);

  function Model2D(p, law) {
    this.p = p; this.law = law;
    const G = p.E / (2 * (1 + (p.nu === undefined ? 0.3 : p.nu)));
    this.D = [p.E, 3 * G];
    this.s = { e: [0, 0], ep: [0, 0], v: [0, 0], p: 0, plastic: false, n: [1, 0], st: law.init(p) };
  }
  Model2D.prototype.phi = function (v, st) {
    const c = this.law.centre(st, this.p);
    return this.law.phiU([v[0] - c[0], v[1] - c[1]], st, this.p);
  };
  Model2D.prototype.grad = function (v, st) {
    const h = 1e-6 * (norm(v) + 1);
    const f = (a, b) => this.phi([v[0] + a, v[1] + b], st);
    return [(f(h, 0) - f(-h, 0)) / (2 * h), (f(0, h) - f(0, -h)) / (2 * h)];
  };
  Model2D.prototype.sub = function (de) {
    const s = this.s, D = this.D, law = this.law, P = this.p;
    const vt = [s.v[0] + D[0] * de[0], s.v[1] + D[1] * de[1]];
    s.e[0] += de[0]; s.e[1] += de[1];
    const F0 = this.phi(vt, s.st) - law.Y(s.st, P);
    if (F0 <= 1e-9 * law.Y(s.st, P)) { s.v = vt; s.plastic = false; return; }
    if (law.first && !s.st.started) law.first(s.st, vt, P);
    const n = this.grad(vt, s.st);
    const Dn = [D[0] * n[0], D[1] * n[1]];
    const res = (dp) => {
      const v = [vt[0] - dp * Dn[0], vt[1] - dp * Dn[1]];
      const st = copy(s.st);
      law.evolve(st, v, n, dp, P);
      return { r: this.phi(v, st) - law.Y(st, P), v, st };
    };
    let x0 = 0, r0 = F0, x1 = F0 / dot(n, Dn), o = res(x1), it = 0;
    while (Math.abs(o.r) > 1e-7 * law.Y(s.st, P) && it++ < 30) {
      const x2 = x1 - o.r * (x1 - x0) / (o.r - r0);
      x0 = x1; r0 = o.r; x1 = x2 > 0 ? x2 : 0.5 * x1; o = res(x1);
    }
    s.v = o.v; s.st = o.st;
    s.ep[0] += x1 * n[0]; s.ep[1] += x1 * n[1]; s.p += x1;
    s.plastic = true; const nn = norm(n) || 1; s.n = [n[0] / nn, n[1] / nn];
  };
  Model2D.prototype.stepStrain = function (de) {
    const k = Math.max(1, Math.ceil(norm(de) / MAXSUB));
    for (let i = 0; i < k; i++) this.sub([de[0] / k, de[1] / k]);
  };
  Model2D.prototype.save = function () { const s = this.s; return { e: s.e.slice(), ep: s.ep.slice(), v: s.v.slice(), p: s.p, plastic: s.plastic, n: s.n.slice(), st: copy(s.st) }; };
  /** Mixed control: ctrl[i] = 'e' (strain) or 's' (stress); tgt in normalised units. */
  Model2D.prototype.step = function (ctrl, tgt) {
    const s0 = this.save(), D = this.D;
    const de = [0, 1].map((i) => ctrl[i] === "e" ? tgt[i] - s0.e[i] : (tgt[i] - s0.v[i]) / D[i]);
    const free = [0, 1].filter((i) => ctrl[i] === "s");
    const trial = (d) => { this.s = this.save.call({ s: s0 }); this.stepStrain(d); return free.map((i) => this.s.v[i] - tgt[i]); };
    let r = trial(de);
    for (let it = 0; it < 25 && free.length && Math.max(...r.map(Math.abs)) > 1e-4; it++) {
      // numerical Jacobian of the residual with respect to the free strain increments
      const J = free.map(() => free.map(() => 0));
      free.forEach((j, b) => {
        const h = 1e-7, d2 = de.slice(); d2[j] += h;
        const r2 = trial(d2);
        free.forEach((_, a) => { J[a][b] = (r2[a] - r[a]) / h; });
      });
      let dx;
      if (free.length === 1) dx = [-r[0] / (J[0][0] || D[free[0]])];
      else { const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]; dx = [-(J[1][1] * r[0] - J[0][1] * r[1]) / det, -(-J[1][0] * r[0] + J[0][0] * r[1]) / det]; }
      free.forEach((j, a) => { de[j] += dx[a]; });
      r = trial(de);
    }
  };
  Model2D.prototype.snap = function () {
    const s = this.s, c = this.law.centre(s.st, this.p);
    return { sig: s.v[0], tau: s.v[1] / S3, eps: s.e[0], gam: S3 * s.e[1], epsp: s.ep[0], gamp: S3 * s.ep[1], p: s.p,
      seq: norm(s.v), Y: this.law.Y(s.st, this.p), cen: c, n: s.n.slice(), plastic: s.plastic, st: copy(s.st) };
  };
  /** Yield surface as a polygon in the (σ, √3 τ) plane for a snapshot. */
  Model2D.prototype.shape = function (snap, npts) {
    npts = npts || 180;
    const st = snap ? snap.st : this.s.st, c = this.law.centre(st, this.p), Y = this.law.Y(st, this.p), pts = [];
    for (let i = 0; i <= npts; i++) {
      const t = 2 * Math.PI * i / npts, d = [Math.cos(t), Math.sin(t)], r = Y / this.law.phiU(d, st, this.p);
      pts.push([c[0] + r * d[0], c[1] + r * d[1]]);
    }
    return pts;
  };

  /* ---------- D1: Teodosiu–Hu ---------- */
  const TeodosiuHu = {
    init: () => ({ X: [0, 0], R: 0, S: [0, 0, 0], P: [0, 0] }),
    centre: (st) => st.X,
    phiU: (u) => norm(u),
    Y: (st, P) => P.Y0 + st.R + P.f * mnorm(st.S),
    parts(st, N) {
      const SD = mq(st.S, N), NN = outer(N);
      const SL = [st.S[0] - SD * NN[0], st.S[1] - SD * NN[1], st.S[2] - SD * NN[2]];
      return { SD, SL, SLn: mnorm(SL), Sn: mnorm(st.S) };
    },
    Xsat(P, Sn, SD) {
      const beta = Sn > 1e-12 ? SD / Sn : 0;
      return P.X0 + (1 - P.f) * Sn * Math.sqrt(P.r + (1 - P.r) * beta * beta);
    },
    evolve(st, v, n, dp, P) {
      const nn = norm(n), N = [n[0] / nn, n[1] / nn];
      const { SD, SL, SLn, Sn } = TeodosiuHu.parts(st, N);
      const Xs = TeodosiuHu.Xsat(P, Sn, SD);
      const h = 0.5 * (1 - dot(st.X, N) / Xs);
      const PN = dot(st.P, N), ratio = P.CP / (P.CSD + P.CP);
      const g = PN >= 0 ? 1 - ratio * Math.abs(SD / P.Ssat - PN) : Math.pow(1 + PN, P.nP) * (1 - ratio * SD / P.Ssat);
      const SD2 = SD + P.CSD * (g * (P.Ssat - SD) - h * SD) * dp;
      const fl = -P.CSL * Math.pow(SLn / P.Ssat, P.nL) * dp;
      const NN = outer(N);
      st.S = [0, 1, 2].map((k) => SD2 * NN[k] + SL[k] * (1 + fl));
      st.X = [st.X[0] + P.CX * (Xs * N[0] - st.X[0]) * dp, st.X[1] + P.CX * (Xs * N[1] - st.X[1]) * dp];
      st.R += P.CR * (P.Rsat - st.R) * dp;
      st.P = [st.P[0] + P.CP * (N[0] - st.P[0]) * dp, st.P[1] + P.CP * (N[1] - st.P[1]) * dp];
      st.SD = SD2; st.SLn = SLn * (1 + fl); st.Sn = mnorm(st.S); st.PN = PN; st.Xsat = Xs;
    },
  };

  /* ---------- D2: HAH (Barlat et al., 2011) ---------- */
  const fk = (g, q) => Math.pow(Math.max(Math.pow(g, -q) - 1, 0), 1 / q);
  const HAH = {
    init: () => ({ h: [1, 0], g1: 1, g2: 1, g3: 1, g4: 1, p: 0, started: false }),
    centre: () => [0, 0],
    sbar: (P, p) => P.K * Math.pow(P.e0 + p, P.n),
    Y: (st, P) => HAH.sbar(P, st.p),
    phiU(u, st, P) {
      const J = norm(u); if (J === 0) return 0;
      const c = st.started ? dot(u, st.h) / J : 0, q = P.q;
      const f1 = fk(st.g1, q), f2 = fk(st.g2, q);
      return J * Math.pow(1 + Math.pow(f1 * Math.max(-c, 0), q) + Math.pow(f2 * Math.max(c, 0), q), 1 / q);
    },
    first(st, v) { const J = norm(v); st.h = [v[0] / J, v[1] / J]; st.started = true; },
    evolve(st, v, n, dp, P) {
      const J = norm(v), sh = [v[0] / J, v[1] / J], c = dot(sh, st.h);
      const r = P.k3 * HAH.sbar(P, 0) / HAH.sbar(P, st.p);
      if (c >= 0) {
        st.g1 += P.k2 * (r - st.g1) * dp; st.g2 += P.k1 * (st.g3 - st.g2) / st.g2 * dp; st.g4 += P.k5 * (P.k4 - st.g4) * dp;
      } else {
        st.g1 += P.k1 * (st.g4 - st.g1) / st.g1 * dp; st.g2 += P.k2 * (r - st.g2) * dp; st.g3 += P.k5 * (P.k4 - st.g3) * dp;
      }
      const sg = c >= 0 ? 1 : -1;
      const h = [st.h[0] + P.k * sg * (sh[0] - c * st.h[0]) * dp, st.h[1] + P.k * sg * (sh[1] - c * st.h[1]) * dp];
      const hn = norm(h); st.h = [h[0] / hn, h[1] / hn];
      st.p += dp; st.c = c;
    },
  };

  /* ---------- D3: Feigenbaum–Dafalias (2007) ---------- */
  const FeigenbaumDafalias = {
    init: (P) => ({ a: [0, 0], A: [0, 0, 0], k: P.k0 }),
    centre: (st) => st.a,
    distortion(m, st) { return dot(m, st.a) * mq(st.A, m); },
    phiU(u, st) {
      const J = norm(u); if (J === 0) return 0;
      const m = [u[0] / J, u[1] / J];
      return J * Math.sqrt(Math.max(1 + FeigenbaumDafalias.distortion(m, st), 1e-6));
    },
    Y: (st) => st.k,
    evolve(st, v, n, dp, P) {
      const u = [v[0] - st.a[0], v[1] - st.a[1]], J = norm(u) || 1, m = [u[0] / J, u[1] / J];
      const nn = norm(n) || 1, N = [n[0] / nn, n[1] / nn];
      const ma = dot(m, st.a), mm = outer(m);
      st.A = [0, 1, 2].map((k) => st.A[k] - P.c * (ma * mm[k] + P.x * st.A[k]) * dp);
      st.a = [st.a[0] + (P.C * N[0] - P.g * st.a[0]) * dp, st.a[1] + (P.C * N[1] - P.g * st.a[1]) * dp];
      st.k += P.b * (P.k0 + P.Q - st.k) * dp;
    },
  };

  /**
   * segments: [{ ctrl: ['e'|'s', 'e'|'s'], to: [axial, shear], label }]
   * axial: ε (fraction) or σ (MPa); shear: γ (fraction) or τ (MPa).
   */
  function run2d(model, segments, opts) {
    opts = Object.assign({ strainStep: 2e-5, stressStep: 2, maxPoints: 4000 }, opts || {});
    const conv = (sg) => sg.to.map((x, i) => (i === 0 ? x : sg.ctrl[1] === "e" ? x / S3 : S3 * x));
    const cur = () => model.s;
    let total = 0;
    const plans = [];
    let e = cur().e.slice(), v = cur().v.slice();
    segments.forEach((sg) => {
      const t = conv(sg);
      const n = Math.max(1, ...[0, 1].map((i) => Math.ceil(Math.abs(t[i] - (sg.ctrl[i] === "e" ? e[i] : v[i])) / (sg.ctrl[i] === "e" ? opts.strainStep : opts.stressStep))));
      [0, 1].forEach((i) => { if (sg.ctrl[i] === "e") e[i] = t[i]; else v[i] = t[i]; });
      plans.push(n); total += n;
    });
    const stride = Math.max(1, Math.ceil(total / opts.maxPoints));
    const hist = [Object.assign({ step: 0 }, model.snap())], ends = [];
    let count = 0;
    segments.forEach((sg, k) => {
      const t = conv(sg), n = plans[k];
      const from = [0, 1].map((i) => (sg.ctrl[i] === "e" ? model.s.e[i] : model.s.v[i]));
      for (let j = 1; j <= n; j++) {
        model.step(sg.ctrl, [0, 1].map((i) => from[i] + (t[i] - from[i]) * j / n));
        if (++count % stride === 0) hist.push(Object.assign({ step: count }, model.snap()));
      }
      const en = Object.assign({ step: count, label: sg.label }, model.snap());
      ends.push(en); hist.push(en);
    });
    return { hist, ends };
  }

  const programs = {
    tension: (e) => [{ ctrl: ["e", "s"], to: [e, 0], label: "max" }],
    shear: (g) => [{ ctrl: ["s", "e"], to: [0, g], label: "max" }],
    reverse: (e1, e2) => [{ ctrl: ["e", "s"], to: [e1, 0], label: "pre" }, { ctrl: ["e", "s"], to: [e2, 0], label: "rev" }],
    cross: (e1, g2) => [{ ctrl: ["e", "s"], to: [e1, 0], label: "pre" }, { ctrl: ["s", "s"], to: [0, 0], label: "unload" },
      { ctrl: ["s", "e"], to: [0, g2], label: "shear" }],
    strainCycles(ea, N) {
      const s = [{ ctrl: ["e", "s"], to: [ea, 0], label: "max" }];
      for (let i = 0; i < N; i++) { s.push({ ctrl: ["e", "s"], to: [-ea, 0], label: "min" }); s.push({ ctrl: ["e", "s"], to: [ea, 0], label: "max" }); }
      return s;
    },
  };

  const make = (law) => (p) => new Model2D(p, law);
  const api = { Model2D, TeodosiuHu: make(TeodosiuHu), HAH: make(HAH), FeigenbaumDafalias: make(FeigenbaumDafalias),
    laws: { TeodosiuHu, HAH, FeigenbaumDafalias }, run2d, programs };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Distortional = api;
})(this);
