/* global THREE, escapeHtml, formatIngredientLabel, showIngredientLabel, INGREDIENT_POSITIONS, INGREDIENT_SCALES, DEFAULT_SCALE, INGREDIENT_ROTATIONS, DEFAULT_ROTATION */
'use strict';

const ASSETS_PATH = '/assets/3d';
const CAMERA_STORAGE_KEY = 'kitchen3d_camera';
const loader = new THREE.GLTFLoader();

let scene, camera, renderer, orbitControls, transformControls;
let ingredientMeshes = [];
let selectedObject = null;
let positionPanel = null;
let animationFrameId = null;
let isXRActive = false;
let xrSession = null;
let kitchenPublicId = null;
let kitchenIngredientLabelEl = null;
let kitchenMoveMode = false;
let kitchenSelectedForMove = null;

function initScene(container) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd4d4d4);

  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 100);

  // Fixed counter-level camera
  camera.position.set(0.1257, 4.2654, -3.5369);

  // XR-compatible context so we can launch into WebXR
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { antialias: true, xrCompatible: true });
  if (!gl) throw new Error('WebGL not available');
  renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap at 2x — mobile perf
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputEncoding = THREE.sRGBEncoding;
  if (renderer.xr) renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  // Lighting
  const hemisphere = new THREE.HemisphereLight(0xfff5e6, 0x8090a0, 0.4);
  scene.add(hemisphere);

  const ambient = new THREE.AmbientLight(0xffeedd, 0.3);
  scene.add(ambient);

  // Key light (main directional)
  const directional = new THREE.DirectionalLight(0xfff8f0, 1.0);
  directional.position.set(3, 6, 2);
  directional.castShadow = true;
  directional.shadow.mapSize.width = 2048;
  directional.shadow.mapSize.height = 2048;
  directional.shadow.camera.near = 0.5;
  directional.shadow.camera.far = 20;
  directional.shadow.camera.left = -6;
  directional.shadow.camera.right = 6;
  directional.shadow.camera.top = 6;
  directional.shadow.camera.bottom = -6;
  directional.shadow.bias = -0.0005;
  directional.shadow.normalBias = 0.02;
  scene.add(directional);

  // Fill light (softer, opposite side)
  const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.4);
  fillLight.position.set(-3, 4, -2);
  scene.add(fillLight);

  // Rim/back light for depth
  const rimLight = new THREE.DirectionalLight(0xfff0dd, 0.3);
  rimLight.position.set(0, 3, -4);
  scene.add(rimLight);

  // Controls
  orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.target.set(0.1169, 3.2055, 0.7738);

  transformControls = new THREE.TransformControls(camera, renderer.domElement);
  transformControls.addEventListener('dragging-changed', (event) => {
    orbitControls.enabled = !event.value;
  });
  // Force uniform scaling — drag X axis, Y and Z follow
  transformControls.addEventListener('objectChange', () => {
    if (transformControls.mode === 'scale' && transformControls.object) {
      var s = transformControls.object.scale;
      s.set(s.x, s.x, s.x);
    }
  });
  scene.add(transformControls);

  // Click to select
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(ingredientMeshes, true);

    if (intersects.length > 0) {
      let target = intersects[0].object;
      while (target.parent && !ingredientMeshes.includes(target)) {
        target = target.parent;
      }
      var name = target.userData.slotName || target.userData.ingredientName;
      var displayName = name ? (typeof formatIngredientLabel === 'function' ? formatIngredientLabel(name) : name.replace(/_/g, ' ')) : '';

      // Always show ingredient name in overlay (label)
      if (kitchenIngredientLabelEl) {
        kitchenIngredientLabelEl.textContent = displayName ? displayName : '';
        kitchenIngredientLabelEl.style.display = displayName ? 'block' : 'none';
      }

      // Open Cloudinary labeled image modal
      if (kitchenPublicId && name && typeof showIngredientLabel === 'function') {
        showIngredientLabel(kitchenPublicId, displayName || name);
      }

      // Remember for Move mode; only show gizmo when Move is on
      kitchenSelectedForMove = target;
      if (kitchenMoveMode) {
        selectedObject = target;
        transformControls.attach(target);
      } else {
        selectedObject = null;
        transformControls.detach();
      }
    } else {
      if (kitchenIngredientLabelEl) kitchenIngredientLabelEl.style.display = 'none';
      deselectObject();
    }
  });

  // Lock camera by default
  orbitControls.enabled = false;

  // Keyboard: toggle transform mode
  window.addEventListener('keydown', (e) => {
    if (!selectedObject) return;
    if (e.key === 'g') transformControls.setMode('translate');
    if (e.key === 'r') transformControls.setMode('rotate');
    if (e.key === 's') transformControls.setMode('scale');
    if (e.key === 'Escape') deselectObject();
  });

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  // Render loop (paused when WebXR is active)
  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (isXRActive) return;
    orbitControls.update();
    updatePositionPanel();
    renderer.render(scene, camera);
  }
  animate();
}

