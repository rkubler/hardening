/*
 * Uniaxial engine for the multisurface and two-surface simulators (M2–M5).
 * Every model keeps its state in this.s (plain numbers and arrays), advances with
 * stepStrain(dε) using explicit sub-increments, and is driven in strain or stress control by run1d().
 *
 *   Overlay      Iwan (1967) / Besseling (1958): parallel elastic–perfectly plastic elements
 *   TwoSurface   Dafalias–Popov (1975) bounding surface, with an optional fixed-reference variant
 *   YoshidaUemori (2002), uniaxial form with a 1D non-hardening region
 *   Subloading   Hashiguchi (1989) subloading surface, uniaxial form
 */
(function (root) {
  "use strict";
  const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const MAXSUB = 2e-5; // largest strain sub-increment

  function subSteps(dEps, fn) {
    const n = Math.max(1, Math.ceil(Math.abs(dEps) / MAXSUB));
    for (let i = 0; i < n; i++) fn(dEps / n);
  }

  /* ---------- M2: overlay model (Iwan / Besseling) ---------- */
  function Overlay(p) {
    this.p = p; // { E, sy: [..], w: [..] } weights sum to 1
    this.s = { eps: 0, sig: 0, ep: p.sy.map(() => 0), sk: p.sy.map(() => 0) };
  }
  Overlay.prototype.stepStrain = function (dEps) {
    const s = this.s, E = this.p.E;
    s.eps += dEps;
    let sig = 0;
    this.p.sy.forEach((sy, k) => {
      let sk = E * (s.eps - s.ep[k]);
      if (Math.abs(sk) > sy) { s.ep[k] += (Math.abs(sk) - sy) / E * sgn(sk); sk = sy * sgn(sk); }
      s.sk[k] = sk;
      sig += this.p.w[k] * sk;
    });
    s.sig = sig;
  };
  Overlay.prototype.snap = function () {
    const s = this.s;
    return { eps: s.eps, sig: s.sig, epsp: s.eps - s.sig / this.p.E, sk: s.sk.slice() };
  };

  /* ---------- M3: two-surface model (Dafalias–Popov) ---------- */
  function TwoSurface(p) {
    this.p = p; // { E, k, K, H0, h, variant: 'dp' | 'fixed' }
    this.s = { eps: 0, sig: 0, ep: 0, p: 0, a: 0, b: 0, nu: 0, din: 2 * (p.K - p.k), plastic: false, H: NaN, delta: NaN };
  }
  TwoSurface.prototype.stepStrain = function (dEps) {
    subSteps(dEps, (de) => {
      const s = this.s, P = this.p;
      const str = s.sig + P.E * de;
      const f = Math.abs(str - s.a) - P.k;
      s.eps += de;
      if (f <= 0) { s.sig = str; s.plastic = false; return; }
      const nu = sgn(str - s.a);
      let delta = nu * (s.b + nu * P.K - s.sig);   // distance to the bounding surface along the loading direction
      if (delta < 0) delta = 0;
      if (s.nu === 0 || nu !== s.nu) {                 // plastic loading in a new direction: update δin
        s.din = P.variant === "fixed" ? 2 * (P.K - P.k) : Math.max(delta, 1e-9);
      }
      const ref = P.variant === "fixed" ? 2 * (P.K - P.k) : s.din;
      const H = P.H0 + P.h * delta / Math.max(ref - delta, 1e-9 * ref);
      const dp = f / (P.E + H);
      s.sig = str - P.E * nu * dp;
      s.ep += nu * dp; s.p += dp;
      s.a = s.sig - nu * P.k;
      s.b += P.H0 * nu * dp;                            // bounding surface: linear kinematic hardening
      // keep the yield surface inside the bounding surface
      if (nu * (s.a + nu * P.k) > nu * (s.b + nu * P.K)) { s.sig = s.b + nu * P.K; s.a = s.sig - nu * P.k; }
      s.plastic = true; s.nu = nu; s.H = H; s.delta = delta;
    });
  };
  TwoSurface.prototype.snap = function () {
    const s = this.s, P = this.p;
    return { eps: s.eps, sig: s.sig, epsp: s.ep, p: s.p, a: s.a, b: s.b, k: P.k, K: P.K, H: s.plastic ? s.H : NaN, delta: s.delta, din: s.din };
  };

  /* ---------- M4: Yoshida–Uemori, uniaxial ---------- */
  function YoshidaUemori(p) {
    this.p = p; // { E0, Ea, xi, Y, B, Rsat, C, m, b, h }
    this.s = { eps: 0, sig: 0, ep: 0, p: 0, as: 0, b: 0, R: 0, q: 0, r: 0 };
  }
  YoshidaUemori.prototype.E = function () {
    const P = this.p; return P.E0 - (P.E0 - P.Ea) * (1 - Math.exp(-P.xi * this.s.p));
  };
  YoshidaUemori.prototype.stepStrain = function (dEps) {
    subSteps(dEps, (de) => {
      const s = this.s, P = this.p, E = this.E();
      const str = s.sig + E * de;
      const alpha = s.as + s.b;
      const f = Math.abs(str - alpha) - P.Y;
      s.eps += de;
      if (f <= 0) { s.sig = str; return; }
      const nu = sgn(str - alpha);
      const a = P.B + s.R - P.Y;
      const has = Math.abs(s.as) > 1e-9 ? P.C * (a * nu - Math.sqrt(a / Math.abs(s.as)) * s.as) : P.C * a * nu;
      const hb = P.m * (P.b * nu - s.b);
      const H = nu * (has + hb);
      const dp = f / (E + Math.max(H, 1e-6));
      s.sig = str - E * nu * dp;
      s.ep += nu * dp; s.p += dp;
      s.as += has * dp;
      const bOld = s.b;
      s.b += hb * dp;
      // isotropic hardening of the bounding surface only when β leaves the non-hardening region
      const excess = Math.abs(s.b - s.q) - s.r;
      if (excess > 0 && Math.abs(s.b - s.q) > Math.abs(bOld - s.q) - 1e-12) {
        s.R += P.m * (P.Rsat - s.R) * dp;
        const d = sgn(s.b - s.q);
        s.r += P.h * excess;                      // expansion
        s.q += d * (1 - P.h) * excess;            // translation
      }
    });
  };
  YoshidaUemori.prototype.snap = function () {
    const s = this.s, P = this.p;
    return { eps: s.eps, sig: s.sig, epsp: s.ep, p: s.p, alpha: s.as + s.b, Y: P.Y, beta: s.b, BR: P.B + s.R, R: s.R, q: s.q, r: s.r, E: this.E() };
  };

  /* ---------- M5: Hashiguchi subloading surface, uniaxial ---------- */
  function Subloading(p) {
    this.p = p; // { E, F, C, g, u, c }
    this.s = { eps: 0, sig: 0, ep: 0, p: 0, a: 0, sc: 0, R: 0, nu: 1 };
  }
  Subloading.prototype.Rof = function (sig, a, sc) {
    const nu = sgn(sig - sc) || 1;
    const den = a + nu * this.p.F - sc;
    return { R: Math.abs(den) > 1e-12 ? (sig - sc) / den : 1, nu };
  };
  Subloading.prototype.stepStrain = function (dEps) {
    subSteps(dEps, (de) => {
      const s = this.s, P = this.p;
      const str = s.sig + P.E * de;
      const tr = this.Rof(str, s.a, s.sc);
      s.eps += de;
      // unloading (R decreasing) is elastic; loading (R increasing) is always plastic
      const cur = this.Rof(s.sig, s.a, s.sc);
      if (tr.R <= cur.R || tr.nu !== cur.nu) { s.sig = str; s.R = tr.R; s.nu = tr.nu; return; }
      const nu = cur.nu, R = Math.max(cur.R, 1e-8);
      const sTil = s.a + nu * P.F;                       // conjugate point on the normal-yield surface
      const ha = nu * P.C - P.g * s.a;                   // Armstrong–Frederick back stress of the normal-yield surface
      const hs = ha + P.c * (sTil - s.sc);               // similarity centre follows α and moves towards the conjugate point
      const U = -P.u * Math.log(R);                      // dR/dp
      const dsdp = hs + U * (sTil - s.sc) + R * (ha - hs);
      const H = Math.max(nu * dsdp, 1e-3);
      const dp = (nu * de) / (1 + H / P.E);
      s.sig += nu * H * dp;
      s.ep += nu * dp; s.p += dp;
      s.a += ha * dp; s.sc += hs * dp;
      const now = this.Rof(s.sig, s.a, s.sc);
      s.R = now.R; s.nu = now.nu;
    });
  };
  Subloading.prototype.snap = function () {
    const s = this.s, P = this.p;
    const abar = s.sc - s.R * (s.sc - s.a);
    return { eps: s.eps, sig: s.sig, epsp: s.ep, p: s.p, a: s.a, F: P.F, sc: s.sc, R: s.R, abar, rF: s.R * P.F };
  };

  /* ---------- driver ---------- */
  function stressTo(model, target) {
    const E = model.p.E || model.p.E0;
    const s0 = model.s.sig;
    let de = (target - s0) / E;
    for (let it = 0; it < 40; it++) {
      const save = clone(model.s);
      model.stepStrain(de);
      const r = model.s.sig - target;
      if (Math.abs(r) < 1e-4) return;
      const ds = model.s.sig - s0;
      model.s = save;
      const Et = Math.abs(de) > 1e-14 && ds * de > 0 ? ds / de : E;
      de -= r / Et;
    }
    model.stepStrain(de);
  }

  /**
   * segments: [{ ctrl: 'eps' | 'sig', to, label }]; strains as fractions, stresses in MPa.
   * Returns { hist: [snapshots with step index], ends: [snapshots] }.
   */
  function run1d(model, segments, opts) {
    opts = Object.assign({ strainStep: 2e-5, stressStep: 2, maxPoints: 5000 }, opts || {});
    let total = 0, cur = { eps: model.s.eps, sig: model.s.sig };
    const plans = segments.map((sg) => {
      const n = Math.max(1, Math.ceil(Math.abs(sg.to - cur[sg.ctrl]) / (sg.ctrl === "eps" ? opts.strainStep : opts.stressStep)));
      cur[sg.ctrl] = sg.to; total += n; return n;
    });
    const stride = Math.max(1, Math.ceil(total / opts.maxPoints));
    const hist = [Object.assign({ step: 0 }, model.snap())], ends = [];
    let count = 0;
    segments.forEach((sg) => {
      const from = sg.ctrl === "eps" ? model.s.eps : model.s.sig;
      const n = Math.max(1, Math.ceil(Math.abs(sg.to - from) / (sg.ctrl === "eps" ? opts.strainStep : opts.stressStep)));
      for (let i = 1; i <= n; i++) {
        if (sg.ctrl === "eps") model.stepStrain((sg.to - from) / n);
        else stressTo(model, from + (sg.to - from) * i / n);
        if (++count % stride === 0) hist.push(Object.assign({ step: count }, model.snap()));
      }
      const e = Object.assign({ step: count, label: sg.label }, model.snap());
      ends.push(e); hist.push(e);
    });
    return { hist, ends };
  }

  const programs = {
    tension: (e) => [{ ctrl: "eps", to: e, label: "max" }],
    path: (pts) => pts.map((e, i) => ({ ctrl: "eps", to: e, label: i % 2 === 0 ? "max" : "min" })),
    strainCycles(eMax, eMin, N) {
      const s = [{ ctrl: "eps", to: eMax, label: "max" }];
      for (let i = 0; i < N; i++) { s.push({ ctrl: "eps", to: eMin, label: "min" }); s.push({ ctrl: "eps", to: eMax, label: "max" }); }
      return s;
    },
    stressCycles(sMax, sMin, N) {
      const s = [];
      for (let i = 0; i < N; i++) { s.push({ ctrl: "sig", to: sMax, label: "max" }); s.push({ ctrl: "sig", to: sMin, label: "min" }); }
      return s;
    },
  };

  const api = { Overlay, TwoSurface, YoshidaUemori, Subloading, run1d, programs };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Hardening1D = api;
})(this);
