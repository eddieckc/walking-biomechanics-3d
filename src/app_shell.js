/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function (global) {
  'use strict';

  const GaitCore = global.GaitCore;
  const GaitInvariants = global.GaitInvariants;
  const GaitThreeRig = global.GaitThreeRig;

  function describeGaitPhase(phase01) {
    const pct = Math.floor(phase01 * 100);
    const num = String(pct).padStart(2, '0') + '% ';
    if (pct < 10) return num + 'Initial Contact';
    if (pct < 20) return num + 'Loading Response';
    if (pct < 38) return num + 'Mid-Stance';
    if (pct < 50) return num + 'Terminal Stance';
    if (pct < 62) return num + 'Pre-Swing Push';
    if (pct < 78) return num + 'Mid-Swing Clear';
    return num + 'Terminal Swing';
  }

  function createTelemetryRenderer(canvas2d) {
    const ctx = canvas2d.getContext('2d');
    let vGrfPct = null;
    let refVGrfPct = null;
    let stressPct = null;
    let refStressPct = null;

    function drawChannel(box, title, activeArr, refArr, minV, maxV, phase01, unit, zeroLine) {
      const x0 = box.x, y0 = box.y, w = box.w, h = box.h;
      ctx.fillStyle = 'rgba(15, 20, 28, 0.72)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, 6);
      ctx.fill();
      ctx.stroke();

      const padL = 8, padR = 8, padT = 19, padB = 7;
      const pw = w - padL - padR;
      const ph = h - padT - padB;

      function mapY(v) {
        const u = (v - minV) / Math.max(1e-4, maxV - minV);
        return y0 + padT + ph * (1 - Math.max(0, Math.min(1, u)));
      }

      if (zeroLine !== undefined && zeroLine >= minV && zeroLine <= maxV) {
        const zy = mapY(zeroLine);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x0 + padL, zy);
        ctx.lineTo(x0 + padL + pw, zy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      function strokeSeries(arr, color, dashed) {
        ctx.strokeStyle = color;
        ctx.lineWidth = dashed ? 1.4 : 2.1;
        ctx.setLineDash(dashed ? [4, 3] : []);
        ctx.beginPath();
        for (let i = 0; i < arr.length; i += 1) {
          const px = x0 + padL + (i / (arr.length - 1)) * pw;
          const py = mapY(arr[i]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      strokeSeries(refArr, '#60a5fa', true);
      strokeSeries(activeArr, '#fb923c', false);

      const curIdx = Math.min(activeArr.length - 1, Math.floor(phase01 * activeArr.length));
      const cx = x0 + padL + phase01 * pw;
      const cy = mapY(activeArr[curIdx]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, y0 + padT - 2);
      ctx.lineTo(cx, y0 + h - padB);
      ctx.stroke();

      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 10px "Google Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(title, x0 + padL, y0 + 13);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 10px "Google Sans Mono", ui-monospace, monospace';
      ctx.textAlign = 'right';
      const valStr = Math.round(activeArr[curIdx]) + unit;
      ctx.fillText(valStr, x0 + w - padR, y0 + 13);
    }

    function draw(series, phase01) {
      const cssW = canvas2d.clientWidth || 600;
      const cssH = canvas2d.clientHeight || 82;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const w = Math.floor(cssW * dpr);
      const h = Math.floor(cssH * dpr);
      if (canvas2d.width !== w || canvas2d.height !== h) {
        canvas2d.width = w;
        canvas2d.height = h;
      }
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssW, cssH);

      const gap = 8;
      const isNarrow = cssW < 520;

      if (!vGrfPct || vGrfPct.length !== series.sampleCount) {
        vGrfPct = new Float32Array(series.sampleCount);
        refVGrfPct = new Float32Array(series.sampleCount);
        stressPct = new Float32Array(series.sampleCount);
        refStressPct = new Float32Array(series.sampleCount);
      }
      for (let i = 0; i < series.sampleCount; i += 1) {
        vGrfPct[i] = series.vGrfBw[i] * 100;
        refVGrfPct[i] = series.refVGrfBw[i] * 100;
        stressPct[i] = series.stress01[i] * 100;
        refStressPct[i] = series.refStress01[i] * 100;
      }

      if (isNarrow) {
        const rh = (cssH - gap * 2) / 3;
        drawChannel({ x: 0, y: 0, w: cssW, h: rh }, 'Knee Angle (deg)', series.kneeDeg, series.refKneeDeg, 0, 75, phase01, ' deg');
        drawChannel({ x: 0, y: rh + gap, w: cssW, h: rh }, 'Vertical GRF (%BW)', vGrfPct, refVGrfPct, 0, 145, phase01, '%');
        drawChannel({ x: 0, y: (rh + gap) * 2, w: cssW, h: rh }, 'Peak Joint Stress', stressPct, refStressPct, 0, 100, phase01, '%');
      } else {
        const cw = (cssW - gap * 2) / 3;
        const ch = cssH;
        drawChannel({ x: 0, y: 0, w: cw, h: ch }, 'Knee Angle (deg)', series.kneeDeg, series.refKneeDeg, 0, 75, phase01, ' deg');
        drawChannel({ x: cw + gap, y: 0, w: cw, h: ch }, 'Vertical GRF (%BW)', vGrfPct, refVGrfPct, 0, 145, phase01, '%');
        drawChannel({ x: (cw + gap) * 2, y: 0, w: cw, h: ch }, 'Peak Joint Stress', stressPct, refStressPct, 0, 100, phase01, '%');
      }
      ctx.restore();
    }

    return { draw };
  }

  function safeParseUrlParam(fn, rawVal, fallbackVal, label) {
    if (rawVal === null) return fallbackVal;
    try {
      return fn(rawVal);
    } catch (err) {
      if (global.console && global.console.warn) {
        global.console.warn('Invalid URL parameter "' + label + '": ' + String(err.message));
      }
      return fallbackVal;
    }
  }

  function bootGaitExplorer() {
    const params = new URLSearchParams(global.location.search);
    const bootResult = GaitInvariants.createVerifiedGaitRegistry({ heightM: 1.75, bodyMassKg: 72 });
    const registry = bootResult.registry;

    const initialHabit = safeParseUrlParam(GaitCore.parseHabitId, params.get('habit'), 'overstride', 'habit');
    const initialPreset = safeParseUrlParam(GaitCore.parseCameraPresetId, params.get('preset'), 'lab_3q', 'preset');
    const rawLayout = params.get('layout');
    const initialLayout = (rawLayout === 'hero_active' || rawLayout === 'hero_healthy') ? rawLayout : 'split_compare';
    const initialPhase = safeParseUrlParam(function (raw) {
      return GaitCore.wrapPhase01(Number(raw) / 100);
    }, params.get('phase'), 0.12, 'phase');
    const initialPlaying = params.get('pause') !== '1';

    const state = {
      habitId: initialHabit,
      layoutKind: initialLayout,
      presetId: initialPreset,
      playing: initialPlaying,
      speed: 0.5,
      phase01: initialPhase,
      cumulativeCycles: initialPhase,
      overlays: {
        muscles: true,
        grf: true,
        comRibbon: true,
        xray: false,
      },
      evidenceOpen: false,
    };

    const webglCanvas = document.getElementById('webgl-canvas');
    const telemetryCanvas = document.getElementById('telemetry-canvas');
    const splitDivider = document.getElementById('split-divider');
    const leftBadge = document.getElementById('pane-left-badge');
    const rightBadge = document.getElementById('pane-right-badge');
    const summaryEl = document.getElementById('habit-summary');
    const badgesEl = document.getElementById('habit-badges');
    const scrubberEl = document.getElementById('phase-scrubber');
    const phaseReadoutEl = document.getElementById('phase-readout');
    const playBtn = document.getElementById('btn-play');
    const speedBtn = document.getElementById('btn-speed');
    const layoutBtn = document.getElementById('btn-layout');
    const presetSelectEl = document.getElementById('preset-select');
    const layersBtn = document.getElementById('btn-layers');
    const layersPopover = document.getElementById('layers-popover');
    const evidenceModal = document.getElementById('evidence-modal');
    const proofTableEl = document.getElementById('proof-table-body');
    const speedSteps = [0.25, 0.5, 1];

    const sharedGeoms = GaitThreeRig.createSharedBoneGeometries(registry.anthropometrics);
    const activeRig = GaitThreeRig.createAnatomicalWalkerRig({
      slotRole: 'active',
      shared: sharedGeoms,
      anth: registry.anthropometrics,
    });
    const healthyRig = GaitThreeRig.createAnatomicalWalkerRig({
      slotRole: 'healthy',
      shared: sharedGeoms,
      anth: registry.anthropometrics,
    });
    const viewport = GaitThreeRig.createViewportController(webglCanvas);
    viewport.snapPresetImmediate(state.presetId);
    const telemetry = createTelemetryRenderer(telemetryCanvas);

    const seriesCache = {};
    function getSeries(id) {
      if (!seriesCache[id]) {
        seriesCache[id] = GaitCore.buildCycleWaveformSeries(registry, id, 200);
      }
      return seriesCache[id];
    }

    function syncUi() {
      const profile = GaitCore.getHabitProfile(registry, state.habitId);
      summaryEl.textContent = profile.clinicalSummary;

      badgesEl.innerHTML = profile.badges.map(function (b) {
        const cls = b.tone === 'overload' ? 'badge-overload' : b.tone === 'caution' ? 'badge-caution' : 'badge-ok';
        return '<div class="ev-badge ' + cls + '"><span class="ev-label">' + b.label +
          '</span><strong>' + b.value + '</strong><span class="ev-cite">' + b.citation + '</span></div>';
      }).join('');

      document.querySelectorAll('[data-habit]').forEach(function (btn) {
        btn.setAttribute('aria-pressed', String(btn.dataset.habit === state.habitId));
      });
      presetSelectEl.value = state.presetId;
      speedBtn.textContent = (state.speed === 1 ? '1.0' : String(state.speed)) + 'x';
      document.querySelectorAll('[data-overlay]').forEach(function (btn) {
        const key = btn.dataset.overlay;
        btn.setAttribute('aria-pressed', String(Boolean(state.overlays[key])));
      });

      const isSplit = state.layoutKind === 'split_compare';
      splitDivider.style.display = isSplit ? 'block' : 'none';
      rightBadge.style.display = isSplit ? 'inline-flex' : 'none';
      leftBadge.textContent = isSplit
        ? profile.shortLabel
        : (state.layoutKind === 'hero_healthy' ? 'Focus: Healthy Baseline' : ('Focus: ' + profile.shortLabel));
      layoutBtn.textContent = isSplit ? 'Single View' : 'Split View';
      playBtn.textContent = state.playing ? 'Pause' : 'Play';
      scrubberEl.value = String(Math.floor(state.phase01 * 100));
      phaseReadoutEl.textContent = describeGaitPhase(state.phase01);
    }

    const habitBar = document.getElementById('habit-bar');
    habitBar.innerHTML = registry.orderedIds.map(function (id) {
      const p = GaitCore.getHabitProfile(registry, id);
      return '<button type="button" class="pill-btn" data-habit="' + id + '" aria-pressed="false">' + p.shortLabel + '</button>';
    }).join('');

    presetSelectEl.innerHTML = Object.keys(GaitCore.CAMERA_PRESETS).map(function (id) {
      const c = GaitCore.CAMERA_PRESETS[id];
      return '<option value="' + id + '">' + c.label + '</option>';
    }).join('');

    proofTableEl.innerHTML = registry.orderedIds.map(function (id) {
      const p = GaitCore.getHabitProfile(registry, id);
      const s = bootResult.report.summaryByHabit[id];
      return '<tr><td><strong>' + p.shortLabel + '</strong></td>' +
        '<td>' + s.comVerticalArcCm.toFixed(2) + ' cm</td>' +
        '<td>' + s.peakBrakingGrfPctBw.toFixed(0) + '% BW</td>' +
        '<td>' + (s.minHeelWorldMeters * 100).toFixed(1) + ' cm</td>' +
        '<td>' + (s.maxFloorPenetrationMeters < 1e-5 ? '0.00 mm' : 'FAIL') + '</td>' +
        '<td>' + p.citations.join(', ') + '</td></tr>';
    }).join('');

    habitBar.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-habit]');
      if (!btn) return;
      state.habitId = GaitCore.parseHabitId(btn.dataset.habit);
      syncUi();
      renderOnce(0, 0);
    });

    presetSelectEl.addEventListener('change', function (ev) {
      state.presetId = GaitCore.parseCameraPresetId(ev.target.value);
      viewport.setPreset(state.presetId);
      syncUi();
    });

    function setLayersOpen(nextOpen) {
      const open = Boolean(nextOpen);
      layersPopover.hidden = !open;
      layersBtn.setAttribute('aria-expanded', String(open));
    }

    layersBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      setLayersOpen(layersPopover.hidden);
    });

    document.addEventListener('click', function (ev) {
      if (!layersPopover.hidden && !layersPopover.contains(ev.target) && ev.target !== layersBtn) {
        setLayersOpen(false);
      }
    });

    document.getElementById('overlay-bar').addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-overlay]');
      if (!btn) return;
      const key = btn.dataset.overlay;
      state.overlays[key] = !state.overlays[key];
      syncUi();
      renderOnce(0, 0);
    });

    speedBtn.addEventListener('click', function () {
      const idx = speedSteps.indexOf(state.speed);
      state.speed = speedSteps[(idx + 1) % speedSteps.length];
      syncUi();
    });

    playBtn.addEventListener('click', function () {
      state.playing = !state.playing;
      syncUi();
    });

    layoutBtn.addEventListener('click', function () {
      state.layoutKind = state.layoutKind === 'split_compare' ? 'hero_active' : 'split_compare';
      syncUi();
      renderOnce(0, 0);
    });

    scrubberEl.addEventListener('input', function (ev) {
      state.playing = false;
      const targetPhase = GaitCore.wrapPhase01(Number(ev.target.value) / 100);
      const baseFloor = Math.floor(state.cumulativeCycles);
      state.phase01 = targetPhase;
      state.cumulativeCycles = baseFloor + targetPhase;
      syncUi();
      renderOnce(0, 0);
    });

    const evidenceOpenBtn = document.getElementById('btn-evidence');
    const evidenceCloseBtn = document.getElementById('btn-close-evidence');

    function setEvidenceOpen(nextOpen) {
      state.evidenceOpen = Boolean(nextOpen);
      evidenceModal.hidden = !state.evidenceOpen;
      if (state.evidenceOpen) {
        evidenceCloseBtn.focus();
      } else {
        evidenceOpenBtn.focus();
      }
    }

    evidenceOpenBtn.addEventListener('click', function () {
      setEvidenceOpen(!state.evidenceOpen);
    });
    evidenceCloseBtn.addEventListener('click', function () {
      setEvidenceOpen(false);
    });
    evidenceModal.addEventListener('click', function (ev) {
      if (ev.target === evidenceModal) {
        setEvidenceOpen(false);
      }
    });

    global.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (!layersPopover.hidden) {
          setLayersOpen(false);
        }
        if (state.evidenceOpen) {
          setEvidenceOpen(false);
        }
        return;
      }
      if (state.evidenceOpen) return;
      if (ev.code === 'Space' && ev.target.tagName !== 'BUTTON' && ev.target.tagName !== 'INPUT' && ev.target.tagName !== 'SELECT') {
        ev.preventDefault();
        state.playing = !state.playing;
        syncUi();
      }
    });

    function renderOnce(dtSec, elapsedSec) {
      const activeProfile = GaitCore.getHabitProfile(registry, state.habitId);
      const healthyProfile = GaitCore.getHabitProfile(registry, 'healthy');
      const activeFrame = GaitCore.solveGaitFrame(registry, state.habitId, state.phase01);
      const healthyFrame = GaitCore.solveGaitFrame(registry, 'healthy', state.phase01);
      const series = getSeries(state.habitId);

      activeRig.update(activeFrame, activeProfile, series, state.overlays, state.cumulativeCycles, elapsedSec);
      healthyRig.update(healthyFrame, healthyProfile, series, state.overlays, state.cumulativeCycles, elapsedSec);

      viewport.render(dtSec, state.layoutKind, {
        active: activeRig.scene,
        healthy: healthyRig.scene,
      });
      telemetry.draw(series, state.phase01);
      scrubberEl.value = String(Math.floor(state.phase01 * 100));
      phaseReadoutEl.textContent = describeGaitPhase(state.phase01);
    }

    let lastMs = null;
    let totalSec = 0;
    function frameLoop(nowMs) {
      if (lastMs === null) lastMs = nowMs;
      const dtSec = Math.max(0, Math.min(0.05, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      totalSec += dtSec;

      if (state.playing) {
        const activeProfile = GaitCore.getHabitProfile(registry, state.habitId);
        const deltaCycles = dtSec * activeProfile.cadenceHz * state.speed;
        state.cumulativeCycles += deltaCycles;
        state.phase01 = GaitCore.wrapPhase01(state.phase01 + deltaCycles);
      }
      renderOnce(dtSec, totalSec);
      global.requestAnimationFrame(frameLoop);
    }

    syncUi();
    renderOnce(0, 0);
    global.__GAIT_BOOT_STATUS__ = Object.freeze({
      ready: true,
      checksExecuted: bootResult.report.checksExecuted,
      passed: bootResult.report.passed,
      threeRevision: global.THREE.REVISION,
      habitId: state.habitId,
      presetId: state.presetId,
      layoutKind: state.layoutKind,
    });
    global.requestAnimationFrame(frameLoop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootGaitExplorer);
  } else {
    bootGaitExplorer();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