var _panelLastUpdate = 0;
function updatePositionPanel() {
  if (!positionPanel) return;
  // Throttle to ~5 fps to avoid DOM thrash
  var now = performance.now();
  if (now - _panelLastUpdate < 200) return;
  _panelLastUpdate = now;
  var lines = ingredientMeshes.map(function (mesh) {
    var label = mesh.userData.slotName || mesh.userData.ingredientName || '?';
    var p = mesh.position;
    var r = mesh.rotation;
    var s = mesh.scale.x;
    return label + ':  pos(' + p.x.toFixed(4) + ', ' + p.y.toFixed(4) + ', ' + p.z.toFixed(4) + ')' +
      '  rot(' + r.x.toFixed(4) + ', ' + r.y.toFixed(4) + ', ' + r.z.toFixed(4) + ')' +
      '  scale(' + s.toFixed(4) + ')';
  });
  positionPanel.textContent = lines.join('\n');
}

function selectObject(obj) {
  if (selectedObject === obj) return;
  deselectObject();
  selectedObject = obj;
  kitchenSelectedForMove = obj;
  if (kitchenMoveMode) transformControls.attach(obj);
}

function deselectObject() {
  selectedObject = null;
  kitchenSelectedForMove = null;
  transformControls.detach();
}

function onXRSessionEnded() {
  isXRActive = false;
  xrSession = null;
  if (renderer && renderer.setAnimationLoop) renderer.setAnimationLoop(null);
  if (window.CookingGuide) CookingGuide.setXRActive(false);
}

/** iPhone / no-WebXR: fullscreen Three.js view, drag to look around. */
function launchFullscreenView() {
  var container = document.getElementById('kitchen3d-container');
  if (!container || !renderer) return;
  var overlay = document.getElementById('kitchen3d-overlay');
  var backBtn = document.getElementById('btn-kitchen3d-back');
  var doneBtn = document.createElement('button');
  doneBtn.textContent = 'Done';
  doneBtn.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;padding:12px 20px;font-size:16px;background:rgba(0,0,0,0.6);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;cursor:pointer;';

  function exitFullscreen() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    if (doneBtn.parentNode) doneBtn.remove();
    if (overlay) overlay.style.display = '';
    if (backBtn) backBtn.style.display = '';
    orbitControls.enabled = false;
  }

  doneBtn.addEventListener('click', exitFullscreen);
  if (overlay) overlay.style.display = 'none';
  if (backBtn) backBtn.style.display = 'none';
  document.body.appendChild(doneBtn);
  orbitControls.enabled = true;

  if (container.requestFullscreen) {
    container.requestFullscreen().catch(function() {});
  } else if (container.webkitRequestFullscreen) {
    container.webkitRequestFullscreen();
  }

  function onFullscreenChange() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      exitFullscreen();
    }
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
}

async function launchWebXR() {
  if (renderer && navigator.xr) {
    var vrSupported = false;
    var arSupported = false;
    try {
      vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
      arSupported = await navigator.xr.isSessionSupported('immersive-ar');
    } catch (_) {}
    var mode = vrSupported ? 'immersive-vr' : (arSupported ? 'immersive-ar' : null);
    if (mode && renderer.xr) {
      try {
        xrSession = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor'] });
        xrSession.addEventListener('end', onXRSessionEnded);
        await renderer.xr.setSession(xrSession);
        isXRActive = true;
        if (window.CookingGuide) CookingGuide.setXRActive(true);
        renderer.setAnimationLoop(function xrLoop() {
          renderer.render(scene, camera);
        });
        return;
      } catch (err) {
        console.warn('WebXR session failed:', err);
      }
    }
  }
  launchFullscreenView();
}

