# Hardening simulators

Interactive simulators of the cyclic hardening of metals, written for teaching.
Each simulator is an HTML page that runs entirely in the browser: no installation is needed.

**Open the simulators:** https://YOUR-USERNAME.github.io/hardening-simulators/

## Simulators

| | Simulator | What it shows |
|---|---|---|
| A | [Armstrong–Frederick model](a_armstrong_frederick.html) | Hardening and recall terms, Voce isotropic hardening; monotonic, strain and stress cycles; analytic ratcheting rate |
| B | [Superposition of back stresses (Chaboche)](b_chaboche.html) | Up to four back stresses and the role of each one |
| C | [Threshold model (Chaboche, 1991)](c_threshold.html) | Ratcheting and mean stress relaxation with and without threshold |
| D | [Static recovery](d_static_recovery.html) | Time-dependent decay of the back stress: relaxation during holds, softening after rest, dwell cycles |
| E1 | [Burlet–Cailletaud](e1_burlet_cailletaud.html) | Radial evanescence; tension–torsion ratcheting compared with Armstrong–Frederick |
| E2 | [Delobelle](e2_delobelle.html) | Weighted recall δ′ between Armstrong–Frederick and Burlet–Cailletaud |
| E3 | [Bari–Hassan](e3_bari_hassan.html) | Chaboche terms with Delobelle recall and optional threshold |
| E4 | [Ohno–Wang I and II](e4_ohno_wang.html) | Critical-state recall; uniaxial and multiaxial ratcheting, mean stress relaxation |
| E5 | [Abdel-Karim–Ohno](e5_abdel_karim_ohno.html) | Ohno–Wang I plus permanent recall μ; between Ohno–Wang I and Chaboche |
| E6 | [Jiang–Sehitoglu](e6_jiang_sehitoglu.html) | Power-law recall with exponent χ, no bracket; compared with Chaboche and Ohno–Wang II |
| E7 | [Chen–Jiao–Kim](e7_chen_jiao_kim.html) | Ohno–Wang II with exponent χ on the bracket; effect under non-proportional loading only |
| M1 | [Mróz multisurface model](mroz.html) | Nested yield surfaces, Masing behaviour and memory |
| M2 | [Iwan and Besseling overlay model](m2_iwan_besseling.html) | Elastic–perfectly plastic elements in parallel; exact Masing loops and memory |
| M3 | [Dafalias–Popov and Krieg two-surface model](m3_dafalias_popov_krieg.html) | Bounding surface, smooth transition, overshoot after partial unloading, ratcheting |
| M4 | [Yoshida–Uemori model](m4_yoshida_uemori.html) | Transient Bauschinger effect, permanent softening, workhardening stagnation, modulus decrease |
| M5 | [Hashiguchi subloading surface model](m5_hashiguchi_subloading.html) | Normal-yield ratio, smooth yielding, ratcheting below the yield stress |
| D1 | [Teodosiu–Hu](d1_teodosiu_hu.html) | Dislocation structures and polarity; workhardening stagnation, cross hardening after an orthogonal path change |
| D2 | [Barlat HAH](d2_barlat_hah.html) | Distorted yield surface without back stress; Bauschinger effect, transient and permanent softening |
| D3 | [Feigenbaum–Dafalias](d3_feigenbaum_dafalias.html) | Directional distortional hardening: egg-shaped yield surface linked to the back stress |
| Ma | [Masing behaviour](masing.html) | Masing and non-Masing hysteresis loops |

Pages D1 to D3 run reverse and orthogonal (tension, then shear) path changes, and their yield surface display shows the distorted shapes.
Pages M2 to M5 are uniaxial versions of the models; each page states the simplifications used.
Pages E1 to E7 also show the yield surface in the (σ, √3 τ) plane with the plastic flow direction, and the plastic strain path (εp, γp/√3). A step slider and a Play button follow the loading history.

## How the simulations work

`js/engine.js` integrates von Mises plasticity for a thin-walled tube in tension–torsion (σ, τ),
with mixed stress or strain control, explicit integration in small increments and a consistency
condition that corrects drift from the yield surface. All kinematic rules above, Voce isotropic
hardening and static recovery are implemented in the same engine. `js/engine1d.js` holds the
uniaxial multisurface and two-surface models of pages M2 to M5, with strain or stress control. `js/engine2d.js` holds
the tension–torsion versions of the microstructure-based and distortional models D1 to D3, with non-circular yield surfaces. `js/plot.js` draws the plots
(plain SVG) and `js/ui.js` handles the forms. There are no external libraries.

The engine was checked against independent calculations: the Armstrong–Frederick ratcheting rate
matches the analytic formula, and the mean stress relaxation of the Chaboche, threshold and
Ohno–Wang II models matches separate 1D integrations to within 0.1 MPa.

## Files

```
index.html            home page
a_… to e7_….html      model simulators
m2_… to m5_….html     multisurface and two-surface simulators
d1_… to d3_….html     microstructure-based and distortional simulators
mroz.html, masing.html
css/style.css         shared styles
js/engine.js          plasticity engine (tension–torsion)
js/engine1d.js        uniaxial multisurface and two-surface models (M2–M5)
js/engine2d.js        microstructure-based and distortional models (D1–D3)
js/plot.js            SVG plots
js/ui.js              forms and page logic
js/surface.js         yield surface and plastic strain path displays (E1–E7, D1–D3)
```

Keep the `css` and `js` folders next to the HTML files: the simulators need them.

## Using the simulators offline

Download the repository (green **Code** button, then **Download ZIP**), unzip it and open `index.html` in a web browser.
An internet connection is only needed for the fonts; the pages fall back to system fonts offline.

## Notes

All material parameters are illustrative and do not represent a specific material.
Plastic flow is rate independent; the static recovery simulator adds time dependence through the back stress only.

## Author

Dr Régis Kubler, Arts et Métiers Institute of Technology.
Developed with the assistance of Claude Opus 5.5 (Anthropic), October 2026.

## Licence

- **Code** (HTML, CSS and JavaScript): MIT licence, see `LICENSE`.
- **Documentation** (explanatory text in the pages and this README): [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You may reuse and adapt both, provided you credit the author.
