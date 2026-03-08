/* heroFoodCard.js — Floating 3D game-card on the hero splash
 *
 * Creates a tilt-on-hover card positioned on the right side of the hero.
 * A Three.js canvas inside renders a rotating food GLB (cycles on click).
 *
 * Public API:
 *   HeroFoodCard.mount()
 *   HeroFoodCard.unmount()
 */
/* global THREE */
'use strict';

const HeroFoodCard = (() => {
  let _card      = null;
  let _canvas    = null;
  let _renderer  = null;
  let _scene     = null;
  let _camera    = null;
  let _foodModel = null;
  let _rafId     = null;
  let _mounted   = false;
  let _rotY      = 0;

  const FOODS = [
    { path: '/assets/3d/tomato.glb',           name: 'Ode·imini',       en: 'Tomato' },
    { path: '/assets/3d/garlic.glb',           name: 'Zhiiwitaaganens', en: 'Garlic' },
    { path: '/assets/3d/onion.glb',            name: 'Zhigaagawanzh',   en: 'Onion' },
    { path: '/assets/3d/cabbage.glb',          name: 'Mashkikiins',     en: 'Cabbage' },
    { path: '/assets/3d/butternut-squash.glb', name: 'Okosimaan',       en: 'Butternut Squash' },
    { path: '/assets/3d/canned-corn.glb',      name: 'Mandaamin',       en: 'Corn' },
  ];

  let _idx = 0;

  // ── Build card DOM ─────────────────────────────────────────────────────────
  function _buildCard(splash) {
    const card = document.createElement('div');
    card.id = 'hero-food-card';
    card.innerHTML = `
      <div class="hfc-border">
        <div class="hfc-inner">
          <div class="hfc-glow"></div>
          <canvas id="hfc-canvas"></canvas>
          <div class="hfc-badge">Scan to discover</div>
          <div class="hfc-body">
            <p class="hfc-ojibwe" id="hfc-ojibwe">${FOODS[_idx].name}</p>
            <h3 class="hfc-en" id="hfc-en">${FOODS[_idx].en}</h3>
          </div>
          <button class="hfc-btn" id="hfc-next">Next ingredient →</button>
        </div>
      </div>
    `;
    splash.appendChild(card);
    _card = card;

    // 3D tilt on mouse move
    const border = card.querySelector('.hfc-border');
    card.addEventListener('mousemove', (e) => {
      const r    = card.getBoundingClientRect();
      const xPct = (e.clientX - r.left) / r.width  - 0.5;
      const yPct = (e.clientY - r.top)  / r.height - 0.5;
      border.style.setProperty('--rx', `${(-yPct * 16).toFixed(2)}deg`);
      border.style.setProperty('--ry', `${( xPct * 16).toFixed(2)}deg`);
    });
    card.addEventListener('mouseleave', () => {
      border.style.setProperty('--rx', '0deg');
      border.style.setProperty('--ry', '0deg');
    });

    // Cycle food on button click
    document.getElementById('hfc-next').addEventListener('click', () => {
      _idx = (_idx + 1) % FOODS.length;
      document.getElementById('hfc-ojibwe').textContent = FOODS[_idx].name;
      document.getElementById('hfc-en').textContent     = FOODS[_idx].en;
      _loadFood(FOODS[_idx].path);
    });
  }

  // ── Three.js setup ─────────────────────────────────────────────────────────
  function _initThree() {
    _canvas = document.getElementById('hfc-canvas');
    if (!_canvas || !window.THREE) return;

    const W = 220, H = 220;
    _renderer = new THREE.WebGLRenderer({ canvas: _canvas, alpha: true, antialias: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    _renderer.setSize(W, H, false);
    _renderer.setClearColor(0x000000, 0);
    _renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    _renderer.toneMappingExposure = 1.1;

    _scene  = new THREE.Scene();
    _camera = new THREE.PerspectiveCamera(38, W / H, 0.01, 100);
    _camera.position.set(0, 0.5, 3.2);

    _scene.add(new THREE.AmbientLight(0xFFE8C0, 1.2));
    const key = new THREE.DirectionalLight(0xFFD080, 2.8);
    key.position.set(3, 5, 4);
    _scene.add(key);
    const fill = new THREE.DirectionalLight(0x9AB5D0, 0.8);
    fill.position.set(-4, 2, -3);
    _scene.add(fill);
    const rim = new THREE.PointLight(0xC8813A, 1.2, 10);
    rim.position.set(0, 3, -2);
    _scene.add(rim);

    _loadFood(FOODS[_idx].path);
  }

  // ── Load a food GLB ────────────────────────────────────────────────────────
  function _loadFood(path) {
    const Loader = (window.THREE && window.THREE.GLTFLoader) || window.GLTFLoader;
    if (!Loader || !_scene) return;

    // Remove old model
    if (_foodModel) { _scene.remove(_foodModel); _foodModel = null; }

    new Loader().load(
      path,
      (gltf) => {
        const group = gltf.scene;

        // Fit to unit sphere
        const box    = new THREE.Box3().setFromObject(group);
        const size   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        group.scale.setScalar(1.5 / maxDim);

        // Centre
        box.setFromObject(group);
        const centre = box.getCenter(new THREE.Vector3());
        group.position.sub(centre);

        _scene.add(group);
        _foodModel = group;
        _rotY = 0;
      },
      undefined,
      (err) => console.warn('[HeroFoodCard] Failed:', path, err)
    );
  }

  // ── Render loop ────────────────────────────────────────────────────────────
  function _loop(now) {
    _rafId = requestAnimationFrame(_loop);
    if (_foodModel) {
      _rotY += 0.008;
      _foodModel.rotation.y = _rotY;
      _foodModel.rotation.x = Math.sin(now * 0.0004) * 0.18;
    }
    if (_renderer && _scene && _camera) _renderer.render(_scene, _camera);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function mount() {
    if (_mounted) return;
    const splash = document.querySelector('.screen-splash');
    if (!splash || !window.THREE) return;

    _buildCard(splash);
    _initThree();
    _loop(performance.now());
    _mounted = true;
  }

  function unmount() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_renderer) { _renderer.dispose(); _renderer = null; }
    if (_card)     { _card.remove(); _card = null; }
    _foodModel = null; _scene = null; _camera = null; _canvas = null;
    _mounted = false;
  }

  return { mount, unmount };
})();

window.HeroFoodCard = HeroFoodCard;