function loadKitchen() {
  return new Promise((resolve, reject) => {
    loader.load(
      `${ASSETS_PATH}/kitchen2.glb`,
      (gltf) => {
        const kitchen = gltf.scene;
        kitchen.traverse((child) => {
          if (child.isMesh) {
            child.receiveShadow = true;
            child.castShadow = true;
          }
        });
        scene.add(kitchen);

        // Debug: log kitchen bounding box to find counter surface
        const box = new THREE.Box3().setFromObject(kitchen);
        console.log('Kitchen bounding box:', {
          min: { x: box.min.x, y: box.min.y, z: box.min.z },
          max: { x: box.max.x, y: box.max.y, z: box.max.z },
        });
        console.log('Kitchen center:', box.getCenter(new THREE.Vector3()));
        console.log('Kitchen size:', box.getSize(new THREE.Vector3()));

        resolve(kitchen);
      },
      undefined,
      (err) => {
        console.error('Failed to load kitchen:', err);
        reject(err);
      }
    );
  });
}

function loadIngredient(name, position) {
  return new Promise((resolve) => {
    const normalizedName = name.toLowerCase().trim();
    const configKey = normalizedName.replace(/-/g, '_');
    loader.load(
      `${ASSETS_PATH}/${normalizedName}.glb`,
      (gltf) => {
        const model = gltf.scene;
        model.position.copy(position);
        model.scale.setScalar(INGREDIENT_SCALES[configKey] || DEFAULT_SCALE);
        var rot = INGREDIENT_ROTATIONS[configKey] || DEFAULT_ROTATION;
        model.rotation.set(rot.x, rot.y, rot.z);
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
          }
        });
        model.userData.ingredientName = name;
        scene.add(model);
        ingredientMeshes.push(model);
        resolve(model);
      },
      undefined,
      () => {
        // Fallback: colored sphere placeholder
        const geometry = new THREE.SphereGeometry(0.15, 16, 16);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(position);
        sphere.castShadow = true;
        sphere.userData.ingredientName = name;
        scene.add(sphere);
        ingredientMeshes.push(sphere);
        console.warn(`No GLB for "${name}", using placeholder sphere`);
        resolve(sphere);
      }
    );
  });
}

function saveCameraState() {
  const state = {
    pos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: orbitControls.target.x, y: orbitControls.target.y, z: orbitControls.target.z },
  };
  localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(state));
  console.log('Camera position saved');
}

function resetCameraState() {
  localStorage.removeItem(CAMERA_STORAGE_KEY);
  camera.position.set(0, 1.6, 1.8);
  orbitControls.target.set(0, 1.0, 0);
  orbitControls.update();
  console.log('Camera reset to default');
}

