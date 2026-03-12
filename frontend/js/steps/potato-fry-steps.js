/* global THREE */
'use strict';

/**
 * PotatoFrySteps — Animations for Potato & Onion Fry recipe unique steps
 *
 * Handles:
 *   Step 3 (HEAT)        — rising orange heat-shimmer particles from the pot, completes after ~2s
 *   Step 4 (DROP_POTATO) — potato mesh arcs into the pot with sizzle splash
 *   Step 5 (DROP_ONION)  — onion arcs into the pot with sizzle splash
 *
 * Steps 1–2 (chop/dice) are handled by existing Step1Chop / Step2Chop.
 * Step 6 (stir) is handled generically by CookingGuide.
 *
 * API:
 *   PotatoFrySteps.init(scene)
 *   PotatoFrySteps.startStep(action, opts)
 *     opts: { getMesh, potMesh, onComplete }
 *   PotatoFrySteps.tick(dt)
 *   PotatoFrySteps.cleanup()
 *   PotatoFrySteps.destroy()
 */
const PotatoFrySteps = (() => {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  const HEAT_DUR     = 2.2;   // heat shimmer step duration
  const DROP_DUR     = 1.2;
  const PAUSE_DUR    = 0.3;
  const SETTLE_DUR   = 0.6;
  const ARC_HEIGHT   = 0.32;
  const HEAT_COUNT   = 22;    // simultaneous heat-shimmer wisps
  const SIZZLE_COUNT = 8;     // sizzle sparks on ingredient landing
  const SIZZLE_LIFE  = 0.45;

  // ── Easing ─────────────────────────────────────────────────────────────────
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }
  function easeOutQuad(t)    { return 1 - (1-t)*(1-t); }
  function easeInQuad(t)     { return t*t; }
  function lerp(a, b, t)     { return a + (b-a) * Math.max(0, Math.min(1, t)); }

  // ── State ──────────────────────────────────────────────────────────────────
  let _scene      = null;
  let _action     = null;
  let _onComplete = null;
  let _completed  = false;

  // Heat shimmer particles
  let _heatWisps = [];   // [{ mesh, phase, speed, ox, oz }]

  // Drop-into-pot
  let _phase       = 'IDLE';
  let _phaseT      = 0;
  let _queue       = [];
  let _currentMesh = null;
  let _currentOrig = null;
  let _potCenter   = null;
  let _potRimY     = 0;
  let _potBottomY  = 0;
  let _potRadius   = 0.12;
  let _dropTarget  = null;
  let _particles   = [];

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(scene) {
    _scene = scene;
    console.log('[PotatoFrySteps] initialized');
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  function startStep(action, opts) {
    cleanup();
    _action     = action;
    _completed  = false;
    _onComplete = opts.onComplete || null;
    const potMesh = opts.potMesh;
    const getMesh = opts.getMesh;

    _setupPot(potMesh);

    if (action === 'HEAT') {
      _spawnHeatWisps();
      setTimeout(() => { _fireComplete(); }, HEAT_DUR * 1000);

    } else if (action === 'DROP_POTATO') {
      // Use the diced-potato pile that appeared after the chop step
      const m = (opts.dicedPile && opts.dicedPile.visible) ? opts.dicedPile
              : (getMesh ? getMesh('potato_1') : null);
      if (m) _queue.push({ mesh: m, orig: { x: m.position.x, y: m.position.y, z: m.position.z } });
      if (_queue.length === 0) {
        _spawnSizzle();
        setTimeout(() => _fireComplete(), 1400);
        return;
      }
      _dropNext();

    } else if (action === 'DROP_ONION') {
      // Use the diced-onions pile that appeared after the dice step
      const m = (opts.dicedOnions && opts.dicedOnions.visible) ? opts.dicedOnions
              : (getMesh ? getMesh('onion_1') : null);
      if (m) _queue.push({ mesh: m, orig: { x: m.position.x, y: m.position.y, z: m.position.z } });
      if (_queue.length === 0) {
        _spawnSizzle();
        setTimeout(() => _fireComplete(), 1400);
        return;
      }
      _dropNext();
    }
  }

  // ── Pot setup ──────────────────────────────────────────────────────────────
  function _setupPot(potMesh) {
    if (potMesh) {
      const box    = new THREE.Box3().setFromObject(potMesh);
      const center = box.getCenter(new THREE.Vector3());
      const size   = box.getSize(new THREE.Vector3());
      _potCenter   = { x: center.x, y: center.y, z: center.z };
      _potRimY     = box.max.y;
      _potBottomY  = box.min.y;
      _potRadius   = Math.min(size.x, size.z) * 0.35;
    } else {
      _potCenter  = { x: 0.59, y: 3.08, z: -0.46 };
      _potRimY    = 3.22;
      _potBottomY = 3.0;
    }
    _dropTarget = {
      x: _potCenter.x,
      y: _potRimY - (_potRimY - _potBottomY) * 0.25,
      z: _potCenter.z,
    };
  }

  // ── Heat shimmer: rising orange/yellow wisps from pot rim ─────────────────
  function _spawnHeatWisps() {
    if (!_scene || !_potCenter) return;
    for (let i = 0; i < HEAT_COUNT; i++) {
      const geo = new THREE.PlaneGeometry(0.025, 0.055);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.5 ? 0xFF8C00 : 0xFFD700,
        transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      _scene.add(mesh);
      _heatWisps.push({
        mesh,
        phase:     Math.random(),
        speed:     0.22 + Math.random() * 0.18,
        ox:        (Math.random() - 0.5) * _potRadius * 1.5,
        oz:        (Math.random() - 0.5) * _potRadius * 1.5,
        swayPhase: Math.random() * Math.PI * 2,
        rotSpeed:  (Math.random() - 0.5) * 2.0,
        maxH:      0.22 + Math.random() * 0.18,
      });
    }
  }

  // ── Sizzle sparks for missing-mesh fallback ────────────────────────────────
  function _spawnSizzle() {
    if (!_scene || !_dropTarget) return;
    for (let i = 0; i < SIZZLE_COUNT; i++) {
      const geo = new THREE.SphereGeometry(0.004, 4, 3);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.5 ? 0xFF8C00 : 0xFFD700,
        transparent: true, opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / SIZZLE_COUNT) * Math.PI * 2;
      mesh.position.set(
        _dropTarget.x + Math.cos(angle) * _potRadius * 0.4,
        _dropTarget.y + 0.01,
        _dropTarget.z + Math.sin(angle) * _potRadius * 0.4
      );
      mesh.scale.setScalar(0.001);
      _scene.add(mesh);
      _particles.push({
        type: 'sizzle', mesh, age: 0, maxLife: SIZZLE_LIFE,
        maxScale: 0.006 * (0.8 + Math.random() * 0.5),
        vx: Math.cos(angle) * (0.04 + Math.random() * 0.06),
        vy: 0.08 + Math.random() * 0.10,
        vz: Math.sin(angle) * (0.04 + Math.random() * 0.06),
      });
    }
  }

  // ── Drop-into-pot ──────────────────────────────────────────────────────────
  function _dropNext() {
    if (_queue.length === 0) { _phase = 'SETTLE'; _phaseT = 0; return; }
    const entry = _queue.shift();
    _currentMesh = entry.mesh;
    _currentOrig = entry.orig;
    _currentMesh.visible = true;
    _phase  = 'DROPPING';
    _phaseT = 0;
  }

  // ── Tick ───────────────────────────────────────────────────────────────────
  function tick(dt) {
    const now = performance.now() / 1000;

    // Tick heat wisps
    _heatWisps.forEach(w => {
      w.phase = (w.phase + dt * w.speed) % 1;
      const lp = w.phase;
      const fi = lp < 0.18 ? lp / 0.18 : 1;
      const fo = lp > 0.68 ? (1 - lp) / 0.32 : 1;
      const alpha = fi * fo * 0.55;
      w.mesh.visible = alpha > 0.01;
      w.mesh.material.opacity = alpha;
      const sway = 0.035 * Math.sin(now * 1.8 + w.swayPhase + lp * 6);
      w.mesh.position.set(
        _potCenter.x + w.ox + sway,
        _potRimY + 0.01 + lp * w.maxH,
        _potCenter.z + w.oz + sway * 0.6
      );
      w.mesh.rotation.y = w.rotSpeed * now;
      w.mesh.rotation.z = 0.15 * Math.sin(now * 1.3 + w.swayPhase);
      const spread = 1 + lp * 0.8;
      w.mesh.scale.set(spread, 1 + lp * 0.5, 1);
    });

    // Tick drop phases
    _phaseT += dt;
    switch (_phase) {
      case 'DROPPING': _tickDrop(dt); break;
      case 'PAUSE':    if (_phaseT >= PAUSE_DUR) _dropNext(); break;
      case 'SETTLE':   if (_phaseT >= SETTLE_DUR) { _phase = 'DONE'; _completed = true; _fireComplete(); } break;
    }

    _tickParticles(dt);
  }

  function _tickDrop(dt) {
    if (!_currentMesh || !_currentOrig) { _phase = 'PAUSE'; _phaseT = 0; return; }
    const t    = Math.min(_phaseT / DROP_DUR, 1);
    const ease = easeInOutCubic(t);
    const peakT = 0.42;
    let arcY;
    if (t < peakT) {
      arcY = lerp(_currentOrig.y, _currentOrig.y + ARC_HEIGHT, easeOutQuad(t / peakT));
    } else {
      arcY = lerp(_currentOrig.y + ARC_HEIGHT, _dropTarget.y, easeInQuad((t - peakT) / (1 - peakT)));
    }
    _currentMesh.position.set(
      lerp(_currentOrig.x, _dropTarget.x, ease),
      arcY,
      lerp(_currentOrig.z, _dropTarget.z, ease)
    );
    _currentMesh.rotation.x += dt * 1.8;
    _currentMesh.rotation.z += dt * 1.2;
    if (t >= 1) {
      _currentMesh.position.set(_dropTarget.x, _dropTarget.y, _dropTarget.z);
      _spawnSizzleBurst();
      _sinkMesh(_currentMesh);
      _currentMesh = null;
      _phase  = 'PAUSE';
      _phaseT = 0;
    }
  }

  // Sizzle burst on landing
  function _spawnSizzleBurst() {
    if (!_scene || !_dropTarget) return;
    for (let i = 0; i < SIZZLE_COUNT; i++) {
      const geo = new THREE.SphereGeometry(0.004, 4, 3);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.5 ? 0xFF8C00 : 0xFFE44D,
        transparent: true, opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / SIZZLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist  = _potRadius * (0.10 + Math.random() * 0.20);
      mesh.position.set(
        _dropTarget.x + Math.cos(angle) * dist,
        _dropTarget.y + 0.01,
        _dropTarget.z + Math.sin(angle) * dist
      );
      mesh.scale.setScalar(0.001);
      _scene.add(mesh);
      _particles.push({
        type: 'sizzle', mesh, age: 0, maxLife: SIZZLE_LIFE,
        maxScale: 0.006 * (0.7 + Math.random() * 0.6),
        vx: Math.cos(angle) * (0.05 + Math.random() * 0.07),
        vy: 0.08 + Math.random() * 0.10,
        vz: Math.sin(angle) * (0.05 + Math.random() * 0.07),
      });
    }
  }

  function _sinkMesh(mesh) {
    if (!mesh) return;
    _particles.push({ type: 'sink', mesh, startScale: mesh.scale.clone(), startY: mesh.position.y, age: 0, dur: 0.45 });
  }

  function _tickParticles(dt) {
    for (let i = _particles.length - 1; i >= 0; i--) {
      const p = _particles[i];
      if (p.type === 'sink') {
        p.age += dt;
        const t    = Math.min(p.age / p.dur, 1);
        const ease = easeInQuad(t);
        const s    = 1 - ease * 0.95;
        p.mesh.scale.set(p.startScale.x * s, p.startScale.y * s, p.startScale.z * s);
        p.mesh.position.y = p.startY - ease * 0.04;
        if (t >= 1) { p.mesh.visible = false; _particles.splice(i, 1); }
        continue;
      }
      // sizzle
      p.age += dt;
      p.mesh.scale.setScalar(p.maxScale * easeOutQuad(Math.min(p.age / 0.08, 1)));
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= dt * 0.6;
      const fadeStart = p.maxLife * 0.3;
      if (p.age > fadeStart) {
        const fade = 1 - (p.age - fadeStart) / (p.maxLife * 0.7);
        if (fade <= 0) {
          _scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
          _particles.splice(i, 1); continue;
        }
        p.mesh.material.opacity = fade * 0.9;
      }
    }
  }

  // ── Callback ───────────────────────────────────────────────────────────────
  function _fireComplete() {
    if (_onComplete) { const cb = _onComplete; _onComplete = null; cb(); }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  function cleanup() {
    _heatWisps.forEach(w => {
      if (w.mesh && _scene) { _scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose(); }
    });
    _heatWisps = [];
    _particles.forEach(p => {
      if (p.type !== 'sink' && p.mesh && _scene) {
        _scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
      }
    });
    _particles   = [];
    _queue       = [];
    _currentMesh = null;
    _currentOrig = null;
    _potCenter   = null;
    _dropTarget  = null;
    _onComplete  = null;
    _action      = null;
    _phase       = 'IDLE';
    _phaseT      = 0;
  }

  function destroy() { cleanup(); _scene = null; }

  return { init, startStep, tick, cleanup, destroy };
})();

window.PotatoFrySteps = PotatoFrySteps;
