/* global THREE */
'use strict';

/**
 * BeanChiliSteps — Animations for Bean Chili recipe unique steps
 *
 * Handles:
 *   Step 3 (DROP_TOMATOES) — tomatoes arc one by one into the pot with splash
 *   Step 4 (DROP_BEANS)    — bean can arcs into the pot with splash
 *
 * Steps 1–2 (chop/mince) are handled by existing Step2Chop / Step3Garlic.
 * Steps 5–6 (boil/stir) are handled generically by CookingGuide.
 *
 * API:
 *   BeanChiliSteps.init(scene)
 *   BeanChiliSteps.startStep(action, opts)
 *     opts: { getMesh, potMesh, onComplete }
 *   BeanChiliSteps.tick(dt)
 *   BeanChiliSteps.cleanup()
 *   BeanChiliSteps.destroy()
 */
const BeanChiliSteps = (() => {
  'use strict';

  // ── Phases ─────────────────────────────────────────────────────────────────
  const PHASE = { IDLE: 'IDLE', DROPPING: 'DROPPING', PAUSE: 'PAUSE', SETTLE: 'SETTLE', DONE: 'DONE' };

  // ── Config ─────────────────────────────────────────────────────────────────
  const DROP_DUR     = 1.2;   // seconds per ingredient drop
  const PAUSE_DUR    = 0.35;  // gap between drops
  const SETTLE_DUR   = 0.7;   // brief settle after last drop
  const ARC_HEIGHT   = 0.30;  // peak arc above start
  const SPLASH_COUNT = 7;
  const SPLASH_LIFE  = 0.55;

  // ── Easing ─────────────────────────────────────────────────────────────────
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }
  function easeOutQuad(t)    { return 1 - (1-t)*(1-t); }
  function easeInQuad(t)     { return t*t; }
  function lerp(a, b, t)     { return a + (b-a) * Math.max(0, Math.min(1, t)); }

  // ── State ──────────────────────────────────────────────────────────────────
  let _scene      = null;
  let _phase      = PHASE.IDLE;
  let _phaseT     = 0;
  let _onComplete = null;
  let _completed  = false;

  // Mesh queue: [{ mesh, orig:{x,y,z} }]
  let _queue       = [];
  let _currentMesh = null;
  let _currentOrig = null;

  // Pot geometry
  let _potCenter  = null;
  let _potRimY    = 0;
  let _potBottomY = 0;
  let _potRadius  = 0.12;
  let _dropTarget = null;

  // Particles
  let _particles = [];

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(scene) {
    _scene = scene;
    console.log('[BeanChiliSteps] initialized');
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  function startStep(action, opts) {
    cleanup();
    _completed  = false;
    _onComplete = opts.onComplete || null;

    const potMesh  = opts.potMesh;
    const getMesh  = opts.getMesh;

    // Pot bounds
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
      _potRadius  = 0.12;
    }

    _dropTarget = {
      x: _potCenter.x,
      y: _potRimY - (_potRimY - _potBottomY) * 0.25,
      z: _potCenter.z,
    };

    // Build queue
    _queue = [];
    if (action === 'DROP_TOMATOES') {
      const m = getMesh ? getMesh('tomato_1') : null;
      if (m) _queue.push({ mesh: m, orig: { x: m.position.x, y: m.position.y, z: m.position.z } });
    } else if (action === 'DROP_BEANS') {
      const m = getMesh ? getMesh('canned_beans_1') : null;
      if (m) _queue.push({ mesh: m, orig: { x: m.position.x, y: m.position.y, z: m.position.z } });
    }

    if (_queue.length === 0) {
      // No meshes — just complete after a short visual pause
      setTimeout(() => _fireComplete(), 1200);
      return;
    }

    _dropNext();
  }

  // ── Drop next queued mesh ──────────────────────────────────────────────────
  function _dropNext() {
    if (_queue.length === 0) {
      _phase  = PHASE.SETTLE;
      _phaseT = 0;
      return;
    }
    const entry = _queue.shift();
    _currentMesh = entry.mesh;
    _currentOrig = entry.orig;
    _currentMesh.visible = true;
    _phase  = PHASE.DROPPING;
    _phaseT = 0;
  }

  // ── Tick ───────────────────────────────────────────────────────────────────
  function tick(dt) {
    _phaseT += dt;

    switch (_phase) {
      case PHASE.IDLE:     return;
      case PHASE.DROPPING: _tickDrop(dt);    break;
      case PHASE.PAUSE:    _tickPause();     break;
      case PHASE.SETTLE:   _tickSettle();   break;
      case PHASE.DONE:     return;
    }

    _tickParticles(dt);
  }

  function _tickDrop(dt) {
    if (!_currentMesh || !_currentOrig) { _startPause(); return; }

    const t    = Math.min(_phaseT / DROP_DUR, 1);
    const ease = easeInOutCubic(t);

    // Arc: rise to peak then fall into pot
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

    // Tumble in flight
    _currentMesh.rotation.x += dt * 2.2;
    _currentMesh.rotation.z += dt * 1.4;

    if (t >= 1) {
      _currentMesh.position.set(_dropTarget.x, _dropTarget.y, _dropTarget.z);
      _spawnSplash();
      _sinkMesh(_currentMesh);
      _currentMesh = null;
      _startPause();
    }
  }

  function _startPause() {
    _phase  = PHASE.PAUSE;
    _phaseT = 0;
  }

  function _tickPause() {
    if (_phaseT >= PAUSE_DUR) _dropNext();
  }

  function _tickSettle() {
    if (_phaseT >= SETTLE_DUR) {
      _phase     = PHASE.DONE;
      _completed = true;
      _fireComplete();
    }
  }

  // ── Splash burst ───────────────────────────────────────────────────────────
  function _spawnSplash() {
    if (!_scene || !_dropTarget) return;
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const geo = new THREE.SphereGeometry(0.005, 4, 3);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xC0392B, transparent: true, opacity: 0.85,
        roughness: 0.3, metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / SPLASH_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist  = _potRadius * (0.12 + Math.random() * 0.22);
      mesh.position.set(
        _dropTarget.x + Math.cos(angle) * dist,
        _dropTarget.y + 0.005,
        _dropTarget.z + Math.sin(angle) * dist
      );
      mesh.scale.setScalar(0.001);
      _scene.add(mesh);
      _particles.push({
        type: 'splash', mesh,
        age: 0, maxLife: SPLASH_LIFE,
        maxScale: 0.006 * (0.7 + Math.random() * 0.6),
        vx: Math.cos(angle) * (0.06 + Math.random() * 0.08),
        vy: 0.10 + Math.random() * 0.12,
        vz: Math.sin(angle) * (0.06 + Math.random() * 0.08),
      });
    }
  }

  // ── Sink mesh into liquid ──────────────────────────────────────────────────
  function _sinkMesh(mesh) {
    if (!mesh) return;
    _particles.push({
      type: 'sink',
      mesh,
      startScale: mesh.scale.clone(),
      startY: mesh.position.y,
      age: 0, dur: 0.45,
    });
  }

  // ── Particle tick ──────────────────────────────────────────────────────────
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

      // splash
      p.age += dt;
      const growT = Math.min(p.age / 0.09, 1);
      p.mesh.scale.setScalar(p.maxScale * easeOutQuad(growT));
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= dt * 0.55;
      const fadeStart = p.maxLife * 0.3;
      if (p.age > fadeStart) {
        const fade = 1 - (p.age - fadeStart) / (p.maxLife * 0.7);
        if (fade <= 0) {
          _scene.remove(p.mesh);
          p.mesh.geometry.dispose(); p.mesh.material.dispose();
          _particles.splice(i, 1);
          continue;
        }
        p.mesh.material.opacity = fade * 0.85;
      }
    }
  }

  // ── Callback ───────────────────────────────────────────────────────────────
  function _fireComplete() {
    if (_onComplete) { const cb = _onComplete; _onComplete = null; cb(); }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  function cleanup() {
    _particles.forEach(p => {
      if (p.type === 'splash' && p.mesh && _scene) {
        _scene.remove(p.mesh);
        p.mesh.geometry.dispose(); p.mesh.material.dispose();
      }
    });
    _particles    = [];
    _queue        = [];
    _currentMesh  = null;
    _currentOrig  = null;
    _potCenter    = null;
    _dropTarget   = null;
    _onComplete   = null;
    _phase        = PHASE.IDLE;
    _phaseT       = 0;
  }

  function destroy() { cleanup(); _scene = null; }

  return { init, startStep, tick, cleanup, destroy };
})();

window.BeanChiliSteps = BeanChiliSteps;
