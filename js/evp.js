/*
 * Uniaxial elastoviscoplastic (rate-dependent) models, pages EVP1–EVP5.
 *
 * Every model gives the plastic strain rate as a function of a driving stress v = |σ − X|
 * and of its internal variables:   dεp/dt = s · F(v),  s = sign(σ − X).
 *   Norton      F = (v/K)^n                                   no elastic domain
 *   Bingham     F = ⟨v − σy(p)⟩ / η                           linear overstress
 *   Perzyna     F = ε̇0 ⟨(v − σy(p)) / σy(p)⟩^n                power overstress
 *   Chaboche    F = ⟨(v − R − k) / K⟩^n, X: Armstrong–Frederick, R: Voce   (unified viscoplasticity)
 *   Bodner      F = (2/√3) D0 exp[−(n+1)/(2n) (Z/v)^(2n)], dZ = m (Z1 − Z) dWp
 *   JohnsonCook F = ε̇0 exp[(v/σs(p) − 1)/C] for v > σs(p), σs = (A + B p^n)(1 − T*^m)
 *
 * Each step is integrated implicitly in the plastic increment Δp (bisection on a monotone
 * scalar equation), with the internal variables updated at the end of the step and the step
 * split when Δp exceeds MAXDP, so that stiff laws (large n, small C) stay stable.
 */
