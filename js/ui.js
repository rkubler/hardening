/* Small form and page helpers shared by the simulators. */
(function (root) {
  "use strict";

  /** Build labelled numeric inputs. spec: [{ id, label, unit, value, min, max, gt }] */
  function fields(container, spec) {
    container.innerHTML = spec.map((f) => `
      <label class="fld" for="${f.id}">
        <span class="fld-l">${f.label}</span>
        <input type="number" id="${f.id}" value="${f.value}" step="any" inputmode="decimal">
        <span class="fld-u">${f.unit || ""}</span>
      </label>`).join("");
  }

  /** Read and validate; returns an object of values, or null after showing the error. */
  function read(spec, errEl) {
    const out = {};
    for (const f of spec) {
      const inp = document.getElementById(f.id);
      const v = parseFloat(inp.value);
      let msg = null;
      if (!isFinite(v)) msg = `Enter a number for ${f.name || f.label}.`;
      else if (f.gt !== undefined && !(v > f.gt)) msg = `${f.name || f.label} must be greater than ${f.gt}.`;
      else if (f.min !== undefined && v < f.min) msg = `${f.name || f.label} must be at least ${f.min}.`;
      else if (f.max !== undefined && v > f.max) msg = `${f.name || f.label} must be at most ${f.max}.`;
      if (msg) {
        errEl.textContent = msg;
        inp.setAttribute("aria-invalid", "true");
        inp.focus();
        return null;
      }
      inp.removeAttribute("aria-invalid");
      out[f.key || f.id] = v;
    }
    errEl.textContent = "";
    return out;
  }

  /** Read-out tiles: items = [{ label, value }] */
  function stats(container, items) {
    container.innerHTML = items.map((s) => `<div><span>${s.label}</span><b>${s.value}</b></div>`).join("");
  }

  /** Show the fields of the selected test only. */
  function testSwitch(selectEl, groups) {
    const upd = () => Object.keys(groups).forEach((k) => { groups[k].hidden = selectEl.value !== k; });
    selectEl.addEventListener("change", upd);
    upd();
  }

  /** Run a computation after letting the "Computing" status paint. */
  function compute(statusEl, fn) {
    statusEl.textContent = "Computing…";
    setTimeout(() => {
      const t0 = performance.now();
      try { fn(); statusEl.textContent = `Done in ${Math.round(performance.now() - t0)} ms.`; }
      catch (e) { statusEl.textContent = "The computation failed: " + e.message; console.error(e); }
    }, 20);
  }


  /**
   * Wire a simulator page.
   * cfg = { mat: [field spec], tests: { key: { label, spec: [field spec], check(values) -> msg|null } },
   *         check(mat) -> msg|null, run(mat, test, testValues) }
   * The page must contain #matFields, #testSel, #testFields, #runBtn, #err, #status.
   */
  function page(cfg) {
    const err = document.getElementById("err"), status = document.getElementById("status");
    fields(document.getElementById("matFields"), cfg.mat);
    const sel = document.getElementById("testSel");
    sel.innerHTML = Object.keys(cfg.tests).map((k) => `<option value="${k}">${cfg.tests[k].label}</option>`).join("");
    const cache = {};
    let current = sel.value;
    const showTest = () => {
      // keep what the user typed for the previous test
      (cfg.tests[current].spec || []).forEach((f) => { const i = document.getElementById(f.id); if (i) cache[f.id] = i.value; });
      current = sel.value;
      const spec = cfg.tests[current].spec.map((f) => Object.assign({}, f, cache[f.id] !== undefined ? { value: cache[f.id] } : {}));
      fields(document.getElementById("testFields"), spec);
      const d = document.getElementById("testDesc");
      if (d) d.textContent = cfg.tests[current].desc || "";
    };
    sel.addEventListener("change", () => { showTest(); go(); });
    const go = () => {
      const m = read(cfg.mat, err); if (!m) return;
      const t = cfg.tests[sel.value];
      const v = read(t.spec, err); if (!v) return;
      const msg = (cfg.check && cfg.check(m, sel.value, v)) || (t.check && t.check(v, m));
      if (msg) { err.textContent = msg; return; }
      compute(status, () => cfg.run(m, sel.value, v));
    };
    document.getElementById("runBtn").addEventListener("click", go);
    document.querySelectorAll("aside").forEach((a) => a.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") go(); }));
    document.querySelectorAll("aside").forEach((a) => a.addEventListener("input", (e) => { if (e.target.tagName === "INPUT") { e.target.removeAttribute("aria-invalid"); err.textContent = ""; } }));
    current = sel.value;
    fields(document.getElementById("testFields"), cfg.tests[current].spec);
    const d = document.getElementById("testDesc"); if (d) d.textContent = cfg.tests[current].desc || "";
    go();
    return { go };
  }

  /** Values at the end of 'max' / 'min' segments, one per cycle. */
  function peaks(ends, label, key) { return ends.filter((e) => e.label === label).map((e) => (typeof key === "function" ? key(e) : e[key])); }

  const color = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const pct = (v, d = 3) => (100 * v).toFixed(d);
  /** toFixed without a negative zero */
  const fix = (v, d) => { const r = (+v).toFixed(d); return /^-0\.?0*$/.test(r) ? r.slice(1) : r; };

  root.UI = { fields, read, stats, testSwitch, compute, color, pct, fix, page, peaks };
})(this);
