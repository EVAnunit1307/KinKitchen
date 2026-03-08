/* hero3d.js — Full-screen Hero 3D village scene for Aki splash
 *
 * Loads the Vietnamese village drone 3D scan as a background:
 *  - Preserves original photorealistic drone-scan textures
 *  - Bird's-eye camera with smooth mouse parallax
 *  - Exponential fog fades edges into the dark background
 *  - Slow auto-rotation keeps the scene alive without mouse input
 *  - Canvas fades in when model finishes loading
 *  - Falls back to a procedural city grid if GLB fails
 *
 * Public API:
 *   Hero3d.mount()   — call when splash screen is shown
 *   Hero3d.unmount() — call when leaving splash
 */
/* global THREE */
'use strict';

const Hero3d = (() => {
  // ── State ─────────────────────────────────────────────────────────────────
  let _renderer  = null;
  let _scene     = null;
  let _camera    = null;
  let _canvas    = null;
  let _rafId     = null;
  let _model     = null;
  let _cityGroup = null;
  let _mounted   = false;

  let _mouseX = 0;
  let _mouseY = 0;
  let _camX   = 0;
  let _camZ   = 9;
  let _autoRotY  = 0;
  let _mouseRotY = 0;

  const CAM_BASE = { x: 0, y: 6.5, z: 6.5 };
  const CAM_LOOKAT = new THREE.Vector3(0, 1.2, 0);

  // ── Mouse tracking ────────────────────────────────────────────────────────
  function _onMouseMove(e) {
    _mouseX =  (e.clientX / window.innerWidth  - 0.5) * 2;
    _mouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
  }

  // ── Load a single GLB and place it at offsetX ─────────────────────────────
  function _loadGLB(path, offsetX, onFail) {
    const Loader = (window.THREE && window.THREE.GLTFLoader) || window.GLTFLoader;
    if (!Loader) { onFail && onFail(); return; }

    new Loader().load(
      path,
      (gltf) => {
        console.log('[Hero3d] Loaded:', path);
        const group = gltf.scene;

        group.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = child.receiveShadow = true;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mat) => {
            if (!mat) return;
            if (mat.color) {
              mat.color.r = Math.min(1, mat.color.r * 1.06);
              mat.color.g = Math.min(1, mat.color.g * 0.97);
              mat.color.b = Math.min(1, mat.color.b * 0.86);
            }
            if (typeof mat.roughness === 'number') mat.roughness = Math.min(1, mat.roughness + 0.06);
          });
        });

        const box    = new THREE.Box3().setFromObject(group);
        const size   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        group.scale.setScalar(11.0 / maxDim);

        box.setFromObject(group);
        const centre = box.getCenter(new THREE.Vector3());
        group.position.set(-centre.x + offsetX, -box.min.y, -centre.z);

        _scene.add(group);
        if (!_model) _model = group; // first loaded drives auto-rotation

        if (_canvas) {
          _canvas.style.transition = 'opacity 1.4s ease';
          _canvas.style.opacity    = '1';
        }
      },
      undefined,
      (err) => { console.warn('[Hero3d] Failed:', path, err); onFail && onFail(); }
    );
  }

  // ── Load both villages ────────────────────────────────────────────────────
  function _loadVillage() {
    const Loader = (window.THREE && window.THREE.GLTFLoader) || window.GLTFLoader;
    if (!Loader) { _buildCityFallback(); return; }

    // Single centred model, bigger scale
    _loadGLB('/assets/3d/residential_buildings_ancient_villages.glb', 0, _buildCityFallback);
  }

  // ── Procedural city fallback ───────────────────────────────────────────────
  function _buildCityFallback() {
    const group = new THREE.Group();

    const buildingColors = [
      0x2A1F10, 0x3A2A14, 0x4A3520, 0x5C4228,
      0x3D2E18, 0x2E2212, 0x4F3B22, 0x6B4E2A,
    ];

    const COLS = 22, ROWS = 22, CELL = 1.1, GAP = 0.18;
    let seed = 42;
    function rand() {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const r = rand();
        if (r < 0.18) continue;
        const h = r < 0.55 ? 0.15 + rand() * 0.4
                : r < 0.80 ? 0.5  + rand() * 1.2
                : r < 0.93 ? 1.4  + rand() * 2.0
                :             3.0  + rand() * 3.5;
        const w = (CELL - GAP) * (0.65 + rand() * 0.35);
        const d = (CELL - GAP) * (0.65 + rand() * 0.35);
        const mat = new THREE.MeshStandardMaterial({
          color: buildingColors[Math.floor(rand() * buildingColors.length)],
          roughness: 0.85, metalness: 0.05,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(
          (col - COLS / 2) * CELL,
          h / 2,
          (row - ROWS / 2) * CELL
        );
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
      }
    }

    const gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS * CELL + 2, ROWS * CELL + 2),
      new THREE.MeshStandardMaterial({ color: 0x150F08, roughness: 1, metalness: 0 })
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -0.01;
    gnd.receiveShadow = true;
    group.add(gnd);

    group.rotation.y = -Math.PI / 7;
    _scene.add(group);
    _cityGroup = group;

    if (_canvas) {
      _canvas.style.transition = 'opacity 1.2s ease';
      _canvas.style.opacity    = '1';
    }
  }

  // ── Scene setup ───────────────────────────────────────────────────────────
  function _initScene() {
    const splash = document.querySelector('.screen-splash');
    if (!splash || !window.THREE) return false;

    const canvas = document.createElement('canvas');
    canvas.id = 'hero3d-canvas';
    canvas.style.cssText = [
      'position:absolute', 'inset:0', 'width:100%', 'height:100%',
      'z-index:0', 'pointer-events:none', 'display:block', 'opacity:0',
    ].join(';');

    splash.style.position = 'relative';
    splash.insertBefore(canvas, splash.firstChild);
    _canvas = canvas;

    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: true, powerPreference: 'high-performance',
    });
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled   = true;
    renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
    renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    _renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0E0B07, 0.06);
    _scene = scene;

    scene.add(new THREE.AmbientLight(0xFFE4C4, 0.55));
    scene.add(new THREE.HemisphereLight(0xFFF0D0, 0x1A1206, 0.5));

    const sun = new THREE.DirectionalLight(0xFFD59E, 1.5);
    sun.position.set(-8, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left   = -14; sun.shadow.camera.right  = 14;
    sun.shadow.camera.top    =  14; sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near   = 0.5; sun.shadow.camera.far    = 70;
    sun.shadow.bias = -0.0002;
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x9AB5D0, 0.38);
    rim.position.set(7, 8, -7);
    scene.add(rim);

    const glow = new THREE.PointLight(0xC8813A, 0.9, 12);
    glow.position.set(0, 1.2, 0);
    scene.add(glow);

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 130);
    camera.position.set(CAM_BASE.x, CAM_BASE.y, CAM_BASE.z);
    camera.lookAt(CAM_LOOKAT);
    _camera = camera;
    _camX   = CAM_BASE.x;
    _camZ   = CAM_BASE.z;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x100D08, roughness: 1, metalness: 0 })
    );
    ground.rotation.x    = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    _loadVillage();

    window.addEventListener('mousemove', _onMouseMove, { passive: true });
    window.addEventListener('resize',    _onResize);
    return true;
  }

  function _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (_renderer && _camera && _canvas) {
      _renderer.setSize(w, h, false);
      _camera.aspect = w / h;
      _camera.updateProjectionMatrix();
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  function _loop(now) {
    _rafId = requestAnimationFrame(_loop);
    const t = now / 1000;

    const drift   = Math.sin(t * 0.11) * 0.18;
    const targetX = _mouseY * 0.75 + drift;
    const targetZ = CAM_BASE.z + _mouseX * 0.9;
    _camX += (targetX - _camX) * 0.05;
    _camZ += (targetZ - _camZ) * 0.05;

    if (_camera) {
      _camera.position.x = _camX;
      _camera.position.z = _camZ;
      _camera.lookAt(CAM_LOOKAT);
    }

    if (_model) {
      _autoRotY  += 0.00032;
      _mouseRotY += (_mouseX * 0.12 - _mouseRotY) * 0.045;
      _model.rotation.y = _autoRotY + _mouseRotY;
      _model.position.y = Math.sin(t * 0.30) * 0.09;
    }

    if (_cityGroup) {
      _cityGroup.rotation.y = -Math.PI / 7 + t * 0.018;
    }

    if (_renderer && _scene && _camera) {
      _renderer.render(_scene, _camera);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function mount() {
    if (_mounted || !window.THREE) return;
    const ok = _initScene();
    if (!ok) return;
    cancelAnimationFrame(_rafId);
    _loop(performance.now());
    _mounted = true;
  }

  function unmount() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    window.removeEventListener('mousemove', _onMouseMove);
    window.removeEventListener('resize',    _onResize);
    if (_renderer)     { _renderer.dispose();     _renderer = null; }
    if (_canvas)       { _canvas.remove();        _canvas = null; }
    _model = null; _cityGroup = null;
    _scene = null; _camera = null;
    _mounted = false;
    _autoRotY = 0; _mouseRotY = 0;
  }

  return { mount, unmount };
})();

// Expose on window so app.js can call `if (window.Hero3d) Hero3d.mount()`
window.Hero3d = Hero3d;
