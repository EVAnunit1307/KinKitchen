/* immersiveEntry.js — Animated Three.js background for the Aki splash screen
 *
 * Creates a full-screen WebGL canvas behind the splash content with:
 *   - Floating golden firefly particles orbiting the centre
 *   - Procedural birch-forest silhouette built from geometry
 *   - Mouse/gyro parallax camera via GyroCamera
 *   - Slow-rotating star-field horizon glow
 *
 * Public API:
 *   ImmersiveEntry.mount()    — starts the scene
 *   ImmersiveEntry.unmount()  — cleans up
 *   ImmersiveEntry.launchXR() — tries WebXR vr→ar→fullscreen
 */
/* global THREE, GyroCamera */
'use strict';

const ImmersiveEntry = (() => {

  let _renderer = null;
  let _rafId    = null;
  let _scene    = null;
  let _camera   = null;
  let _canvas   = null;
  let _particles = null;  // Points object
  let _treeLine  = null;  // Group of tree silhouettes
  let _glowRing  = null;  // Mesh — horizon glow
  let _mounted   = false;
  let _xrSession = null;

  const PARTICLE_COUNT = 180;

  // ── Particle system: warm golden fireflies ────────────────────────────────
  function _buildParticles(scene) {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const phases    = new Float32Array(PARTICLE_COUNT);
    const speeds    = new Float32Array(PARTICLE_COUNT);
    const radii     = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r     = 0.4 + Math.random() * 2.2;
      const theta = Math.random() * Math.PI * 2;
      const phi   = (Math.random() - 0.5) * 1.4;
      positions[i * 3]     = r * Math.cos(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.sin(phi) + (Math.random() - 0.5) * 0.8;
      positions[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi) - 2;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.18 + Math.random() * 0.28;
      radii[i]  = r;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Store animation data on geometry for the tick
    geo.userData = { phases, speeds, radii, positions: positions.slice() };

    const mat = new THREE.PointsMaterial({
      color: 0xF5B04A,
      size: 0.038,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });

    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    _particles = pts;
  }

  // ── Birch tree silhouette line ────────────────────────────────────────────
  function _buildTreeline(scene) {
    const group = new THREE.Group();
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x0D1208 });

    function addTree(x, h, trunkW, crownW) {
      // Trunk
      const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(trunkW, h * 0.55, 0.04),
        darkMat
      );
      trunk.position.set(x, -1.2 + h * 0.275, -3.8);
      group.add(trunk);

      // Crown (layered triangles for birch look)
      const layers = 3;
      for (let l = 0; l < layers; l++) {
        const lh = h * (0.35 - l * 0.06);
        const lw = crownW * (1.0 - l * 0.22);
        const ly  = -1.2 + h * 0.48 + l * h * 0.13;
        const tri = new THREE.Mesh(
          new THREE.ConeGeometry(lw * 0.5, lh, 5),
          darkMat
        );
        tri.position.set(x, ly, -3.8);
        group.add(tri);
      }
    }

    const treeData = [
      [-3.8, 2.1, 0.07, 0.60],
      [-2.9, 1.7, 0.06, 0.50],
      [-2.1, 2.4, 0.08, 0.70],
      [-1.4, 1.5, 0.05, 0.42],
      [-0.7, 2.0, 0.07, 0.58],
      [ 0.0, 1.9, 0.06, 0.54],
      [ 0.8, 2.3, 0.08, 0.65],
      [ 1.5, 1.6, 0.05, 0.45],
      [ 2.2, 2.2, 0.07, 0.62],
      [ 3.1, 1.8, 0.06, 0.52],
      [ 3.9, 2.0, 0.07, 0.56],
    ];
    treeData.forEach(d => addTree(...d));
    scene.add(group);
    _treeLine = group;
  }

  // ── Horizon glow ──────────────────────────────────────────────────────────
  function _buildGlow(scene) {
    const geo = new THREE.PlaneGeometry(12, 2.4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xC8622A,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, -0.7, -4);
    scene.add(mesh);
    _glowRing = mesh;
  }

  // ── Scene setup ───────────────────────────────────────────────────────────
  function _initScene() {
    const canvas = document.createElement('canvas');
    canvas.id = 'immersive-bg-canvas';
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    const splash = document.querySelector('.screen-splash');
    if (!splash) return false;
    splash.style.position = 'relative';
    splash.insertBefore(canvas, splash.firstChild);
    _canvas = canvas;

    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    if (renderer.xr) renderer.xr.enabled = true;
    _renderer = renderer;

    const scene = new THREE.Scene();
    _scene = scene;

    // Gradient-ish sky: tint ambient
    scene.add(new THREE.AmbientLight(0x2A1A0A, 1.0));
    const moonLight = new THREE.DirectionalLight(0xB0C4DE, 0.5);
    moonLight.position.set(-2, 5, 3);
    scene.add(moonLight);

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.05, 50);
    camera.position.set(0, 0.2, 2.5);
    camera.lookAt(0, 0, 0);
    _camera = camera;

    _buildParticles(scene);
    _buildTreeline(scene);
    _buildGlow(scene);

    // Gyro/mouse parallax
    if (window.GyroCamera) {
      GyroCamera.attach(camera, {
        strength: 0.18,
        smoothing: 0.04,
        basePos: { x: 0, y: 0.2, z: 2.5 },
        lookAt:  { x: 0, y: 0, z: 0 },
      });
    }

    // Resize
    window.addEventListener('resize', _onResize);
    return true;
  }

  function _onResize() {
    if (!_renderer || !_camera || !_canvas) return;
    const w = _canvas.clientWidth  || window.innerWidth;
    const h = _canvas.clientHeight || window.innerHeight;
    _renderer.setSize(w, h, false);
    _camera.aspect = w / h;
    _camera.updateProjectionMatrix();
  }

  // ── Animation loop ────────────────────────────────────────────────────────
  function _loop(now) {
    _rafId = requestAnimationFrame(_loop);
    const t = now / 1000;

    // Animate particles: each firefly bobs gently in its orbit
    if (_particles) {
      const pos  = _particles.geometry.attributes.position;
      const ud   = _particles.geometry.userData;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const orig  = ud.positions;
        const phase = ud.phases[i];
        const speed = ud.speeds[i];
        const r     = ud.radii[i];

        const angle = t * speed + phase;
        const ox = orig[i * 3];
        const oz = orig[i * 3 + 2];
        // Orbit gently around origin in XZ, bob in Y
        const dist = Math.sqrt(ox * ox + oz * oz) || 1;
        const baseAngle = Math.atan2(oz, dist);
        pos.array[i * 3]     = ox + Math.cos(angle) * 0.08;
        pos.array[i * 3 + 1] = orig[i * 3 + 1] + Math.sin(angle * 1.3) * 0.06;
        pos.array[i * 3 + 2] = oz + Math.sin(angle) * 0.08;
      }
      pos.needsUpdate = true;

      // Pulse particle opacity
      _particles.material.opacity = 0.6 + 0.22 * Math.sin(t * 1.1);
    }

    // Glow pulse
    if (_glowRing) {
      _glowRing.material.opacity = 0.12 + 0.07 * Math.sin(t * 0.7);
    }

    if (_renderer && _scene && _camera) {
      _renderer.render(_scene, _camera);
    }
  }

  // ── WebXR launcher ────────────────────────────────────────────────────────
  async function launchXR() {
    if (!_renderer) return;

    if (navigator.xr) {
      let vrOk = false, arOk = false;
      try { vrOk = await navigator.xr.isSessionSupported('immersive-vr'); } catch (_) {}
      try { arOk = await navigator.xr.isSessionSupported('immersive-ar'); } catch (_) {}
      const mode = vrOk ? 'immersive-vr' : arOk ? 'immersive-ar' : null;

      if (mode) {
        try {
          const session = await navigator.xr.requestSession(mode, {
            optionalFeatures: ['local-floor', 'bounded-floor'],
          });
          _xrSession = session;
          session.addEventListener('end', () => {
            _xrSession = null;
            if (_renderer && _renderer.xr) _renderer.xr.setSession(null);
          });
          await _renderer.xr.setSession(session);
          _renderer.setAnimationLoop(() => {
            if (_renderer && _scene && _camera) _renderer.render(_scene, _camera);
          });
          return;
        } catch (err) {
          console.warn('[ImmersiveEntry] WebXR failed:', err.message);
        }
      }
    }

    // Fullscreen fallback
    const container = document.querySelector('.screen-splash');
    if (container?.requestFullscreen) {
      container.requestFullscreen().catch(() => {});
    }
    // Switch to 3D kitchen as the immersive fallback
    if (window.AkiApp) {
      window.AkiApp.goTo('kitchen3d');
      requestAnimationFrame(() => {
        const c = document.getElementById('kitchen3d-container');
        if (c && window.launchDemoKitchen) window.launchDemoKitchen(c);
      });
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function mount() {
    if (_mounted) return;
    if (!window.THREE) return;
    const ok = _initScene();
    if (!ok) return;
    cancelAnimationFrame(_rafId);
    _loop(performance.now());
    _mounted = true;
  }

  function unmount() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (window.GyroCamera) GyroCamera.detach();
    if (_renderer) { _renderer.dispose(); _renderer = null; }
    if (_canvas)   { _canvas.remove(); _canvas = null; }
    window.removeEventListener('resize', _onResize);
    _particles = null; _treeLine = null; _glowRing = null;
    _scene = null; _camera = null;
    _mounted = false;
  }

  return { mount, unmount, launchXR };
})();