(function (root) {
  "use strict";
  const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  const MAXDP = 4e-5;      // largest plastic increment per sub-step
  const BIG = 1e12;        // cap on the plastic strain rate (1/s)

  /* ---------- the models ---------- */
  function base(p, extra) {
    return Object.assign({ p, s: Object.assign({ t: 0, eps: 0, sig: 0, ep: 0, p: 0, X: 0, rate: 0 }, extra || {}) });
  }
  const laws = {
    Norton(p) {   // { E, K, n }
      const m = base(p);
      m.F = (v) => Math.min(Math.pow(v / p.K, p.n), BIG);
      m.evolve = () => {};
      return m;
    },
    Bingham(p) {  // { E, sy, H, eta }
      const m = base(p);
      m.F = (v) => Math.max(0, v - p.sy - p.H * m.s.p) / p.eta;
      m.evolve = () => {};
      m.limit = () => p.sy + p.H * m.s.p;
      return m;
    },
    Perzyna(p) {  // { E, sy, H, e0, n }
      const m = base(p);
      m.F = (v) => { const y = p.sy + p.H * m.s.p; return v > y ? Math.min(p.e0 * Math.pow((v - y) / y, p.n), BIG) : 0; };
      m.evolve = () => {};
      m.limit = () => p.sy + p.H * m.s.p;
      return m;
    },
    Chaboche(p) { // { E, k, K, n, C, g, Q, b }
      const m = base(p, { R: 0 });
      m.F = (v) => { const f = v - m.s.R - p.k; return f > 0 ? Math.min(Math.pow(f / p.K, p.n), BIG) : 0; };
      m.evolve = (dp, s) => {
        m.s.X += (p.C * s - p.g * m.s.X) * dp;
        m.s.R += p.b * (p.Q - m.s.R) * dp;
      };
      m.limit = () => m.s.R + p.k;
      return m;
    },
    Bodner(p) {   // { E, D0, n, Z0, Z1, m }
      const m = base(p, { Z: p.Z0, Wp: 0 });
      const c = (p.n + 1) / (2 * p.n);
      m.F = (v) => (v <= 0 ? 0 : 2 / Math.sqrt(3) * p.D0 * Math.exp(-c * Math.pow(m.s.Z / v, 2 * p.n)));
      m.evolve = (dp, s, sig) => {
        const dW = Math.abs(sig) * dp;
        m.s.Wp += dW;
        m.s.Z += p.m * (p.Z1 - m.s.Z) * dW;
      };
      return m;
    },
    JohnsonCook(p) { // { E, A, B, n, C, e0, T, mT }
      const m = base(p);
      const soft = () => 1 - Math.pow(Math.max(0, Math.min(p.T, 1)), p.mT);
      m.sigS = () => (p.A + p.B * Math.pow(m.s.p, p.n)) * soft();
      m.F = (v) => { const y = m.sigS(); return v > y ? p.e0 * Math.exp(Math.min((v / y - 1) / p.C, 40)) : 0; };
      m.evolve = () => {};
      m.limit = () => m.sigS();
      return m;
    },

    /* ----- physics-based laws (PB-EVP1–6). T in K, rates in 1/s, stresses in MPa. ----- */
    ZerilliArmstrong(p) { // { E, T, type: 'fcc' | 'bcc', C0, C1, C2, C3, C4, C5, n }
      const m = base(p);
      m.maxdp = 1e-3;                           // no internal variable but p: large increments are exact
      const th = (r) => Math.exp(-p.C3 * p.T + p.C4 * p.T * Math.log(r));
      m.S = (dp, r) => {
        const q = m.s.p + dp;
        return p.type === "fcc" ? p.C0 + p.C2 * Math.sqrt(q) * th(r) : p.C0 + p.C1 * th(r) + p.C5 * Math.pow(q, p.n);
      };
      m.evolve = () => {};
      return m;
    },
    MTS(p) {      // { E, T, sa, si, g0i, ses0, g0es, g0e, e0, a0, a1, a2, alpha, mu0, D, T0, b }
      const m = base(p, { se: 0 });
      m.maxdp = 2e-4;
      const mu = shearVarshni(p.mu0, p.D, p.T0, p.T), kb3 = kB / Math.pow(p.b, 3) / 1e6;   // MPa/K
      const sfac = (r, g0, pp, q) => {          // [1 − (kT ln(ε̇0/ε̇) / (g0 μ b³))^(1/q)]^(1/p)
        const x = kb3 * p.T * Math.log(p.e0 / r) / (g0 * mu);
        return x <= 0 ? 1 : x >= 1 ? 0 : Math.pow(1 - Math.pow(x, 1 / q), 1 / pp);
      };
      const ses = (r) => p.ses0 * Math.pow(r / p.e0, kb3 * p.T / (mu * p.g0es));
      const th0 = (r) => Math.max(0, p.a0 + p.a1 * Math.log(r) + p.a2 * Math.sqrt(r));
      const tf = Math.tanh(p.alpha);
      const next = (dp, r) => Math.max(0, m.s.se + th0(r) * (1 - Math.tanh(p.alpha * m.s.se / ses(r)) / tf) * dp);
      m.S = (dp, r) => p.sa + mu / p.mu0 * (sfac(r, p.g0i, 0.5, 1.5) * p.si + sfac(r, p.g0e, 2 / 3, 1) * next(dp, r));
      m.evolve = (dp, d, sig, r) => { m.s.se = next(dp, r); };
      m.mu = mu;
      return m;
    },
    KocksMecking(p) { // { E, T, s0, M, alpha, b, rho0, k1, k20, d (µm, 0 = none), e0, A1, A2, mu0, D, T0 }
      const m = base(p, { rho: p.rho0 });
      m.maxdp = 2e-4;
      const mu = shearVarshni(p.mu0, p.D, p.T0, p.T), kb3 = kB / Math.pow(p.b, 3) / 1e6;
      const invm = kb3 * p.T / (p.A1 * mu), invn = kb3 * p.T / (p.A2 * mu);
      const gb = p.d > 0 ? 1 / (p.b * p.d * 1e-6) : 0;
      const k2 = (r) => p.k20 * Math.pow(r / p.e0, -invn);
      const next = (dp, r) => { const rho = m.s.rho; return Math.max(1e8, rho + p.M * (gb + p.k1 * Math.sqrt(rho) - k2(r) * rho) * dp); };
      m.S = (dp, r) => p.s0 + p.M * p.alpha * mu * p.b * Math.sqrt(next(dp, r)) * Math.pow(r / p.e0, invm);
      m.evolve = (dp, d, sig, r) => { m.s.rho = next(dp, r); };
      m.mu = mu; m.invm = invm; m.invn = invn;
      return m;
    },
    SellarsTegart(p) { // { E, T, A, alpha, n, Q (kJ/mol), s0, h }
      const m = base(p, { st: p.s0 });
      const Ze = p.A * Math.exp(-p.Q * 1000 / (Rgas * p.T));
      m.F = (v) => Math.min(Ze * Math.pow(Math.sinh(Math.min(p.alpha * v / m.s.st, 300)), p.n), BIG);
      m.evolve = (dp) => { m.s.st += p.h * (1 - m.s.st) * dp; };
      return m;
    },
    SteinbergGuinan(p) { // { E, T, P (GPa), K0 (GPa), Y0, Ymax, beta, n, ei, Ap (1/GPa), Bt (1/K), Tm }
      const m = base(p);
      m.maxdp = 1e-3;
      m.gfac = steinbergShear(p);
      m.S = (dp) => Math.min(p.Y0 * Math.pow(1 + p.beta * (m.s.p + dp + p.ei), p.n), p.Ymax) * m.gfac;
      m.evolve = () => {};
      return m;
    },
    SteinbergLund(p) { // SG parameters + { YA, YP, C1, Uk (eV), C2 (MPa·s) }
      const m = base(p);
      const gfac = steinbergShear(p), act = 2 * p.Uk / (kEV * p.T);
      m.F = (v) => {
        if (gfac <= 0) return BIG;
        const YT = v / gfac - Math.min(p.YA * Math.pow(1 + p.beta * (m.s.p + p.ei), p.n), p.Ymax);
        if (YT <= 0) return 0;
        const y = Math.min(YT / p.YP, 1);
        return Math.min(1 / (Math.exp(act * (1 - y) * (1 - y)) / p.C1 + p.C2 / YT), BIG);
      };
      m.evolve = () => {};
      return m;
    },
    PTW(p) {      // { E, T, theta, pp, s0, sinf, kappa, gamma, y0, yinf, y1, y2, beta, G0 (GPa), alpha, Tm, rho (g/cm³), M (g/mol) }
      const m = base(p);
      m.maxdp = 1e-3;
      const Th = p.T / p.Tm, G = p.G0 * 1e3 * (1 - p.alpha * Th);          // MPa
      const nat = p.rho * 1000 * 6.02214076e23 / (p.M / 1000);            // atoms per m³
      const xi = 0.5 * Math.cbrt(4 * Math.PI * nat / 3) * Math.sqrt(G * 1e6 / (p.rho * 1000));
      m.xi = xi; m.G = G;
      m.tau = (psi, r) => {
        const z = r / (p.gamma * xi), ef = erf(p.kappa * Th * Math.log(1 / z));
        const ts = Math.max(p.s0 - (p.s0 - p.sinf) * ef, p.s0 * Math.pow(z, p.beta));
        const ty = Math.max(p.y0 - (p.y0 - p.yinf) * ef, Math.min(p.y1 * Math.pow(z, p.y2), p.s0 * Math.pow(z, p.beta)));
        const d = p.s0 - ty;
        if (ts - ty < 1e-12 || d <= 0) return Math.max(ts, ty);
        const A = p.pp * (ts - ty) / d;
        return ts + d / p.pp * Math.log(1 - (1 - Math.exp(-A)) * Math.exp(-p.pp * p.theta * psi / (d * (Math.exp(A) - 1))));
      };
      m.S = (dp, r) => (Th >= 1 ? 0 : 2 * G * m.tau(m.s.p + dp, r));
      m.evolve = () => {};
      return m;
    },
  };

  /* ---------- helpers of the physics-based laws ---------- */
  const kB = 1.380649e-23, kEV = 8.617333e-5, Rgas = 8.314462;
  function shearVarshni(mu0, D, T0, T) { return mu0 - D / (Math.exp(T0 / T) - 1); }   // MPa
  function steinbergShear(p) {           // G(P, T) / G0, zero above melting
    if (p.T >= p.Tm) return 0;
    const eta = 1 + p.P / p.K0;
    return Math.max(0, 1 + p.Ap * p.P / Math.cbrt(eta) - p.Bt * (p.T - 300));
  }
  function erf(x) {                       // Abramowitz & Stegun 7.1.26
    const sg = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return sg * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }

  /* ---------- one time step ---------- */
  // Two kinds of laws. Rate laws give F(v), the plastic strain rate at the driving stress v.
  // Flow-stress laws (the physics-based ones) give S(dp, rate), the flow stress at the end of a
  // step with plastic increment dp at the plastic strain rate rate = dp/dt; their internal variables
  // are updated inside S, so that the yield condition |σ| = S is met at the end of the step.
  const RMIN = 1e-12;      // lowest plastic strain rate considered (1/s)
  function solveDp(g, hi0, expand) {   // root of the increasing function g on [0, hi]
    let lo = 0, hi = hi0;
    if (expand) while (g(hi) < 0 && hi < 0.5) { lo = hi; hi *= 4; }
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (g(mid) > 0) hi = mid; else lo = mid;
      if (hi - lo < 1e-15 + 1e-12 * hi) break;
    }
    return 0.5 * (lo + hi);
  }
  // strain control: total strain increment dE over dt. Returns the plastic increment.
  function strainStep(m, dE, dt) {
    const s = m.s, E = m.p.E, MX = m.maxdp || MAXDP;
    const str = E * (s.eps + dE - s.ep);
    const vtr = Math.abs(str - s.X), dir = sgn(str - s.X);
    let dp = 0;
    if (m.S) {
      // S(dp, dp/dt) = vtr − E dp
      const g = (x) => m.S(x, Math.max(x / dt, RMIN)) - (vtr - E * x);
      if (vtr > 0 && dt > 0 && g(0) < 0) dp = solveDp(g, vtr / E, false);
    } else if (vtr > 0 && m.F(vtr) > 0) {
      // g(dp) = dp − dt F(vtr − E dp) = 0 on [0, vtr/E]
      dp = solveDp((x) => x - dt * m.F(vtr - E * x), vtr / E, false);
    }
    if (dp > MX && dt > 1e-14) {   // too large: split the step
      const k = Math.min(64, Math.ceil(dp / MX));
      let tot = 0;
      for (let i = 0; i < k; i++) tot += strainStep(m, dE / k, dt / k);
      return tot;
    }
    s.eps += dE; s.t += dt;
    s.rate = dt > 0 ? dp / dt : 0;
    m.evolve(dp, dir, E * (s.eps - s.ep - dir * dp), Math.max(s.rate, RMIN));
    s.ep += dir * dp; s.p += dp;
    s.sig = E * (s.eps - s.ep);
    return dp;
  }
  // stress control: stress goes to sNew over dt. Δp solves Δp = dt F(v) (rate laws) or
  // S(Δp, Δp/dt) = v (flow-stress laws) with the internal variables at the end of the step,
  // split when Δp is large.
  function stressStep(m, sNew, dt, depth) {
    const s = m.s, E = m.p.E, MX = m.maxdp || MAXDP;
    const dir0 = sgn(sNew - s.X);
    let dp = 0;
    if (m.S) {
      const v = Math.abs(sNew - s.X);
      const g = (x) => m.S(x, Math.max(x / dt, RMIN)) - v;
      if (v > 0 && dt > 0 && g(0) < 0) dp = solveDp(g, MX, true);
    } else {
      const saved = Object.assign({}, s);
      const g = (x) => {             // x − dt F at the state reached after x; restores the state
        s.p = saved.p + x; m.evolve(x, dir0, sNew, x / dt);
        const r = x - dt * m.F(Math.abs(sNew - s.X));
        Object.assign(s, saved);
        return r;
      };
      if (g(0) < 0) dp = solveDp(g, MX, true);
    }
    if (dp > MX && (depth || 0) < 3) {
      const k = Math.min(64, Math.ceil(dp / MX)), s0 = s.sig;
      for (let i = 1; i <= k; i++) stressStep(m, s0 + (sNew - s0) * i / k, dt / k, (depth || 0) + 1);
      return;
    }
    s.t += dt;
    s.rate = dt > 0 ? dp / dt : 0;
    if (m.S) m.evolve(dp, dir0, sNew, Math.max(s.rate, RMIN));
    else { s.p += dp; m.evolve(dp, dir0, sNew, s.rate); s.p -= dp; }
    s.ep += dir0 * dp; s.p += dp;
    s.sig = sNew; s.eps = s.ep + sNew / E;
  }

  function snap(m) {
    const s = m.s;
    return { t: s.t, eps: s.eps, sig: s.sig, epsp: s.ep, p: s.p, X: s.X, R: s.R, Z: s.Z, rate: s.rate,
      lim: m.limit ? m.limit() : NaN };
  }

  /**
   * runVP(model, segments, opts)
   * segments: [{ ctrl: 'eps' | 'sig', to (null = hold), time (s), label }], strains as fractions, stresses in MPa.
   * Ramps are split in equal time steps; holds in steps growing geometrically, so that
   * relaxation and creep are resolved from milliseconds to the end of the hold.
   */
  function runVP(m, segments, opts) {
    opts = Object.assign({ strainStep: 2e-5, stressStep: 1, minSteps: 60, holdSteps: 500, maxPoints: 6000 }, opts || {});
    const hist = [Object.assign({ step: 0, seg: -1 }, snap(m))], ends = [];
    const plans = segments.map((sg) => sg.to === null || sg.to === undefined ? opts.holdSteps : 0);
    let total = 0;
    segments.forEach((sg, i) => { total += plans[i] || 400; });
    const stride = Math.max(1, Math.ceil(total * 1.5 / opts.maxPoints));
    let count = 0;
    segments.forEach((sg, iseg) => {
      const hold = sg.to === null || sg.to === undefined;
      const t0 = m.s.t;
      if (hold) {
        const n = opts.holdSteps, a = 7, T = sg.time;           // times t0 + T (10^(a i/n) − 1)/(10^a − 1)
        let prev = 0;
        const sHold = m.s.sig;
        for (let i = 1; i <= n; i++) {
          const ti = T * (Math.pow(10, a * i / n) - 1) / (Math.pow(10, a) - 1), dt = ti - prev; prev = ti;
          if (sg.ctrl === "eps") strainStep(m, 0, dt); else stressStep(m, sHold, dt);
          if (++count % stride === 0 || i === n || i < 20) hist.push(Object.assign({ step: count, seg: iseg, th: m.s.t - t0 }, snap(m)));
        }
      } else {
        const from = sg.ctrl === "eps" ? m.s.eps : m.s.sig, d = sg.to - from;
        const n = Math.max(opts.minSteps, Math.ceil(Math.abs(d) / (sg.ctrl === "eps" ? opts.strainStep : opts.stressStep)));
        const dt = sg.time / n;
        for (let i = 1; i <= n; i++) {
          if (sg.ctrl === "eps") strainStep(m, d / n, dt); else stressStep(m, from + d * i / n, dt);
          if (++count % stride === 0) hist.push(Object.assign({ step: count, seg: iseg, th: m.s.t - t0 }, snap(m)));
        }
      }
      const e = Object.assign({ step: count, seg: iseg, label: sg.label, th: m.s.t - t0 }, snap(m));
      ends.push(e); hist.push(e);
    });
    return { hist, ends };
  }

  /* ---------- loading programs (rates in 1/s, stress rates in MPa/s, times in s) ---------- */
  const programs = {
    tension: (eMax, rate) => [{ ctrl: "eps", to: eMax, time: eMax / rate, label: "max" }],
    relaxation: (e0, rate, tHold) => [{ ctrl: "eps", to: e0, time: e0 / rate, label: "load" },
                                      { ctrl: "eps", to: null, time: tHold, label: "hold" }],
    creep: (s0, sRate, tHold) => [{ ctrl: "sig", to: s0, time: s0 / sRate, label: "load" },
                                  { ctrl: "sig", to: null, time: tHold, label: "hold" }],
    strainCycles(ea, rate, N, tHold) {
      const S = [], ramp = (to, d, label) => S.push({ ctrl: "eps", to, time: d / rate, label });
      ramp(ea, ea, "max"); if (tHold > 0) S.push({ ctrl: "eps", to: null, time: tHold, label: "dwell+" });
      for (let i = 0; i < N; i++) {
        ramp(-ea, 2 * ea, "min"); if (tHold > 0) S.push({ ctrl: "eps", to: null, time: tHold, label: "dwell-" });
        ramp(ea, 2 * ea, "max"); if (tHold > 0) S.push({ ctrl: "eps", to: null, time: tHold, label: "dwell+" });
      }
      return S;
    },
    jump: (e1, e2, e3, ra, rb) => [{ ctrl: "eps", to: e1, time: e1 / ra, label: "j1" },
                                   { ctrl: "eps", to: e2, time: (e2 - e1) / rb, label: "j2" },
                                   { ctrl: "eps", to: e3, time: (e3 - e2) / ra, label: "j3" }],
    stressCycles(sMax, sMin, sRate, N) {
      const S = [{ ctrl: "sig", to: sMax, time: sMax / sRate, label: "max" }];
      for (let i = 0; i < N; i++) {
        S.push({ ctrl: "sig", to: sMin, time: (sMax - sMin) / sRate, label: "min" });
        if (i < N - 1) S.push({ ctrl: "sig", to: sMax, time: (sMax - sMin) / sRate, label: "max" });
      }
      return S;
    },
  };

  const api = { laws, runVP, programs, strainStep, stressStep, erf, shearVarshni, Rgas };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Viscoplastic = api;
})(this);
