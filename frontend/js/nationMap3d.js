/* nationMap3d.js — Interactive 3D Canada map for nation selection
 *
 * Renders a stylized top-down view of Canada silhouette with
 * glowing territory zones for each nation. Hover → pulse gold.
 * Click → select nation and call back into AkiApp.
 *
 * Public API:
 *   NationMap3d.mount(containerEl, onSelectCallback)
 *   NationMap3d.unmount()
 */
/* global THREE */
'use strict';

const NationMap3d = (() => {
  let _renderer = null;
  let _scene    = null;
  let _camera   = null;
  let _rafId    = null;
  let _canvas   = null;
  let _raycaster = null;
  let _mouse     = new (window.THREE ? THREE.Vector2 : class { constructor() { this.x=0; this.y=0; } })();
  let _hoveredZone = null;
  let _zones       = [];  // { mesh, ringMesh, labelSprite, nation, glowMat }
  let _onSelect    = null;
  let _mounted     = false;

  // ── Nation territories (2D XZ positions on map, roughly proportional) ─────
  const NATIONS = [
    {
      id: 'Anishinaabe',
      label: 'Anishinaabe',
      region: 'Great Lakes',
      pos: { x: 1.2, z: 0.3 },
      color: 0xC8813A,
      radius: 0.42,
    },
    {
      id: 'Haudenosaunee',
      label: 'Haudenosaunee',
      region: 'Northeast',
      pos: { x: 1.8, z: 0.9 },
      color: 0xA06228,
      radius: 0.35,
    },
    {
      id: 'Cree',
      label: 'Cree',
      region: 'Northern Canada',
      pos: { x: 0.2, z: -1.1 },
      color: 0x4A8C5C,
      radius: 0.55,
    },
    {
      id: 'Métis',
      label: 'Métis',
      region: 'Prairies',
      pos: { x: -0.9, z: 0.1 },
      color: 0xD4884A,
      radius: 0.48,
    },
    {
      id: 'Coast Salish',
      label: 'Coast Salish',
      region: 'Pacific Northwest',
      pos: { x: -2.1, z: 0.5 },
      color: 0x5A8CB8,
      radius: 0.40,
    },
    {
      id: 'Other',
      label: 'All Nations',
      region: 'All territories',
      pos: { x: 0.2, z: 1.6 },
      color: 0x7A6A5A,
      radius: 0.32,
    },
  ];

  // ── Text sprite factory ───────────────────────────────────────────────────
  function _makeTextSprite(name, sub, color) {
    const canvas  = document.createElement('canvas');
    canvas.width  = 320;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');

    // Background pill
    ctx.fillStyle = 'rgba(20,12,4,0.78)';
    _roundRect(ctx, 4, 4, 312, 92, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = `#${color.toString(16).padStart(6,'0')}`;
    ctx.lineWidth = 2.5;
    _roundRect(ctx, 4, 4, 312, 92, 12);
    ctx.stroke();

    // Nation name
    ctx.fillStyle = '#F5ECD7';
    ctx.font = 'bold 32px "Playfair Display", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, 160, 42);

    // Region sub-label
    ctx.fillStyle = `#${color.toString(16).padStart(6,'0')}`;
    ctx.font = '18px "DM Sans", system-ui, sans-serif';
    ctx.fillText(sub, 160, 70);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 0.38, 1);
    return sprite;
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Build Zone ───────────────────────────────────────────────────────────
  function _buildZone(nation, scene) {
    const { pos, color, radius } = nation;

    // Ground glow disc
    const discGeo = new THREE.CircleGeometry(radius, 48);
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const disc = new THREE.Mesh(discGeo, glowMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(pos.x, 0.01, pos.z);
    scene.add(disc);

    // Outer ring
    const ringGeo = new THREE.RingGeometry(radius * 0.82, radius, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.02, pos.z);
    scene.add(ring);

    // Tall invisible hit-target cylinder for raycasting
    const hitGeo = new THREE.CylinderGeometry(radius, radius, 0.6, 24);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.set(pos.x, 0.3, pos.z);
    hitMesh.userData.nationId = nation.id;
    scene.add(hitMesh);

    // Label sprite floating above
    const sprite = _makeTextSprite(nation.label, nation.region, color);
    sprite.position.set(pos.x, 0.68, pos.z);
    scene.add(sprite);

    return { mesh: hitMesh, disc, ring, glowMat, ringMat, sprite, nation, baseOpacity: 0.22 };
  }

  // ── Scene setup ───────────────────────────────────────────────────────────
  function _initScene(containerEl) {
    const w = containerEl.clientWidth  || window.innerWidth;
    const h = containerEl.clientHeight || window.innerHeight;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;';
    containerEl.appendChild(canvas);
    _canvas = canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    _renderer = renderer;

    const scene = new THREE.Scene();
    _scene = scene;

    // Subtle flat ground plane (Canada-ish dark color)
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x0D1810, transparent: true, opacity: 0.72 });
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = 0;
    scene.add(groundMesh);

    // Ambient light
    scene.add(new THREE.AmbientLight(0xFFFFFF, 1.0));

    // Camera — top-down isometric-ish angle
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 50);
    camera.position.set(0, 4.2, 2.8);
    camera.lookAt(0, 0, 0.4);
    _camera = camera;

    // Build zones
    NATIONS.forEach(n => {
      const zone = _buildZone(n, scene);
      _zones.push(zone);
    });

    _raycaster = new THREE.Raycaster();

    // Events
    canvas.addEventListener('mousemove', _onPointerMove, { passive: true });
    canvas.addEventListener('click',     _onClick);
    canvas.addEventListener('touchstart', _onTouchStart, { passive: true });

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

  function _getPointerNDC(e) {
    const rect = _canvas.getBoundingClientRect();
    return {
      x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      y: -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    };
  }

  function _onPointerMove(e) {
    const ndc = _getPointerNDC(e);
    _mouse.set(ndc.x, ndc.y);
    _updateHover();
  }

  function _onTouchStart(e) {
    if (!e.touches[0]) return;
    const rect = _canvas.getBoundingClientRect();
    _mouse.x =  ((e.touches[0].clientX - rect.left) / rect.width)  * 2 - 1;
    _mouse.y = -((e.touches[0].clientY - rect.top)  / rect.height) * 2 + 1;
    _updateHover();
    // treat tap as click
    setTimeout(() => {
      if (_hoveredZone) _selectZone(_hoveredZone);
    }, 80);
  }

  function _updateHover() {
    if (!_raycaster || !_camera) return;
    _raycaster.setFromCamera(_mouse, _camera);
    const hits   = _raycaster.intersectObjects(_zones.map(z => z.mesh));
    const zone   = hits.length ? _zones.find(z => z.mesh === hits[0].object) : null;

    if (zone !== _hoveredZone) {
      if (_hoveredZone) _setZoneHighlight(_hoveredZone, false);
      _hoveredZone = zone;
      if (_hoveredZone) _setZoneHighlight(_hoveredZone, true);
      _canvas.style.cursor = zone ? 'pointer' : 'default';
    }
  }

  function _setZoneHighlight(zone, on) {
    zone.glowMat.opacity = on ? 0.52 : 0.22;
    zone.ringMat.opacity = on ? 0.92 : 0.55;
    zone.sprite.material.opacity = on ? 1.0 : 0.78;
  }

  function _onClick() {
    if (_hoveredZone) _selectZone(_hoveredZone);
  }

  function _selectZone(zone) {
    // Flash all zones dim, selected zone bright then callback
    _zones.forEach(z => {
      z.glowMat.opacity = z === zone ? 0.85 : 0.08;
      z.ringMat.opacity = z === zone ? 1.0  : 0.20;
    });
    setTimeout(() => {
      if (_onSelect) _onSelect(zone.nation.id);
    }, 300);
  }

  // ── Animation loop ────────────────────────────────────────────────────────
  function _loop(now) {
    _rafId = requestAnimationFrame(_loop);
    const t = now / 1000;

    // Pulse all zone rings
    _zones.forEach((z, i) => {
      if (z === _hoveredZone) return;
      const pulse = 0.22 + 0.06 * Math.sin(t * 1.4 + i * 1.1);
      z.glowMat.opacity = pulse;
    });

    // Gentle camera drift
    if (_camera) {
      _camera.position.x = Math.sin(t * 0.12) * 0.25;
      _camera.lookAt(Math.sin(t * 0.12) * 0.1, 0, 0.4);
    }

    if (_renderer && _scene && _camera) {
      _renderer.render(_scene, _camera);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────
  function mount(containerEl, onSelectCallback) {
    if (_mounted || !window.THREE) return;
    _onSelect = onSelectCallback;
    _zones = [];
    const ok = _initScene(containerEl);
    if (!ok) return;
    _loop(performance.now());
    _mounted = true;
  }

  function unmount() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_canvas) {
      _canvas.removeEventListener('mousemove', _onPointerMove);
      _canvas.removeEventListener('click', _onClick);
      _canvas.removeEventListener('touchstart', _onTouchStart);
      _canvas.remove();
      _canvas = null;
    }
    window.removeEventListener('resize', _onResize);
    if (_renderer) { _renderer.dispose(); _renderer = null; }
    _zones = []; _hoveredZone = null;
    _scene = null; _camera = null;
    _mounted = false;
  }

  return { mount, unmount };
})();
