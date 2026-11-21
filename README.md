# 3D Walking Biomechanics Lab

Interactive Three.js (`r161`) musculoskeletal gait explorer comparing healthy heel-to-toe pendulum walking against four biomechanically harmful walking habits.

Live showcase: https://eddieckc.github.io/walking-biomechanics-3d/

## Compared Gait Patterns

* **Healthy Baseline.** Soft ~16 deg knee loading wave, hip-width parallel tracks, elastic Achilles push-off, and counter-rotating arm swing.
* **Overstride + Locked Knee.** Extended stride reach (+25%) landing on a ~0.8 deg locked knee, increasing braking shockwave (-34% BW in model).
* **Crossover Valgus.** Narrow crossover track (-0.02 m) with pelvic drop and femoral inward twist, elevating IT-band strain and medial knee adduction moment (KAM).
* **Toe-Walk + Muscle Clench.** Continuous forefoot loading where the heel never lands, pairing tonic gastrocnemius-quadriceps co-contraction with high metabolic cost.
* **Phone Gaze + Flat-Head Glide.** Forward neck tilt (+28 deg), immobilized arms holding a smartphone, and bent-knee gait flattening center-of-mass (COM) vertical oscillation.

## Interactive Controls

* **Habit Selector.** Switch between `Healthy Baseline` and the four overload patterns while inspecting live side-by-side scissor viewports (`Split Compare` or `Focus Active Only`).
* **3D Camera & Overlays.** Drag to orbit, scroll to zoom, pick from five camera presets (`3/4 Gait Lab`, `Side Sagittal`, `Front Coronal`, `Knee & Tendon Zoom`, `Foot Track Top`), and toggle GLSL thermal muscle/cartilage shading, GRF vectors, COM arc ribbon, or Bone X-Ray.
* **Scrubber & Verification.** Press `Space` to pause and scrub any percentage of the gait cycle, or open `Clinical Proof Table` to inspect 200-phase invariants.

## Peer-Reviewed References

* **Winter, D. A. (2009).** *Biomechanics and Motor Control of Human Movement* (4th ed.). Normative walking kinematics and segment anthropometrics.
* **Perry, J. (2010).** *Gait Analysis: Normal and Pathological Function*. Gait phases and bimodal ground reaction forces.
* **Milner, C. E., et al. (2018).** Shortening step length by 15% reduces cumulative tibiofemoral contact force impulse by 12% to 28%.
* **Willson, J. D., et al. (2014).** Step length sensitivity of patellofemoral stress per step in running (+31% at +10% step length).
* **Meardon, S. A., et al. (2012).** Step width and crossover mechanics elevate iliotibial band strain.
* **Powers, C. M. (2010).** *JOSPT*. Proximal hip drop and femoral internal rotation driving dynamic knee valgus.
* **Miyazaki, T., et al. (2002).** *Ann. Rheum. Dis.* Baseline external knee adduction moment predicts medial OA progression (6.46x per +1 %BW*ht unit).
* **Cunningham, C. B., et al. (2010).** *J. Exp. Biol.* Forefoot walking increases metabolic cost by +53% over heel-first walking.
* **Hodges, P. W., et al. (2016).** Medial muscle co-contraction duration associates with -0.14%/yr medial tibial cartilage loss per +1% duration.
* **Perry, J., et al. (2003).** Voluntary equinus paradox: elevated gastrocnemius EMG despite altered ankle plantarflexor moment.
* **Ortega, J. D., & Farley, C. T. (2005).** *J. Appl. Physiol.* Flattening vertical COM displacement (-69%) doubles (+100%) metabolic energy cost.
* **Collins, S. H., Adamczyk, P. G., & Kuo, A. D. (2009).** *Proc. R. Soc. B.* Passive arm swing cancels up to 63% of vertical leg-twisting torque and saves 12% metabolic energy.
* **Selinger, J. C., et al. (2015).** *Current Biology.* Real-time energetic self-optimization during walking.

## Local Development and Tests

Run `src/test_gait_core.html` in a browser to verify all 26 biomechanical invariants and 14 unit assertions.

## License

Authored code is licensed under the Apache License 2.0 (see [LICENSE](LICENSE)). Third-party bundled Three.js r161 notices appear in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
