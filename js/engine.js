/*
 * Cyclic plasticity engine for the hardening simulators.
 *
 * Thin-walled tube in tension–torsion: the stress state is (σ, τ) = (σ11, σ12),
 * the strains are (ε, γ) = (ε11, 2ε12). Von Mises plasticity, small strains.
 *
 * Deviatoric tensors A are stored as 2-vectors [p, q] with p = 3/2 A11 and q = A12
 * (with A22 = A33 = -A11/2). In this representation:
 *   A:B  = (2/3) p1 p2 + 2 q1 q2
 *   J(A) = sqrt(3/2 A:A) = sqrt(p² + 3 q²)
 * so the deviatoric stress is [σ, τ] and J(s − X) = sqrt((σ − Xp)² + 3 (τ − Xq)²).
 *
 * Back stress rules (one per term, X = Σ X_i):
 *   'chab' : dX = 2/3 C dεp − γ ⟨J(X) − Xl⟩/J(X) [δ X + (1−δ)(X:n̄) n̄] dp
 *            δ = 1, Xl = 0 → Armstrong–Frederick; Xl > 0 → Chaboche threshold;
 *            δ = 0 → Burlet–Cailletaud; 0 < δ < 1 → Delobelle (Bari–Hassan when several terms)
 *   'ow'   : dX = γ [2/3 r dεp − w ⟨dεp : k⟩ X],  r = C/γ, k = X/J(X)
 *            w = H(J(X) − r) (model I) or (J(X)/r)^m (model II)
 * Optional static recovery: dX = − b_s J(X)^(r_s − 1) X dt (all terms).
 * Optional Voce isotropic hardening: R = Q (1 − exp(−b p)).
 *
 * Integration: explicit, small increments, with the consistency condition linearized
 * about the current state (including the current yield-function value, which removes drift).
 */
