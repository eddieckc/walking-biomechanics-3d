(function (global) {
  'use strict';

  const THREE = global.THREE;
  const GaitCore = global.GaitCore;

  const MUSCLE_VERTEX_SHADER = [
    'varying vec3 vNormalView;',
    'varying vec3 vViewPos;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
    '  vViewPos = -mvPos.xyz;',
    '  vNormalView = normalize(normalMatrix * normal);',
    '  gl_Position = projectionMatrix * mvPos;',
    '}',
  ].join('\n');

  const MUSCLE_FRAGMENT_SHADER = [
    'uniform float uHeat;',
    'uniform float uTime;',
    'uniform float uXray;',
    'uniform float uIsMeniscus;',
    'uniform vec3 uLightDir;',
    'varying vec3 vNormalView;',
    'varying vec3 vViewPos;',
    'varying vec2 vUv;',
    'vec3 clinicalRamp(float h) {',
    '  vec3 c0 = vec3(0.16, 0.56, 0.66);',
    '  vec3 c1 = vec3(0.18, 0.72, 0.45);',
    '  vec3 c2 = vec3(0.94, 0.62, 0.16);',
    '  vec3 c3 = vec3(0.95, 0.23, 0.16);',
    '  if (h < 0.33) return mix(c0, c1, h / 0.33);',
    '  if (h < 0.66) return mix(c1, c2, (h - 0.33) / 0.33);',
    '  return mix(c2, c3, (h - 0.66) / 0.34);',
    '}',
    'void main() {',
    '  float h = clamp(uHeat, 0.0, 1.0);',
    '  vec3 n = normalize(vNormalView);',
    '  vec3 v = normalize(vViewPos);',
    '  float ndl = max(dot(n, normalize(uLightDir)), 0.0) * 0.65 + 0.35;',
    '  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.1);',
    '  vec3 base = clinicalRamp(h);',
    '  float striation = uIsMeniscus > 0.5',
    '    ? (0.90 + 0.10 * sin(vUv.x * 24.0))',
    '    : (0.86 + 0.14 * sin(vUv.x * 46.0));',
    '  float overloadPulse = h > 0.62 ? (0.14 * sin(uTime * 8.0) * smoothstep(0.62, 1.0, h)) : 0.0;',
    '  vec3 color = base * ndl * striation + base * (0.28 * fresnel + overloadPulse);',
    '  float baseAlpha = uIsMeniscus > 0.5 ? mix(0.62, 0.94, h) : mix(0.28, 0.78, h);',
    '  float alpha = clamp(baseAlpha * mix(1.0, 0.42, uXray) + 0.18 * fresnel, 0.08, 0.96);',
    '  gl_FragColor = vec4(color, alpha);',
    '}',
  ].join('\n');

  function createHeatMaterial(isMeniscus) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uHeat: { value: 0.2 },
        uTime: { value: 0.0 },
        uXray: { value: 0.0 },
        uIsMeniscus: { value: isMeniscus ? 1.0 : 0.0 },
        uLightDir: { value: new THREE.Vector3(0.55, 0.78, 0.45) },
      },
      vertexShader: MUSCLE_VERTEX_SHADER,
      fragmentShader: MUSCLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
  }

  function createLatheBone(lengthM, profilePairs) {
    const pts = profilePairs.map(function (pair) {
      return new THREE.Vector2(pair[1], -pair[0] * lengthM);
    });
    const geom = new THREE.LatheGeometry(pts, 18);
    geom.computeVertexNormals();
    return geom;
  }

  function createFusiformMuscleGeo(lengthM, maxRadiusM) {
    const pts = [];
    const segs = 12;
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const profile = Math.sin(Math.PI * t);
      const r = Math.max(0.004, maxRadiusM * Math.pow(profile, 0.72));
      pts.push(new THREE.Vector2(r, (0.5 - t) * lengthM));
    }
    const geom = new THREE.LatheGeometry(pts, 14);
    geom.computeVertexNormals();
    return geom;
  }

  function createIliacWingGeo(halfW, pelvisH) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfW * 1.18, pelvisH * 0.55);
    shape.bezierCurveTo(-halfW * 1.32, pelvisH * 0.92, -halfW * 0.55, pelvisH * 0.98, -halfW * 0.22, pelvisH * 0.55);
    shape.lineTo(0, pelvisH * 0.22);
    shape.lineTo(halfW * 0.22, pelvisH * 0.55);
    shape.bezierCurveTo(halfW * 0.55, pelvisH * 0.98, halfW * 1.32, pelvisH * 0.92, halfW * 1.18, pelvisH * 0.55);
    shape.lineTo(halfW * 0.96, -pelvisH * 0.28);
    shape.quadraticCurveTo(halfW * 0.42, -pelvisH * 0.55, 0, -pelvisH * 0.36);
    shape.quadraticCurveTo(-halfW * 0.42, -pelvisH * 0.55, -halfW * 0.96, -pelvisH * 0.28);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.068,
      bevelEnabled: true,
      bevelThickness: 0.016,
      bevelSize: 0.014,
      bevelSegments: 3,
      curveSegments: 14,
    });
    geo.translate(0, 0, -0.034);
    geo.computeVertexNormals();
    return geo;
  }

  function createBeltTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1b222c';
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = '#212a36';
    for (let y = 0; y < 512; y += 32) {
      ctx.fillRect(28, y, 456, 4);
    }

    ctx.strokeStyle = 'rgba(232, 130, 62, 0.48)';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();

    const pxPerM = 512 / 0.72;
    const laneOffset = 0.07 * pxPerM;
    ctx.strokeStyle = 'rgba(92, 178, 255, 0.42)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(256 - laneOffset, 0);
    ctx.lineTo(256 - laneOffset, 512);
    ctx.moveTo(256 + laneOffset, 0);
    ctx.lineTo(256 + laneOffset, 512);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2.5);
    tex.anisotropy = 4;
    return tex;
  }

  function createSharedBoneGeometries(anth) {
    const femurGeo = createLatheBone(anth.thighLenM, [
      [0.0, 0.022], [0.06, 0.036], [0.16, 0.026], [0.5, 0.021],
      [0.85, 0.026], [0.95, 0.038], [1.0, 0.026],
    ]);
    const tibiaGeo = createLatheBone(anth.shankLenM, [
      [0.0, 0.028], [0.06, 0.038], [0.18, 0.024], [0.55, 0.019],
      [0.88, 0.021], [0.96, 0.028], [1.0, 0.020],
    ]);
    const fibulaGeo = createLatheBone(anth.shankLenM * 0.92, [
      [0.0, 0.006], [0.08, 0.011], [0.5, 0.008], [0.94, 0.011], [1.0, 0.006],
    ]);
    const upperArmGeo = createLatheBone(anth.upperArmLenM, [
      [0.0, 0.018], [0.08, 0.026], [0.5, 0.018], [0.92, 0.022], [1.0, 0.016],
    ]);
    const forearmGeo = createLatheBone(anth.forearmLenM, [
      [0.0, 0.015], [0.10, 0.021], [0.55, 0.015], [0.92, 0.014], [1.0, 0.011],
    ]);

    const pelvisGeo = createIliacWingGeo(anth.pelvisHalfWidthM, anth.pelvisHeightM);
    const sacrumGeo = new THREE.ConeGeometry(0.048, 0.11, 10);
    sacrumGeo.rotateX(Math.PI);

    const thoraxGeo = createLatheBone(anth.torsoLenM * 0.68, [
      [0.0, 0.055], [0.10, 0.118], [0.24, 0.130], [0.42, 0.126],
      [0.62, 0.116], [0.80, 0.102], [0.92, 0.084], [0.98, 0.054], [1.0, 0.024],
    ]);
    thoraxGeo.translate(0, anth.torsoLenM * 0.68, 0);
    thoraxGeo.scale(1.16, 1, 0.72);
    const ribRingGeo = new THREE.TorusGeometry(0.118, 0.0085, 8, 22);
    ribRingGeo.rotateX(Math.PI * 0.5);
    ribRingGeo.scale(1.18, 1, 0.72);

    const sternumGeo = new THREE.BoxGeometry(0.032, anth.torsoLenM * 0.42, 0.016);
    const clavicleLen = Math.hypot(anth.shoulderHalfWidthM, 0.072);
    const clavicleGeo = new THREE.CapsuleGeometry(0.0095, clavicleLen * 0.78, 6, 10);
    clavicleGeo.rotateZ(Math.PI * 0.5);

    const spineDiscGeo = new THREE.CylinderGeometry(0.022, 0.025, 0.024, 12);
    const jointBallGeo = new THREE.SphereGeometry(0.028, 14, 10);
    const headGeo = new THREE.SphereGeometry(anth.headRadiusM * 1.12, 18, 14);
    headGeo.scale(0.84, 1.06, 1.02);
    const jawGeo = new THREE.CylinderGeometry(0.038, 0.024, 0.058, 12);
    jawGeo.scale(0.85, 1, 0.95);
    const browGeo = new THREE.BoxGeometry(0.068, 0.018, 0.032);
    const neckGeo = new THREE.CylinderGeometry(0.020, 0.025, anth.neckLenM * 1.2, 12);

    const patellaGeo = new THREE.SphereGeometry(0.022, 14, 10);
    patellaGeo.scale(1.05, 1.12, 0.52);

    const condyleCapGeo = new THREE.SphereGeometry(0.036, 16, 12);
    condyleCapGeo.scale(1.15, 0.62, 0.95);

    const meniscusGeo = new THREE.TorusGeometry(0.020, 0.0068, 10, 18, Math.PI * 1.45);
    meniscusGeo.rotateX(Math.PI * 0.5);

    const calcaneusGeo = new THREE.CapsuleGeometry(0.024, anth.footRearLenM * 0.72, 8, 12);
    calcaneusGeo.rotateX(Math.PI * 0.44);
    const talusGeo = new THREE.SphereGeometry(0.026, 12, 10);
    talusGeo.scale(1.05, 0.85, 1.15);
    const malleolusGeo = new THREE.SphereGeometry(0.012, 10, 8);
    const metatarsalGeo = new THREE.CylinderGeometry(0.0062, 0.0072, anth.footMidLenM * 1.02, 8);
    metatarsalGeo.rotateX(Math.PI * 0.5);
    const phalanxGeo = new THREE.CapsuleGeometry(0.0062, anth.footForeLenM * 0.72, 6, 8);
    phalanxGeo.rotateX(Math.PI * 0.5);

    const handGeo = new THREE.SphereGeometry(0.024, 10, 8);
    handGeo.scale(0.75, 1.3, 0.9);
    const phoneGeo = new THREE.BoxGeometry(0.076, 0.148, 0.009);

    const quadGeo = createFusiformMuscleGeo(anth.thighLenM * 0.72, 0.042);
    const hamGeo = createFusiformMuscleGeo(anth.thighLenM * 0.72, 0.038);
    const gastrocGeo = createFusiformMuscleGeo(anth.shankLenM * 0.54, 0.036);
    const gluteMedGeo = createFusiformMuscleGeo(0.145, 0.026);
    gluteMedGeo.scale(1.0, 1.0, 1.35);

    const footprintGeo = new THREE.PlaneGeometry(0.076, 0.088);
    footprintGeo.rotateX(-Math.PI * 0.5);
    const shadowDiscGeo = new THREE.CircleGeometry(0.16, 20);
    shadowDiscGeo.rotateX(-Math.PI * 0.5);

    const beltTex = createBeltTexture();

    return {
      femurGeo,
      tibiaGeo,
      fibulaGeo,
      upperArmGeo,
      forearmGeo,
      pelvisGeo,
      sacrumGeo,
      thoraxGeo,
      ribRingGeo,
      sternumGeo,
      clavicleGeo,
      spineDiscGeo,
      jointBallGeo,
      headGeo,
      jawGeo,
      browGeo,
      neckGeo,
      patellaGeo,
      condyleCapGeo,
      meniscusGeo,
      calcaneusGeo,
      talusGeo,
      malleolusGeo,
      metatarsalGeo,
      phalanxGeo,
      handGeo,
      phoneGeo,
      quadGeo,
      hamGeo,
      gastrocGeo,
      gluteMedGeo,
      footprintGeo,
      shadowDiscGeo,
      beltTex,
      dispose: function () {
        const keys = Object.keys(this);
        for (let i = 0; i < keys.length; i += 1) {
          const item = this[keys[i]];
          if (item && typeof item.dispose === 'function' && keys[i] !== 'dispose') {
            item.dispose();
          }
        }
      },
    };
  }

  function createDynamicTendonTube(baseRadius, tubularSegments, radialSegments) {
    const tSegs = tubularSegments || 12;
    const rSegs = radialSegments || 8;
    const vertCount = (tSegs + 1) * (rSegs + 1);
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const indices = [];

    for (let i = 0; i <= tSegs; i += 1) {
      for (let j = 0; j <= rSegs; j += 1) {
        const idx = i * (rSegs + 1) + j;
        uvs[idx * 2] = j / rSegs;
        uvs[idx * 2 + 1] = i / tSegs;
      }
    }
    for (let i = 0; i < tSegs; i += 1) {
      for (let j = 0; j < rSegs; j += 1) {
        const a = i * (rSegs + 1) + j;
        const b = (i + 1) * (rSegs + 1) + j;
        const c = (i + 1) * (rSegs + 1) + (j + 1);
        const d = i * (rSegs + 1) + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const normAttr = new THREE.BufferAttribute(normals, 3);
    normAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('normal', normAttr);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const p3 = new THREE.Vector3();
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
    const pt = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const refUp = new THREE.Vector3();
    const binorm = new THREE.Vector3();
    const normVec = new THREE.Vector3();
    const radialDir = new THREE.Vector3();

    const material = createHeatMaterial(false);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;

    function updatePoints(a, b, c, d, strain01, timeSec, xrayVal) {
      p0.set(a[0], a[1], a[2]);
      p1.set(b[0], b[1], b[2]);
      p2.set(c[0], c[1], c[2]);
      p3.set(d[0], d[1], d[2]);

      const radius = baseRadius * (1.0 - 0.18 * Math.max(0, Math.min(1, strain01)));
      for (let i = 0; i <= tSegs; i += 1) {
        const u = i / tSegs;
        curve.getPoint(u, pt);
        curve.getTangent(u, tan);
        if (Math.abs(tan.x) < 0.85) refUp.set(1, 0, 0);
        else refUp.set(0, 0, 1);
        binorm.crossVectors(tan, refUp).normalize();
        normVec.crossVectors(binorm, tan).normalize();

        for (let j = 0; j <= rSegs; j += 1) {
          const theta = (j / rSegs) * Math.PI * 2;
          const ct = Math.cos(theta);
          const st = Math.sin(theta);
          radialDir.set(
            normVec.x * ct + binorm.x * st,
            normVec.y * ct + binorm.y * st,
            normVec.z * ct + binorm.z * st
          );
          const idx = i * (rSegs + 1) + j;
          positions[idx * 3] = pt.x + radius * radialDir.x;
          positions[idx * 3 + 1] = pt.y + radius * radialDir.y;
          positions[idx * 3 + 2] = pt.z + radius * radialDir.z;
          normals[idx * 3] = radialDir.x;
          normals[idx * 3 + 1] = radialDir.y;
          normals[idx * 3 + 2] = radialDir.z;
        }
      }
      posAttr.needsUpdate = true;
      normAttr.needsUpdate = true;
      material.uniforms.uHeat.value = strain01;
      material.uniforms.uTime.value = timeSec;
      material.uniforms.uXray.value = xrayVal;
    }

    return {
      mesh,
      updatePoints,
      dispose: function () {
        geometry.dispose();
        material.dispose();
      },
    };
  }

  // Thick 3D GRF force arrow (cylinder + cone) so it stays crisp unlike 1px WebGL lines.
  function createForceArrow3D(colorHex) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });
    const shaftGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 10);
    shaftGeo.translate(0, 0.5, 0);
    const shaft = new THREE.Mesh(shaftGeo, mat);
    const headGeo = new THREE.ConeGeometry(0.028, 0.085, 12);
    headGeo.translate(0, 0.0425, 0);
    const head = new THREE.Mesh(headGeo, mat);
    group.add(shaft, head);

    const dir = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();

    function updateVector(origin, vec, show) {
      const mag = Math.hypot(vec[0], vec[1], vec[2]);
      if (!show || mag < 0.06) {
        group.visible = false;
        return;
      }
      group.visible = true;
      group.position.set(origin[0], origin[1], origin[2]);
      dir.set(vec[0] / mag, vec[1] / mag, vec[2] / mag);
      quat.setFromUnitVectors(up, dir);
      group.quaternion.copy(quat);

      const len = mag * 0.52;
      const shaftLen = Math.max(0.04, len - 0.08);
      shaft.scale.set(1, shaftLen, 1);
      head.position.set(0, shaftLen, 0);

      const isBrakingSpike = vec[2] < -0.24;
      mat.color.setHex(isBrakingSpike ? 0xff4930 : colorHex);
      mat.emissive.setHex(isBrakingSpike ? 0xff4930 : colorHex);
    }

    return {
      group,
      updateVector,
      dispose: function () {
        shaftGeo.dispose();
        headGeo.dispose();
        mat.dispose();
      },
    };
  }

  function applyPose(obj, pose) {
    obj.position.set(pose.position[0], pose.position[1], pose.position[2]);
    obj.quaternion.set(pose.quaternion[0], pose.quaternion[1], pose.quaternion[2], pose.quaternion[3]);
  }

  const _tmpDir = new THREE.Vector3();
  const _tmpUp = new THREE.Vector3(0, 1, 0);
  const _tmpVec = new THREE.Vector3();
  const _tmpQuat = new THREE.Quaternion();

  function rotateLocalPoint(origin, quatArr, lx, ly, lz, outArr) {
    _tmpVec.set(lx, ly, lz);
    _tmpQuat.set(quatArr[0], quatArr[1], quatArr[2], quatArr[3]);
    _tmpVec.applyQuaternion(_tmpQuat);
    outArr[0] = origin[0] + _tmpVec.x;
    outArr[1] = origin[1] + _tmpVec.y;
    outArr[2] = origin[2] + _tmpVec.z;
    return outArr;
  }

  function orientBetween(mesh, a, b, scaleZ) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    mesh.position.set((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5);
    _tmpDir.set(dx / len, dy / len, dz / len);
    mesh.quaternion.setFromUnitVectors(_tmpUp, _tmpDir);
    mesh.scale.set(1, len / 0.145, scaleZ || 1);
  }

  /**
   * Builds one isolated biomechanical 3D walker scene sharing immutable geometries.
   * @param {{slotRole: 'active'|'healthy', shared: object, anth: object}} opts
   */
  function createAnatomicalWalkerRig(opts) {
    const shared = opts.shared;
    const anth = opts.anth;
    const isHealthyRef = opts.slotRole === 'healthy';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f141c);
    scene.fog = new THREE.Fog(0x0f141c, 5.0, 11.0);

    const hemi = new THREE.HemisphereLight(0xd9e8ff, 0x1d2532, 0.95);
    const keyLight = new THREE.DirectionalLight(0xfff7ea, 1.65);
    keyLight.position.set(2.4, 3.8, 2.5);
    const rimLight = new THREE.DirectionalLight(isHealthyRef ? 0x67b8ff : 0xffad6e, 0.85);
    rimLight.position.set(-2.6, 2.4, -2.4);
    scene.add(hemi, keyLight, rimLight);

    const beltMat = new THREE.MeshStandardMaterial({
      map: shared.beltTex.clone(),
      roughness: 0.78,
      metalness: 0.08,
    });
    beltMat.map.needsUpdate = true;

    const beltMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 2.2), beltMat);
    beltMesh.rotation.x = -Math.PI * 0.5;
    beltMesh.position.y = 0;

    const deckMat = new THREE.MeshStandardMaterial({ color: 0x1a2029, roughness: 0.55, metalness: 0.35 });
    const deckFrame = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.075, 2.34), deckMat);
    deckFrame.position.y = -0.04;

    const gridHelper = new THREE.GridHelper(4.8, 16, 0x2a3444, 0x1c2430);
    gridHelper.position.y = -0.08;
    scene.add(deckFrame, beltMesh, gridHelper);

    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd3,
      roughness: 0.55,
      metalness: 0.04,
      transparent: false,
      opacity: 1.0,
    });
    const cartilageMat = new THREE.MeshPhysicalMaterial({
      color: 0xcbe3f2,
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.75,
      clearcoatRoughness: 0.18,
    });
    const phoneMat = new THREE.MeshStandardMaterial({
      color: 0x1d293a,
      emissive: 0x57b5ff,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });

    const pelvisGroup = new THREE.Group();
    const pelvisMesh = new THREE.Mesh(shared.pelvisGeo, boneMat);
    const sacrumMesh = new THREE.Mesh(shared.sacrumGeo, boneMat);
    sacrumMesh.position.set(0, -0.01, -0.028);
    pelvisGroup.add(pelvisMesh, sacrumMesh);

    const thoraxGroup = new THREE.Group();
    const ribcageMesh = new THREE.Mesh(shared.thoraxGeo, boneMat);
    ribcageMesh.position.y = anth.torsoLenM * 0.30;
    thoraxGroup.add(ribcageMesh);
    for (let r = 0; r < 5; r += 1) {
      const rib = new THREE.Mesh(shared.ribRingGeo, boneMat);
      const frac = 0.42 + r * 0.11;
      rib.position.y = anth.torsoLenM * frac;
      const sc = 0.90 + Math.sin((r / 4) * Math.PI) * 0.14;
      rib.scale.set(sc, 1, sc);
      thoraxGroup.add(rib);
    }
    const sternumMesh = new THREE.Mesh(shared.sternumGeo, boneMat);
    sternumMesh.position.set(0, anth.torsoLenM * 0.66, 0.088);
    thoraxGroup.add(sternumMesh);
    [-1, 1].forEach(function (sSign) {
      const sternX = sSign * 0.014;
      const sternY = anth.torsoLenM * 0.85;
      const sternZ = 0.076;
      const shX = sSign * anth.shoulderHalfWidthM;
      const shY = anth.torsoLenM * 0.82;
      const shZ = 0.0;
      const clav = new THREE.Mesh(shared.clavicleGeo, boneMat);
      clav.position.set((sternX + shX) * 0.5, (sternY + shY) * 0.5, (sternZ + shZ) * 0.5);
      const yaw = Math.atan2(sternZ - shZ, Math.abs(shX - sternX));
      clav.rotation.y = sSign * yaw;
      clav.rotation.z = -sSign * 0.08;
      const shCap = new THREE.Mesh(shared.jointBallGeo, cartilageMat);
      shCap.position.set(shX, shY, shZ);
      thoraxGroup.add(clav, shCap);
    });
    for (let i = 0; i < 5; i += 1) {
      const disc = new THREE.Mesh(shared.spineDiscGeo, cartilageMat);
      disc.position.set(0, 0.020 + i * 0.042, -0.022);
      thoraxGroup.add(disc);
    }

    const headGroup = new THREE.Group();
    const headMesh = new THREE.Mesh(shared.headGeo, boneMat);
    const jawMesh = new THREE.Mesh(shared.jawGeo, boneMat);
    jawMesh.position.set(0, -anth.headRadiusM * 0.68, 0.024);
    jawMesh.rotation.x = 0.18;
    const browMesh = new THREE.Mesh(shared.browGeo, boneMat);
    browMesh.position.set(0, 0.012, anth.headRadiusM * 0.88);
    const neckMesh = new THREE.Mesh(shared.neckGeo, boneMat);
    neckMesh.position.set(0, -anth.headRadiusM * 0.78 - anth.neckLenM * 0.5, -0.012);
    headGroup.add(headMesh, jawMesh, browMesh, neckMesh);

    const phoneMesh = new THREE.Mesh(shared.phoneGeo, phoneMat);
    phoneMesh.visible = false;

    scene.add(pelvisGroup, thoraxGroup, headGroup, phoneMesh);

    function createSideLimbMeshes(side) {
      const sideSign = side === 'left' ? 1 : -1;

      const thighGroup = new THREE.Group();
      const hipHead = new THREE.Mesh(shared.jointBallGeo, cartilageMat);
      hipHead.scale.setScalar(0.88);
      const femurMesh = new THREE.Mesh(shared.femurGeo, boneMat);
      const distCap = new THREE.Mesh(shared.condyleCapGeo, cartilageMat);
      distCap.position.set(0, -anth.thighLenM, 0);
      const quadMat = createHeatMaterial(false);
      const quadMesh = new THREE.Mesh(shared.quadGeo, quadMat);
      quadMesh.position.set(0, -anth.thighLenM * 0.46, 0.032);
      quadMesh.renderOrder = 4;
      const hamMat = createHeatMaterial(false);
      const hamMesh = new THREE.Mesh(shared.hamGeo, hamMat);
      hamMesh.position.set(0, -anth.thighLenM * 0.48, -0.028);
      hamMesh.renderOrder = 4;
      thighGroup.add(femurMesh, distCap, quadMesh, hamMesh, hipHead);

      const patellaMat = createHeatMaterial(true);
      const patellaMesh = new THREE.Mesh(shared.patellaGeo, patellaMat);

      const shankGroup = new THREE.Group();
      const tibiaMesh = new THREE.Mesh(shared.tibiaGeo, boneMat);
      const fibulaMesh = new THREE.Mesh(shared.fibulaGeo, boneMat);
      fibulaMesh.position.set(sideSign * 0.024, -0.025, -0.008);
      const proxCap = new THREE.Mesh(shared.condyleCapGeo, cartilageMat);
      proxCap.position.set(0, -0.006, 0);

      const medMenMat = createHeatMaterial(true);
      const medMeniscus = new THREE.Mesh(shared.meniscusGeo, medMenMat);
      medMeniscus.position.set(-sideSign * 0.019, 0.002, 0.002);
      medMeniscus.rotation.y = sideSign > 0 ? Math.PI * 0.75 : -Math.PI * 0.25;
      medMeniscus.renderOrder = 2;

      const latMenMat = createHeatMaterial(true);
      const latMeniscus = new THREE.Mesh(shared.meniscusGeo, latMenMat);
      latMeniscus.position.set(sideSign * 0.019, 0.002, 0.002);
      latMeniscus.rotation.y = sideSign > 0 ? -Math.PI * 0.25 : Math.PI * 0.75;
      latMeniscus.renderOrder = 2;

      const gastrocMat = createHeatMaterial(false);
      const gastrocMesh = new THREE.Mesh(shared.gastrocGeo, gastrocMat);
      gastrocMesh.position.set(0, -anth.shankLenM * 0.34, -0.030);
      gastrocMesh.renderOrder = 4;

      shankGroup.add(tibiaMesh, fibulaMesh, proxCap, medMeniscus, latMeniscus, gastrocMesh);

      const hindfootGroup = new THREE.Group();
      const talus = new THREE.Mesh(shared.talusGeo, cartilageMat);
      talus.position.set(0, -anth.ankleHeightM * 0.25, 0.01);
      const navicular = new THREE.Mesh(shared.talusGeo, boneMat);
      navicular.scale.set(1.05, 0.68, 1.05);
      navicular.position.set(0, -anth.ankleHeightM * 0.52, anth.footMidLenM * 0.24);
      const malLat = new THREE.Mesh(shared.malleolusGeo, boneMat);
      malLat.position.set(sideSign * 0.026, -0.004, -0.004);
      const malMed = new THREE.Mesh(shared.malleolusGeo, boneMat);
      malMed.position.set(-sideSign * 0.025, 0.003, 0.002);
      const calcaneus = new THREE.Mesh(shared.calcaneusGeo, boneMat);
      calcaneus.position.set(0, -anth.ankleHeightM * 0.68, -anth.footRearLenM * 0.35);
      hindfootGroup.add(talus, navicular, malLat, malMed, calcaneus);

      for (let ray = 0; ray < 5; ray += 1) {
        const uRay = (ray - 2) / 2;
        const xSpread = sideSign * uRay * 0.028;
        const rayMesh = new THREE.Mesh(shared.metatarsalGeo, boneMat);
        rayMesh.position.set(xSpread * 0.68, -anth.ankleHeightM * 0.62, anth.footMidLenM * 0.52);
        rayMesh.rotation.y = Math.atan2(xSpread, anth.footMidLenM);
        rayMesh.rotation.x = 0.22;
        if (ray === 0) rayMesh.scale.set(1.35, 1.0, 1.35);
        hindfootGroup.add(rayMesh);
      }

      const forefootGroup = new THREE.Group();
      for (let ray = 0; ray < 5; ray += 1) {
        const uRay = (ray - 2) / 2;
        const xSpread = sideSign * uRay * 0.029;
        const lenScale = 1.08 - ray * 0.09;
        const toeMesh = new THREE.Mesh(shared.phalanxGeo, boneMat);
        toeMesh.position.set(xSpread, -0.012, anth.footForeLenM * 0.44 * lenScale);
        toeMesh.scale.set(ray === 0 ? 1.35 : 0.92, lenScale, ray === 0 ? 1.35 : 0.92);
        forefootGroup.add(toeMesh);
      }

      const upperArmMesh = new THREE.Mesh(shared.upperArmGeo, boneMat);
      const forearmMesh = new THREE.Mesh(shared.forearmGeo, boneMat);
      const handMesh = new THREE.Mesh(shared.handGeo, boneMat);

      const gluteMedMat = createHeatMaterial(false);
      const gluteMedMesh = new THREE.Mesh(shared.gluteMedGeo, gluteMedMat);
      gluteMedMesh.renderOrder = 4;

      const itBand = createDynamicTendonTube(0.010, 12, 8);
      const achilles = createDynamicTendonTube(0.009, 10, 8);
      const grfArrow = createForceArrow3D(isHealthyRef ? 0x3b82f6 : 0xf59e0b);

      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x05070a,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      const shadowMesh = new THREE.Mesh(shared.shadowDiscGeo, shadowMat);
      shadowMesh.position.y = 0.001;

      scene.add(
        thighGroup, patellaMesh, shankGroup, hindfootGroup, forefootGroup,
        upperArmMesh, forearmMesh, handMesh, gluteMedMesh,
        itBand.mesh, achilles.mesh, grfArrow.group, shadowMesh
      );

      return {
        thighGroup, patellaMesh, shankGroup, hindfootGroup, forefootGroup,
        upperArmMesh, forearmMesh, handMesh, gluteMedMesh,
        itBand, achilles, grfArrow, shadowMesh,
        mats: { quadMat, hamMat, gastrocMat, gluteMedMat, medMenMat, latMenMat, patellaMat },
        dispose: function () {
          itBand.dispose();
          achilles.dispose();
          grfArrow.dispose();
          shadowMat.dispose();
          Object.keys(this.mats).forEach(function (k) {
            this.mats[k].dispose();
          }, this);
        },
      };
    }

    const limbs = {
      right: createSideLimbMeshes('right'),
      left: createSideLimbMeshes('left'),
    };

    const fpCount = 24;
    const fpMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const fpMesh = new THREE.InstancedMesh(shared.footprintGeo, fpMat, fpCount);
    fpMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(fpMesh);

    let comTubeMesh = null;
    const comLineMat = new THREE.MeshStandardMaterial({
      color: isHealthyRef ? 0x60a5fa : 0xfbbf24,
      emissive: isHealthyRef ? 0x3b82f6 : 0xd97706,
      emissiveIntensity: 0.65,
      roughness: 0.3,
    });
    const comMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 14, 12),
      comLineMat
    );
    scene.add(comMarker);

    let lastComHabit = null;
    const dummy = new THREE.Object3D();
    const fpColor = new THREE.Color();
    const iliacAnchor = [0, 0, 0];
    const trochanterAnchor = [0, 0, 0];

    function updateFootprints(frame, profile, cumulativeCycles) {
      const stride = frame.strideLengthM;
      const halfStepX = profile.stepWidthM * 0.5;
      const hasHeel = profile.id !== 'toe_clench';
      const footRad = (profile.footOutDeg * Math.PI) / 180;
      const strikeMidZ = Number.isFinite(profile.heelStrikeMidZ) ? profile.heelStrikeMidZ : 0.28;
      const floorIdx = Math.floor(cumulativeCycles * 2);

      let instIdx = 0;
      for (let step = 0; step < 12; step += 1) {
        const kStep = floorIdx - step;
        const isLeft = (((kStep % 2) + 2) % 2) === 1;
        const sideSign = isLeft ? 1 : -1;
        const ageCycles = cumulativeCycles - kStep * 0.5;
        const zCenter = strikeMidZ - ageCycles * stride;
        const xCenter = sideSign * halfStepX;
        const inBelt = zCenter >= -1.04 && zCenter <= 1.04;

        dummy.position.set(xCenter, inBelt ? 0.0025 : -10, zCenter + 0.055);
        dummy.rotation.set(0, sideSign * footRad, 0);
        dummy.scale.set(0.85, 1, 0.92);
        dummy.updateMatrix();
        fpMesh.setMatrixAt(instIdx, dummy.matrix);
        fpColor.setHex(profile.id === 'crossover_valgus' ? 0xfb923c : (isHealthyRef ? 0x60a5fa : 0x94a3b8));
        fpMesh.setColorAt(instIdx, fpColor);
        instIdx += 1;

        dummy.position.set(xCenter, (inBelt && hasHeel) ? 0.0025 : -10, zCenter - 0.065);
        dummy.rotation.set(0, sideSign * footRad, 0);
        dummy.scale.set(0.72, 1, 0.72);
        dummy.updateMatrix();
        fpMesh.setMatrixAt(instIdx, dummy.matrix);
        fpMesh.setColorAt(instIdx, fpColor);
        instIdx += 1;
      }
      fpMesh.instanceMatrix.needsUpdate = true;
      if (fpMesh.instanceColor) fpMesh.instanceColor.needsUpdate = true;
    }

    function updateSide(sideKey, sideFrame, axialFrame, profile, overlays, elapsedSec) {
      const m = limbs[sideKey];
      const sideSign = sideKey === 'left' ? 1 : -1;
      const xray = overlays.xray ? 1.0 : 0.0;

      applyPose(m.thighGroup, sideFrame.joints.hip);
      applyPose(m.patellaMesh, sideFrame.joints.patella);
      applyPose(m.shankGroup, sideFrame.joints.knee);
      applyPose(m.hindfootGroup, sideFrame.joints.ankle);
      applyPose(m.forefootGroup, sideFrame.joints.mtp);

      m.upperArmMesh.position.set(sideFrame.joints.shoulder.position[0], sideFrame.joints.shoulder.position[1], sideFrame.joints.shoulder.position[2]);
      m.upperArmMesh.quaternion.set(sideFrame.joints.shoulder.quaternion[0], sideFrame.joints.shoulder.quaternion[1], sideFrame.joints.shoulder.quaternion[2], sideFrame.joints.shoulder.quaternion[3]);

      m.forearmMesh.position.set(sideFrame.joints.elbow.position[0], sideFrame.joints.elbow.position[1], sideFrame.joints.elbow.position[2]);
      m.forearmMesh.quaternion.set(sideFrame.joints.elbow.quaternion[0], sideFrame.joints.elbow.quaternion[1], sideFrame.joints.elbow.quaternion[2], sideFrame.joints.elbow.quaternion[3]);

      m.handMesh.position.set(sideFrame.joints.wrist.position[0], sideFrame.joints.wrist.position[1], sideFrame.joints.wrist.position[2]);
      m.handMesh.quaternion.copy(m.forearmMesh.quaternion);

      rotateLocalPoint(
        axialFrame.pelvis.position,
        axialFrame.pelvis.quaternion,
        sideSign * anth.pelvisHalfWidthM * 1.12,
        anth.pelvisHeightM * 0.55,
        -0.01,
        iliacAnchor
      );
      rotateLocalPoint(
        sideFrame.joints.hip.position,
        sideFrame.joints.hip.quaternion,
        sideSign * 0.032,
        -0.015,
        0,
        trochanterAnchor
      );
      orientBetween(m.gluteMedMesh, iliacAnchor, trochanterAnchor, 1.0);
      m.gluteMedMesh.visible = overlays.muscles;

      const boneOp = overlays.xray ? 0.52 : 1.0;
      boneMat.transparent = overlays.xray;
      boneMat.opacity = boneOp;

      const musVis = overlays.muscles;
      m.thighGroup.children[2].visible = musVis;
      m.thighGroup.children[3].visible = musVis;
      m.shankGroup.children[5].visible = musVis;

      m.mats.quadMat.uniforms.uHeat.value = sideFrame.muscles.quads;
      m.mats.quadMat.uniforms.uTime.value = elapsedSec;
      m.mats.quadMat.uniforms.uXray.value = xray;

      m.mats.hamMat.uniforms.uHeat.value = sideFrame.muscles.hamstrings;
      m.mats.hamMat.uniforms.uTime.value = elapsedSec;
      m.mats.hamMat.uniforms.uXray.value = xray;

      m.mats.gastrocMat.uniforms.uHeat.value = sideFrame.muscles.gastrocSoleus;
      m.mats.gastrocMat.uniforms.uTime.value = elapsedSec;
      m.mats.gastrocMat.uniforms.uXray.value = xray;

      m.mats.gluteMedMat.uniforms.uHeat.value = sideFrame.muscles.gluteMedius;
      m.mats.gluteMedMat.uniforms.uTime.value = elapsedSec;
      m.mats.gluteMedMat.uniforms.uXray.value = xray;

      m.mats.medMenMat.uniforms.uHeat.value = sideFrame.kneeStress.medialMeniscusLoad;
      m.mats.medMenMat.uniforms.uTime.value = elapsedSec;
      m.mats.medMenMat.uniforms.uXray.value = xray;

      m.mats.latMenMat.uniforms.uHeat.value = sideFrame.kneeStress.lateralMeniscusLoad;
      m.mats.latMenMat.uniforms.uTime.value = elapsedSec;
      m.mats.latMenMat.uniforms.uXray.value = xray;

      m.mats.patellaMat.uniforms.uHeat.value = sideFrame.kneeStress.patellofemoralStress;
      m.mats.patellaMat.uniforms.uTime.value = elapsedSec;
      m.mats.patellaMat.uniforms.uXray.value = xray;

      m.itBand.mesh.visible = musVis;
      if (musVis) {
        const kneeMid = [
          (trochanterAnchor[0] + sideFrame.joints.lateralEpicondyle[0]) * 0.5 + sideSign * 0.015,
          (trochanterAnchor[1] + sideFrame.joints.lateralEpicondyle[1]) * 0.5,
          (trochanterAnchor[2] + sideFrame.joints.lateralEpicondyle[2]) * 0.5,
        ];
        m.itBand.updatePoints(
          iliacAnchor,
          kneeMid,
          sideFrame.joints.lateralEpicondyle,
          sideFrame.joints.gerdyTubercle,
          sideFrame.muscles.itBand,
          elapsedSec,
          xray
        );
      }

      m.achilles.mesh.visible = musVis;
      if (musVis) {
        const k = sideFrame.joints.knee.position;
        const a = sideFrame.joints.ankle.position;
        const calfOrigin = [
          (k[0] + a[0]) * 0.5,
          k[1] + (a[1] - k[1]) * 0.52,
          (k[2] + a[2]) * 0.5 - 0.032,
        ];
        const calfLow = [
          a[0],
          a[1] + (k[1] - a[1]) * 0.22,
          a[2] - 0.028,
        ];
        const anklePost = [a[0], a[1] + 0.01, a[2] - 0.025];
        m.achilles.updatePoints(
          calfOrigin,
          calfLow,
          anklePost,
          sideFrame.joints.calcaneusTuberosity,
          sideFrame.muscles.achilles,
          elapsedSec,
          xray
        );
      }

      m.grfArrow.updateVector(
        sideFrame.grf.copWorld,
        [sideFrame.grf.medioLateralBw, sideFrame.grf.verticalBw, sideFrame.grf.foreAftBw],
        overlays.grf
      );

      const fx = sideFrame.footContact.ballWorld[0];
      const fz = (sideFrame.footContact.heelWorld[2] + sideFrame.footContact.ballWorld[2]) * 0.5;
      const fy = sideFrame.footContact.minWorldY;
      m.shadowMesh.position.set(fx, 0.001, fz);
      m.shadowMesh.material.opacity = Math.max(0.08, 0.45 - fy * 2.2);
    }

    function updateComRibbon(series, frame, visible) {
      if (comTubeMesh) comTubeMesh.visible = visible;
      comMarker.visible = visible;
      if (!visible) return;

      const ribbonZ = -0.44;
      if (lastComHabit !== frame.habitId) {
        lastComHabit = frame.habitId;
        const arr = isHealthyRef ? series.refComY : series.comY;
        const pts = [];
        for (let i = 0; i < arr.length; i += 4) {
          const p = i / (arr.length - 1);
          pts.push(new THREE.Vector3(-0.34 + p * 0.68, arr[i], ribbonZ));
        }
        pts.push(new THREE.Vector3(0.34, arr[0], ribbonZ));
        if (comTubeMesh) {
          scene.remove(comTubeMesh);
          comTubeMesh.geometry.dispose();
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        comTubeMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.0055, 8, false), comLineMat);
        scene.add(comTubeMesh);
      }
      const px = -0.34 + frame.phase01 * 0.68;
      comMarker.position.set(px, frame.axial.comWorld[1], ribbonZ);
    }

    return {
      scene,
      update: function (frame, profile, series, overlays, cumulativeCycles, elapsedSec) {
        applyPose(pelvisGroup, frame.axial.pelvis);
        applyPose(thoraxGroup, frame.axial.lumbar);
        applyPose(headGroup, frame.axial.head);

        phoneMesh.visible = frame.axial.phoneTransform.visible;
        if (phoneMesh.visible) {
          applyPose(phoneMesh, frame.axial.phoneTransform);
        }

        beltMat.map.offset.y = -(cumulativeCycles * frame.strideLengthM) / 0.88;

        updateSide('right', frame.right, frame.axial, profile, overlays, elapsedSec);
        updateSide('left', frame.left, frame.axial, profile, overlays, elapsedSec);
        updateFootprints(frame, profile, cumulativeCycles);
        updateComRibbon(series, frame, overlays.comRibbon);
      },
      dispose: function () {
        beltMesh.geometry.dispose();
        beltMat.map.dispose();
        beltMat.dispose();
        deckFrame.geometry.dispose();
        deckMat.dispose();
        gridHelper.geometry.dispose();
        if (Array.isArray(gridHelper.material)) {
          gridHelper.material.forEach(function (gm) { gm.dispose(); });
        } else {
          gridHelper.material.dispose();
        }
        boneMat.dispose();
        cartilageMat.dispose();
        phoneMat.dispose();
        fpMat.dispose();
        if (comTubeMesh) comTubeMesh.geometry.dispose();
        comLineMat.dispose();
        comMarker.geometry.dispose();
        limbs.right.dispose();
        limbs.left.dispose();
      },
    };
  }

  /**
   * Owns the single shared WebGLRenderer, OrbitControls, camera presets, and scissor dispatch.
   */
  function createViewportController(canvasEl) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.autoClear = false;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 40);
    const initial = GaitCore.CAMERA_PRESETS.lab_3q;
    camera.position.set(initial.position[0], initial.position[1], initial.position[2]);

    const controls = new THREE.OrbitControls(camera, canvasEl);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomToCursor = false;
    controls.minDistance = 0.7;
    controls.maxDistance = 6.5;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(initial.target[0], initial.target[1], initial.target[2]);
    controls.update();

    let tween = null;
    controls.addEventListener('start', function () {
      tween = null;
    });

    function setPreset(presetId) {
      const p = GaitCore.CAMERA_PRESETS[GaitCore.parseCameraPresetId(presetId)];
      // Flush residual sphericalDelta/panOffset from OrbitControls before snapping/tweening.
      const prevDamping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = prevDamping;

      tween = {
        elapsed: 0,
        duration: 0.35,
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(p.position[0], p.position[1], p.position[2]),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(p.target[0], p.target[1], p.target[2]),
        fromFov: camera.fov,
        toFov: p.fovDeg,
      };
    }

    function snapPresetImmediate(presetId) {
      const p = GaitCore.CAMERA_PRESETS[GaitCore.parseCameraPresetId(presetId)];
      tween = null;
      const prevDamping = controls.enableDamping;
      controls.enableDamping = false;
      camera.position.set(p.position[0], p.position[1], p.position[2]);
      controls.target.set(p.target[0], p.target[1], p.target[2]);
      camera.fov = p.fovDeg;
      camera.updateProjectionMatrix();
      controls.update();
      controls.enableDamping = prevDamping;
    }

    function render(dtSec, layoutKind, scenesByRole) {
      if (tween) {
        tween.elapsed = Math.min(tween.duration, tween.elapsed + dtSec);
        const u = tween.elapsed / tween.duration;
        const s = 1 - Math.pow(1 - u, 3);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, s);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, s);
        camera.fov = tween.fromFov + (tween.toFov - tween.fromFov) * s;
        camera.updateProjectionMatrix();
        if (u >= 1) tween = null;
      }
      controls.update();

      const cssW = canvasEl.clientWidth || 1;
      const cssH = canvasEl.clientHeight || 1;
      const dpr = renderer.getPixelRatio();
      const targetW = Math.floor(cssW * dpr);
      const targetH = Math.floor(cssH * dpr);
      if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
        renderer.setSize(cssW, cssH, false);
      }

      const layout = GaitCore.computeViewportPanes(layoutKind, cssW, cssH);
      renderer.setScissorTest(true);
      for (let i = 0; i < layout.panes.length; i += 1) {
        const pane = layout.panes[i];
        const glY = cssH - pane.y - pane.height;
        renderer.setViewport(pane.x, glY, pane.width, pane.height);
        renderer.setScissor(pane.x, glY, pane.width, pane.height);
        const aspect = pane.width / Math.max(1, pane.height);
        if (Math.abs(camera.aspect - aspect) > 1e-4) {
          camera.aspect = aspect;
          camera.updateProjectionMatrix();
        }
        renderer.clear(true, true, true);
        renderer.render(scenesByRole[pane.role], camera);
      }
      renderer.setScissorTest(false);
    }

    return {
      renderer,
      camera,
      controls,
      setPreset,
      snapPresetImmediate,
      render,
      dispose: function () {
        controls.dispose();
        renderer.dispose();
      },
    };
  }

  global.GaitThreeRig = Object.freeze({
    createSharedBoneGeometries,
    createAnatomicalWalkerRig,
    createViewportController,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
