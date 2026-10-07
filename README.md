# hardening
Different hardening models used for cyclic elastoplastic-(rate-independent) behaviour of metals - For educational purposes
Interactive simulators of the cyclic hardening of metals, written for teaching.
Each simulator is an HTML page that runs entirely in the browser: no installation is needed.

**Open the simulators:** https://rkubler.github.io/hardening/
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
| M | [Mróz multisurface model](mroz.html) | Nested yield surfaces, Masing behaviour and memory |
| Ma | [Masing behaviour](masing.html) | Masing and non-Masing hysteresis loops |

Pages E1 to E4 also show the yield surface in the (σ, √3 τ) plane with the plastic flow direction, and the plastic strain path (εp, γp/√3). A step slider and a Play button follow the loading history.

## How the simulations work

`js/engine.js` integrates von Mises plasticity for a thin-walled tube in tension–torsion (σ, τ),
with mixed stress or strain control, explicit integration in small increments and a consistency
condition that corrects drift from the yield surface. All kinematic rules above, Voce isotropic
hardening and static recovery are implemented in the same engine. `js/plot.js` draws the plots
(plain SVG) and `js/ui.js` handles the forms. There are no external libraries.

The engine was checked against independent calculations: the Armstrong–Frederick ratcheting rate
matches the analytic formula, and the mean stress relaxation of the Chaboche, threshold and
Ohno–Wang II models matches separate 1D integrations to within 0.1 MPa.

## Files

```
index.html            home page
a_… to e4_….html      model simulators
mroz.html, masing.html
css/style.css         shared styles
js/engine.js          plasticity engine
js/plot.js            SVG plots
js/ui.js              forms and page logic
js/surface.js         yield surface and plastic strain path displays (E1–E4)
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
## Cite as
[Regis KUBLER] (2026). Hardening Simulator. Zenodo. DOI: https://doi.org/10.5281/zenodo.23205497

## Licence

- **Code** (HTML, CSS and JavaScript): MIT licence, see `LICENSE`.
- **Documentation** (explanatory text in the pages and this README): [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You may reuse and adapt both, provided you credit the author.