async function handleGenerate3d(imageUrl, boundingBoxes, container, publicId) {
  kitchenPublicId = publicId || null;
  kitchenMoveMode = false;
  kitchenSelectedForMove = null;
  // Use overlay for status messages, container for the 3D canvas
  var overlay = document.getElementById('kitchen3d-overlay');
  if (overlay) overlay.innerHTML = '<p style="color:var(--cream);font-size:14px;">Loading 3D scene...</p>';

  try {
    const res = await fetch('/api/generate3d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boundingBoxes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to process ingredients');

    const ingredients = data.ingredients || [];
    if (!ingredients.length) {
      if (overlay) overlay.innerHTML = '<p style="color:#e55;">No ingredients detected.</p>';
      return;
    }

    // Clear previous scene
    container.innerHTML = '';
    ingredientMeshes = [];
    selectedObject = null;

    // Init Three.js scene
    initScene(container);

    // Load kitchen
    await loadKitchen();

    // Place ingredients on counter using named slots from INGREDIENT_POSITIONS
    const typeCounts = {};
    const fallbackSpacing = 0.8;
    const fallbackBaseX = -2.0;
    const fallbackY = 3.1;
    const fallbackZ = 0.5;
    let fallbackIndex = 0;

    await Promise.all(
      ingredients.map((ing) => {
        const name = ing.name.toLowerCase().trim().replace(/-/g, '_');
        typeCounts[name] = (typeCounts[name] || 0) + 1;
        const slotName = name + '_' + typeCounts[name];
        const slot = INGREDIENT_POSITIONS[slotName];

        let pos;
        if (slot) {
          pos = new THREE.Vector3(slot.x, slot.y, slot.z);
        } else {
          pos = new THREE.Vector3(fallbackBaseX + fallbackIndex * fallbackSpacing, fallbackY, fallbackZ);
          fallbackIndex++;
        }

        return loadIngredient(ing.name, pos).then(function (mesh) {
          mesh.userData.slotName = slotName;
        });
      })
    );

    // Reset camera to the original counter-level view before launching guide
    camera.position.set(0.1257, 4.2654, -3.5369);
    orbitControls.target.set(0.1169, 3.2055, 0.7738);
    orbitControls.update();

    // Launch CookingGuide overlay now that all meshes are in the scene
    if (window.CookingGuide) {
      CookingGuide.init(scene, camera, renderer, ingredientMeshes);
    }

    // Update overlay with controls
    if (overlay) {
      overlay.innerHTML = '';
      overlay.style.pointerEvents = 'auto';

      // Status text
      const status = document.createElement('p');
      status.style.cssText = 'color:var(--cream);font-size:13px;margin-bottom:8px;';
      status.innerHTML = '<strong>3D Kitchen</strong> — ' + ingredients.length + ' ingredients';
      overlay.appendChild(status);

      const hint = document.createElement('p');
      hint.style.cssText = 'color:var(--cream);opacity:0.5;font-size:11px;margin-bottom:8px;';
      hint.textContent = 'Click an ingredient to see its name and Cloudinary labeled photo.';
      overlay.appendChild(hint);

      // Ingredient name label (shown when you click an object)
      const labelWrap = document.createElement('div');
      labelWrap.style.cssText = 'margin-bottom:12px;min-height:28px;';
      kitchenIngredientLabelEl = document.createElement('span');
      kitchenIngredientLabelEl.className = 'kitchen3d-ingredient-label';
      kitchenIngredientLabelEl.style.cssText = 'display:none;padding:8px 14px;border-radius:8px;background:rgba(200,129,58,0.25);color:var(--cream);font-size:14px;font-weight:600;border:1px solid rgba(200,129,58,0.5);';
      labelWrap.appendChild(kitchenIngredientLabelEl);
      overlay.appendChild(labelWrap);

      // Button row
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

      // Launch in WebXR — pulsing ring wrapper + smart capability label
      const xrWrap = document.createElement('div');
      xrWrap.className = 'xr-btn-wrap';
      xrWrap.innerHTML = `
        <svg class="xr-pulse-ring" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
          <circle cx="30" cy="30" r="26" fill="none" stroke="#C8813A" stroke-width="2"
            stroke-dasharray="163" stroke-dashoffset="0" opacity="0.6">
            <animate attributeName="stroke-dashoffset" values="163;0;163" dur="2.4s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.6;0.15;0.6" dur="2.4s" repeatCount="indefinite"/>
          </circle>
        </svg>`;
      const xrBtn = document.createElement('button');
      xrBtn.id = 'btn-enter-xr';
      xrBtn.innerHTML = '🥽 Immersive View';
      xrBtn.className = 'kitchen3d-btn kitchen3d-btn--xr';
      xrBtn.addEventListener('click', () => launchWebXR());
      xrWrap.appendChild(xrBtn);
      btnRow.appendChild(xrWrap);

      // Detect WebXR capability and update button label accordingly
      if (navigator.xr) {
        Promise.all([
          navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
          navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
        ]).then(([vr, ar]) => {
          if (vr)      xrBtn.innerHTML = '🥽 Enter VR (WebXR)';
          else if (ar) xrBtn.innerHTML = '🥽 Enter AR (WebXR)';
          else         xrBtn.innerHTML = '🥽 Immersive Fullscreen';
        });
      } else {
        xrBtn.innerHTML = '🥽 Immersive Fullscreen';
      }

      // Unlock Camera
      const camBtn = document.createElement('button');
      camBtn.textContent = 'Unlock Camera';
      camBtn.className = 'kitchen3d-btn';
      camBtn.addEventListener('click', () => {
        orbitControls.enabled = !orbitControls.enabled;
        camBtn.textContent = orbitControls.enabled ? 'Lock Camera' : 'Unlock Camera';
      });
      btnRow.appendChild(camBtn);

      // Move mode (enables transform gizmo; click ingredient first to select)
      const moveBtn = document.createElement('button');
      moveBtn.textContent = 'Move';
      moveBtn.className = 'kitchen3d-btn';
      moveBtn.addEventListener('click', () => {
        kitchenMoveMode = !kitchenMoveMode;
        moveBtn.classList.toggle('kitchen3d-btn--active', kitchenMoveMode);
        if (kitchenMoveMode && kitchenSelectedForMove) {
          transformControls.attach(kitchenSelectedForMove);
          selectedObject = kitchenSelectedForMove;
        } else if (!kitchenMoveMode) {
          transformControls.detach();
          selectedObject = null;
          kitchenSelectedForMove = null;
        }
        if (kitchenMoveMode) {
          transformControls.setMode('translate');
          rotBtn.classList.remove('kitchen3d-btn--active');
          scaleBtn.classList.remove('kitchen3d-btn--active');
        }
      });
      btnRow.appendChild(moveBtn);

      // Rotate mode
      const rotBtn = document.createElement('button');
      rotBtn.textContent = 'Rotate';
      rotBtn.className = 'kitchen3d-btn';
      rotBtn.addEventListener('click', () => {
        kitchenMoveMode = true;
        moveBtn.classList.add('kitchen3d-btn--active');
        rotBtn.classList.add('kitchen3d-btn--active');
        scaleBtn.classList.remove('kitchen3d-btn--active');
        if (kitchenSelectedForMove) {
          transformControls.attach(kitchenSelectedForMove);
          selectedObject = kitchenSelectedForMove;
        }
        transformControls.setMode('rotate');
      });
      btnRow.appendChild(rotBtn);

      // Scale mode
      const scaleBtn = document.createElement('button');
      scaleBtn.textContent = 'Scale';
      scaleBtn.className = 'kitchen3d-btn';
      scaleBtn.addEventListener('click', () => {
        kitchenMoveMode = true;
        moveBtn.classList.add('kitchen3d-btn--active');
        scaleBtn.classList.add('kitchen3d-btn--active');
        rotBtn.classList.remove('kitchen3d-btn--active');
        if (kitchenSelectedForMove) {
          transformControls.attach(kitchenSelectedForMove);
          selectedObject = kitchenSelectedForMove;
        }
        transformControls.setMode('scale');
      });
      btnRow.appendChild(scaleBtn);

      overlay.appendChild(btnRow);

      // Live position panel
      positionPanel = document.createElement('pre');
      positionPanel.style.cssText =
        'margin-top:12px;padding:8px 10px;background:rgba(0,0,0,0.55);color:#0f0;' +
        'font-family:monospace;font-size:11px;border-radius:6px;max-height:160px;' +
        'overflow-y:auto;white-space:pre;line-height:1.5;';
      overlay.appendChild(positionPanel);
      updatePositionPanel();
    }

    // Enable orbit + set default transform mode
    orbitControls.enabled = false;
    transformControls.setMode('translate');
  } catch (err) {
    if (overlay) overlay.innerHTML = '<p style="color:#e55;">' + escapeHtml(err.message) + '</p>';
  }
}

