# Hardening simulators

Interactive simulators of the cyclic hardening of metals, written for teaching.
Elastoviscoplastic models, phenomenological and physics-based, are also given to describe the rate dependence of plastic flow.
The content is based on the course material of two MSc courses, 1. Mechanics of Materials and 2. Kinetic Processes and Mechanical Behavior
in Materials Science, taught in the [MSc AM2S (Advanced Manufacturing and Materials Science)](https://artsetmetiers.fr/fr/master-science-am2s-advanced-manufacturing-and-materials-science) at Arts et Métiers Science and Technology.
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
| EVP1 | [Norton power law](evp1_norton.html) | Creep, relaxation and rate effect without elastic domain; closed-form checks |
| EVP2 | [Bingham and Perzyna overstress models](evp2_bingham_perzyna.html) | Linear and power-law overstress above a yield stress; rate-independent limit |
| EVP3 | [Unified viscoplasticity (Chaboche)](evp3_chaboche_viscoplastic.html) | Back stress, Voce hardening and Norton flow; loops at two rates, holds, time-dependent ratcheting |
| EVP4 | [Bodner–Partom](evp4_bodner_partom.html) | Exponential flow law without yield surface; hardening by plastic work |
| EVP5 | [Johnson–Cook](evp5_johnson_cook.html) | Multiplicative strain, rate and temperature terms; high strain rates |
| PB-EVP1 | [Zerilli–Armstrong](pbevp1_zerilli_armstrong.html) | Dislocation-mechanics flow stress, FCC (copper) and BCC (iron) forms; temperatures, rates, rate jumps |
| PB-EVP2 | [Mechanical Threshold Stress (Follansbee–Kocks)](pbevp2_mts.html) | Thermally activated flow over an evolving threshold stress; strain-rate history effect |
| PB-EVP3 | [Kocks–Mecking and Estrin–Mecking](pbevp3_kocks_mecking.html) | Dislocation density storage and dynamic recovery, grain size; stage III, rate jumps, creep |
| PB-EVP4 | [Sellars–Tegart (Garofalo)](pbevp4_sellars_tegart.html) | Hyperbolic sine law of hot working and creep; Zener–Hollomon master curve |
| PB-EVP5 | [Steinberg–Guinan and Steinberg–Lund](pbevp5_steinberg_guinan.html) | Yield stress scaled by the pressure- and temperature-dependent shear modulus; rate-independent or thermally activated |
| PB-EVP6 | [Preston–Tonks–Wallace](pbevp6_ptw.html) | Thermal activation and strong-shock regimes, strain rates from 10⁻³ to 10⁹ /s |
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
the tension–torsion versions of the microstructure-based and distortional models D1 to D3, with non-circular yield surfaces. `js/evp.js` holds the uniaxial
elastoviscoplastic models EVP1 to EVP5: it integrates in time under strain or stress control, implicitly in the plastic
strain increment (so that large Norton exponents stay stable), with geometric time steps during holds. `js/evpui.js`
builds their common tests (rates, creep, relaxation, strain cycles, stress cycles). The Norton relaxation curve matches
the closed-form solution to within 0.5 %, and the steady creep rate matches (σ/K)ⁿ. The physics-based models PB-EVP1 to PB-EVP6
are written as flow-stress laws σ = S(εp, ε̇p, T, internal variables): in each step the plastic increment is found so that
the stress equals S at the plastic strain rate of the step, which gives creep and relaxation from the same equations as tension.
`js/evpui.js` adds tests at several temperatures, a strain-rate jump test with the Kocks–Mecking plot (θ against σ), and the
Zener–Hollomon plot. Each PB-EVP page gives the original references of its model. `js/plot.js` draws the plots
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
evp1_… to evp5_….html elastoviscoplastic (rate-dependent) simulators
mroz.html, masing.html
css/style.css         shared styles
js/engine.js          plasticity engine (tension–torsion)
js/engine1d.js        uniaxial multisurface and two-surface models (M2–M5)
js/engine2d.js        microstructure-based and distortional models (D1–D3)
js/plot.js            SVG plots
js/ui.js              forms and page logic
js/surface.js         yield surface and plastic strain path displays (E1–E7, D1–D3)
js/evp.js             elastoviscoplastic models and time integration (EVP1–EVP5, PB-EVP1–PB-EVP6)
js/evpui.js           common tests and plots of the EVP and PB-EVP pages
```

Keep the `css` and `js` folders next to the HTML files: the simulators need them.

## Using the simulators offline

Download the repository (green **Code** button, then **Download ZIP**), unzip it and open `index.html` in a web browser.
An internet connection is only needed for the fonts; the pages fall back to system fonts offline.

## Notes

All material parameters are illustrative and do not represent a specific material.
Plastic flow is rate independent in simulators A to D3 (the static recovery simulator adds time dependence through the back stress only); EVP1 to EVP5 and PB-EVP1 to PB-EVP6 are rate dependent. The PB-EVP models run at a constant temperature (no adiabatic heating).


## Author

Dr Régis Kubler, Arts et Métiers Institute of Technology.
Developed with the assistance of Claude Opus 5.5 (Anthropic), October 2026.

## Cite as
Kubler, R. (2026). *Hardening Simulator*. Arts et Métiers Institute of Technology. Zenodo. DOI: https://doi.org/10.5281/zenodo.23205497
## Licence

- **Code** (HTML, CSS and JavaScript): MIT licence, see `LICENSE`.
- **Documentation** (explanatory text in the pages and this README): [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You may reuse and adapt both, provided you credit the author.