(function (root) {
  "use strict";

  const dot = (a, b) => (2 / 3) * a[0] * b[0] + 2 * a[1] * b[1];
  const Jn = (a) => Math.sqrt(a[0] * a[0] + 3 * a[1] * a[1]);

  /** Back stress rate per unit dp for one term, given the flow direction n (rep). */
  function hardeningRate(t, X, n) {
    const C = t.C, g = t.g || 0;
    const out = [(2 / 3) * C * n[0], (2 / 3) * C * n[1]];
    if (g <= 0) return out;
    const xb = Jn(X);
    if (xb <= 1e-12) return out;
    if (t.rule === "ow") {
      const r = C / g;
      const w = t.model === 1 ? (xb >= r ? 1 : 0) : Math.pow(xb / r, t.m);
      const q = dot(n, X) / xb; // n : k
      const mac = Math.max(q, 0);
      out[0] -= g * w * mac * X[0];
      out[1] -= g * w * mac * X[1];
      return out;
    }
    // Chaboche family: AF, threshold, Burlet–Cailletaud, Delobelle
    const delta = t.delta === undefined ? 1 : t.delta;
    const Xl = t.Xl || 0;
    const scale = Xl > 0 ? Math.max(xb - Xl, 0) / xb : 1;
    if (scale === 0) return out;
    const xn = (2 / 3) * dot(X, n); // (X : n̄) with n̄ = sqrt(2/3) n, times sqrt(2/3) again
    out[0] -= g * scale * (delta * X[0] + (1 - delta) * xn * n[0]);
    out[1] -= g * scale * (delta * X[1] + (1 - delta) * xn * n[1]);
    return out;
  }

  /**
   * Create a material point.
   * cfg = { E, nu, sy, Q, b, terms: [{rule, C, g, delta, Xl, m, model}], recovery: {b, r} }
   */
  function MaterialPoint(cfg) {
    this.E = cfg.E || 200000;
    this.nu = cfg.nu === undefined ? 0.3 : cfg.nu;
    this.G = this.E / (2 * (1 + this.nu));
    this.sy = cfg.sy;
    this.Q = cfg.Q || 0;
    this.bv = cfg.b || 0;
    this.terms = cfg.terms.map((t) => Object.assign({ rule: "chab" }, t));
    this.rec = cfg.recovery && cfg.recovery.b > 0 ? cfg.recovery : null;
    this.reset();
  }

  MaterialPoint.prototype.reset = function () {
    this.S = [0, 0];        // σ, τ
    this.Eps = [0, 0];      // ε, γ
    this.Ep = [0, 0];       // εp, γp
    this.X = this.terms.map(() => [0, 0]);
    this.p = 0;
    this.t = 0;
  };

  MaterialPoint.prototype.R = function () { return this.Q * (1 - Math.exp(-this.bv * this.p)); };
  MaterialPoint.prototype.dR = function () { return this.Q * this.bv * Math.exp(-this.bv * this.p); };
  MaterialPoint.prototype.Xsum = function () {
    const s = [0, 0];
    for (const x of this.X) { s[0] += x[0]; s[1] += x[1]; }
    return s;
  };
  MaterialPoint.prototype.f = function (S, Xs) {
    const a1 = S[0] - Xs[0], a2 = S[1] - Xs[1];
    return Math.sqrt(a1 * a1 + 3 * a2 * a2) - (this.sy + this.R());
  };

  /**
   * One increment. ctrl = ['sig'|'eps', 'sig'|'eps'] for the axial and shear channels,
   * d = increments of the controlled quantities, dt = time increment.
   */
  MaterialPoint.prototype.step = function (ctrl, d, dt) {
    const E = this.E, G = this.G;
    const Se = [1 / E, 1 / G];
    // static recovery of each back stress
    const dRec = this.X.map((x) => {
      if (!this.rec || !dt) return [0, 0];
      const j = Jn(x);
      if (j <= 0) return [0, 0];
      let c = this.rec.b * Math.pow(j, this.rec.r - 1) * dt;
      if (c > 0.5) c = 0.5; // stability cap for very large time steps
      return [-c * x[0], -c * x[1]];
    });
    const dRecSum = dRec.reduce((s, v) => [s[0] + v[0], s[1] + v[1]], [0, 0]);

    // solve dE = S dΣ + c for the free components (S diagonal-plus-rank-one)
    const solve = (Smat, c) => {
      const dS = [0, 0], dE = [0, 0];
      const known = [ctrl[0] === "sig", ctrl[1] === "sig"];
      for (let i = 0; i < 2; i++) if (known[i]) dS[i] = d[i];
      const free = [0, 1].filter((i) => !known[i]);
      if (free.length === 1) {
        const i = free[0], j = 1 - i;
        dS[i] = (d[i] - c[i] - Smat[i][j] * dS[j]) / Smat[i][i];
      } else if (free.length === 2) {
        const r0 = d[0] - c[0], r1 = d[1] - c[1];
        const det = Smat[0][0] * Smat[1][1] - Smat[0][1] * Smat[1][0];
        dS[0] = (r0 * Smat[1][1] - Smat[0][1] * r1) / det;
        dS[1] = (Smat[0][0] * r1 - Smat[1][0] * r0) / det;
      }
      for (let i = 0; i < 2; i++) dE[i] = Smat[i][0] * dS[0] + Smat[i][1] * dS[1] + c[i];
      return { dS, dE };
    };

    const Xs = this.Xsum();
    const elastic = solve([[Se[0], 0], [0, Se[1]]], [0, 0]);
    const Str = [this.S[0] + elastic.dS[0], this.S[1] + elastic.dS[1]];
    const Xtr = [Xs[0] + dRecSum[0], Xs[1] + dRecSum[1]];
    const fTrial = this.f(Str, Xtr);

    let dS = elastic.dS, dEps = elastic.dE, dp = 0, hs = null;
    if (fTrial > 0) {
      const a1 = this.S[0] - Xs[0], a2 = this.S[1] - Xs[1];
      const J = Math.sqrt(a1 * a1 + 3 * a2 * a2) || 1e-12;
      const n = [1.5 * a1 / J, 1.5 * a2 / J];   // flow direction (rep)
      const N = [a1 / J, 3 * a2 / J];             // conjugate to (dσ, dτ)
      hs = this.terms.map((t, i) => hardeningRate(t, this.X[i], n));
      const hsum = hs.reduce((s, v) => [s[0] + v[0], s[1] + v[1]], [0, 0]);
      const H = N[0] * hsum[0] + N[1] * hsum[1] + this.dR();
      if (H > 1e-9) {
        const fOld = this.f(this.S, Xs);
        const k0 = (fOld - (N[0] * dRecSum[0] + N[1] * dRecSum[1])) / H;
        const Sp = [[Se[0] + N[0] * N[0] / H, N[0] * N[1] / H], [N[1] * N[0] / H, Se[1] + N[1] * N[1] / H]];
        const sol = solve(Sp, [N[0] * k0, N[1] * k0]);
        const dpc = (fOld + N[0] * (sol.dS[0] - dRecSum[0]) + N[1] * (sol.dS[1] - dRecSum[1])) / H;
        if (dpc > 0) {
          dS = sol.dS; dEps = sol.dE; dp = dpc;
          this.Ep[0] += N[0] * dp; this.Ep[1] += N[1] * dp;
        }
      }
    }
    this.S[0] += dS[0]; this.S[1] += dS[1];
    this.Eps[0] += dEps[0]; this.Eps[1] += dEps[1];
    for (let i = 0; i < this.X.length; i++) {
      this.X[i][0] += dRec[i][0] + (dp && hs ? hs[i][0] * dp : 0);
      this.X[i][1] += dRec[i][1] + (dp && hs ? hs[i][1] * dp : 0);
    }
    this.p += dp;
    this.t += dt || 0;
  };

  MaterialPoint.prototype.snapshot = function () {
    return {
      t: this.t, sig: this.S[0], tau: this.S[1], eps: this.Eps[0], gam: this.Eps[1],
      epsp: this.Ep[0], gamp: this.Ep[1], p: this.p, R: this.R(),
      X: this.X.map((x) => [x[0], x[1]]),
    };
  };

  /**
   * Run a loading program.
   * segments: [{ ctrl: ['eps','sig'], to: [ax, sh], time: seconds (optional), label }]
   *   'to' gives the target value of each controlled quantity (strain as a fraction, stress in MPa);
   *   null keeps the current value. A segment with no change and a time is a hold.
   * opts: { strainStep, stressStep, holdSteps, maxPoints }
   * Returns { hist: [snapshots], ends: [snapshot at the end of each segment] }.
   */
  function run(mp, segments, opts) {
    opts = Object.assign({ strainStep: 1e-5, stressStep: 0.5, holdSteps: 400, maxPoints: 6000 }, opts || {});
    const raw = [mp.snapshot()], ends = [];
    let total = 0;
    const plans = [];
    // first pass: count steps (approximate, based on targets) to decide the recording stride
    let cur = [mp.S[0], mp.S[1]], curE = [mp.Eps[0], mp.Eps[1]];
    for (const sg of segments) {
      let n = 0;
      for (let i = 0; i < 2; i++) {
        if (sg.to[i] === null || sg.to[i] === undefined) continue;
        const from = sg.ctrl[i] === "sig" ? cur[i] : curE[i];
        const step = sg.ctrl[i] === "sig" ? opts.stressStep : opts.strainStep;
        n = Math.max(n, Math.ceil(Math.abs(sg.to[i] - from) / step));
        if (sg.ctrl[i] === "sig") cur[i] = sg.to[i]; else curE[i] = sg.to[i];
      }
      if (sg.time) n = Math.max(n, opts.holdSteps);
      n = Math.max(n, 1);
      plans.push(n); total += n;
    }
    const stride = Math.max(1, Math.ceil(total / opts.maxPoints));
    let count = 0;
    segments.forEach((sg) => {
      const from = [0, 1].map((i) => (sg.ctrl[i] === "sig" ? mp.S[i] : mp.Eps[i]));
      const to = [0, 1].map((i) => (sg.to[i] === null || sg.to[i] === undefined ? from[i] : sg.to[i]));
      let n = 0;
      for (let i = 0; i < 2; i++) {
        const step = sg.ctrl[i] === "sig" ? opts.stressStep : opts.strainStep;
        n = Math.max(n, Math.ceil(Math.abs(to[i] - from[i]) / step));
      }
      if (sg.time) n = Math.max(n, opts.holdSteps);
      n = Math.max(n, 1);
      const d = [(to[0] - from[0]) / n, (to[1] - from[1]) / n];
      const dt = sg.time ? sg.time / n : 0;
      for (let k = 0; k < n; k++) {
        mp.step(sg.ctrl, d, dt);
        if (++count % stride === 0) raw.push(mp.snapshot());
      }
      const s = mp.snapshot();
      s.label = sg.label;
      ends.push(s);
      raw.push(s);
    });
    return { hist: raw, ends };
  }

  /** Helpers that build common loading programs (strains as fractions). */
  const programs = {
    tension(eMax) { return [{ ctrl: ["eps", "sig"], to: [eMax, 0], label: "max" }]; },
    strainCycles(eMax, eMin, N) {
      const s = [{ ctrl: ["eps", "sig"], to: [eMax, 0], label: "max" }];
      for (let i = 0; i < N; i++) {
        s.push({ ctrl: ["eps", "sig"], to: [eMin, 0], label: "min" });
        s.push({ ctrl: ["eps", "sig"], to: [eMax, 0], label: "max" });
      }
      return s;
    },
    stressCycles(sMax, sMin, N) {
      const s = [];
      for (let i = 0; i < N; i++) {
        s.push({ ctrl: ["sig", "sig"], to: [sMax, 0], label: "max" });
        s.push({ ctrl: ["sig", "sig"], to: [sMin, 0], label: "min" });
      }
      return s;
    },
    // constant axial stress, symmetric shear strain cycles ±gA
    tensionTorsion(sig0, gA, N) {
      const s = [{ ctrl: ["sig", "eps"], to: [sig0, 0], label: "load" }];
      for (let i = 0; i < N; i++) {
        s.push({ ctrl: ["sig", "eps"], to: [sig0, gA], label: "max" });
        s.push({ ctrl: ["sig", "eps"], to: [sig0, -gA], label: "min" });
      }
      s.push({ ctrl: ["sig", "eps"], to: [sig0, 0], label: "end" });
      return s;
    },
  };

  const api = { MaterialPoint, run, programs, Jn, dot, hardeningRate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Hardening = api;
})(this);