function addGenerate3dButton(imageUrl, boundingBoxes) {
  if (!boundingBoxes?.length) return;

  const container = document.getElementById('result');

  const section = document.createElement('div');
  section.className = 'analysis analysis--stacked';
  section.id = 'generate3d-section';

  const btn = document.createElement('button');
  btn.textContent = 'View in 3D Kitchen (' + boundingBoxes.length + ' ingredients)';
  btn.className = 'btn-3d';
  btn.addEventListener('click', () => handleGenerate3d(imageUrl, boundingBoxes, section));

  section.appendChild(btn);
  container.appendChild(section);
}

// ── Demo kitchen — Three Sisters preset, no upload required ──────────────────
// Mirrors the DEMO_PRESETS.threesisters in backend/routes/upload.js.
// Ingredients must have matching GLB files in /assets/3d/.
const DEMO_PRESET_INGREDIENTS = [
  { name: 'butternut-squash', confidence: 1 },
  { name: 'canned-beans',     confidence: 1 },
  { name: 'canned-corn',      confidence: 1 },
  { name: 'chicken-stock',    confidence: 1 },
  { name: 'onion',            confidence: 1 },
  { name: 'garlic',           confidence: 1 },
];

function launchDemoKitchen(container) {
  // Wait for the kitchen3d screen to finish layout before measuring container size
  function tryLaunch() {
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      handleGenerate3d('', DEMO_PRESET_INGREDIENTS, container);
    } else {
      setTimeout(tryLaunch, 50);
    }
  }
  tryLaunch();
}

// Expose to global scope for upload.js and app.js
window.addGenerate3dButton = addGenerate3dButton;
window.handleGenerate3d   = handleGenerate3d;
window.launchDemoKitchen  = launchDemoKitchen;
