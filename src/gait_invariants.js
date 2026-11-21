(function (global) {
  'use strict';

  const GaitCore = global.GaitCore;

  class BiomechanicsInvariantError extends Error {
    constructor(failures) {
      const summary = failures
        .map(function (f) {
          return f.checkId + ' [' + f.habitId + ']: expected ' + f.expected + ', observed ' + f.observed;
        })
        .join(' | ');
      super('Biomechanics invariant gate failed: ' + summary);
      this.name = 'BiomechanicsInvariantError';
      this.failures = failures;
    }
  }

  /**
   * Executes peer-reviewed biomechanical, geometric, and floor-contact invariant checks across
   * all habits at 200 phases in [0, 1) before any WebGL context initializes.
   * @param {Readonly<object>} registry
   * @returns {object}
   */
  function verifyBiomechanicsSuite(registry) {
    const failures = [];
    const summaryByHabit = {};
    let checksExecuted = 0;
    const N = 200;

    function check(checkId, habitId, condition, expected, observed, citation) {
      checksExecuted += 1;
      if (!condition) {
        failures.push({ checkId, habitId, expected, observed: String(observed), citation });
      }
    }

    const framesByHabit = {};
    for (let hi = 0; hi < registry.orderedIds.length; hi += 1) {
      const id = registry.orderedIds[hi];
      const frames = [];
      let maxPenetration = 0;
      let minHeelY = Infinity;
      let minSwingToeY = Infinity;
      let minComY = Infinity;
      let maxComY = -Infinity;
      let minForeAftBw = Infinity;
      let maxVertGrfBw = -Infinity;

      for (let i = 0; i < N; i += 1) {
        const f = GaitCore.solveGaitFrame(registry, id, i / N);
        frames.push(f);
        const minPlantar = Math.min(f.right.footContact.minWorldY, f.left.footContact.minWorldY);
        maxPenetration = Math.max(maxPenetration, Math.abs(minPlantar));
        minHeelY = Math.min(minHeelY, f.right.footContact.heelWorld[1]);
        if (f.right.legPhase >= 0.68 && f.right.legPhase <= 0.84) {
          minSwingToeY = Math.min(minSwingToeY, f.right.footContact.toeWorld[1]);
        }
        minComY = Math.min(minComY, f.axial.comWorld[1]);
        maxComY = Math.max(maxComY, f.axial.comWorld[1]);
        minForeAftBw = Math.min(minForeAftBw, f.right.grf.foreAftBw);
        maxVertGrfBw = Math.max(maxVertGrfBw, f.right.grf.verticalBw);
      }

      framesByHabit[id] = frames;
      const comArcCm = (maxComY - minComY) * 100;
      summaryByHabit[id] = {
        maxFloorPenetrationMeters: maxPenetration,
        minHeelWorldMeters: minHeelY,
        swingToeClearanceMeters: minSwingToeY,
        comVerticalArcCm: comArcCm,
        peakBrakingGrfPctBw: minForeAftBw * 100,
        maxVerticalGrfPctBw: maxVertGrfBw * 100,
      };

      check(
        'floor_clamp_exact',
        id,
        maxPenetration < 1e-6,
        '< 1e-6 m',
        maxPenetration.toExponential(2) + ' m',
        'Ground contact solver'
      );
      check(
        'swing_toe_clearance',
        id,
        minSwingToeY > 0.012,
        '> 0.012 m min mid-swing clearance',
        minSwingToeY.toFixed(3) + ' m',
        'Winter (2009)'
      );
    }

    const hf0 = framesByHabit.healthy[0];
    const hf12 = framesByHabit.healthy[Math.round(0.12 * N)];
    const hf32 = framesByHabit.healthy[Math.round(0.32 * N)];
    const hf48 = framesByHabit.healthy[Math.round(0.48 * N)];
    const hf55 = framesByHabit.healthy[Math.round(0.55 * N)];
    const hf73 = framesByHabit.healthy[Math.round(0.73 * N)];
    check('healthy_knee_loading_12pct', 'healthy', Math.abs(hf12.right.anglesDeg.kneeFlex - 16) < 0.8, '~16 deg', hf12.right.anglesDeg.kneeFlex.toFixed(1) + ' deg', 'Winter (2009)');
    check('healthy_knee_swing_73pct', 'healthy', Math.abs(hf73.right.anglesDeg.kneeFlex - 62) < 0.8, '~62 deg', hf73.right.anglesDeg.kneeFlex.toFixed(1) + ' deg', 'Winter (2009)');
    check('healthy_vgrf_m_shape', 'healthy', hf12.right.grf.verticalBw >= 1.12 && hf32.right.grf.verticalBw <= 0.83 && hf48.right.grf.verticalBw >= 1.18, '115%/80%/120% BW', [hf12.right.grf.verticalBw, hf32.right.grf.verticalBw, hf48.right.grf.verticalBw].map(function (v) { return Math.round(v * 100) + '%'; }).join('/'), 'Perry (2010)');
    check('healthy_double_support_contact', 'healthy', hf0.left.footContact.minWorldY < 0.025 && hf0.right.footContact.heelWorld[1] < 0.020, 'both feet within 2cm at 0% heel strike', 'left=' + hf0.left.footContact.minWorldY.toFixed(3) + ' m, rightHeel=' + hf0.right.footContact.heelWorld[1].toFixed(3) + ' m', 'Double-support continuity');
    check('healthy_toe_break_pushoff', 'healthy', hf55.right.footContact.heelWorld[1] > 0.02 && hf55.right.footContact.toeWorld[1] < 0.015, 'heel lifts while toes stay grounded', 'heel=' + hf55.right.footContact.heelWorld[1].toFixed(3) + ', toe=' + hf55.right.footContact.toeWorld[1].toFixed(3), 'Perry (2010)');

    const of0 = framesByHabit.overstride[0];
    const of12 = framesByHabit.overstride[Math.round(0.12 * N)];
    check('overstride_stride_ratio', 'overstride', of0.strideLengthM >= 1.24 * hf0.strideLengthM, '>= 1.25x healthy', (of0.strideLengthM / hf0.strideLengthM).toFixed(2) + 'x', 'Model reach factor');
    check('overstride_locked_knee', 'overstride', of0.right.anglesDeg.kneeFlex <= 1.2 && of12.right.anglesDeg.kneeFlex <= 1.2, '<= 1.2 deg locked', of12.right.anglesDeg.kneeFlex.toFixed(1) + ' deg', 'Model locked strike');
    check('overstride_braking_spike', 'overstride', summaryByHabit.overstride.peakBrakingGrfPctBw <= -33, '<= -33% BW', summaryByHabit.overstride.peakBrakingGrfPctBw.toFixed(1) + '% BW', 'Model braking impulse');

    const cf15 = framesByHabit.crossover_valgus[Math.round(0.15 * N)];
    check('crossover_midline_foot', 'crossover_valgus', cf15.right.footContact.ballWorld[0] >= -0.002, 'crosses midline (>= 0)', cf15.right.footContact.ballWorld[0].toFixed(3) + ' m', 'Meardon et al. (2012)');
    check('crossover_pelvic_drop_valgus', 'crossover_valgus', Math.abs(cf15.axial.pelvisObliquityDeg) >= 11 && cf15.right.anglesDeg.hipAdduction >= 15 && cf15.right.anglesDeg.hipInternalRot >= 11, '>= 11 deg drop, >= 15 deg solved add, >= 11 deg intRot', [Math.abs(cf15.axial.pelvisObliquityDeg), cf15.right.anglesDeg.hipAdduction, cf15.right.anglesDeg.hipInternalRot].map(function (x) { return x.toFixed(1); }).join('/'), 'Powers (2010)');
    check('crossover_itb_kam_spike', 'crossover_valgus', cf15.right.muscles.itBand >= 0.85 && cf15.right.kneeStress.kamNorm > hf12.right.kneeStress.kamNorm * 1.8, 'high ITB + elevated KAM', 'itb=' + cf15.right.muscles.itBand.toFixed(2) + ', kam=' + cf15.right.kneeStress.kamNorm.toFixed(2), 'Miyazaki et al. (2002)');

    const tf32 = framesByHabit.toe_clench[Math.round(0.32 * N)];
    const minToeCoContract = Math.min.apply(null, framesByHabit.toe_clench.map(function (f) {
      return Math.min(f.right.muscles.quads, f.right.muscles.hamstrings, f.right.muscles.gastrocSoleus);
    }));
    check('toe_clench_heel_elevated', 'toe_clench', summaryByHabit.toe_clench.minHeelWorldMeters > 0.025, '> 0.025 m all cycle', summaryByHabit.toe_clench.minHeelWorldMeters.toFixed(3) + ' m', 'Perry et al. (2003)');
    check('toe_clench_bent_knee_co_contraction', 'toe_clench', tf32.right.anglesDeg.kneeFlex >= 15 && minToeCoContract >= 0.35, 'knee >= 15 deg, min co-activation >= 0.35', 'knee=' + tf32.right.anglesDeg.kneeFlex.toFixed(1) + ', emg=' + minToeCoContract.toFixed(2), 'Hodges et al. (2016)');

    const pf0 = framesByHabit.phone_glide[0];
    const healthyArc = summaryByHabit.healthy.comVerticalArcCm;
    const phoneArc = summaryByHabit.phone_glide.comVerticalArcCm;
    const arcReductionPct = ((healthyArc - phoneArc) / healthyArc) * 100;
    check('phone_glide_neck_arms', 'phone_glide', pf0.axial.cervicalFlexDeg >= 27.5 && pf0.right.anglesDeg.shoulderSwing === 0 && pf0.axial.phoneTransform.visible, 'neck >= 27.5 deg, arm=0, phone visible', 'neck=' + pf0.axial.cervicalFlexDeg + ', arm=' + pf0.right.anglesDeg.shoulderSwing, 'Collins et al. (2009)');
    check('phone_glide_com_flattening', 'phone_glide', arcReductionPct >= 55, '>= 55% COM arc reduction', arcReductionPct.toFixed(1) + '% (' + phoneArc.toFixed(2) + ' vs ' + healthyArc.toFixed(2) + ' cm)', 'Ortega & Farley (2005)');

    const fWrapA = GaitCore.solveGaitFrame(registry, 'healthy', 0.995);
    const fWrapB = GaitCore.solveGaitFrame(registry, 'healthy', 0.005);
    const wrapKneeJump = Math.abs(fWrapA.right.anglesDeg.kneeFlex - fWrapB.right.anglesDeg.kneeFlex);
    check('periodic_wrap_continuity', 'healthy', wrapKneeJump < 2.5, '< 2.5 deg delta across wrap', wrapKneeJump.toFixed(2) + ' deg', 'Spline C1 continuity');

    return Object.freeze({
      passed: failures.length === 0,
      checksExecuted,
      failures: Object.freeze(failures),
      summaryByHabit: Object.freeze(summaryByHabit),
    });
  }

  /**
   * Single verified boot entrypoint hiding raw tables and failing loud on any invariant break.
   * @param {{heightM?: number, bodyMassKg?: number}} [anthropometricsInput]
   * @returns {{registry: Readonly<object>, report: Readonly<object>}}
   */
  function createVerifiedGaitRegistry(anthropometricsInput) {
    const anth = GaitCore.createAnthropometrics(anthropometricsInput);
    const registry = GaitCore.parseAndBuildRegistry(anth);
    const report = verifyBiomechanicsSuite(registry);
    if (!report.passed) {
      throw new BiomechanicsInvariantError(report.failures);
    }
    return Object.freeze({ registry, report });
  }

  global.GaitInvariants = Object.freeze({
    BiomechanicsInvariantError,
    verifyBiomechanicsSuite,
    createVerifiedGaitRegistry,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
