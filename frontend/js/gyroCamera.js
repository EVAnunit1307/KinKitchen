/* gyroCamera.js — Mouse/Gyroscope parallax camera driver
 * 
 * Exposes:
 *   GyroCamera.attach(threeCamera, options)
 *   GyroCamera.detach()
 *
 * Options:
 *   strength   {number} — parallax intensity (default 0.06)
 *   smoothing  {number} — lerp factor per frame (default 0.055)
 *   basePos    {{x,y,z}} — camera rest position
 *   lookAt     {{x,y,z}} — camera look-at target (default {0,0,0})
 */
'use strict';

const GyroCamera = (() => {
  let _camera      = null;
  let _basePos     = null;
  let _lookAt      = null;
  let _strength    = 0.06;
  let _smoothing   = 0.055;
  let _currentX    = 0;
  let _currentY    = 0;
  let _targetX     = 0;
  let _targetY     = 0;
  let _gyroEnabled = false;
  let _rafId       = null;

  // ── Mouse driver ─────────────────────────────────────────────────────────
  function _onMouseMove(e) {
    _targetX = ((e.clientX / window.innerWidth)  - 0.5) * 2;
    _targetY = ((e.clientY / window.innerHeight) - 0.5) * 2;
  }

  // ── Gyroscope driver ─────────────────────────────────────────────────────
  function _onDeviceOrientation(e) {
    if (!e.gamma || !e.beta) return;
    // gamma: left-right tilt (-90..90), beta: front-back tilt (-180..180)
    _targetX =  Math.max(-1, Math.min(1, e.gamma / 30));
    _targetY =  Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  }

  function _requestGyroPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+ requires permission
      DeviceOrientationEvent.requestPermission()
        .then(state => {
          if (state === 'granted') {
            window.addEventListener('deviceorientation', _onDeviceOrientation, { passive: true });
            _gyroEnabled = true;
          }
        })
        .catch(() => {});
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      window.addEventListener('deviceorientation', _onDeviceOrientation, { passive: true });
      _gyroEnabled = true;
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  function _loop() {
    _rafId = requestAnimationFrame(_loop);
    if (!_camera || !_basePos) return;

    // Smooth toward target
    _currentX += (_targetX - _currentX) * _smoothing;
    _currentY += (_targetY - _currentY) * _smoothing;

    _camera.position.x = _basePos.x + _currentX * _strength;
    _camera.position.y = _basePos.y - _currentY * _strength * 0.5;
    _camera.position.z = _basePos.z;

    if (_lookAt) {
      _camera.lookAt(_lookAt.x || 0, _lookAt.y || 0, _lookAt.z || 0);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function attach(camera, opts = {}) {
    detach();
    _camera   = camera;
    _strength  = opts.strength  ?? 0.06;
    _smoothing = opts.smoothing ?? 0.055;
    _basePos   = opts.basePos  ? { ...opts.basePos  } : { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    _lookAt    = opts.lookAt   ? { ...opts.lookAt   } : { x: 0, y: 0, z: 0 };
    _currentX  = 0; _currentY = 0;
    _targetX   = 0; _targetY  = 0;

    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) {
      _requestGyroPermission();
    } else {
      window.addEventListener('mousemove', _onMouseMove, { passive: true });
    }
    _loop();
  }

  function detach() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    window.removeEventListener('mousemove', _onMouseMove);
    if (_gyroEnabled) {
      window.removeEventListener('deviceorientation', _onDeviceOrientation);
      _gyroEnabled = false;
    }
    _camera = null; _basePos = null;
  }

  /** Called on first user interaction on iOS to request gyro permission */
  function requestGyroOnTap() {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile && !_gyroEnabled) _requestGyroPermission();
  }

  return { attach, detach, requestGyroOnTap };
})();
