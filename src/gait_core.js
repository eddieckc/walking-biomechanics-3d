(function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180;

  const HABIT_IDS = Object.freeze([
    'healthy',
    'overstride',
    'crossover_valgus',
    'toe_clench',
    'phone_glide',
  ]);

  /**
   * Normalizes any finite cycle phase into [0, 1).
   * @param {number} rawPhase
   * @returns {number}
   */
  function wrapPhase01(rawPhase) {
    if (typeof rawPhase !== 'number' || !Number.isFinite(rawPhase)) {
      throw new RangeError('wrapPhase01 requires a finite number');
    }
    const wrapped = ((rawPhase % 1) + 1) % 1;
    return wrapped >= 1 ? 0 : wrapped;
  }

  /**
   * Parses and freezes anthropometric scaling parameters using Winter (2009) segment ratios.
   * @param {{heightM?: number, bodyMassKg?: number}} [raw]
   * @returns {Readonly<object>}
   */
  function createAnthropometrics(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const heightM = src.heightM === undefined ? 1.75 : Number(src.heightM);
    const bodyMassKg = src.bodyMassKg === undefined ? 72 : Number(src.bodyMassKg);
    if (!Number.isFinite(heightM) || heightM < 1.3 || heightM > 2.2) {
      throw new RangeError('heightM must be finite within [1.30, 2.20] m');
    }
    if (!Number.isFinite(bodyMassKg) || bodyMassKg < 35 || bodyMassKg > 160) {
      throw new RangeError('bodyMassKg must be finite within [35, 160] kg');
    }
    return Object.freeze({
      heightM,
      bodyMassKg,
      pelvisHalfWidthM: 0.095 * (heightM / 1.75),
      pelvisHeightM: 0.11 * (heightM / 1.75),
      thighLenM: 0.245 * heightM,
      shankLenM: 0.246 * heightM,
      ankleHeightM: 0.039 * heightM,
      footRearLenM: 0.028 * heightM,
      footMidLenM: 0.074 * heightM,
      footForeLenM: 0.038 * heightM,
      soleThicknessM: 0.016,
      torsoLenM: 0.288 * heightM,
      neckLenM: 0.058 * heightM,
      headRadiusM: 0.058 * heightM,
      shoulderHalfWidthM: 0.195 * (heightM / 1.75),
      upperArmLenM: 0.186 * heightM,
      forearmLenM: 0.146 * heightM,
    });
  }

  function validatePeriodicKnots(rawPoints, fieldName) {
    if (!Array.isArray(rawPoints) || rawPoints.length < 3) {
      throw new RangeError('Curve ' + fieldName + ' requires at least 3 keyframes');
    }
    const points = rawPoints.map(function (pt, idx) {
      if (!pt || !Number.isFinite(pt.pct) || !Number.isFinite(pt.value)) {
        throw new RangeError('Invalid knot in ' + fieldName + ' at index ' + idx);
      }
      return Object.freeze({ pct: pt.pct, value: pt.value });
    });
    if (points[0].pct !== 0 || points[points.length - 1].pct !== 100) {
      throw new RangeError('Curve ' + fieldName + ' must span 0..100 pct');
    }
    if (Math.abs(points[0].value - points[points.length - 1].value) > 1e-6) {
      throw new RangeError('Curve ' + fieldName + ' is not periodic at 0 and 100');
    }
    for (let i = 1; i < points.length; i += 1) {
      if (points[i].pct <= points[i - 1].pct) {
        throw new RangeError('Curve ' + fieldName + ' pct must strictly increase');
      }
    }
    return Object.freeze(points);
  }

  /**
   * Time-normalized PCHIP-clamped periodic cubic Hermite interpolation over [0, 1).
   * Zero overshoot across unevenly spaced clinical keyframes (e.g. 8% -> 12% -> 30%).
   * @param {readonly {pct: number, value: number}[]} points
   * @param {number} phase01
   * @returns {number}
   */
  function sampleCyclicCurve(points, phase01) {
    const p = wrapPhase01(phase01) * 100;
    const n = points.length - 1;
    let seg = 0;
    for (let i = 0; i < n; i += 1) {
      if (p >= points[i].pct && p <= points[i + 1].pct) {
        seg = i;
        break;
      }
    }

    function secantSlope(i) {
      const i0 = ((i % n) + n) % n;
      const i1 = i0 + 1;
      const dt = points[i1].pct - points[i0].pct;
      return (points[i1].value - points[i0].value) / dt;
    }

    function pchipTangent(idx) {
      const k = ((idx % n) + n) % n;
      const prevIdx = (k - 1 + n) % n;
      const dPrev = secantSlope(prevIdx);
      const dNext = secantSlope(k);
      if (dPrev === 0 || dNext === 0 || dPrev * dNext < 0) {
        return 0;
      }
      const hPrev = points[prevIdx + 1].pct - points[prevIdx].pct;
      const hNext = points[k + 1].pct - points[k].pct;
      const w1 = 2 * hNext + hPrev;
      const w2 = hNext + 2 * hPrev;
      return (w1 + w2) / (w1 / dPrev + w2 / dNext);
    }

    const x0 = points[seg].pct;
    const x1 = points[seg + 1].pct;
    const h = x1 - x0;
    const t = (p - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const m0 = pchipTangent(seg);
    const m1 = pchipTangent(seg + 1);
    return h00 * points[seg].value + h10 * h * m0 + h01 * points[seg + 1].value + h11 * h * m1;
  }

  function k(pct, value) {
    return { pct, value };
  }

  function buildRawProfiles() {
    const healthyHipSag = [
      k(0, 22), k(10, 19), k(20, 9), k(30, 0), k(40, -9),
      k(50, -15), k(60, -2), k(73, 21), k(84, 27), k(93, 24), k(100, 22),
    ];
    const healthyKneeSag = [
      k(0, 4), k(12, 16), k(32, 2), k(42, 6), k(50, 25), k(60, 48),
      k(73, 62), k(84, 38), k(92, 14), k(100, 4),
    ];
    const healthyAnkleSag = [
      k(0, 0), k(8, -7), k(30, 6), k(44, 11), k(50, 0), k(60, -16),
      k(68, 5), k(75, 6), k(84, 4), k(93, 1), k(100, 0),
    ];
    const healthyMtp = [
      k(0, 0), k(40, 0), k(50, 36), k(60, 38), k(68, 5), k(100, 0),
    ];
    const healthyVertGrf = [
      k(0, 0), k(4, 0.72), k(12, 1.15), k(32, 0.80), k(48, 1.20),
      k(60, 0.12), k(63, 0), k(100, 0),
    ];
    const healthyForeAftGrf = [
      k(0, 0), k(12, -0.18), k(30, 0), k(50, 0.20), k(61, 0), k(100, 0),
    ];
    const healthyMlGrf = [
      k(0, 0), k(12, 0.05), k(32, 0.04), k(48, 0.05), k(62, 0), k(100, 0),
    ];
    const healthyPelvisObl = [
      k(0, 0), k(15, -4.5), k(35, -3.5), k(50, 0), k(65, 4.5), k(85, 3.5), k(100, 0),
    ];
    const healthyPelvisRot = [
      k(0, 4.5), k(25, 0), k(50, -4.5), k(75, 0), k(100, 4.5),
    ];
    const healthyThoraxRot = [
      k(0, -4.0), k(25, 0), k(50, 4.0), k(75, 0), k(100, -4.0),
    ];
    const healthyArmSwing = [
      k(0, -20), k(25, -5), k(50, 10), k(75, -5), k(100, -20),
    ];
    const healthyElbow = [
      k(0, 18), k(25, 24), k(50, 32), k(75, 24), k(100, 18),
    ];
    const zeroCurve = [k(0, 0), k(50, 0), k(100, 0)];

    return {
      healthy: {
        id: 'healthy',
        label: 'Healthy Heel-to-Toe Pendulum',
        shortLabel: 'Healthy Baseline',
        clinicalSummary: 'Soft 16 deg knee loading wave, hip-width tracks, elastic Achilles push-off, and counter-rotating arms.',
        citations: ['Winter (2009)', 'Perry (2010)', 'Selinger et al. (2015)', 'Collins et al. (2009)'],
        cadenceHz: 0.92,
        strideLengthScale: 1.0,
        stepWidthM: 0.14,
        footOutDeg: 7,
        handProp: 'none',
        curves: {
          hipSagittalDeg: healthyHipSag,
          hipInternalRotDeg: [k(0, 2), k(30, 1), k(60, 0), k(100, 2)],
          kneeSagittalDeg: healthyKneeSag,
          kneeValgusDeg: zeroCurve,
          ankleSagittalDeg: healthyAnkleSag,
          mtpToeBreakDeg: healthyMtp,
          pelvisObliquityDeg: healthyPelvisObl,
          pelvisTransverseDeg: healthyPelvisRot,
          thoraxCounterRotDeg: healthyThoraxRot,
          thoraxPitchDeg: [k(0, 2.5), k(50, 2.5), k(100, 2.5)],
          cervicalFlexDeg: [k(0, 3), k(50, 3), k(100, 3)],
          shoulderSwingDeg: healthyArmSwing,
          elbowFlexDeg: healthyElbow,
          verticalGrfBw: healthyVertGrf,
          foreAftGrfBw: healthyForeAftGrf,
          medioLateralGrfBw: healthyMlGrf,
          kamNorm: [k(0, 0), k(12, 0.38), k(30, 0.28), k(48, 0.36), k(62, 0), k(100, 0)],
          patellofemoralStress01: [k(0, 0.05), k(12, 0.34), k(35, 0.14), k(55, 0.22), k(73, 0.08), k(100, 0.05)],
          quadsEmg01: [k(0, 0.32), k(12, 0.42), k(35, 0.08), k(55, 0.15), k(80, 0.08), k(95, 0.28), k(100, 0.32)],
          hamstringsEmg01: [k(0, 0.36), k(10, 0.18), k(45, 0.06), k(78, 0.18), k(92, 0.44), k(100, 0.36)],
          gluteMedEmg01: [k(0, 0.26), k(15, 0.45), k(40, 0.34), k(58, 0.08), k(85, 0.10), k(100, 0.26)],
          gastrocEmg01: [k(0, 0.06), k(20, 0.22), k(48, 0.56), k(60, 0.18), k(85, 0.05), k(100, 0.06)],
          achillesStrain01: [k(0, 0.08), k(25, 0.28), k(48, 0.58), k(62, 0.12), k(85, 0.05), k(100, 0.08)],
          itBandStrain01: [k(0, 0.18), k(15, 0.26), k(45, 0.20), k(75, 0.12), k(100, 0.18)],
          medialMeniscusLoad01: [k(0, 0.12), k(12, 0.36), k(32, 0.28), k(48, 0.38), k(65, 0.06), k(100, 0.12)],
          lateralMeniscusLoad01: [k(0, 0.10), k(12, 0.30), k(32, 0.24), k(48, 0.32), k(65, 0.06), k(100, 0.10)],
        },
        badges: [
          { label: 'Knee Loading Wave', value: '16 deg cushion', citation: 'Winter (2009)', tone: 'baseline' },
          { label: 'Braking Peak', value: '-18% BW', citation: 'Perry (2010)', tone: 'baseline' },
          { label: 'Metabolic Cost', value: 'Baseline optimum', citation: 'Selinger et al. (2015)', tone: 'baseline' },
        ],
      },
      overstride: {
        id: 'overstride',
        label: 'Overstriding + Locked 0 deg Knee',
        shortLabel: 'Overstride',
        clinicalSummary: 'Model +25% reach onto a 0.8 deg knee produces -34% BW braking; shortening overstride (-15%) cuts knee TF impulse 12-28% (Milner 2018).',
        citations: ['Milner et al. (2018)', 'Willson et al. (2014)'],
        cadenceHz: 0.78,
        strideLengthScale: 1.25,
        stepWidthM: 0.14,
        footOutDeg: 7,
        handProp: 'none',
        curves: {
          hipSagittalDeg: [
            k(0, 31), k(10, 26), k(20, 14), k(30, 1), k(40, -10),
            k(50, -17), k(60, 16), k(68, 28), k(76, 30), k(88, 31), k(100, 31),
          ],
          hipInternalRotDeg: [k(0, 2), k(30, 1), k(60, 0), k(100, 2)],
          kneeSagittalDeg: [
            k(0, 0.5), k(8, 0.8), k(18, 1.0), k(35, 3), k(50, 4),
            k(60, 56), k(70, 64), k(84, 34), k(92, 12), k(97, 2), k(100, 0.5),
          ],
          kneeValgusDeg: zeroCurve,
          ankleSagittalDeg: [
            k(0, 4), k(8, -10), k(30, 6), k(48, 11), k(60, 0), k(67, 9), k(76, 8), k(85, 5), k(100, 4),
          ],
          mtpToeBreakDeg: healthyMtp,
          pelvisObliquityDeg: healthyPelvisObl,
          pelvisTransverseDeg: [k(0, 6.5), k(25, 0), k(50, -6.5), k(75, 0), k(100, 6.5)],
          thoraxCounterRotDeg: [k(0, -5), k(25, 0), k(50, 5), k(75, 0), k(100, -5)],
          thoraxPitchDeg: [k(0, -1), k(50, -1), k(100, -1)],
          cervicalFlexDeg: [k(0, 3), k(50, 3), k(100, 3)],
          shoulderSwingDeg: [k(0, -24), k(25, -5), k(50, 14), k(75, -5), k(100, -24)],
          elbowFlexDeg: healthyElbow,
          verticalGrfBw: [
            k(0, 0), k(4, 1.02), k(12, 1.34), k(32, 0.78), k(48, 1.22), k(60, 0.12), k(63, 0), k(100, 0),
          ],
          foreAftGrfBw: [
            k(0, 0), k(10, -0.34), k(30, -0.02), k(50, 0.22), k(61, 0), k(100, 0),
          ],
          medioLateralGrfBw: healthyMlGrf,
          kamNorm: [k(0, 0), k(12, 0.54), k(30, 0.34), k(48, 0.42), k(62, 0), k(100, 0)],
          patellofemoralStress01: [k(0, 0.12), k(12, 0.86), k(35, 0.32), k(55, 0.28), k(73, 0.10), k(100, 0.12)],
          quadsEmg01: [k(0, 0.62), k(12, 0.82), k(35, 0.24), k(55, 0.18), k(85, 0.14), k(100, 0.62)],
          hamstringsEmg01: [k(0, 0.52), k(12, 0.28), k(45, 0.10), k(80, 0.28), k(92, 0.58), k(100, 0.52)],
          gluteMedEmg01: [k(0, 0.30), k(15, 0.48), k(40, 0.36), k(60, 0.10), k(100, 0.30)],
          gastrocEmg01: [k(0, 0.08), k(20, 0.26), k(48, 0.60), k(62, 0.18), k(100, 0.08)],
          achillesStrain01: [k(0, 0.10), k(25, 0.30), k(48, 0.60), k(65, 0.10), k(100, 0.10)],
          itBandStrain01: [k(0, 0.22), k(15, 0.36), k(45, 0.24), k(75, 0.14), k(100, 0.22)],
          medialMeniscusLoad01: [k(0, 0.22), k(12, 0.82), k(32, 0.40), k(48, 0.52), k(65, 0.08), k(100, 0.22)],
          lateralMeniscusLoad01: [k(0, 0.18), k(12, 0.72), k(32, 0.36), k(48, 0.46), k(65, 0.08), k(100, 0.18)],
        },
        badges: [
          { label: 'Model Reach & Brake', value: '+25% reach / -34% BW', citation: 'Model (0.8 deg locked strike)', tone: 'overload' },
          { label: 'Short-Step Relief', value: '-12% to -28% TF impulse', citation: 'Milner et al. (2018) (-15% step)', tone: 'overload' },
          { label: 'PF Sensitivity (Run)', value: '+31% / step (+10% reach)', citation: 'Willson et al. (2014)', tone: 'caution' },
        ],
      },
      crossover_valgus: {
        id: 'crossover_valgus',
        label: 'Crossover Walk + Pelvic Drop & Knee Cave',
        shortLabel: 'Crossover Valgus',
        clinicalSummary: 'Model -0.02 m crossover, 11.5 deg Trendelenburg drop, and 13 deg femur twist raise ITB strain and medial KAM.',
        citations: ['Meardon et al. (2012)', 'Powers (2010)', 'Miyazaki et al. (2002)'],
        cadenceHz: 0.90,
        strideLengthScale: 0.98,
        stepWidthM: -0.02,
        footOutDeg: 2,
        handProp: 'none',
        curves: {
          hipSagittalDeg: [
            k(0, 22), k(10, 19), k(20, 9), k(30, 0), k(40, -9),
            k(50, -14), k(60, 14), k(68, 27), k(78, 30), k(86, 27), k(100, 22),
          ],
          hipInternalRotDeg: [
            k(0, 7), k(18, 13), k(38, 11), k(55, 4), k(80, 2), k(100, 7),
          ],
          kneeSagittalDeg: [
            k(0, 3), k(12, 16), k(32, 2), k(42, 6), k(50, 25), k(60, 54),
            k(68, 70), k(74, 72), k(82, 42), k(92, 14), k(100, 3),
          ],
          kneeValgusDeg: [
            k(0, 4), k(15, 11), k(35, 9), k(52, 3), k(75, 1), k(100, 4),
          ],
          ankleSagittalDeg: [
            k(0, 0), k(8, -7), k(30, 6), k(44, 11), k(50, 0), k(60, 0),
            k(68, 9), k(76, 10), k(86, 8), k(100, 0),
          ],
          mtpToeBreakDeg: healthyMtp,
          pelvisObliquityDeg: [
            k(0, 0), k(15, -11.5), k(35, -9.5), k(50, 0), k(65, 11.5), k(85, 9.5), k(100, 0),
          ],
          pelvisTransverseDeg: [k(0, 6), k(25, 0), k(50, -6), k(75, 0), k(100, 6)],
          thoraxCounterRotDeg: [k(0, -4.5), k(25, 0), k(50, 4.5), k(75, 0), k(100, -4.5)],
          thoraxPitchDeg: [k(0, 2.5), k(50, 2.5), k(100, 2.5)],
          cervicalFlexDeg: [k(0, 3), k(50, 3), k(100, 3)],
          shoulderSwingDeg: healthyArmSwing,
          elbowFlexDeg: healthyElbow,
          verticalGrfBw: healthyVertGrf,
          foreAftGrfBw: healthyForeAftGrf,
          medioLateralGrfBw: [k(0, 0), k(15, 0.14), k(35, 0.12), k(50, 0.11), k(62, 0), k(100, 0)],
          kamNorm: [k(0, 0), k(15, 0.92), k(32, 0.78), k(48, 0.88), k(62, 0), k(100, 0)],
          patellofemoralStress01: [k(0, 0.14), k(15, 0.88), k(35, 0.68), k(52, 0.44), k(75, 0.10), k(100, 0.14)],
          quadsEmg01: [k(0, 0.34), k(15, 0.56), k(35, 0.22), k(55, 0.18), k(100, 0.34)],
          hamstringsEmg01: [
            k(0, 0.36), k(15, 0.24), k(40, 0.12), k(65, 0.18), k(90, 0.40), k(100, 0.36),
          ],
          gluteMedEmg01: [k(0, 0.12), k(15, 0.16), k(35, 0.14), k(55, 0.08), k(100, 0.12)],
          gastrocEmg01: [k(0, 0.06), k(20, 0.24), k(48, 0.58), k(62, 0.18), k(100, 0.06)],
          achillesStrain01: [k(0, 0.10), k(25, 0.28), k(48, 0.56), k(65, 0.12), k(100, 0.10)],
          itBandStrain01: [k(0, 0.42), k(15, 0.94), k(35, 0.86), k(52, 0.64), k(75, 0.26), k(100, 0.42)],
          medialMeniscusLoad01: [k(0, 0.22), k(15, 0.92), k(32, 0.76), k(48, 0.88), k(62, 0.10), k(100, 0.22)],
          lateralMeniscusLoad01: [k(0, 0.16), k(15, 0.64), k(32, 0.54), k(48, 0.58), k(62, 0.08), k(100, 0.16)],
        },
        badges: [
          { label: 'IT-Band & Hip Drop', value: 'Model: 11.5 deg / -0.02 m', citation: 'Meardon et al. (2012)', tone: 'overload' },
          { label: 'OA Progression', value: '6.46x / +1 %BW*ht KAM', citation: 'Miyazaki et al. (2002)', tone: 'overload' },
          { label: 'Proximal Valgus', value: 'Model: 13 deg twist', citation: 'Powers (2010) JOSPT', tone: 'caution' },
        ],
      },
      toe_clench: {
        id: 'toe_clench',
        label: 'Forefoot / Toe-Walk + Muscle Clenching',
        shortLabel: 'Toe-Walk + Clench',
        clinicalSummary: 'Heel never touches floor (-19 deg ankle), continuous quad/calf co-contraction clamps knee cartilage and spikes O2 cost +53%.',
        citations: ['Cunningham et al. (2010)', 'Hodges et al. (2016)', 'Perry et al. (2003)'],
        cadenceHz: 0.96,
        strideLengthScale: 0.88,
        stepWidthM: 0.13,
        footOutDeg: 5,
        handProp: 'none',
        curves: {
          hipSagittalDeg: [
            k(0, 18), k(15, 14), k(35, 4), k(50, -8), k(62, 0), k(76, 25), k(90, 22), k(100, 18),
          ],
          hipInternalRotDeg: [k(0, 2), k(50, 1), k(100, 2)],
          kneeSagittalDeg: [
            k(0, 18), k(15, 22), k(35, 17), k(50, 18), k(62, 42), k(75, 68), k(90, 24), k(100, 18),
          ],
          kneeValgusDeg: zeroCurve,
          ankleSagittalDeg: [
            k(0, -19), k(15, -18), k(35, -18), k(50, -21), k(60, -24), k(75, -18), k(100, -19),
          ],
          mtpToeBreakDeg: [
            k(0, 22), k(15, 24), k(35, 24), k(50, 32), k(60, 34), k(75, 14), k(100, 22),
          ],
          pelvisObliquityDeg: [k(0, 0), k(25, -2.5), k(50, 0), k(75, 2.5), k(100, 0)],
          pelvisTransverseDeg: [k(0, 2.5), k(25, 0), k(50, -2.5), k(75, 0), k(100, 2.5)],
          thoraxCounterRotDeg: [k(0, -2), k(25, 0), k(50, 2), k(75, 0), k(100, -2)],
          thoraxPitchDeg: [k(0, 4), k(50, 4), k(100, 4)],
          cervicalFlexDeg: [k(0, 4), k(50, 4), k(100, 4)],
          shoulderSwingDeg: [k(0, -14), k(25, -3), k(50, 8), k(75, -3), k(100, -14)],
          elbowFlexDeg: [k(0, 22), k(50, 30), k(100, 22)],
          verticalGrfBw: [
            k(0, 0), k(5, 0.92), k(14, 1.18), k(32, 0.92), k(48, 1.12), k(60, 0.14), k(63, 0), k(100, 0),
          ],
          foreAftGrfBw: [
            k(0, 0), k(12, -0.16), k(32, 0), k(50, 0.16), k(61, 0), k(100, 0),
          ],
          medioLateralGrfBw: healthyMlGrf,
          kamNorm: [k(0, 0), k(15, 0.56), k(32, 0.52), k(48, 0.58), k(62, 0), k(100, 0)],
          patellofemoralStress01: [k(0, 0.56), k(15, 0.72), k(35, 0.64), k(50, 0.62), k(75, 0.34), k(100, 0.56)],
          quadsEmg01: [k(0, 0.68), k(15, 0.78), k(35, 0.66), k(55, 0.62), k(80, 0.44), k(100, 0.68)],
          hamstringsEmg01: [k(0, 0.58), k(15, 0.64), k(35, 0.54), k(55, 0.50), k(80, 0.48), k(100, 0.58)],
          gluteMedEmg01: [k(0, 0.38), k(25, 0.44), k(55, 0.34), k(80, 0.28), k(100, 0.38)],
          gastrocEmg01: [k(0, 0.74), k(15, 0.88), k(35, 0.84), k(52, 0.92), k(75, 0.58), k(100, 0.74)],
          achillesStrain01: [k(0, 0.70), k(15, 0.82), k(35, 0.80), k(52, 0.90), k(75, 0.52), k(100, 0.70)],
          itBandStrain01: [k(0, 0.26), k(25, 0.34), k(55, 0.26), k(100, 0.26)],
          medialMeniscusLoad01: [k(0, 0.64), k(15, 0.82), k(35, 0.78), k(52, 0.80), k(75, 0.38), k(100, 0.64)],
          lateralMeniscusLoad01: [k(0, 0.58), k(15, 0.72), k(35, 0.70), k(52, 0.70), k(75, 0.34), k(100, 0.58)],
        },
        badges: [
          { label: 'Energy Cost', value: '+53% O2 penalty', citation: 'Cunningham et al. (2010)', tone: 'overload' },
          { label: 'Co-Contraction MRI', value: '-0.14%/yr / +1% co-act', citation: 'Hodges et al. (2016)', tone: 'overload' },
          { label: 'Calf Tonic EMG', value: 'Heel up (tonic +EMG)', citation: 'Perry et al. (2003)', tone: 'caution' },
        ],
      },
      phone_glide: {
        id: 'phone_glide',
        label: 'Phone Gaze + Rigid Arms + Flat-Head Glide',
        shortLabel: 'Phone + Flat Glide',
        clinicalSummary: '28 deg neck tilt, locked arms (+12% O2, losing 63% torque cancel), and bent-knee COM flattening (model -56%; Ortega -69% -> +100% O2).',
        citations: ['Ortega & Farley (2005)', 'Collins et al. (2009)'],
        cadenceHz: 0.90,
        strideLengthScale: 0.78,
        stepWidthM: 0.14,
        footOutDeg: 7,
        handProp: 'phone',
        curves: {
          hipSagittalDeg: [
            k(0, 14), k(15, 11), k(32, 3), k(45, -6), k(50, -9), k(62, 6), k(75, 24), k(85, 22), k(100, 14),
          ],
          hipInternalRotDeg: [k(0, 2), k(40, 1), k(100, 2)],
          kneeSagittalDeg: [
            k(0, 5), k(15, 26), k(32, 30), k(45, 25), k(50, 22), k(62, 52),
            k(74, 70), k(84, 38), k(92, 16), k(100, 5),
          ],
          kneeValgusDeg: zeroCurve,
          ankleSagittalDeg: [
            k(0, 0), k(10, 4), k(32, 13), k(45, 11), k(50, 0), k(60, -10), k(68, 5), k(76, 8), k(85, 7), k(100, 0),
          ],
          mtpToeBreakDeg: [
            k(0, 0), k(42, 0), k(50, 32), k(60, 34), k(68, 4), k(100, 0),
          ],
          pelvisObliquityDeg: [k(0, 0), k(25, -1.5), k(50, 0), k(75, 1.5), k(100, 0)],
          pelvisTransverseDeg: [k(0, 6.5), k(25, 0), k(50, -6.5), k(75, 0), k(100, 6.5)],
          thoraxCounterRotDeg: [k(0, 2.5), k(25, 0), k(50, -2.5), k(75, 0), k(100, 2.5)],
          thoraxPitchDeg: [k(0, 9), k(50, 9), k(100, 9)],
          cervicalFlexDeg: [k(0, 28), k(50, 28), k(100, 28)],
          shoulderSwingDeg: [k(0, 0), k(50, 0), k(100, 0)],
          elbowFlexDeg: [k(0, 74), k(50, 74), k(100, 74)],
          verticalGrfBw: [
            k(0, 0), k(12, 1.08), k(32, 0.95), k(48, 1.10), k(62, 0), k(100, 0),
          ],
          foreAftGrfBw: [
            k(0, 0), k(12, -0.16), k(32, 0), k(50, 0.17), k(61, 0), k(100, 0),
          ],
          medioLateralGrfBw: [k(0, 0), k(15, 0.07), k(48, 0.07), k(62, 0), k(100, 0)],
          kamNorm: [k(0, 0), k(15, 0.44), k(32, 0.42), k(48, 0.46), k(62, 0), k(100, 0)],
          patellofemoralStress01: [k(0, 0.50), k(15, 0.78), k(32, 0.76), k(50, 0.56), k(74, 0.14), k(100, 0.50)],
          quadsEmg01: [k(0, 0.62), k(15, 0.84), k(32, 0.82), k(50, 0.64), k(76, 0.18), k(100, 0.62)],
          hamstringsEmg01: [k(0, 0.34), k(25, 0.24), k(55, 0.22), k(90, 0.40), k(100, 0.34)],
          gluteMedEmg01: [k(0, 0.28), k(20, 0.42), k(50, 0.28), k(100, 0.28)],
          gastrocEmg01: [k(0, 0.18), k(25, 0.38), k(48, 0.56), k(75, 0.10), k(100, 0.18)],
          achillesStrain01: [k(0, 0.18), k(28, 0.38), k(48, 0.54), k(75, 0.10), k(100, 0.18)],
          itBandStrain01: [k(0, 0.20), k(25, 0.28), k(50, 0.20), k(100, 0.20)],
          medialMeniscusLoad01: [k(0, 0.36), k(15, 0.58), k(32, 0.56), k(48, 0.58), k(75, 0.12), k(100, 0.36)],
          lateralMeniscusLoad01: [k(0, 0.34), k(15, 0.52), k(32, 0.50), k(48, 0.52), k(75, 0.10), k(100, 0.34)],
        },
        badges: [
          { label: 'Flat COM Glide', value: 'Model -56% | -69%->+100%', citation: 'Ortega & Farley (2005)', tone: 'overload' },
          { label: 'No Arm Swing', value: '+12% O2; -63% cancel', citation: 'Collins et al. (2009)', tone: 'overload' },
          { label: 'Phone Neck Tilt', value: '+28 deg cervical flex', citation: 'Posture kinematic load', tone: 'caution' },
        ],
      },
    };
  }

  function validateAndFreezeProfile(raw) {
    if (!raw || typeof raw !== 'object' || HABIT_IDS.indexOf(raw.id) === -1) {
      throw new RangeError('Invalid habit profile id');
    }
    const frozenCurves = {};
    const curveKeys = Object.keys(raw.curves);
    for (let i = 0; i < curveKeys.length; i += 1) {
      const name = curveKeys[i];
      frozenCurves[name] = validatePeriodicKnots(raw.curves[name], raw.id + '.' + name);
    }
    return Object.freeze({
      id: raw.id,
      label: String(raw.label),
      shortLabel: String(raw.shortLabel),
      clinicalSummary: String(raw.clinicalSummary),
      citations: Object.freeze(raw.citations.slice()),
      cadenceHz: Number(raw.cadenceHz),
      strideLengthScale: Number(raw.strideLengthScale),
      stepWidthM: Number(raw.stepWidthM),
      footOutDeg: Number(raw.footOutDeg),
      handProp: raw.handProp === 'phone' ? 'phone' : 'none',
      curves: Object.freeze(frozenCurves),
      badges: Object.freeze(raw.badges.map(function (b) { return Object.freeze(Object.assign({}, b)); })),
    });
  }

  function qIdentity() {
    return [0, 0, 0, 1];
  }

  function qMul(a, b) {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3];
    const bx = b[0], by = b[1], bz = b[2], bw = b[3];
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  }

  function qAxisX(rad) {
    const h = rad * 0.5;
    return [Math.sin(h), 0, 0, Math.cos(h)];
  }

  function qAxisY(rad) {
    const h = rad * 0.5;
    return [0, Math.sin(h), 0, Math.cos(h)];
  }

  function qAxisZ(rad) {
    const h = rad * 0.5;
    return [0, 0, Math.sin(h), Math.cos(h)];
  }

  function vRotateQ(v, q) {
    const vx = v[0], vy = v[1], vz = v[2];
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const ix = qw * vx + qy * vz - qz * vy;
    const iy = qw * vy + qz * vx - qx * vz;
    const iz = qw * vz + qx * vy - qy * vx;
    const iw = -qx * vx - qy * vy - qz * vz;
    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ];
  }

  function vAdd(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function worldPoint(origin, quat, localVec) {
    return vAdd(origin, vRotateQ(localVec, quat));
  }

  function evaluateSidePose(profile, side, pSide, pelvisPos, pelvisQuat, pelvisOblDeg, thoraxPos, thoraxQuat, anth) {
    const sideSign = side === 'left' ? 1 : -1;
    const c = profile.curves;

    const hipFlexDeg = sampleCyclicCurve(c.hipSagittalDeg, pSide);
    const hipIntRotDeg = sampleCyclicCurve(c.hipInternalRotDeg, pSide);
    const kneeFlexDeg = sampleCyclicCurve(c.kneeSagittalDeg, pSide);
    const kneeValgusDeg = sampleCyclicCurve(c.kneeValgusDeg, pSide);
    const ankleDorsiDeg = sampleCyclicCurve(c.ankleSagittalDeg, pSide);
    const mtpDorsiDeg = sampleCyclicCurve(c.mtpToeBreakDeg, pSide);
    const shoulderSwingDeg = sampleCyclicCurve(c.shoulderSwingDeg, pSide);
    const elbowFlexDeg = sampleCyclicCurve(c.elbowFlexDeg, pSide);

    const hipLocalX = sideSign * anth.pelvisHalfWidthM;
    const hipCenter = worldPoint(pelvisPos, pelvisQuat, [hipLocalX, -0.025, 0]);

    const desiredFootHalfX = sideSign * (profile.stepWidthM * 0.5);
    const lateralDelta = desiredFootHalfX - hipCenter[0];
    const legSpan = anth.thighLenM + anth.shankLenM;
    const worldLaneAngleRad = Math.asin(Math.max(-0.35, Math.min(0.35, lateralDelta / legSpan)));
    const pelvisOblRad = pelvisOblDeg * DEG2RAD;
    const valgusFemurOffsetRad = -sideSign * kneeValgusDeg * DEG2RAD * (anth.shankLenM / legSpan);
    const coronalHipRad = worldLaneAngleRad - pelvisOblRad + valgusFemurOffsetRad;
    const hipAddSolvedDeg = (-sideSign * coronalHipRad) / DEG2RAD;

    // Apply coronal adduction before sagittal flexion so pelvic obliquity cancels cleanly in the coronal plane.
    const qHipCor = qAxisZ(coronalHipRad);
    const qHipSag = qAxisX(-hipFlexDeg * DEG2RAD);
    const qHipAx = qAxisY(-sideSign * hipIntRotDeg * DEG2RAD);
    const femurQuat = qMul(pelvisQuat, qMul(qHipCor, qMul(qHipSag, qHipAx)));

    const kneeCenter = worldPoint(hipCenter, femurQuat, [0, -anth.thighLenM, 0]);
    const patellaCenter = worldPoint(kneeCenter, femurQuat, [0, 0.014, 0.036]);
    const lateralEpicondyle = worldPoint(kneeCenter, femurQuat, [sideSign * 0.044, 0.01, 0]);

    const tibiaQuat = qMul(femurQuat, qMul(qAxisX(kneeFlexDeg * DEG2RAD), qAxisZ(sideSign * kneeValgusDeg * DEG2RAD)));
    const ankleCenter = worldPoint(kneeCenter, tibiaQuat, [0, -anth.shankLenM, 0]);
    const gerdyTubercle = worldPoint(kneeCenter, tibiaQuat, [sideSign * 0.036, -0.045, 0.024]);

    const hindfootQuat = qMul(tibiaQuat, qMul(qAxisX(-ankleDorsiDeg * DEG2RAD), qAxisY(sideSign * profile.footOutDeg * DEG2RAD)));
    const calcaneusTuberosity = worldPoint(ankleCenter, hindfootQuat, [0, -anth.ankleHeightM * 0.42, -anth.footRearLenM * 0.85]);
    const heelContact = worldPoint(ankleCenter, hindfootQuat, [0, -anth.ankleHeightM - anth.soleThicknessM, -anth.footRearLenM]);
    const mtpJoint = worldPoint(ankleCenter, hindfootQuat, [0, -anth.ankleHeightM * 0.82, anth.footMidLenM]);
    const mtpBallContact = worldPoint(ankleCenter, hindfootQuat, [0, -anth.ankleHeightM - anth.soleThicknessM, anth.footMidLenM]);

    const forefootQuat = qMul(hindfootQuat, qAxisX(-mtpDorsiDeg * DEG2RAD));
    const toeTipContact = worldPoint(mtpJoint, forefootQuat, [0, -anth.ankleHeightM * 0.18 - anth.soleThicknessM, anth.footForeLenM]);

    const lowestPlantarY = Math.min(heelContact[1], mtpBallContact[1], toeTipContact[1]);

    const shoulderLocalX = sideSign * anth.shoulderHalfWidthM;
    const shoulderPos = worldPoint(thoraxPos, thoraxQuat, [shoulderLocalX, anth.torsoLenM * 0.82, 0]);
    let upperArmQuat;
    let forearmQuat;
    if (profile.handProp === 'phone') {
      upperArmQuat = qMul(thoraxQuat, qMul(qAxisX(-18 * DEG2RAD), qAxisZ(-sideSign * 14 * DEG2RAD)));
      forearmQuat = qMul(upperArmQuat, qMul(qAxisX(-elbowFlexDeg * DEG2RAD), qAxisY(-sideSign * 22 * DEG2RAD)));
    } else {
      upperArmQuat = qMul(thoraxQuat, qMul(qAxisX(-shoulderSwingDeg * DEG2RAD), qAxisZ(sideSign * 5 * DEG2RAD)));
      forearmQuat = qMul(upperArmQuat, qAxisX(-elbowFlexDeg * DEG2RAD));
    }
    const elbowPos = worldPoint(shoulderPos, upperArmQuat, [0, -anth.upperArmLenM, 0]);
    const wristPos = worldPoint(elbowPos, forearmQuat, [0, -anth.forearmLenM, 0]);

    const verticalBw = sampleCyclicCurve(c.verticalGrfBw, pSide);
    const foreAftBw = sampleCyclicCurve(c.foreAftGrfBw, pSide);
    const medioLateralBw = sampleCyclicCurve(c.medioLateralGrfBw, pSide) * -sideSign;

    return {
      side,
      legPhase: pSide,
      anglesDeg: {
        hipFlex: hipFlexDeg,
        hipAdduction: hipAddSolvedDeg,
        hipInternalRot: hipIntRotDeg,
        kneeFlex: kneeFlexDeg,
        kneeValgus: kneeValgusDeg,
        ankleDorsi: ankleDorsiDeg,
        mtpDorsi: mtpDorsiDeg,
        shoulderSwing: shoulderSwingDeg,
        elbowFlex: elbowFlexDeg,
      },
      joints: {
        hip: { position: hipCenter, quaternion: femurQuat },
        knee: { position: kneeCenter, quaternion: tibiaQuat },
        patella: { position: patellaCenter, quaternion: femurQuat },
        lateralEpicondyle,
        gerdyTubercle,
        ankle: { position: ankleCenter, quaternion: hindfootQuat },
        calcaneusTuberosity,
        mtp: { position: mtpJoint, quaternion: forefootQuat },
        shoulder: { position: shoulderPos, quaternion: upperArmQuat },
        elbow: { position: elbowPos, quaternion: forearmQuat },
        wrist: { position: wristPos, quaternion: forearmQuat },
      },
      plantarRaw: {
        heelContact,
        mtpBallContact,
        toeTipContact,
        lowestPlantarY,
      },
      grf: {
        verticalBw,
        foreAftBw,
        medioLateralBw,
      },
      muscles: {
        quads: sampleCyclicCurve(c.quadsEmg01, pSide),
        hamstrings: sampleCyclicCurve(c.hamstringsEmg01, pSide),
        gluteMedius: sampleCyclicCurve(c.gluteMedEmg01, pSide),
        gastrocSoleus: sampleCyclicCurve(c.gastrocEmg01, pSide),
        achilles: sampleCyclicCurve(c.achillesStrain01, pSide),
        itBand: sampleCyclicCurve(c.itBandStrain01, pSide),
      },
      kneeStress: {
        kamNorm: sampleCyclicCurve(c.kamNorm, pSide),
        patellofemoralStress: sampleCyclicCurve(c.patellofemoralStress01, pSide),
        medialMeniscusLoad: sampleCyclicCurve(c.medialMeniscusLoad01, pSide),
        lateralMeniscusLoad: sampleCyclicCurve(c.lateralMeniscusLoad01, pSide),
      },
    };
  }

  function shiftSideY(sideRaw, offsetY, strideLengthM) {
    function shiftVec(v) {
      return [v[0], v[1] + offsetY, v[2]];
    }
    const j = sideRaw.joints;
    const heel = shiftVec(sideRaw.plantarRaw.heelContact);
    const ball = shiftVec(sideRaw.plantarRaw.mtpBallContact);
    const toe = shiftVec(sideRaw.plantarRaw.toeTipContact);
    const minY = Math.min(heel[1], ball[1], toe[1]);
    const heelGrounded = heel[1] <= 0.006;
    const forefootGrounded = Math.min(ball[1], toe[1]) <= 0.008;

    const s = Math.min(1, Math.max(0, sideRaw.legPhase / 0.6));
    const copX = heel[0] + (ball[0] - heel[0]) * s;
    const copZ = heel[2] + (ball[2] - heel[2]) * s;

    return {
      side: sideRaw.side,
      legPhase: sideRaw.legPhase,
      anglesDeg: sideRaw.anglesDeg,
      joints: {
        hip: { position: shiftVec(j.hip.position), quaternion: j.hip.quaternion },
        knee: { position: shiftVec(j.knee.position), quaternion: j.knee.quaternion },
        patella: { position: shiftVec(j.patella.position), quaternion: j.patella.quaternion },
        lateralEpicondyle: shiftVec(j.lateralEpicondyle),
        gerdyTubercle: shiftVec(j.gerdyTubercle),
        ankle: { position: shiftVec(j.ankle.position), quaternion: j.ankle.quaternion },
        calcaneusTuberosity: shiftVec(j.calcaneusTuberosity),
        mtp: { position: shiftVec(j.mtp.position), quaternion: j.mtp.quaternion },
        shoulder: { position: shiftVec(j.shoulder.position), quaternion: j.shoulder.quaternion },
        elbow: { position: shiftVec(j.elbow.position), quaternion: j.elbow.quaternion },
        wrist: { position: shiftVec(j.wrist.position), quaternion: j.wrist.quaternion },
      },
      footContact: {
        heelWorld: heel,
        ballWorld: ball,
        toeWorld: toe,
        minWorldY: minY,
        heelGrounded,
        forefootGrounded,
        isStance: sideRaw.legPhase < 0.61,
      },
      grf: {
        verticalBw: sideRaw.grf.verticalBw,
        foreAftBw: sideRaw.grf.foreAftBw,
        medioLateralBw: sideRaw.grf.medioLateralBw,
        copWorld: [copX, 0, copZ],
      },
      muscles: sideRaw.muscles,
      kneeStress: sideRaw.kneeStress,
      strideLengthM,
    };
  }

  /**
   * Evaluates full 3D gait pose, floor-contact Y clamp, GRF vectors, muscle EMG, and
   * cartilage stress for a validated registry and habitId at phase in [0, 1).
   * @param {Readonly<object>} registry
   * @param {string} habitId
   * @param {number} rawPhase
   * @returns {object}
   */
  function solveGaitFrame(registry, habitId, rawPhase) {
    const profile = getHabitProfile(registry, habitId);
    const anth = registry.anthropometrics;
    const pR = wrapPhase01(rawPhase);
    const pL = wrapPhase01(pR + 0.5);
    const c = profile.curves;

    const baseStrideM = 0.78 * anth.heightM * profile.strideLengthScale;
    const beltSpeedMps = baseStrideM * profile.cadenceHz;

    const pelvisOblDeg = sampleCyclicCurve(c.pelvisObliquityDeg, pR);
    const pelvisRotDeg = sampleCyclicCurve(c.pelvisTransverseDeg, pR);
    const thoraxRotDeg = sampleCyclicCurve(c.thoraxCounterRotDeg, pR);
    const thoraxPitchDeg = sampleCyclicCurve(c.thoraxPitchDeg, pR);
    const cervicalFlexDeg = sampleCyclicCurve(c.cervicalFlexDeg, pR);

    const pelvisPos0 = [0, 0, 0];
    const pelvisQuat = qMul(qAxisY(pelvisRotDeg * DEG2RAD), qAxisZ(pelvisOblDeg * DEG2RAD));

    const lumbarPos0 = worldPoint(pelvisPos0, pelvisQuat, [0, anth.pelvisHeightM * 0.65, 0]);
    const thoraxQuat = qMul(qAxisY(thoraxRotDeg * DEG2RAD), qAxisX(thoraxPitchDeg * DEG2RAD));
    const neckBase0 = worldPoint(lumbarPos0, thoraxQuat, [0, anth.torsoLenM, 0]);
    const headQuat = qMul(thoraxQuat, qAxisX(cervicalFlexDeg * DEG2RAD));
    const headPos0 = worldPoint(neckBase0, headQuat, [0, anth.neckLenM + anth.headRadiusM * 0.75, 0]);

    const rightRaw = evaluateSidePose(profile, 'right', pR, pelvisPos0, pelvisQuat, pelvisOblDeg, lumbarPos0, thoraxQuat, anth);
    const leftRaw = evaluateSidePose(profile, 'left', pL, pelvisPos0, pelvisQuat, pelvisOblDeg, lumbarPos0, thoraxQuat, anth);

    const minRawY = Math.min(rightRaw.plantarRaw.lowestPlantarY, leftRaw.plantarRaw.lowestPlantarY);
    const offsetY = -minRawY;

    const right = shiftSideY(rightRaw, offsetY, baseStrideM);
    const left = shiftSideY(leftRaw, offsetY, baseStrideM);

    const pelvisPos = [0, offsetY, 0];
    const lumbarPos = [lumbarPos0[0], lumbarPos0[1] + offsetY, lumbarPos0[2]];
    const neckBase = [neckBase0[0], neckBase0[1] + offsetY, neckBase0[2]];
    const headPos = [headPos0[0], headPos0[1] + offsetY, headPos0[2]];
    const comWorld = [0, offsetY + 0.04, 0];

    let phoneTransform = { visible: false, position: [0, 0, 0], quaternion: qIdentity() };
    if (profile.handProp === 'phone') {
      const px = (right.joints.wrist.position[0] + left.joints.wrist.position[0]) * 0.5;
      const py = (right.joints.wrist.position[1] + left.joints.wrist.position[1]) * 0.5 + 0.02;
      const pz = (right.joints.wrist.position[2] + left.joints.wrist.position[2]) * 0.5 + 0.04;
      phoneTransform = {
        visible: true,
        position: [px, py, pz],
        quaternion: qAxisX(-48 * DEG2RAD),
      };
    }

    return {
      habitId: profile.id,
      phase01: pR,
      strideLengthM: baseStrideM,
      stepWidthM: profile.stepWidthM,
      beltSpeedMps,
      pelvisRootOffsetY: offsetY,
      axial: {
        pelvis: { position: pelvisPos, quaternion: pelvisQuat },
        lumbar: { position: lumbarPos, quaternion: thoraxQuat },
        neck: { position: neckBase, quaternion: headQuat },
        head: { position: headPos, quaternion: headQuat },
        pelvisObliquityDeg: pelvisOblDeg,
        pelvisTransverseDeg: pelvisRotDeg,
        thoraxCounterRotDeg: thoraxRotDeg,
        cervicalFlexDeg,
        comWorld,
        phoneTransform,
      },
      right,
      left,
    };
  }

  function buildCycleWaveformSeries(registry, habitId, sampleCount) {
    const count = sampleCount || 200;
    const profile = getHabitProfile(registry, habitId);
    const refProfile = getHabitProfile(registry, 'healthy');
    const phases = new Float32Array(count);
    const kneeDeg = new Float32Array(count);
    const refKneeDeg = new Float32Array(count);
    const vGrfBw = new Float32Array(count);
    const refVGrfBw = new Float32Array(count);
    const apGrfBw = new Float32Array(count);
    const refApGrfBw = new Float32Array(count);
    const stress01 = new Float32Array(count);
    const refStress01 = new Float32Array(count);
    const comY = new Float32Array(count);
    const refComY = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const p = i / count;
      const f = solveGaitFrame(registry, habitId, p);
      const rf = solveGaitFrame(registry, 'healthy', p);
      phases[i] = p;
      kneeDeg[i] = f.right.anglesDeg.kneeFlex;
      refKneeDeg[i] = rf.right.anglesDeg.kneeFlex;
      vGrfBw[i] = f.right.grf.verticalBw;
      refVGrfBw[i] = rf.right.grf.verticalBw;
      apGrfBw[i] = f.right.grf.foreAftBw;
      refApGrfBw[i] = rf.right.grf.foreAftBw;
      stress01[i] = Math.max(
        f.right.kneeStress.medialMeniscusLoad,
        f.right.kneeStress.patellofemoralStress,
        f.right.muscles.itBand,
        f.right.muscles.achilles
      );
      refStress01[i] = Math.max(
        rf.right.kneeStress.medialMeniscusLoad,
        rf.right.kneeStress.patellofemoralStress,
        rf.right.muscles.itBand,
        rf.right.muscles.achilles
      );
      comY[i] = f.axial.comWorld[1];
      refComY[i] = rf.axial.comWorld[1];
    }

    return {
      habitId: profile.id,
      referenceHabitId: refProfile.id,
      sampleCount: count,
      phases,
      kneeDeg,
      refKneeDeg,
      vGrfBw,
      refVGrfBw,
      apGrfBw,
      refApGrfBw,
      stress01,
      refStress01,
      comY,
      refComY,
    };
  }

  function getHabitProfile(registry, habitId) {
    if (!registry || !registry.__validated) {
      throw new TypeError('Expected a validated gait registry');
    }
    if (!Object.prototype.hasOwnProperty.call(registry.byId, habitId)) {
      throw new RangeError('Unknown habitId: ' + String(habitId));
    }
    return registry.byId[habitId];
  }

  function parseHabitId(raw) {
    if (typeof raw !== 'string' || HABIT_IDS.indexOf(raw) === -1) {
      throw new RangeError('Invalid habitId "' + String(raw) + '". Expected one of: ' + HABIT_IDS.join(', '));
    }
    return raw;
  }

  const CAMERA_PRESETS = Object.freeze({
    lab_3q: Object.freeze({
      id: 'lab_3q',
      label: '3/4 Gait Lab',
      position: [2.25, 1.54, 2.75],
      target: [0, 0.88, 0.04],
      fovDeg: 38,
    }),
    side_sagittal: Object.freeze({
      id: 'side_sagittal',
      label: 'Side Sagittal',
      position: [3.15, 0.98, 0.0],
      target: [0, 0.92, 0.04],
      fovDeg: 36,
    }),
    front_coronal: Object.freeze({
      id: 'front_coronal',
      label: 'Front Coronal',
      position: [0.0, 1.04, 3.15],
      target: [0, 0.92, 0.0],
      fovDeg: 36,
    }),
    knee_closeup: Object.freeze({
      id: 'knee_closeup',
      label: 'Knee & Tendon Zoom',
      position: [1.12, 0.50, 1.04],
      target: [0, 0.42, 0.04],
      fovDeg: 34,
    }),
    foot_top: Object.freeze({
      id: 'foot_top',
      label: 'Foot Track Top',
      position: [0.0, 1.65, 1.38],
      target: [0, 0.08, 0.04],
      fovDeg: 38,
    }),
  });

  function parseCameraPresetId(raw) {
    if (typeof raw !== 'string' || !Object.prototype.hasOwnProperty.call(CAMERA_PRESETS, raw)) {
      throw new RangeError('Unknown camera preset: ' + String(raw));
    }
    return raw;
  }

  function computeViewportPanes(layoutKind, cssWidth, cssHeight) {
    const w = Math.max(1, Math.floor(cssWidth));
    const h = Math.max(1, Math.floor(cssHeight));
    if (layoutKind === 'split_compare') {
      const leftW = Math.floor(w / 2);
      const rightW = w - leftW;
      return {
        panes: [
          { paneId: 'left', role: 'active', x: 0, y: 0, width: leftW, height: h },
          { paneId: 'right', role: 'healthy', x: leftW, y: 0, width: rightW, height: h },
        ],
        dividerX: leftW,
      };
    }
    if (layoutKind === 'hero_active' || layoutKind === 'hero_healthy') {
      return {
        panes: [
          {
            paneId: 'hero',
            role: layoutKind === 'hero_active' ? 'active' : 'healthy',
            x: 0,
            y: 0,
            width: w,
            height: h,
          },
        ],
        dividerX: null,
      };
    }
    throw new RangeError('Unknown layoutKind: ' + String(layoutKind));
  }

  function parseAndBuildRegistry(anthropometrics) {
    const anth = anthropometrics || createAnthropometrics();
    const raw = buildRawProfiles();
    const byId = {};
    const tempReg = { __validated: true, orderedIds: HABIT_IDS, anthropometrics: anth, byId: byId };
    for (let i = 0; i < HABIT_IDS.length; i += 1) {
      const id = HABIT_IDS[i];
      byId[id] = validateAndFreezeProfile(raw[id]);
    }
    for (let i = 0; i < HABIT_IDS.length; i += 1) {
      const id = HABIT_IDS[i];
      const f0 = solveGaitFrame(tempReg, id, 0);
      const midZ = (f0.right.footContact.heelWorld[2] + f0.right.footContact.ballWorld[2]) * 0.5;
      const base = byId[id];
      byId[id] = Object.freeze(Object.assign({}, base, { heelStrikeMidZ: midZ }));
    }
    return Object.freeze({
      __validated: true,
      orderedIds: HABIT_IDS,
      anthropometrics: anth,
      byId: Object.freeze(byId),
    });
  }

  global.GaitCore = Object.freeze({
    HABIT_IDS,
    CAMERA_PRESETS,
    wrapPhase01,
    parseHabitId,
    parseCameraPresetId,
    createAnthropometrics,
    sampleCyclicCurve,
    parseAndBuildRegistry,
    getHabitProfile,
    solveGaitFrame,
    buildCycleWaveformSeries,
    computeViewportPanes,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
