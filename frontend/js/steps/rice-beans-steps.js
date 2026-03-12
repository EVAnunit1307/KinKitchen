/* global THREE */
'use strict';

/**
 * RiceBeansSteps — Animations for Rice & Beans recipe unique steps
 *
 * Handles:
 *   Step 1 (RINSE)      — water droplet rain above the counter, completes after ~2s
 *   Step 2 (POUR_WATER) — drip droplets fall into the pot from above
 *   Step 4 (DROP_BEANS) — bean can arcs into the pot with splash
 *
 * Step 3 (boil) and Step 5 (stir) are handled generically by CookingGuide.
 *
 * API:
 *   RiceBeansSteps.init(scene)
 *   RiceBeansSteps.startStep(action, opts)
 *     opts: { getMesh, potMesh, onComplete }
 *   RiceBeansSteps.tick(dt)
 *   RiceBeansSteps.cleanup()
 *   RiceBeansSteps.destroy()
 */
const RiceBeansSteps = (() => {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  const RINSE_DUR    = 2.2;   // seconds for rinse particle effect
  const POUR_DUR     = 2.0;   // seconds for pour drip effect
  const DROP_DUR     = 1.2;
  const PAUSE_DUR    = 0.3;
  const SETTLE_DUR   = 0.7;
  const ARC_HEIGHT   = 0.30;
  const SPLASH_COUNT = 6;
  const SPLASH_LIFE  = 0.5;

  const RINSE_DROPS  = 40;    // simultaneous droplets during rinse
  const POUR_DROPS   = 20;    // simultaneous drip threads during pour

  // ── Easing ─────────────────────────────────────────────────────────────────
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }
  function easeOutQuad(t)    { return 1 - (1-t)*(1-t); }
  function easeInQuad(t)     { return t*t; }
  function lerp(a, b, t)     { return a + (b-a) * Math.max(0, Math.min(1, t)); }

  // ── State ──────────────────────────────────────────────────────────────────
  let _scene      = null;
  let _action     = null;
  let _elapsed    = 0;
  let _onComplete = null;
  let _completed  = false;
  let _done       = false;

  // Rinse / Pour particles
  let _droplets    = [];   // [{ mesh, phase, speed, ox, oz, fallH }]

  // Drop-into-pot (beans step)
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
    console.log('[RiceBeansSteps] initialized');
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  function startStep(action, opts) {
    cleanup();
    _action     = action;
    _completed  = false;
    _done       = false;
    _elapsed    = 0;
    _onComplete = opts.onComplete || null;
    const potMesh = opts.potMesh;
    const getMesh = opts.getMesh;

    _setupPot(potMesh);

    if (action === 'ADD_RICE') {
      const m = getMesh ? getMesh('rice_1') : null;
      if (m) _queue.push({ mesh: m, orig: { x: m.position.x, y: m.position.y, z: m.position.z } });
      if (_queue.length === 0) { setTimeout(() => _fireComplete(), 1000); return; }
      _dropNext();

    } else if (action === 'RINSE') {
      _spawnRinseDroplets();
      setTimeout(() => { _done = true; _fireComplete(); }, RINSE_DUR * 1000);

    } else if (action === 'POUR_WATER') {
      _spawnPourDroplets(potMesh);
      setTimeout(() => { _done = true; _fireComplete(); }, POUR_DUR * 1000);

    } else if (action === 'DROP_BEANS') {
      const m = getMesh ? getMesh('canned_beans_1') : null;
      if (m) _queue.push({ mesh: m, orig: { x: m.position.x, y: m.position.y, z: m.position.z } });
      if (_queue.length === 0) {
        setTimeout(() => _fireComplete(), 1000);
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

  // ── Rinse: falling water droplets cycling above the counter ───────────────
  function _spawnRinseDroplets() {
    if (!_scene) return;
    const cx = _potCenter ? _potCenter.x : 0.59;
    const cz = _potCenter ? _potCenter.z : -0.46;
    const baseY = (_potRimY || 3.22) + 0.15;

    for (let i = 0; i < RINSE_DROPS; i++) {
      const geo = new THREE.SphereGeometry(0.004, 4, 3);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xA8D4F5, transparent: true, opacity: 0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      _scene.add(mesh);
      _droplets.push({
        type: 'rinse', mesh,
        phase: Math.random(),
        speed: 0.55 + Math.random() * 0.45,
        ox: (Math.random() - 0.5) * 0.28,
        oz: (Math.random() - 0.5) * 0.28,
        fallH: 0.30 + Math.random() * 0.20,
        baseY, cx, cz,
      });
    }
  }

  // ── Pour: thin drip threads falling into the pot from above ───────────────
  function _spawnPourDroplets(potMesh) {
    if (!_scene) return;
    const cx = _potCenter ? _potCenter.x : 0.59;
    const cz = _potCenter ? _potCenter.z : -0.46;
    const topY = (_potRimY || 3.22) + 0.50;

    for (let i = 0; i < POUR_DROPS; i++) {
      const geo = new THREE.CylinderGeometry(0.003, 0.003, 0.04, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xB8DFFA, transparent: true, opacity: 0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      _scene.add(mesh);
      _droplets.push({
        type: 'pour', mesh,
        phase: Math.random(),
        speed: 0.7 + Math.random() * 0.5,
        ox: (Math.random() - 0.5) * 0.15,
        oz: (Math.random() - 0.5) * 0.15,
        fallH: 0.55 + Math.random() * 0.15,
        baseY: topY, cx, cz,
      });
    }
  }

  // ── Drop-into-pot (beans) ─────────────────────────────────────────────────
  function _dropNext() {
    if (_queue.length === 0) {
      _phase  = 'SETTLE';
      _phaseT = 0;
      return;
    }
    const entry = _queue.shift();
    _currentMesh = entry.mesh;
    _currentOrig = entry.orig;
    _currentMesh.visible = true;
    _phase  = 'DROPPING';
    _phaseT = 0;
  }

  // ── Tick ───────────────────────────────────────────────────────────────────
  function tick(dt) {
    _elapsed += dt;

    // Tick rinse/pour droplets
    const now = performance.now() / 1000;
    _droplets.forEach(d => {
      d.phase = (d.phase + dt * d.speed) % 1;
      const lp = d.phase;
      const fi = lp < 0.12 ? lp / 0.12 : 1;
      const fo = lp > 0.72 ? (1 - lp) / 0.28 : 1;
      const alpha = fi * fo * 0.7;

      d.mesh.visible = alpha > 0.01;
      d.mesh.material.opacity = alpha;
      const y = d.baseY - lp * d.fallH;
      d.mesh.position.set(d.cx + d.ox + Math.sin(now * 1.4 + d.phase * 8) * 0.012, y, d.cz + d.oz);
    });

    // Tick drop-into-pot phases
    _phaseT += dt;
    switch (_phase) {
      case 'DROPPING': _tickDrop(dt);  break;
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
    _currentMesh.rotation.x += dt * 2.0;
    _currentMesh.rotation.z += dt * 1.2;
    if (t >= 1) {
      _currentMesh.position.set(_dropTarget.x, _dropTarget.y, _dropTarget.z);
      _spawnSplash(0x6B8CFF);
      _sinkMesh(_currentMesh);
      _currentMesh = null;
      _phase  = 'PAUSE';
      _phaseT = 0;
    }
  }

  // ── Splash ─────────────────────────────────────────────────────────────────
  function _spawnSplash(color) {
    if (!_scene || !_dropTarget) return;
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const geo = new THREE.SphereGeometry(0.005, 4, 3);
      const mat = new THREE.MeshStandardMaterial({
        color: color || 0xADD8FF, transparent: true, opacity: 0.85, roughness: 0.3,
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
        type: 'splash', mesh, age: 0, maxLife: SPLASH_LIFE,
        maxScale: 0.006 * (0.7 + Math.random() * 0.6),
        vx: Math.cos(angle) * (0.06 + Math.random() * 0.08),
        vy: 0.09 + Math.random() * 0.11,
        vz: Math.sin(angle) * (0.06 + Math.random() * 0.08),
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
      p.age += dt;
      p.mesh.scale.setScalar(p.maxScale * easeOutQuad(Math.min(p.age / 0.09, 1)));
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= dt * 0.5;
      const fadeStart = p.maxLife * 0.3;
      if (p.age > fadeStart) {
        const fade = 1 - (p.age - fadeStart) / (p.maxLife * 0.7);
        if (fade <= 0) {
          _scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
          _particles.splice(i, 1); continue;
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
    _droplets.forEach(d => {
      if (d.mesh && _scene) { _scene.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose(); }
    });
    _droplets = [];
    _particles.forEach(p => {
      if (p.type === 'splash' && p.mesh && _scene) {
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
    _elapsed     = 0;
    _done        = false;
  }

  function destroy() { cleanup(); _scene = null; }

  return { init, startStep, tick, cleanup, destroy };
})();

window.RiceBeansSteps = RiceBeansSteps;
