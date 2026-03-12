/* global THREE, Step1Chop, Step2Chop, Step3Garlic, Step4Stock, Step5Boil, Step6Veggies, Step7BeansCorn, Step8Stir, INGREDIENT_POSITIONS, INGREDIENT_SCALES, INGREDIENT_ROTATIONS, DEFAULT_ROTATION */
'use strict';

/**
 * CookingGuide — Immersive step-by-step 3D cooking overlay
 *
 * Per-step 3D animations: knife chop / spoon stir / steam / sparkle / drip / salt
 * Chop steps move the active ingredient to a cutting board then back.
 *
 *   CookingGuide.init(scene, camera, renderer, ingredientMeshes)
 *   .goToStep(n) .next() .prev() .reset() .destroy() .setXRActive(bool)
 */
const CookingGuide = (() => {
  'use strict';

  // ── State ────────────────────��────────────────────────────────────────────
  let _scene, _camera, _renderer, _meshes;
  let _currentStep  = 0;
  let _animId       = null;
  let _overlayEl    = null;
  let _activeLights = [];
  let _autoAdvanceTimer = null;
  let _countdownStart   = null;
  let _audioCtx     = null;
  let _stepAudio    = null;  // ElevenLabs TTS for current step
  let _lastFrame    = 0;
  let _initialized  = false;
  let _isXR         = false;

  // 3D scene objects
  let _cuttingBoard = null;
  let _orangePile   = null;
  let _dicedOnionsMesh = null;
  let _mincedGarlicMesh = null;
  let _potMesh = null;
  let _stewMesh = null;
  let _knifeGroup   = null;
  let _spoonGroup   = null;
  let _spotGlow     = null;
  let _particles    = [];
  let _animType     = 'none';
  let _animT        = 0;
  let _stirAngle    = 0;
  let _chopWaiting  = false;  // true = waiting for user to click Start Cutting
  let _nextReady    = false;  // true = animation complete, next button unlocked
  let _startBtnFn   = null;  // function to call when Start button is clicked

  // Completion scene
  let _soupMesh        = null;
  let _smokePoints     = null;
  let _smokePosAttr    = null;
  let _smokeVelocities = null;
  const _SMOKE_COUNT   = 70;

  // Ingredient lerp system (move to board / return)
  let _activeLerps   = [];   // [{ mesh, from, to, t, duration }]
  let _origPositions = {};   // { slotName: {x,y,z} }

  // Cutting board world-space defaults
  const BOARD_CENTER = { x: 0.0685, z: -0.2397 };
  const BOARD_Y      = 3.0243;
  const BOARD_ROT    = { x: -0.3714, y: 1.1136, z: 3.1083 };
  const BOARD_SCALE  = 0.0035;

  // Where the squash lands on the board for chopping
  const CHOP_TARGET  = { x: 0.0690, y: 3.0300, z: -0.50 };

  // Orange pile of cubes (replaces scattered cubes after chopping)
  // Read from ingredientPositions.js so they can be tweaked via the Move gizmo
  const _pileSlot = 'orange_pile_cubes_1';
  const _pileKey  = 'orange_pile_cubes';
  const PILE_POS   = INGREDIENT_POSITIONS[_pileSlot] || { x: 0.0685, y: 3.1045, z: -0.3929 };
  const PILE_ROT   = INGREDIENT_ROTATIONS[_pileKey]  || DEFAULT_ROTATION;
  const PILE_SCALE = INGREDIENT_SCALES[_pileKey]      || 0.2956;

  // Diced onions pile
  const _dicedOnionsSlot = 'diced_onions_1';
  const _dicedOnionsKey  = 'diced_onions';
  const DICED_ONIONS_POS   = INGREDIENT_POSITIONS[_dicedOnionsSlot] || { x: 0.5, y: 3.1, z: -0.3 };
  const DICED_ONIONS_ROT   = INGREDIENT_ROTATIONS[_dicedOnionsKey]  || DEFAULT_ROTATION;
  const DICED_ONIONS_SCALE = INGREDIENT_SCALES[_dicedOnionsKey]      || 0.3;

  // Minced garlic pile
  const _mincedGarlicSlot = 'minced_garlic_1';
  const _mincedGarlicKey  = 'minced_garlic';
  const MINCED_GARLIC_POS   = INGREDIENT_POSITIONS[_mincedGarlicSlot] || { x: 0.9, y: 3.1, z: -0.3 };
  const MINCED_GARLIC_ROT   = INGREDIENT_ROTATIONS[_mincedGarlicKey]  || DEFAULT_ROTATION;
  const MINCED_GARLIC_SCALE = INGREDIENT_SCALES[_mincedGarlicKey]      || 0.3;

  // Pot
  const _potSlot = 'pot_1';
  const _potKey  = 'pot';
  const POT_POS   = INGREDIENT_POSITIONS[_potSlot] || { x: 0.5, y: 3.0, z: 0.2 };
  const POT_ROT   = INGREDIENT_ROTATIONS[_potKey]  || DEFAULT_ROTATION;
  const POT_SCALE = INGREDIENT_SCALES[_potKey]      || 0.3;

  // Stew (final reveal, step 8)
  const STEW_POS   = { x: 0.1341, y: 3.1786, z: -0.4954 };
  const STEW_ROT   = { x: 0.0080, y: 0.9917, z: -0.0067 };
  const STEW_SCALE = 0.4138;

  // ── Ingredient emoji map ──────────────────────────────────────────────────
  const ING_EMOJI = {
    butternut_squash_1: '🎃',
    onion_1:            '🧅',
    garlic_1:           '🧄',
    canned_beans_1:     '🫘',
    canned_corn_1:      '🌽',
    chicken_stock_1:    '🍲',
    potato_1:           '🥔',
    tomato_1:           '🍅',
    tomato_2:           '🍅',
    tomato_3:           '🍅',
    rice_1:             '🍚',
  };

  // ── Recipe catalogue ──────────────────────────────────────────────────────
  const RECIPES = {
    'squash-stew': {
      name: 'Three Sisters Stew',
      subtitle: 'Baaniibaanesi-Naboob',
      steps: [
        {
          id: 1, phase: 'Preparation', icon: '🔪', action: 'CHOP', heroColor: '#5C2A0E', animType: 'chop',
          title: 'Cube the squash',
          body: 'Peel the butternut squash, halve lengthwise, scoop out the seeds, and cut into 1-inch cubes. Uniform size = even cooking.',
          tip: 'Use the heel of your knife, knuckles curled — the blade guides against them.',
          activeIngredients: ['butternut_squash_1'], duration: null,
        },
        {
          id: 2, phase: 'Preparation', icon: '🔪', action: 'DICE', heroColor: '#5C2A0E', animType: 'chop',
          title: 'Dice the onion',
          body: 'Halve through the root end, peel, make parallel cuts lengthwise then crosswise. The root holds everything together while you work.',
          tip: 'Refrigerate the onion 15 min before cutting — reduces the tear-inducing vapour.',
          activeIngredients: ['onion_1'], duration: null,
        },
        {
          id: 3, phase: 'Preparation', icon: '🔪', action: 'MINCE', heroColor: '#5C2A0E', animType: 'chop',
          title: 'Smash and mince the garlic',
          body: 'Press the flat of your knife over each clove and smash with your palm. Peel, then rock-chop into a fine mince. 4–5 cloves.',
          tip: 'Smashing splits the skin instantly. Smaller mince = more flavour unlocked.',
          activeIngredients: ['garlic_1'], duration: null,
        },
        {
          id: 4, phase: 'Preparation', icon: '🍲', action: 'POUR_STOCK', heroColor: '#1E3D60', animType: 'pour',
          title: 'Pour chicken stock into the pot',
          body: 'Open the chicken stock and pour 6 cups into the large pot. This forms the base of your stew.',
          tip: 'Room-temperature stock heats faster than cold from the fridge.',
          activeIngredients: ['chicken_stock_1'], duration: null,
        },
        {
          id: 5, phase: 'Preparation', icon: '🌡️', action: 'BOIL', heroColor: '#5A2800', animType: 'boil',
          title: 'Bring stock to a boil',
          body: 'Place the pot on the stove and crank the heat to high. Wait for a rolling boil — big bubbles breaking the surface.',
          tip: 'A rolling boil is when bubbles break the surface continuously, not just at the edges.',
          activeIngredients: ['chicken_stock_1'], duration: null,
        },
        {
          id: 6, phase: 'Cooking', icon: '🥘', action: 'ADD_VEGGIES', heroColor: '#5A2800', animType: 'add_veggies',
          title: 'Drop the veggies into the pot',
          body: 'Add the cubed squash, diced onion, and minced garlic into the boiling stock. They\'ll cook down into a rich, hearty stew base.',
          tip: 'Add the squash first — it takes the longest to soften.',
          activeIngredients: ['butternut_squash_1', 'onion_1', 'garlic_1'], duration: null,
        },
        {
          id: 7, phase: 'Cooking', icon: '🥘', action: 'ADD_BEANS_CORN', heroColor: '#5A2800', animType: 'add_beans_corn',
          title: 'Add beans and corn to the pot',
          body: 'Pour the drained beans and corn into the boiling stock. They\'ll simmer alongside the veggies and soak up all that flavour.',
          tip: 'Add beans first — they\'re denser and need a bit more time to heat through.',
          activeIngredients: ['canned_beans_1', 'canned_corn_1'], duration: null,
        },
        {
          id: 8, phase: 'Finishing', icon: '🥄', action: 'STIR', heroColor: '#1A0E04', animType: 'stir_finish',
          title: 'Stir and let the stew come together',
          body: 'Give everything a good stir to combine. The stew will thicken as the squash breaks down — your Three Sisters Stew is ready.',
          tip: 'Taste and adjust seasoning. A squeeze of lime at the end brightens all the flavours.',
          activeIngredients: [], duration: null,
        },
      ],
    },

    'potato-onion-fry': {
      name: 'Potato & Onion Fry',
      subtitle: '',
      steps: [
        {
          id: 1, phase: 'Preparation', icon: '🔪', action: 'CHOP', heroColor: '#5C2A0E', animType: 'chop',
          title: 'Cube the potato',
          body: 'Peel the potato and cut into small cubes, about half an inch. Smaller pieces fry faster and get crispier edges.',
          tip: 'Pat the cubes dry with a cloth — less moisture means better browning.',
          activeIngredients: ['potato_1'], duration: null,
        },
        {
          id: 2, phase: 'Preparation', icon: '🔪', action: 'DICE', heroColor: '#5C2A0E', animType: 'chop',
          title: 'Slice the onion',
          body: 'Halve the onion and slice into thin half-moons. They\'ll soften and sweeten as they fry alongside the potato.',
          tip: 'Thin slices cook faster — try to keep them even.',
          activeIngredients: ['onion_1'], duration: null,
        },
        {
          id: 3, phase: 'Cooking', icon: '🔥', action: 'HEAT', heroColor: '#5A2800', animType: 'pof_step',
          title: 'Heat oil in the pan',
          body: 'Add a good glug of oil to the pan and heat on medium-high until shimmering. The oil needs to be hot before anything goes in.',
          tip: 'Drop a small piece of onion in — if it sizzles right away, the oil is ready.',
          activeIngredients: [], duration: null,
        },
        {
          id: 4, phase: 'Cooking', icon: '🥘', action: 'DROP_POTATO', heroColor: '#5A2800', animType: 'pof_step',
          title: 'Add potato to the pan',
          body: 'Spread the potato cubes in a single layer. Leave them alone for 3–4 minutes so they develop a golden crust before stirring.',
          tip: 'Resist the urge to stir too early — that crust is the best part.',
          activeIngredients: ['potato_1'], duration: null,
        },
        {
          id: 5, phase: 'Cooking', icon: '🥘', action: 'DROP_ONION', heroColor: '#5A2800', animType: 'pof_step',
          title: 'Add onion and season',
          body: 'Add the sliced onion, salt, pepper, and any spices you like. Stir everything together and fry for another 5–6 minutes.',
          tip: 'A pinch of smoked paprika or cumin takes this to another level.',
          activeIngredients: ['onion_1'], duration: null,
        },
        {
          id: 6, phase: 'Finishing', icon: '🥄', action: 'STIR', heroColor: '#1A0E04', animType: 'stir',
          title: 'Stir and finish',
          body: 'Keep stirring until the potato is cooked through and golden, and the onion is soft and caramelised. Serve hot.',
          tip: 'Taste before serving and adjust seasoning — potatoes need plenty of salt.',
          activeIngredients: [], duration: null,
        },
      ],
    },

    'rice-and-beans': {
      name: 'Rice & Beans',
      subtitle: '',
      steps: [
        {
          id: 1, phase: 'Preparation', icon: '🍚', action: 'ADD_RICE', heroColor: '#1E3D60', animType: 'rab_step',
          title: 'Add rice to the pot',
          body: 'Measure your rice and add it straight to the pot. For every cup of rice add 1¾ cups of water. Add a pinch of salt.',
          tip: 'No need to rinse — just pour it in and let the water do the work.',
          activeIngredients: ['rice_1'], duration: null,
        },
        {
          id: 2, phase: 'Cooking', icon: '🌡️', action: 'BOIL', heroColor: '#5A2800', animType: 'boil',
          title: 'Bring to a boil then simmer',
          body: 'Bring to a boil, then reduce heat to low. Cover and cook for 15–18 minutes without lifting the lid.',
          tip: 'Steam cooks the rice — every time you lift the lid you lose it.',
          activeIngredients: [], duration: null,
        },
        {
          id: 3, phase: 'Cooking', icon: '🥘', action: 'DROP_BEANS', heroColor: '#5A2800', animType: 'rab_step',
          title: 'Add beans',
          body: 'Drain and rinse the canned beans. Stir them in gently and replace the lid for 2 minutes to heat through.',
          tip: 'Black beans, kidney beans, or pinto all work great here.',
          activeIngredients: ['canned_beans_1'], duration: null,
        },
        {
          id: 4, phase: 'Finishing', icon: '🥄', action: 'STIR', heroColor: '#1A0E04', animType: 'stir',
          title: 'Season and serve',
          body: 'Fluff the rice with a fork, stir in the beans, and season with salt, pepper, and a squeeze of lime. Serve as a side or a main.',
          tip: 'Fresh cilantro and a dash of hot sauce finish it perfectly.',
          activeIngredients: [], duration: null,
        },
      ],
    },

    'bean-chili': {
      name: 'Bean Chili',
      subtitle: '',
      steps: [
        {
          id: 1, phase: 'Preparation', icon: '🔪', action: 'DICE', heroColor: '#5C2A0E', animType: 'chop',
          title: 'Dice the onion',
          body: 'Dice the onion into small, even pieces. It forms the flavour base of the chili so don\'t rush this step.',
          tip: 'Smaller dice means it melts into the sauce rather than staying chunky.',
          activeIngredients: ['onion_1'], duration: null,
        },
        {
          id: 2, phase: 'Preparation', icon: '🔪', action: 'MINCE', heroColor: '#5C2A0E', animType: 'chop',
          title: 'Mince the garlic',
          body: 'Smash and mince 3–4 cloves of garlic fine. It infuses into the oil and builds the base flavour.',
          tip: 'More garlic is almost always better in chili.',
          activeIngredients: ['garlic_1'], duration: null,
        },
        {
          id: 3, phase: 'Cooking', icon: '🍲', action: 'ADD_VEGGIES', heroColor: '#5A2800', animType: 'add_veggies',
          title: 'Sauté onion and garlic',
          body: 'Add the diced onion and minced garlic to the pot with a splash of oil. Cook on medium heat for 4–5 minutes until softened and fragrant.',
          tip: 'Don\'t rush this — properly softened aromatics are the foundation of great chili.',
          activeIngredients: [], duration: null,
        },
        {
          id: 4, phase: 'Cooking', icon: '🍅', action: 'DROP_TOMATOES', heroColor: '#5A2800', animType: 'bc_step',
          title: 'Add tomato and spices',
          body: 'Add crushed tomato, chili powder, cumin, smoked paprika, and a pinch of cayenne. Stir well to combine.',
          tip: 'Toast the spices for 30 seconds before adding tomato — it deepens the flavour.',
          activeIngredients: ['tomato_1'], duration: null,
        },
        {
          id: 5, phase: 'Cooking', icon: '🥘', action: 'DROP_BEANS', heroColor: '#5A2800', animType: 'bc_step',
          title: 'Add beans',
          body: 'Drain and rinse the canned beans, then pour them into the pot. Stir to combine with the tomato base.',
          tip: 'Two cans of beans gives a hearty texture — use one if you prefer more sauce.',
          activeIngredients: ['canned_beans_1'], duration: null,
        },
        {
          id: 6, phase: 'Cooking', icon: '🌡️', action: 'BOIL', heroColor: '#5A2800', animType: 'boil',
          title: 'Simmer the chili',
          body: 'Bring to a boil then reduce to a low simmer. Cook uncovered for 20–25 minutes, stirring occasionally, until thickened.',
          tip: 'The longer it simmers, the better it gets — chili only improves with time.',
          activeIngredients: [], duration: null,
        },
        {
          id: 7, phase: 'Finishing', icon: '🥄', action: 'STIR', heroColor: '#1A0E04', animType: 'stir',
          title: 'Season and serve',
          body: 'Taste and adjust seasoning. Serve with rice, cornbread, or on its own with a dollop of sour cream.',
          tip: 'A squeeze of lime right at the end cuts through the richness.',
          activeIngredients: [], duration: null,
        },
      ],
    },
  };

  // Active recipe state (set by init)
  let _activeSteps = RECIPES['squash-stew'].steps;
  let _activeRecipeMeta = RECIPES['squash-stew'];

  /** Accessor for current recipe's steps array */
  function _S() { return _activeSteps; }

  // ── Audio ─────────────────────────────────────────────────────────────────
  function _actx() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { return null; }
    }
    return _audioCtx;
  }
  function _tone(freqs, att, dec, vol) {
    const ctx = _actx(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    freqs.forEach(f => {
      try {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = f;
        const now = ctx.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(vol, now + att);
        g.gain.exponentialRampToValueAtTime(0.0001, now + att + dec);
        o.start(now); o.stop(now + att + dec + 0.05);
      } catch (_) {}
    });
  }
  const _chime       = () => _tone([440],               0.07, 0.32, 0.26);
  const _chimeFinale = () => _tone([440, 554.4, 659.3],  0.07, 1.80, 0.26);

  /** Speak the step instruction via ElevenLabs (e.g. "Cube the squash"). */
  function _speakStep(step) {
    if (!step || !step.title) return;
    if (_stepAudio) {
      _stepAudio.pause();
      _stepAudio = null;
    }
    const text = step.title.trim();
    if (!text) return;
    const url = `/api/tts?text=${encodeURIComponent(text)}`;
    fetch(url)
      .then(function (res) {
        if (!res.ok) return res.json().then(function (body) { throw new Error(body.error || res.statusText); });
        return res.arrayBuffer();
      })
      .then(function (buf) {
        const blob = new Blob([buf], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(blob);
        const audio = new Audio(blobUrl);
        _stepAudio = audio;
        audio.onended = function () { URL.revokeObjectURL(blobUrl); _stepAudio = null; };
        audio.onerror = function () { URL.revokeObjectURL(blobUrl); _stepAudio = null; };
        return audio.play();
      })
      .then(function () {})
      .catch(function (err) {
        _stepAudio = null;
        console.warn('[CookingGuide] TTS failed:', err.message, '— Try clicking "Listen" after tapping the page.');
      });
  }

  // ── DOM Overlay ───────────────────────────────────────────────────────────
  const _CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');
#cg-card {
  position:relative; width:100%;
  background:transparent;
  border-radius:0; overflow:hidden;
  box-shadow:none;
  font-family:'DM Sans',system-ui,sans-serif;
  transition:opacity .15s ease,transform .15s ease;
  pointer-events:auto;
}
#cg-card.cg-out  { opacity:0; transform:translateY(8px) scale(.98); }
#cg-card.cg-done { background:rgba(15,32,24,0.55); }
.cg-hero {
  position:relative; padding:14px 20px 12px;
  display:flex; align-items:center; gap:12px; min-height:60px;
  border-bottom:1px solid rgba(200,129,58,0.14);
}
.cg-hero::after {
  content:''; position:absolute; inset:0;
  background:linear-gradient(135deg,rgba(200,129,58,.07) 0%,transparent 55%);
  pointer-events:none;
}
.cg-hero-icon { display:none; }
.cg-hero-mid  { flex:1; min-width:0; }
.cg-hero-verb { font-size:9px; font-weight:700; letter-spacing:.13em; text-transform:uppercase; color:rgba(200,129,58,.65); margin-bottom:2px; }
.cg-hero-ings { font-size:18px; line-height:1; letter-spacing:.03em; color:rgba(245,236,215,.90); }
.cg-hero-num  { font-family:'DM Sans',sans-serif; font-size:44px; font-weight:700; color:rgba(200,129,58,.45); line-height:1; flex-shrink:0; letter-spacing:-.04em; }
.cg-prog-wrap { height:2px; background:rgba(200,129,58,.10); }
.cg-prog-fill { height:100%; background:linear-gradient(90deg,#C8813A,#F5B04A); transition:width .5s cubic-bezier(.4,0,.2,1); }
.cg-content   { padding:14px 20px 12px; }
.cg-phase     { font-size:9px; font-weight:700; letter-spacing:.13em; text-transform:uppercase; color:rgba(200,129,58,.70); margin-bottom:5px; }
.cg-title-row  { display:flex; align-items:flex-start; gap:8px; margin-bottom:9px; flex-wrap:wrap; }
.cg-title      { font-family:'Playfair Display',serif; font-size:19px; font-weight:700; color:rgba(245,236,215,.95); line-height:1.25; flex:1; min-width:0; }
.cg-btn-listen, .cg-btn-voice {
  flex-shrink:0; font-size:10px; font-weight:600; letter-spacing:.04em;
  padding:5px 10px; border-radius:6px;
  border:1px solid rgba(200,129,58,.28);
  background:rgba(200,129,58,.08);
  color:rgba(200,129,58,.85);
  cursor:pointer; font-family:inherit;
  transition:background .12s,border-color .12s;
}
.cg-btn-listen:hover, .cg-btn-voice:hover { background:rgba(200,129,58,.18); border-color:rgba(200,129,58,.50); }
.cg-btn-voice.cg-btn-voice--listening { background:#C8813A; color:#FFF8EE; border-color:#C8813A; animation:cg-pulse 1s ease-in-out infinite; }
@keyframes cg-pulse { 50% { opacity:.85; } }
.cg-body-text { font-size:13px; line-height:1.65; color:rgba(245,236,215,.85); margin-bottom:9px; }
.cg-tip       { font-size:11.5px; line-height:1.55; color:rgba(200,129,58,.78); font-style:italic;
                 border-left:2px solid rgba(200,129,58,.38); padding-left:10px; margin-bottom:13px; }
.cg-btns { display:flex; gap:8px; justify-content:flex-end; padding-bottom:2px; }
.cg-btn  {
  font-family:'DM Sans',sans-serif; font-size:12px; font-weight:600; letter-spacing:.03em;
  padding:9px 18px; border-radius:8px; border:none; cursor:pointer;
  transition:background .12s,transform .1s,box-shadow .12s;
}
.cg-btn:active { transform:scale(.93); }
.cg-btn-back { background:transparent; color:rgba(200,129,58,.80); border:1px solid rgba(200,129,58,.30); }
.cg-btn-next { background:#C8813A; color:#FFF8EE; box-shadow:0 2px 10px rgba(200,129,58,.28); }
.cg-btn-start { background:#C8813A; color:#FFF8EE; box-shadow:0 2px 10px rgba(200,129,58,.28); }
.cg-btn-back:hover { background:rgba(200,129,58,.10); border-color:rgba(200,129,58,.52); }
.cg-btn-next:hover { background:#A06228; }
.cg-btn-start:hover { background:#A06228; }
.cg-btn-next.cg-btn-next--locked { background:rgba(200,129,58,.25); color:rgba(255,248,238,.35); box-shadow:none; cursor:not-allowed; pointer-events:none; }
.cg-ring     { position:absolute; top:12px; right:12px; width:34px; height:34px; }
.cg-ring svg { transform:rotate(-90deg); }
.cg-ring-c   { fill:none; stroke:rgba(200,129,58,.50); stroke-width:3; stroke-linecap:round; stroke-dasharray:86; stroke-dashoffset:0; }
.cg-swipe    { font-size:10px; color:rgba(200,129,58,.30); text-align:center; margin-top:6px; display:none; }
@media(pointer:coarse){ .cg-btns{display:none} .cg-swipe{display:block} }
.cg-done-top     { text-align:center; padding:24px 20px 8px; }
.cg-done-emoji   { display:none; }
.cg-done-title   { font-family:'Playfair Display',serif; font-size:19px; color:rgba(245,236,215,.95); line-height:1.3; margin-bottom:4px; }
.cg-done-sub     { font-size:12px; color:rgba(245,236,215,.45); font-style:italic; margin-bottom:18px; letter-spacing:.03em; }
.cg-done-btns    { padding:0 20px 20px; display:flex; flex-direction:column; gap:8px; }
.cg-btn-story, .cg-btn-reset {
  font-family:'DM Sans',sans-serif; font-weight:600; font-size:13px; letter-spacing:.03em;
  padding:11px 16px; border-radius:10px; border:none; cursor:pointer; text-align:center;
  transition:background .12s,box-shadow .12s;
}
.cg-btn-story { background:#C8813A; color:#FFF8EE; box-shadow:0 2px 12px rgba(200,129,58,.28); }
.cg-btn-story:hover { background:#A06228; }
.cg-btn-reset { background:rgba(200,129,58,.08); color:rgba(200,129,58,.60); border:1px solid rgba(200,129,58,.22); }
.cg-btn-reset:hover { background:rgba(200,129,58,.15); }
`;

  /** Voice: say "next" or "continue" to advance step. Uses browser Speech Recognition; step audio is ElevenLabs. */
  function _setupVoiceNext(overlayEl) {
    const btn = overlayEl ? overlayEl.querySelector('#cg-btn-voice') : _q('#cg-btn-voice');
    if (!btn) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      btn.title = 'Voice not supported in this browser';
      btn.disabled = true;
      return;
    }
    let recognition = null;
    btn.addEventListener('click', () => {
      if (recognition && recognition.rolling) {
        recognition.stop();
        return;
      }
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.rolling = true;
      btn.classList.add('cg-btn-voice--listening');
      btn.textContent = 'Listening…';
      recognition.onresult = (e) => {
        const t = (e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
        const said = t.toLowerCase().trim();
        if (/^(next|continue|next step|go( to)? next|next please|continue please)$/.test(said) || /next|continue/.test(said)) {
          _nextStep();
        }
      };
      recognition.onend = () => {
        recognition.rolling = false;
        btn.classList.remove('cg-btn-voice--listening');
        btn.innerHTML = 'Voice';
      };
      recognition.onerror = () => {
        btn.classList.remove('cg-btn-voice--listening');
        btn.innerHTML = 'Voice';
      };
      try { recognition.start(); } catch (err) { btn.classList.remove('cg-btn-voice--listening'); btn.innerHTML = 'Voice'; }
    });
  }

  function _buildOverlay() {
    const cardHTML = `<style>${_CSS}</style>
<div id="cg-card">
  <div class="cg-hero" id="cg-hero">
    <span class="cg-hero-icon" id="cg-hero-icon"></span>
    <div class="cg-hero-mid">
      <div class="cg-hero-verb" id="cg-hero-verb"></div>
      <div class="cg-hero-ings" id="cg-hero-ings"></div>
    </div>
    <div class="cg-hero-num" id="cg-hero-num"></div>
    <div class="cg-ring" id="cg-ring" style="display:none">
      <svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="13.7" class="cg-ring-c" id="cg-ring-c"/></svg>
    </div>
  </div>
  <div class="cg-prog-wrap"><div class="cg-prog-fill" id="cg-prog-fill" style="width:0%"></div></div>
  <div class="cg-content">
    <div class="cg-phase"     id="cg-phase"></div>
    <div class="cg-title-row">
      <div class="cg-title" id="cg-title"></div>
      <button type="button" class="cg-btn-listen" id="cg-btn-listen" title="Hear this step">Listen</button>
      <button type="button" class="cg-btn-voice" id="cg-btn-voice" title="Say &quot;next&quot; or &quot;continue&quot; to go to next step">Voice</button>
    </div>
    <div class="cg-body-text" id="cg-body-text"></div>
    <div class="cg-tip"       id="cg-tip" style="display:none"></div>
    <div class="cg-btns">
      <button class="cg-btn cg-btn-start" id="cg-btn-start" style="display:none">&#9654; Start</button>
      <button class="cg-btn cg-btn-next" id="cg-btn-next">Next &#8594;</button>
    </div>
    <div class="cg-swipe">&#8592; swipe to navigate &#8594;</div>
  </div>
</div>`;

    const el = document.createElement('div');
    el.id = 'cg-root';

    const sidebarTarget = document.getElementById('k3d-instructions');
    if (sidebarTarget) {
      // Sidebar mode: render inline inside the instructions panel
      el.innerHTML = cardHTML;
      sidebarTarget.innerHTML = '';
      sidebarTarget.appendChild(el);
    } else {
      // Fallback: floating fixed card appended to body
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;';
      el.innerHTML = cardHTML;
      document.body.appendChild(el);
    }

    _overlayEl = el;
    _q('#cg-btn-next').addEventListener('click', () => _nextStep());
    _q('#cg-btn-start').addEventListener('click', () => { const fn = _startBtnFn || _beginChop; _startBtnFn = null; _removeStartBtn(); fn(); });
    _q('#cg-btn-listen').addEventListener('click', () => {
      const step = _S()[_currentStep];
      if (step) _speakStep(step);
    });
    _setupVoiceNext(el);
    let tx0 = 0;
    el.addEventListener('touchstart', e => { tx0 = e.changedTouches[0].clientX; }, { passive: true });
    el.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - tx0;
      if (Math.abs(dx) > 46 && dx < 0) { _nextStep(); }
    }, { passive: true });
  }

  function _destroyOverlay() { if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; } }

  // ── Cutting board ────────────────────────────────────���────────────────────
  function _buildCuttingBoard() {
    const glbLoader = new THREE.GLTFLoader();
    glbLoader.load(
      assetUrl('/assets/3d/cutting-board.glb'),
      (gltf) => {
        const g = gltf.scene;
        g.traverse(c => {
          if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
        });
        g.position.set(BOARD_CENTER.x + 2.0, BOARD_Y, BOARD_CENTER.z);
        g.rotation.set(BOARD_ROT.x, BOARD_ROT.y, BOARD_ROT.z);
        g.scale.setScalar(BOARD_SCALE);
        g.visible = false;
        g.userData.slotName = '__cutting_board__';
        _scene.add(g);
        _cuttingBoard = g;
        if (_meshes) _meshes.push(g);
        console.log('[CookingGuide] cutting-board.glb loaded at', BOARD_CENTER);
      },
      undefined,
      () => {
        console.warn('[CookingGuide] cutting-board.glb failed, using fallback box');
        const geo = new THREE.BoxGeometry(0.50, 0.022, 0.34);
        const mat = new THREE.MeshStandardMaterial({ color: 0x5C3010, roughness: 0.88 });
        const g = new THREE.Mesh(geo, mat);
        g.position.set(BOARD_CENTER.x + 2.0, BOARD_Y, BOARD_CENTER.z);
        g.castShadow = true; g.receiveShadow = true;
        g.visible = false;
        g.userData.slotName = '__cutting_board__';
        _scene.add(g);
        _cuttingBoard = g;
        if (_meshes) _meshes.push(g);
      }
    );
  }

  // ── Orange pile of cubes ─────────────────────────────────────────────────
  function _buildOrangePile() {
    const glbLoader = new THREE.GLTFLoader();
    const isPof     = _activeRecipeMeta?.name === 'Potato & Onion Fry';
    const glbPath   = isPof ? '/assets/3d/diced-potato.glb' : '/assets/3d/orange-pile-cubes.glb';
    const pileScale = isPof
      ? (INGREDIENT_SCALES['diced_potato'] || 0.3)
      : PILE_SCALE;
    const pilePos   = isPof
      ? (INGREDIENT_POSITIONS['diced_potato_1'] || PILE_POS)
      : PILE_POS;
    const ingName   = isPof ? 'diced-potato' : 'orange-pile-cubes';

    glbLoader.load(
      assetUrl(glbPath),
      (gltf) => {
        const g = gltf.scene;
        g.traverse(c => {
          if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
        });
        g.position.set(pilePos.x, pilePos.y, pilePos.z);
        g.rotation.set(PILE_ROT.x, PILE_ROT.y, PILE_ROT.z);
        g.scale.setScalar(pileScale);
        g.userData.slotName = _pileSlot;
        g.userData.ingredientName = ingName;
        g.visible = false;
        _scene.add(g);
        _orangePile = g;
        if (_meshes) _meshes.push(g);
        console.log('[CookingGuide]', ingName, 'loaded at', pilePos);
      },
      undefined,
      () => {
        console.warn('[CookingGuide]', glbPath, 'failed to load');
      }
    );
  }

  // ── Diced onions pile ───────────────────────────────────────────────────
  function _buildDicedOnions() {
    const glbLoader = new THREE.GLTFLoader();
    glbLoader.load(
      assetUrl('/assets/3d/diced_onions.glb'),
      (gltf) => {
        const g = gltf.scene;
        g.traverse(c => {
          if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
        });
        g.position.set(DICED_ONIONS_POS.x, DICED_ONIONS_POS.y, DICED_ONIONS_POS.z);
        g.rotation.set(DICED_ONIONS_ROT.x, DICED_ONIONS_ROT.y, DICED_ONIONS_ROT.z);
        g.scale.setScalar(DICED_ONIONS_SCALE);
        g.userData.slotName = _dicedOnionsSlot;
        g.userData.ingredientName = 'diced_onions';
        g.visible = false;
        _scene.add(g);
        _dicedOnionsMesh = g;
        if (_meshes) _meshes.push(g);
        const box = new THREE.Box3().setFromObject(g);
        const size = box.getSize(new THREE.Vector3());
        console.log('[CookingGuide] diced_onions.glb loaded — world size:', size, 'pos:', DICED_ONIONS_POS);
      },
      undefined,
      () => {
        console.warn('[CookingGuide] diced_onions.glb failed to load');
      }
    );
  }

  // ── Minced garlic pile ─────────────────────────────────────────────────────
  function _buildMincedGarlic() {
    const glbLoader = new THREE.GLTFLoader();
    glbLoader.load(
      assetUrl('/assets/3d/minced-garlic.glb'),
      (gltf) => {
        const g = gltf.scene;
        g.traverse(c => {
          if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
        });
        g.position.set(MINCED_GARLIC_POS.x, MINCED_GARLIC_POS.y, MINCED_GARLIC_POS.z);
        g.rotation.set(MINCED_GARLIC_ROT.x, MINCED_GARLIC_ROT.y, MINCED_GARLIC_ROT.z);
        g.scale.setScalar(MINCED_GARLIC_SCALE);
        g.userData.slotName = _mincedGarlicSlot;
        g.userData.ingredientName = 'minced-garlic';
        g.visible = false;
        _scene.add(g);
        _mincedGarlicMesh = g;
        if (_meshes) _meshes.push(g);
        const box = new THREE.Box3().setFromObject(g);
        const size = box.getSize(new THREE.Vector3());
        console.log('[CookingGuide] minced-garlic.glb loaded — world size:', size, 'pos:', MINCED_GARLIC_POS);
      },
      undefined,
      () => {
        console.warn('[CookingGuide] minced-garlic.glb failed to load');
      }
    );
  }

  // ── Pot ──────────────────────────────────────────────────────────────────
  function _buildPot() {
    const glbLoader = new THREE.GLTFLoader();
    glbLoader.load(
      assetUrl('/assets/3d/pot.glb'),
      (gltf) => {
        const g = gltf.scene;
        g.traverse(c => {
          if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
        });
        g.position.set(POT_POS.x, POT_POS.y, POT_POS.z);
        g.rotation.set(POT_ROT.x, POT_ROT.y, POT_ROT.z);
        g.scale.setScalar(POT_SCALE);
        g.userData.slotName = _potSlot;
        g.userData.ingredientName = 'pot';
        _scene.add(g);
        _potMesh = g;
        if (_meshes) _meshes.push(g);
        // Pot loads async — re-apply visibility based on current step now that mesh exists
        const _potStartNow = (_activeRecipeMeta?.name === 'Potato & Onion Fry') ? 3
          : (_activeRecipeMeta?.name === 'Rice & Beans') ? 1
          : (_activeRecipeMeta?.name === 'Bean Chili') ? 3 : 4;
        const _curStep = _S()[_currentStep];
        g.visible = !!(_curStep && _curStep.id >= _potStartNow);
        const box = new THREE.Box3().setFromObject(g);
        const size = box.getSize(new THREE.Vector3());
        console.log('[CookingGuide] pot.glb loaded — world size:', size, 'pos:', POT_POS);
      },
      undefined,
      () => {
        console.warn('[CookingGuide] pot.glb failed to load');
      }
    );
  }

  // ── Stew / final dish (counter reveal, recipe-aware) ─────────────────────
  function _buildStew() {
    const glbLoader = new THREE.GLTFLoader();
    const _isPof2 = _activeRecipeMeta?.name === 'Potato & Onion Fry';
    const _isRab2 = _activeRecipeMeta?.name === 'Rice & Beans';
    const _isBc2  = _activeRecipeMeta?.name === 'Bean Chili';
    const _stewGlb = _isPof2 ? '/assets/3d/patato-onion-fry.glb'
      : _isRab2 ? '/assets/3d/rice-and-beans.glb'
      : _isBc2  ? '/assets/3d/bean-chilli.glb' : '/assets/3d/stew.glb';
    glbLoader.load(
      assetUrl(_stewGlb),
      (gltf) => {
        const g = gltf.scene;
        g.traverse(c => {
          if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
        });
        g.position.set(STEW_POS.x, STEW_POS.y, STEW_POS.z);
        g.rotation.set(STEW_ROT.x, STEW_ROT.y, STEW_ROT.z);
        g.scale.setScalar(STEW_SCALE);
        g.userData.slotName = 'stew_1';
        g.userData.ingredientName = 'stew';
        g.visible = false;
        _scene.add(g);
        _stewMesh = g;
        console.log('[CookingGuide] stew.glb loaded at', STEW_POS);
      },
      undefined,
      () => {
        console.warn('[CookingGuide] stew.glb failed to load');
      }
    );
  }

  // ── Knife ─────────────────────────────────────────────────────────────────
  function _buildKnife() {
    const g = new THREE.Group();
    const silver = new THREE.MeshStandardMaterial({ color: 0xE2E2E2, metalness: 0.94, roughness: 0.06 });
    const wood   = new THREE.MeshStandardMaterial({ color: 0x2C1608, roughness: 0.84, metalness: 0 });
    const grey   = new THREE.MeshStandardMaterial({ color: 0xB2B2B2, metalness: 0.78, roughness: 0.22 });

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.27, 0.004), silver);
    blade.position.y = -0.02; blade.castShadow = true; g.add(blade);

    const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.022, 0.013), grey);
    bolster.position.y = 0.12; g.add(bolster);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.136, 0.017), wood);
    handle.position.y = 0.203; handle.castShadow = true; g.add(handle);

    [0.173, 0.233].forEach(y => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.020, 8), grey);
      r.rotation.x = Math.PI / 2; r.position.set(0, y, 0); g.add(r);
    });

    g.scale.setScalar(1.5);
    g.rotation.z = Math.PI / 9;
    g.visible = false;
    _scene.add(g);
    _knifeGroup = g;
  }

  // ── Wooden spoon ──────────────────────────────────────────────────────────
  function _buildSpoon() {
    const g = new THREE.Group();
    const darkWood  = new THREE.MeshStandardMaterial({ color: 0x6B3A14, roughness: 0.83, metalness: 0 });
    const lightWood = new THREE.MeshStandardMaterial({ color: 0x9A5A28, roughness: 0.78, metalness: 0 });

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.013, 0.38, 10), darkWood);
    handle.position.y = 0.05; handle.castShadow = true; g.add(handle);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.022, 0.06, 10), darkWood);
    neck.position.y = -0.16; g.add(neck);

    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 10), lightWood);
    bowl.scale.set(1, 0.43, 0.88); bowl.position.y = -0.22;
    bowl.castShadow = true; g.add(bowl);

    g.rotation.x = 0.24;
    g.visible = false;
    _scene.add(g);
    _spoonGroup = g;
  }

  // ── Spot glow ─────────────────────────────────────────────────────────────
  function _buildSpotGlow() {
    const g = new THREE.Group();
    const sharedParams = { transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false, depthWrite: false };
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 40),
      new THREE.MeshBasicMaterial({ color: 0xD4883A, ...sharedParams })
    );
    inner.rotation.x = -Math.PI / 2; inner.name = 'inner'; g.add(inner);

    const outer = new THREE.Mesh(
      new THREE.RingGeometry(0.17, 0.38, 40),
      new THREE.MeshBasicMaterial({ color: 0xC8813A, ...sharedParams })
    );
    outer.rotation.x = -Math.PI / 2; outer.name = 'outer'; g.add(outer);

    _scene.add(g);
    _spotGlow = g;
  }

  // ── Ingredient lerp system ────────────────────────────────────────────────
  // Easing: smooth cubic in-out
  function _easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function _startLerp(mesh, to, duration) {
    // Cancel any existing lerp for this mesh
    _activeLerps = _activeLerps.filter(l => l.mesh !== mesh);
    _activeLerps.push({
      mesh,
      from: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      to,
      t: 0,
      duration,
    });
  }

  // Return all currently-boarded ingredients to their original positions
  // force=true hides piles too (used by reset/destroy)
  function _returnAllIngredients(force) {
    Object.entries(_origPositions).forEach(([slot, orig]) => {
      const m = _getMesh(slot);
      if (m) _startLerp(m, orig, 0.7);
    });
    _origPositions = {};
    // Only hide piles on explicit reset — progressive cooking keeps them visible
    if (force) {
      if (_orangePile) _orangePile.visible = false;
      if (_dicedOnionsMesh) _dicedOnionsMesh.visible = false;
      if (_mincedGarlicMesh) _mincedGarlicMesh.visible = false;
    }
  }

  // Move the named ingredient to the cutting board (arc motion)
  function _moveToBoard(slot) {
    const m = _getMesh(slot);
    if (!m) return;
    if (!_origPositions[slot]) {
      _origPositions[slot] = { x: m.position.x, y: m.position.y, z: m.position.z };
    }
    const bp = _cuttingBoard ? _cuttingBoard.position : { x: BOARD_CENTER.x, z: BOARD_CENTER.z };
    _startLerp(m, { x: bp.x, y: _origPositions[slot].y, z: bp.z }, 0.75);
  }

  // ── Particle system ───────────────────────────────────────────────────────
  function _clearParticles() {
    _particles.forEach(p => {
      if (p.mesh && _scene) {
        _scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
    });
    _particles = [];
  }

  // Steam: thin wispy planes that twist and rise (NOT spheres)
  function _spawnSteamWisps() {
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xEEEEE4, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.040, 0.20), mat.clone());
      mesh.visible = false;
      _scene.add(mesh);
      _particles.push({
        type: 'wisp', mesh,
        phase: Math.random(), speed: 0.17 + Math.random() * 0.13,
        ox: (Math.random() - 0.5) * 0.09, oz: (Math.random() - 0.5) * 0.09,
        rotOffset: Math.random() * Math.PI * 2,
        rotSpeed:  (Math.random() - 0.5) * 1.6,
        swayPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  // Drain: elongated falling droplets + flat expanding water ripple rings
  function _spawnDrainDroplets() {
    const dropGeo = new THREE.CylinderGeometry(0.007, 0.010, 0.042, 7);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x88BBDD, transparent: true, opacity: 0, metalness: 0.1, roughness: 0.35, depthTest: false,
      });
      const mesh = new THREE.Mesh(dropGeo, mat.clone());
      mesh.visible = false;
      _scene.add(mesh);
      _particles.push({
        type: 'droplet', mesh,
        phase: Math.random(), speed: 0.55 + Math.random() * 0.38,
        ox: (Math.random() - 0.5) * 0.11, oz: (Math.random() - 0.5) * 0.11,
        fallH: 0.33 + Math.random() * 0.14,
      });
    }
    // Expanding ripple rings on the counter surface
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x88BBDD, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.025, 0.040, 28), mat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      _scene.add(mesh);
      _particles.push({
        type: 'ripple', mesh,
        phase: (i / 4) + Math.random() * 0.15, // stagger starts
        speed: 0.55 + Math.random() * 0.30,
        ox: (Math.random() - 0.5) * 0.09, oz: (Math.random() - 0.5) * 0.09,
      });
    }
  }

  // Season: tumbling crystalline octahedra raining from above
  function _spawnSaltCrystals() {
    for (let i = 0; i < 16; i++) {
      const b = 0.88 + Math.random() * 0.12;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(b, b * 0.97, b * 0.94),
        transparent: true, opacity: 0, metalness: 0.06, roughness: 0.25, depthTest: false,
      });
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.008 + Math.random() * 0.007, 0), mat.clone());
      mesh.visible = false;
      _scene.add(mesh);
      _particles.push({
        type: 'crystal', mesh,
        phase: Math.random(), speed: 0.38 + Math.random() * 0.32,
        ox: (Math.random() - 0.5) * 0.20, oz: (Math.random() - 0.5) * 0.20,
        fallH: 0.28 + Math.random() * 0.22,
        rx: Math.random() * Math.PI * 2, rz: Math.random() * Math.PI * 2,
        rxs: (Math.random() - 0.5) * 9,  rzs: (Math.random() - 0.5) * 7,
      });
    }
  }

  // Sparkles: warm golden octahedra burst outward (unchanged — these look great)
  function _spawnSparkles(count) {
    const geo = new THREE.OctahedronGeometry(0.017, 0);
    for (let i = 0; i < count; i++) {
      const hue = (28 + Math.random() * 22) / 360;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 1.0, 0.60),
        transparent: true, opacity: 0, depthTest: false,
      });
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.visible = false;
      _scene.add(mesh);
      _particles.push({
        type: 'sparkle', mesh,
        phase: Math.random() * 0.65, speed: 0.42 + Math.random() * 0.28,
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.5,
        spread: 0.17 + Math.random() * 0.13,
        lift: 0.55 + Math.random() * 0.55,
        rotSpeed: (Math.random() - 0.5) * 6,
      });
    }
  }

  // ── Animation type switcher ───────────────────────────────────────────────
  function _setAnimType(type, ingPos) {
    if (_knifeGroup) _knifeGroup.visible = false;
    if (_spoonGroup) _spoonGroup.visible = false;
    _clearParticles();
    if (typeof Step1Chop !== 'undefined') Step1Chop.cleanup();
    if (typeof Step2Chop !== 'undefined') Step2Chop.cleanup();
    if (typeof Step3Garlic !== 'undefined') Step3Garlic.cleanup();
    if (typeof Step4Stock !== 'undefined') Step4Stock.cleanup();
    if (typeof Step6Veggies !== 'undefined') Step6Veggies.cleanup();
    if (typeof Step7BeansCorn !== 'undefined') Step7BeansCorn.cleanup();
    if (typeof Step8Stir !== 'undefined') Step8Stir.cleanup();
    if (typeof BeanChiliSteps !== 'undefined') BeanChiliSteps.cleanup();
    if (typeof RiceBeansSteps !== 'undefined') RiceBeansSteps.cleanup();
    if (typeof PotatoFrySteps !== 'undefined') PotatoFrySteps.cleanup();
    _animType = type; _animT = 0; _stirAngle = 0;

    switch (type) {
      case 'chop':
        _chopWaiting = true;
        if (_currentStep === 0) _showStartBtn();
        else setTimeout(_beginChop, 500);
        break;
      case 'pour':
        _chopWaiting = true;
        setTimeout(_beginPour, 500);
        break;
      case 'boil':
        _chopWaiting = true;
        setTimeout(_beginBoil, 500);
        break;
      case 'add_veggies':
        _chopWaiting = true;
        setTimeout(_beginAddVeggies, 500);
        break;
      case 'add_beans_corn':
        _chopWaiting = true;
        setTimeout(_beginAddBeansCorn, 500);
        break;
      case 'stir_finish':
        _chopWaiting = true;
        setTimeout(_beginStir, 500);
        break;
      case 'stir': {
        const _stirPos = ingPos || (_potMesh ? _potMesh.position : null);
        if (_spoonGroup && _stirPos) {
          _spoonGroup.position.set(_stirPos.x, _stirPos.y + 0.3, _stirPos.z);
          _spoonGroup.visible = true;
        }
        setTimeout(_unlockNext, 2000);
        break;
      }
      case 'steam':   _spawnSteamWisps(); _unlockNext(); break;
      case 'drain':   _spawnDrainDroplets(); break;
      case 'season':  _spawnSaltCrystals(); break;
      case 'sparkle': _spawnSparkles(12); break;
      case 'add_ingredient':
        _spawnSparkles(10);
        setTimeout(_unlockNext, 1800);
        break;
      case 'bc_step':
        _chopWaiting = true;
        setTimeout(_beginBcStep, 500);
        break;
      case 'rab_step':
        _chopWaiting = true;
        if (_currentStep === 0) _showStartBtn(_beginRabStep);
        else setTimeout(_beginRabStep, 500);
        break;
      case 'pof_step':
        _chopWaiting = true;
        setTimeout(_beginPofStep, 500);
        break;
    }
  }


  // ── Start button (shown only on step 1 inside the instruction panel) ────────
  function _showStartBtn(fn) {
    _startBtnFn = fn || null;
    const startBtn = _q('#cg-btn-start'), nextBtn = _q('#cg-btn-next');
    if (startBtn) startBtn.style.display = '';
    if (nextBtn)  nextBtn.style.display  = 'none';
  }

  function _removeStartBtn() {
    const startBtn = _q('#cg-btn-start'), nextBtn = _q('#cg-btn-next');
    if (startBtn) startBtn.style.display = 'none';
    if (nextBtn)  nextBtn.style.display  = '';
  }

  // Onion chop target on the board
  const ONION_CHOP_TARGET = { x: 0.0977, y: 3.0259, z: -0.3594 };
  // Final scale for diced onions pile during step 2
  const DICED_PILE_SCALE  = 0.2392;

  function _beginChop() {
    _chopWaiting = false;

    const step = _S()[_currentStep];
    if (!step || !step.activeIngredients[0]) return;

    const slot = step.activeIngredients[0];
    const m = _getMesh(slot);
    if (!m) return;

    // Save original position for return later
    if (!_origPositions[slot]) {
      _origPositions[slot] = { x: m.position.x, y: m.position.y, z: m.position.z };
    }

    // Reset cutting board to its known centre so step modules slide it in correctly
    if (_cuttingBoard) {
      _cuttingBoard.visible = true;
      _cuttingBoard.position.set(BOARD_CENTER.x, BOARD_Y, BOARD_CENTER.z);
    }

    // Step 2: Dice the onion — use Step2Chop
    if (step.action === 'DICE' && typeof Step2Chop !== 'undefined') {
      // Position the diced onions pile at the board (Step2Chop will show/scale it)
      if (_dicedOnionsMesh) {
        _dicedOnionsMesh.visible = false;
        _dicedOnionsMesh.position.set(ONION_CHOP_TARGET.x, ONION_CHOP_TARGET.y, ONION_CHOP_TARGET.z);
        _dicedOnionsMesh.scale.setScalar(0.001);
      }

      Step2Chop.start({
        ingredient:     m,
        knifeGroup:     _knifeGroup,
        dicedOnions:    _dicedOnionsMesh,
        cuttingBoard:   _cuttingBoard,
        pileFinalScale: DICED_PILE_SCALE,
        chopTarget:     ONION_CHOP_TARGET,
        boardCenter:    { x: ONION_CHOP_TARGET.x, z: ONION_CHOP_TARGET.z },
        boardY:         ONION_CHOP_TARGET.y,
        origPosition:   _origPositions[slot],
        onComplete:     function onDiceComplete() {
          // Ingredient consumed — don't return it to shelf on step change
          delete _origPositions[slot];
          console.log('[CookingGuide] dice pipeline complete');
          _unlockNext();
        },
      });
      return;
    }

    // Step 3: Smash & mince the garlic — use Step3Garlic
    if (step.action === 'MINCE' && typeof Step3Garlic !== 'undefined') {
      const GARLIC_CHOP_TARGET = { x: 0.0879, y: 3.1360, z: -0.3736 };
      const MINCED_PILE_FINAL  = { x: 1.2118, y: 3.0039, z: -0.4023 };
      const MINCED_PILE_SCALE  = 0.2335;

      if (_mincedGarlicMesh) {
        _mincedGarlicMesh.visible = false;
        _mincedGarlicMesh.position.set(GARLIC_CHOP_TARGET.x, GARLIC_CHOP_TARGET.y, GARLIC_CHOP_TARGET.z);
        _mincedGarlicMesh.scale.setScalar(0.001);
      }

      Step3Garlic.start({
        ingredient:     m,
        knifeGroup:     _knifeGroup,
        mincedGarlic:   _mincedGarlicMesh,
        cuttingBoard:   _cuttingBoard,
        pileFinalScale: MINCED_PILE_SCALE,
        pileFinalPos:   MINCED_PILE_FINAL,
        chopTarget:     GARLIC_CHOP_TARGET,
        boardCenter:    { x: GARLIC_CHOP_TARGET.x, z: GARLIC_CHOP_TARGET.z },
        boardY:         GARLIC_CHOP_TARGET.y,
        origPosition:   _origPositions[slot],
        onComplete:     function onMinceComplete() {
          delete _origPositions[slot];
          console.log('[CookingGuide] mince pipeline complete');
          _unlockNext();
        },
      });
      return;
    }

    // Step 1 (and other chop steps): use Step1Chop
    if (_orangePile) {
      _orangePile.visible = false;
      _orangePile.position.set(PILE_POS.x, PILE_POS.y, PILE_POS.z);
      _orangePile.scale.setScalar(0.001);
    }
    if (_dicedOnionsMesh) {
      _dicedOnionsMesh.visible = false;
    }

    if (typeof Step1Chop !== 'undefined') {
      Step1Chop.start({
        ingredient:     m,
        knifeGroup:     _knifeGroup,
        orangePile:     _orangePile,
        cuttingBoard:   _cuttingBoard,
        pileFinalScale: PILE_SCALE,
        chopTarget:     CHOP_TARGET,
        boardCenter:    { x: CHOP_TARGET.x, z: CHOP_TARGET.z },
        boardY:         CHOP_TARGET.y,
        origPosition:   _origPositions[slot],
        onComplete:     function onChopComplete() {
          // Ingredient consumed — don't return it to shelf on step change
          delete _origPositions[slot];
          console.log('[CookingGuide] chop pipeline complete');
          _unlockNext();
        },
      });
    }
  }

  // ── Begin Pour ────────────────────────────────────────────────────────────
  function _beginPour() {
    _chopWaiting = false;

    const step = _S()[_currentStep];
    if (!step) return;

    // Three Sisters Stew: full Step4Stock pour animation
    if (step.action === 'POUR_STOCK') {
      const slot = step.activeIngredients[0];
      const m = _getMesh(slot);
      if (m && typeof Step4Stock !== 'undefined') {
        Step4Stock.start({
          stockMesh:  m,
          potMesh:    _potMesh,
          onComplete: function onPourComplete() {
            console.log('[CookingGuide] pour stock pipeline complete');
            _unlockNext();
          },
        });
        return;
      }
    }

    // Generic pour: sparkles on active ingredient then unlock
    _spawnDrainDroplets();
    setTimeout(_unlockNext, 1800);
  }

  // ── Begin Boil (for Step5Boil — persistent steam) ─────────────────────
  function _beginBoil() {
    _chopWaiting = false;

    const step = _S()[_currentStep];
    if (!step || step.animType !== 'boil') return;

    // Three Sisters Stew: use Step5Boil for persistent steam over the pot
    if (step.action === 'BOIL' && typeof Step5Boil !== 'undefined') {
      Step5Boil.start({
        potMesh: _potMesh,
        onComplete: function onBoilComplete() {
          console.log('[CookingGuide] boil steam started — persists for rest of tutorial');
          _unlockNext();
        },
      });
      return;
    }

    // Generic boil: wisp particles then unlock
    _spawnSteamWisps();
    setTimeout(_unlockNext, 2000);
  }

  // ── Begin Add Veggies (for Step6Veggies) ──────────────────────────────
  function _beginAddVeggies() {
    _chopWaiting = false;

    const step = _S()[_currentStep];
    if (!step || step.action !== 'ADD_VEGGIES') return;

    if (typeof Step6Veggies !== 'undefined') {
      Step6Veggies.start({
        squashMesh: _orangePile,
        onionMesh:  _dicedOnionsMesh,
        garlicMesh: _mincedGarlicMesh,
        potMesh:    _potMesh,
        onComplete: function onVeggiesComplete() {
          console.log('[CookingGuide] veggies added to pot — pipeline complete');
          _unlockNext();
        },
      });
    }
  }

  // ── Begin Add Beans & Corn (for Step7BeansCorn) ──────────────────────
  function _beginAddBeansCorn() {
    _chopWaiting = false;

    const step = _S()[_currentStep];
    if (!step || step.action !== 'ADD_BEANS_CORN') return;

    const beansM = _getMesh('canned_beans_1');
    const cornM  = _getMesh('canned_corn_1');

    if (typeof Step7BeansCorn !== 'undefined') {
      Step7BeansCorn.start({
        beansMesh:  beansM,
        cornMesh:   cornM,
        potMesh:    _potMesh,
        onComplete: function onBeansCornComplete() {
          console.log('[CookingGuide] beans & corn added to pot — pipeline complete');
          _unlockNext();
        },
      });
    }
  }

  // ── Begin Stir (for Step8Stir) ────────────────────────────────────────
  function _beginStir() {
    _chopWaiting = false;

    const step = _S()[_currentStep];
    if (!step || step.action !== 'STIR') return;

    if (typeof Step8Stir !== 'undefined') {
      Step8Stir.start({
        spoonGroup:      _spoonGroup,
        potMesh:         _potMesh,
        stewMesh:        _stewMesh,
        stewTargetScale: STEW_SCALE,
        onComplete: function onStirComplete() {
          console.log('[CookingGuide] stir complete — stew revealed');
          _unlockNext();
        },
      });
    }
  }

  // ── Recipe step helpers (shared opts builder) ─────────────────────────────
  function _recipeStepOpts(onComplete) {
    return {
      getMesh:     _getMesh.bind(null),
      potMesh:     _potMesh,
      knifeGroup:  _knifeGroup,
      spoonGroup:  _spoonGroup,
      dicedPile:   _orangePile,       // diced potato pile → DROP_POTATO
      dicedOnions: _dicedOnionsMesh,  // diced onion pile  → DROP_ONION
      onComplete,
    };
  }

  // ── Begin Bean Chili step ──────────────────────────────────────────────────
  function _beginBcStep() {
    _chopWaiting = false;
    const step = _S()[_currentStep];
    if (!step) return;
    if (typeof BeanChiliSteps !== 'undefined') {
      BeanChiliSteps.startStep(step.action, _recipeStepOpts(_unlockNext));
    } else {
      setTimeout(_unlockNext, 1500);
    }
  }

  // ── Begin Rice & Beans step ────────────────────────────────────────────────
  function _beginRabStep() {
    _chopWaiting = false;
    const step = _S()[_currentStep];
    if (!step) return;
    if (typeof RiceBeansSteps !== 'undefined') {
      RiceBeansSteps.startStep(step.action, _recipeStepOpts(_unlockNext));
    } else {
      setTimeout(_unlockNext, 1500);
    }
  }

  // ── Begin Potato & Onion Fry step ─────────────────────────────────────────
  function _beginPofStep() {
    _chopWaiting = false;
    const step = _S()[_currentStep];
    if (!step) return;
    if (typeof PotatoFrySteps !== 'undefined') {
      PotatoFrySteps.startStep(step.action, _recipeStepOpts(_unlockNext));
    } else {
      setTimeout(_unlockNext, 1500);
    }
  }

  // ── Animation ticks ───────────────────────────────────────────────────────
  function _tickChop(dt) {
    if (_chopWaiting) return;
    // Step1Chop orchestrates squash chopping; Step2Chop orchestrates onion dicing
    if (typeof Step1Chop !== 'undefined') Step1Chop.tick(dt);
    if (typeof Step2Chop !== 'undefined') Step2Chop.tick(dt);
    if (typeof Step3Garlic !== 'undefined') Step3Garlic.tick(dt);
    if (typeof Step4Stock !== 'undefined') Step4Stock.tick(dt);
  }

  function _tickStir(dt, base) {
    if (!_spoonGroup) return;
    const isMash = _S()[_currentStep] && _S()[_currentStep].action === 'MASH';
    if (isMash) {
      _stirAngle += dt * 2.2;
      const press = Math.abs(Math.sin(_stirAngle));
      _spoonGroup.position.set(base.x + 0.06, base.y + 0.12 + press * 0.24, base.z + 0.04);
      _spoonGroup.rotation.x = 0.38 + press * 0.32;
    } else {
      _stirAngle += dt * 1.9;
      const r = 0.11;
      _spoonGroup.position.set(
        base.x + r * Math.cos(_stirAngle),
        base.y + 0.29 + 0.028 * Math.sin(_stirAngle * 2),
        base.z + r * Math.sin(_stirAngle)
      );
      _spoonGroup.rotation.y = _stirAngle + Math.PI * 1.1;
      _spoonGroup.rotation.x = 0.20 + 0.06 * Math.sin(_stirAngle);
    }
  }

  // Unified particle tick — routes by p.type
  function _tickAllParticles(dt, base, now) {
    _particles.forEach(p => {
      p.phase = (p.phase + dt * p.speed) % 1;
      const lp = p.phase;

      switch (p.type) {

        case 'wisp': {
          // Thin plane wisp: rises, twists, sways side to side
          const fi = lp < 0.22 ? lp / 0.22 : 1;
          const fo = lp > 0.66 ? (1 - lp) / 0.34 : 1;
          p.mesh.visible = true;
          p.mesh.position.set(
            base.x + p.ox + 0.042 * Math.sin(now / 1000 * 1.3 + p.swayPhase + lp * 7),
            base.y + 0.06 + lp * 0.60,
            base.z + p.oz + 0.030 * Math.cos(now / 1000 * 0.9 + p.swayPhase)
          );
          // Always face roughly toward camera; twist slowly around Y
          p.mesh.rotation.y = p.rotOffset + p.rotSpeed * (now / 1000);
          // Lean/sway on Z gives the wispy flutter
          p.mesh.rotation.z = 0.20 * Math.sin(now / 1000 * 1.1 + p.swayPhase);
          p.mesh.material.opacity = fi * fo * 0.34;
          // Wider and taller as it rises
          p.mesh.scale.set(0.7 + 0.7 * lp, 0.9 + 0.5 * lp, 1);
          break;
        }

        case 'droplet': {
          // Elongated cylinder: falls in a parabolic arc, stretches at peak velocity
          const fi = lp < 0.08 ? lp / 0.08 : 1;
          const fo = lp > 0.86 ? (1 - lp) / 0.14 : 1;
          // Velocity proxy: sin of lifecycle — fastest at lp≈0.5
          const vel = Math.sin(lp * Math.PI);
          const y = base.y + p.fallH - (p.fallH + 0.06) * lp;
          p.mesh.visible = true;
          p.mesh.position.set(base.x + p.ox, y, base.z + p.oz);
          // Stretch along fall direction at high velocity
          p.mesh.scale.set(1.0 - vel * 0.25, 1 + vel * 2.2, 1.0 - vel * 0.25);
          p.mesh.material.opacity = fi * fo * 0.70;
          break;
        }

        case 'ripple': {
          // Flat ring expands on counter surface then fades — like water impact
          const fi = lp < 0.08 ? lp / 0.08 : 1;
          const fo = lp > 0.50 ? (1 - lp) / 0.50 : 1;
          const scale = 0.5 + lp * 3.0; // ring radius grows 0.5→3.5×
          p.mesh.visible = true;
          p.mesh.position.set(base.x + p.ox, base.y - 0.018, base.z + p.oz);
          p.mesh.scale.set(scale, scale, 1);
          p.mesh.material.opacity = fi * fo * 0.45;
          break;
        }

        case 'crystal': {
          // Tumbling octahedron rains from above, spinning on multiple axes
          const fi = lp < 0.07 ? lp / 0.07 : 1;
          const fo = lp > 0.80 ? (1 - lp) / 0.20 : 1;
          const y = base.y + p.fallH + 0.08 - (p.fallH + 0.28) * lp;
          p.mesh.visible = y > base.y - 0.04;
          p.mesh.position.set(base.x + p.ox, Math.max(y, base.y - 0.03), base.z + p.oz);
          p.mesh.rotation.x = p.rx + p.rxs * (now / 1000);
          p.mesh.rotation.z = p.rz + p.rzs * (now / 1000);
          p.mesh.material.opacity = fi * fo * 0.88;
          break;
        }

        case 'sparkle': {
          // Golden burst outward then contract — unchanged, they look great
          const r = p.spread * Math.sin(lp * Math.PI);
          p.mesh.visible = true;
          p.mesh.position.set(
            base.x + r * Math.cos(p.angle),
            base.y + 0.14 + r * p.lift,
            base.z + r * Math.sin(p.angle)
          );
          p.mesh.material.opacity = Math.sin(lp * Math.PI) * 0.92;
          p.mesh.rotation.y += dt * p.rotSpeed;
          p.mesh.rotation.x += dt * p.rotSpeed * 0.55;
          p.mesh.scale.setScalar(0.45 + Math.sin(lp * Math.PI) * 1.05);
          break;
        }
      }
    });
  }

  // ── Ingredient helpers ────────────────────────────────────────────────────
  function _getMesh(slot) {
    return (_meshes || []).find(m => m.userData.slotName === slot) || null;
  }

  function _setAllOpacity(opacity, skip) {
    (_meshes || []).forEach(m => {
      if (skip && skip.includes(m.userData.slotName)) return;
      m.traverse(c => {
        if (!c.isMesh) return;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(mat => { mat.transparent = opacity < 1; mat.opacity = opacity; });
      });
    });
  }

  function _setMeshFull(slot) {
    const m = _getMesh(slot);
    if (!m) return;
    m.traverse(c => {
      if (!c.isMesh) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach(mat => { mat.transparent = false; mat.opacity = 1; });
    });
  }

  // ── Ingredient lights ─────────────────────────────────────────────────────
  function _clearLights() {
    const sc = _scene;
    _activeLights.forEach(({ light }) => {
      const i0 = light.intensity, t0 = performance.now();
      (function fade() {
        const p = (performance.now() - t0) / 380;
        if (p >= 1) { if (sc) sc.remove(light); return; }
        light.intensity = i0 * (1 - p);
        requestAnimationFrame(fade);
      })();
    });
    _activeLights = [];
  }

  function _addLight(slot) {
    const m = _getMesh(slot); if (!m || !_scene) return;
    const p = m.position;
    const light = new THREE.PointLight(0xD4883A, 0, 1.9);
    light.position.set(p.x, p.y + 0.48, p.z + 0.12);
    _scene.add(light);
    _activeLights.push({ light, startTime: performance.now() });
  }

  // ── Step renderer ─────────────────────────────────────────────────────────
  function _applyStep(idx) {
    const step = _S()[idx]; if (!step) return;

    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    _countdownStart = null;

    // Return any ingredients sitting on the cutting board
    _returnAllIngredients();

    // Pot appears at step 3 for potato-onion-fry (HEAT step), step 4 for other recipes
    const _potStartStep = (_activeRecipeMeta?.name === 'Potato & Onion Fry') ? 3
      : (_activeRecipeMeta?.name === 'Rice & Beans') ? 1
      : (_activeRecipeMeta?.name === 'Bean Chili') ? 3 : 4;
    if (_potMesh && step.id >= _potStartStep) _potMesh.visible = true;

    // Hero band
    const hero = _q('#cg-hero');
    if (hero) hero.style.background = step.heroColor;
    _set('cg-hero-icon', step.icon);
    _set('cg-hero-verb', step.action);
    _set('cg-hero-num',  String(step.id).padStart(2, '0'));
    const ingsEl = _q('#cg-hero-ings');
    if (ingsEl) {
      ingsEl.textContent = step.activeIngredients.length
        ? step.activeIngredients.map(s => ING_EMOJI[s] || '🌿').join(' ')
        : '🍲';
    }

    // Progress
    const fill = _q('#cg-prog-fill');
    if (fill) fill.style.width = `${(step.id / _S().length) * 100}%`;

    // Content
    _set('cg-phase',     step.phase);
    _set('cg-title',     step.title);
    _set('cg-body-text', step.body);
    const tipEl = _q('#cg-tip');
    if (tipEl) { tipEl.textContent = step.tip || ''; tipEl.style.display = step.tip ? '' : 'none'; }

    // Buttons
    const nxBtn = _q('#cg-btn-next');
    if (nxBtn) nxBtn.textContent = idx === _S().length - 1 ? 'Finish \u2192' : 'Next \u2192';
    _lockNext();

    // Fade back in
    const card = _q('#cg-card');
    if (card) { card.classList.remove('cg-out'); card.classList.remove('cg-done'); }

    // Ingredient opacity + lights
    _clearLights();
    const active = step.activeIngredients;
    if (active.length) {
      _setAllOpacity(0.30, active);
      active.forEach(s => { _setMeshFull(s); _addLight(s); });
    } else {
      _setAllOpacity(1);
    }

    // Spot glow under first active ingredient
    if (_spotGlow) {
      const m = active[0] ? _getMesh(active[0]) : null;
      if (m) {
        _spotGlow.position.set(m.position.x, m.position.y - 0.04, m.position.z);
        _spotGlow.children.forEach(c => { if (c.material) c.material.opacity = 0.01; });
      } else {
        _spotGlow.children.forEach(c => { if (c.material) c.material.opacity = 0; });
      }
    }

    // 3D animation
    const firstM = active[0] ? _getMesh(active[0]) : null;
    _setAnimType(step.animType, firstM ? firstM.position : null);

    // Countdown ring
    const ring = _q('#cg-ring');
    if (ring) ring.style.display = 'none';
    if (step.duration) {
      _countdownStart = performance.now();
      if (ring) ring.style.display = 'block';
      _autoAdvanceTimer = setTimeout(() => _nextStep(), step.duration * 1000);
    }

    // Speak step out loud (ElevenLabs)
    _speakStep(step);
  }

  function _renderStep(idx, skipFade) {
    const card = _q('#cg-card'); if (!card) return;
    if (skipFade) { _applyStep(idx); }
    else { card.classList.add('cg-out'); setTimeout(() => _applyStep(idx), 155); }
  }

  // ── Final dish: load vegetable_soup.glb + fade out ingredients ────────────
  function _loadFinalDish() {
    // Fade out all ingredient meshes
    if (_meshes) {
      _meshes.forEach(m => {
        m.traverse(c => {
          if (c.material) {
            c.material = c.material.clone();
            c.material.transparent = true;
          }
        });
        let fade = 1;
        const fadeOut = () => {
          fade -= 0.04;
          m.traverse(c => { if (c.material) c.material.opacity = Math.max(0, fade); });
          if (fade > 0) requestAnimationFrame(fadeOut);
          else m.visible = false;
        };
        fadeOut();
      });
    }

    // Load the finished dish model (recipe-aware)
    const _isPof = _activeRecipeMeta?.name === 'Potato & Onion Fry';
    const _isRab = _activeRecipeMeta?.name === 'Rice & Beans';
    const _isBc  = _activeRecipeMeta?.name === 'Bean Chili';
    const _dishGlb = _isPof ? '/assets/3d/patato-onion-fry.glb'
      : _isRab ? '/assets/3d/rice-and-beans.glb'
      : _isBc  ? '/assets/3d/bean-chilli.glb' : '/assets/3d/vegetable_soup.glb';
    const soupLoader = new THREE.GLTFLoader();
    soupLoader.load(
      assetUrl(_dishGlb),
      (gltf) => {
        const soup = gltf.scene;
        soup.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

        // Scale to a reasonable counter size
        const box    = new THREE.Box3().setFromObject(soup);
        const size   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale  = 0.55 / maxDim;
        soup.scale.setScalar(0); // start invisible, grow in

        // Centre on cutting board
        box.setFromObject(soup);
        const centre = box.getCenter(new THREE.Vector3());
        soup.position.set(
          BOARD_CENTER.x - centre.x * scale,
          BOARD_Y       + 0.02,
          BOARD_CENTER.z - centre.z * scale
        );

        _scene.add(soup);
        _soupMesh = soup;

        // Grow the soup in over ~0.8s
        let t = 0;
        const targetScale = scale;
        const grow = () => {
          t = Math.min(t + 0.03, 1);
          const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
          soup.scale.setScalar(targetScale * ease);
          if (t < 1) requestAnimationFrame(grow);
        };
        grow();
      },
      undefined,
      (err) => console.warn('[CookingGuide] vegetable_soup.glb failed:', err)
    );
  }

  // ── Steam / smoke particle effect ─────────────────────────────────────────
  function _startSmokeEffect() {
    const positions  = new Float32Array(_SMOKE_COUNT * 3);
    const velocities = [];

    for (let i = 0; i < _SMOKE_COUNT; i++) {
      const spread = 0.22;
      positions[i * 3]     = BOARD_CENTER.x + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = BOARD_Y        + 0.12 + Math.random() * 0.6;
      positions[i * 3 + 2] = BOARD_CENTER.z + (Math.random() - 0.5) * spread;
      velocities.push({
        x:    (Math.random() - 0.5) * 0.0025,
        y:    0.004  + Math.random() * 0.004,
        z:    (Math.random() - 0.5) * 0.0025,
        life: Math.random(), // stagger start
      });
    }

    const geo     = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    geo.setAttribute('position', posAttr);

    const mat = new THREE.PointsMaterial({
      color:        0xEEDDCC,
      size:         0.09,
      sizeAttenuation: true,
      transparent:  true,
      opacity:      0.30,
      depthWrite:   false,
    });

    _smokePoints     = new THREE.Points(geo, mat);
    _smokePosAttr    = posAttr;
    _smokeVelocities = velocities;
    _scene.add(_smokePoints);
  }

  function _renderCompletion() {
    _clearLights();
    _setAllOpacity(1);
    _returnAllIngredients(true);
    _setAnimType('none', null);
    _chimeFinale();
    if (_spotGlow) _spotGlow.children.forEach(c => { if (c.material) c.material.opacity = 0; });

    // Load the finished soup and start smoke effect
    _loadFinalDish();
    _startSmokeEffect();

    const card = _q('#cg-card'); if (!card) return;
    card.classList.add('cg-out');
    setTimeout(() => {
      card.classList.remove('cg-out'); card.classList.add('cg-done');
      const _meta = _activeRecipeMeta || RECIPES['squash-stew'];
      const _subtitle = _meta.subtitle ? `<div class="cg-done-sub">${_meta.subtitle}</div>` : '';
      const _storyBtn = _meta.subtitle
        ? `<button class="cg-btn-story" id="cg-btn-story" style="pointer-events:auto">Hear the origin story &rarr;</button>`
        : '';
      card.innerHTML = `
<div class="cg-done-top">
  <div class="cg-done-title">${_meta.name} &mdash; complete</div>
  ${_subtitle}
</div>
<div class="cg-done-btns">
  ${_storyBtn}
  <button class="cg-btn-reset" id="cg-btn-reset" style="pointer-events:auto">Cook again</button>
</div>`;
      document.getElementById('cg-btn-reset').addEventListener('click', () => reset());
      const storyBtn = document.getElementById('cg-btn-story');
      if (storyBtn) storyBtn.addEventListener('click', () => {
        if (typeof window.launchElderStory === 'function') window.launchElderStory();
        else window.dispatchEvent(new CustomEvent('cookingguide:story'));
      });
    }, 155);
  }

  // ── Main animation loop ───────────────────────────────────────────────────
  function _tick(now) {
    _animId = requestAnimationFrame(_tick);
    const dt = Math.min((now - _lastFrame) / 1000, 0.1);
    _lastFrame = now;
    if (!_scene) return;

    const t = now / 1000;
    _animT += dt;

    // Process ingredient lerp animations (arc motion to board / back)
    _activeLerps = _activeLerps.filter(l => {
      l.t += dt / l.duration;
      const ease = _easeInOut(Math.min(l.t, 1));
      const arc  = Math.sin(Math.min(l.t, 1) * Math.PI) * 0.18; // arc height
      l.mesh.position.set(
        _lerp(l.from.x, l.to.x, ease),
        _lerp(l.from.y, l.to.y, ease) + arc,
        _lerp(l.from.z, l.to.z, ease)
      );
      return l.t < 1;
    });

    // Pulse ingredient lights
    _activeLights.forEach(({ light, startTime }) => {
      const el = (now - startTime) / 1000;
      const fi = Math.min(el / 0.38, 1);
      light.intensity = 2.4 * fi * (1 + 0.30 * Math.sin(t * 3.1));
    });

    // Spot glow pulse
    if (_spotGlow) {
      const step = _S()[_currentStep];
      const active = step ? step.activeIngredients : [];
      const m0 = active[0] ? _getMesh(active[0]) : null;
      if (m0) {
        // Glow tracks the ingredient as it moves (e.g. to the board)
        _spotGlow.position.set(m0.position.x, m0.position.y - 0.04, m0.position.z);
        const pulse = 0.08 + 0.055 * Math.sin(t * 2.7);
        _spotGlow.children.forEach(c => {
          if (!c.material) return;
          c.material.opacity = c.name === 'inner' ? pulse : pulse * 0.45;
        });
      }
    }

    // Per-animation tick
    const step = _S()[_currentStep];
    if (step) {
      const slot = step.activeIngredients[0];
      const ingM = slot ? _getMesh(slot) : null;
      const base = ingM ? ingM.position : null;

      switch (_animType) {
        case 'chop':        _tickChop(dt); break;
        case 'pour':        _tickChop(dt); break;
        case 'boil':        break; // Step5Boil ticks below (persistent)
        case 'add_veggies': if (typeof Step6Veggies !== 'undefined') Step6Veggies.tick(dt); break;
        case 'add_beans_corn': if (typeof Step7BeansCorn !== 'undefined') Step7BeansCorn.tick(dt); break;
        case 'stir_finish': if (!_chopWaiting && typeof Step8Stir !== 'undefined') Step8Stir.tick(dt); break;
        case 'bc_step':  if (!_chopWaiting && typeof BeanChiliSteps !== 'undefined') BeanChiliSteps.tick(dt); break;
        case 'rab_step': if (!_chopWaiting && typeof RiceBeansSteps !== 'undefined') RiceBeansSteps.tick(dt); break;
        case 'pof_step': if (!_chopWaiting && typeof PotatoFrySteps !== 'undefined') PotatoFrySteps.tick(dt); break;
        case 'stir': { const _sb = base || (_potMesh ? _potMesh.position : null); if (_sb) _tickStir(dt, _sb); break; }
        default:        if (base) _tickAllParticles(dt, base, now); break;
      }
    }

    // Persistent boiling steam (ticks regardless of current step)
    if (typeof Step5Boil !== 'undefined') Step5Boil.tick(dt);

    // Countdown ring
    if (_countdownStart !== null) {
      const s = _S()[_currentStep];
      if (s && s.duration) {
        const p = Math.min((now - _countdownStart) / 1000 / s.duration, 1);
        const c = _q('#cg-ring-c');
        if (c) c.style.strokeDashoffset = (86 * (1 - p)).toFixed(2);
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _lerp(a, b, t)  { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  function _q(sel)         { return _overlayEl ? _overlayEl.querySelector(sel) : document.querySelector(sel); }
  function _set(id, v)     { const el = _q('#' + id); if (el) el.textContent = v || ''; }

  // ── Public API ────────────────────────────────────────────────────────────
  function init(scene, camera, renderer, meshes, recipeId) {
    destroy();
    _scene = scene; _camera = camera; _renderer = renderer;
    _meshes = meshes || []; _currentStep = 0; _initialized = true;

    // Select recipe
    const recipe = RECIPES[recipeId] || RECIPES['squash-stew'];
    _activeSteps = recipe.steps;
    _activeRecipeMeta = recipe;

    _buildCuttingBoard();
    _buildOrangePile();
    _buildDicedOnions();
    _buildMincedGarlic();
    _buildPot();
    _buildStew();
    _buildKnife();
    _buildSpoon();
    _buildSpotGlow();
    _buildOverlay();
    if (typeof Step1Chop !== 'undefined') Step1Chop.init(_scene);
    if (typeof Step2Chop !== 'undefined') Step2Chop.init(_scene);
    if (typeof Step3Garlic !== 'undefined') Step3Garlic.init(_scene);
    if (typeof Step4Stock !== 'undefined') Step4Stock.init(_scene);
    if (typeof Step5Boil !== 'undefined') Step5Boil.init(_scene);
    if (typeof Step6Veggies !== 'undefined') Step6Veggies.init(_scene);
    if (typeof Step7BeansCorn !== 'undefined') Step7BeansCorn.init(_scene);
    if (typeof Step8Stir !== 'undefined') Step8Stir.init(_scene);
    if (typeof BeanChiliSteps !== 'undefined') BeanChiliSteps.init(_scene);
    if (typeof RiceBeansSteps !== 'undefined') RiceBeansSteps.init(_scene);
    if (typeof PotatoFrySteps !== 'undefined') PotatoFrySteps.init(_scene);
    _renderStep(0, true);
    _chime();

    _lastFrame = performance.now();
    _animId = requestAnimationFrame(_tick);
    console.log('[CookingGuide] ready —', _meshes.length, 'meshes, cutting board placed at', BOARD_CENTER);
  }

  function goToStep(n) {
    _currentStep = Math.max(0, Math.min(n, _S().length - 1));
    _renderStep(_currentStep); _chime();
  }

  function _lockNext() {
    _nextReady = false;
    const btn = _q('#cg-btn-next');
    if (btn) btn.classList.add('cg-btn-next--locked');
  }

  function _unlockNext() {
    _nextReady = true;
    const btn = _q('#cg-btn-next');
    if (btn) btn.classList.remove('cg-btn-next--locked');
  }

  function _nextStep() {
    if (!_nextReady) return;
    if (_currentStep >= _S().length - 1) _renderCompletion();
    else { _currentStep++; _renderStep(_currentStep); _chime(); }
  }

  function next() { _nextStep(); }

  function prev() {
    if (_currentStep <= 0) return;
    _currentStep--; _renderStep(_currentStep); _chime();
  }

  function reset() {
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_stepAudio) { _stepAudio.pause(); _stepAudio = null; }
    _clearLights(); _returnAllIngredients(true); _setAnimType('none', null);
    _removeStartBtn(); _chopWaiting = false;
    if (typeof Step5Boil !== 'undefined') Step5Boil.cleanup();
    if (typeof Step6Veggies !== 'undefined') Step6Veggies.cleanup();
    if (typeof Step7BeansCorn !== 'undefined') Step7BeansCorn.cleanup();
    if (typeof Step8Stir !== 'undefined') Step8Stir.cleanup();
    if (typeof BeanChiliSteps !== 'undefined') BeanChiliSteps.cleanup();
    if (typeof RiceBeansSteps !== 'undefined') RiceBeansSteps.cleanup();
    if (typeof PotatoFrySteps !== 'undefined') PotatoFrySteps.cleanup();
    if (_stewMesh) { _stewMesh.visible = false; _stewMesh.scale.setScalar(0.001); }
    if (_potMesh) _potMesh.visible = false;
    _currentStep = 0; _countdownStart = null;
    _destroyOverlay(); _buildOverlay();
    _renderStep(0, true); _chime();
  }

  function destroy() {
    if (!_initialized) return;
    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_stepAudio) { _stepAudio.pause(); _stepAudio = null; }
    _clearLights(); _clearParticles(); _returnAllIngredients(true);
    _removeStartBtn(); _chopWaiting = false;
    if (typeof Step1Chop !== 'undefined') Step1Chop.destroy();
    if (typeof Step2Chop !== 'undefined') Step2Chop.destroy();
    if (typeof Step3Garlic !== 'undefined') Step3Garlic.destroy();
    if (typeof Step4Stock !== 'undefined') Step4Stock.destroy();
    if (typeof Step5Boil !== 'undefined') Step5Boil.destroy();
    if (typeof Step6Veggies !== 'undefined') Step6Veggies.destroy();
    if (typeof Step7BeansCorn !== 'undefined') Step7BeansCorn.destroy();
    if (typeof Step8Stir !== 'undefined') Step8Stir.destroy();
    if (typeof BeanChiliSteps !== 'undefined') BeanChiliSteps.destroy();
    if (typeof RiceBeansSteps !== 'undefined') RiceBeansSteps.destroy();
    if (typeof PotatoFrySteps !== 'undefined') PotatoFrySteps.destroy();
    _destroyOverlay();

    [_cuttingBoard, _knifeGroup, _spoonGroup, _spotGlow].forEach(obj => {
      if (!obj) return;
      _scene.remove(obj);
      // Remove board from selectable meshes
      if (obj === _cuttingBoard && _meshes) {
        const idx = _meshes.indexOf(obj);
        if (idx !== -1) _meshes.splice(idx, 1);
      }
      obj.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    });
    _cuttingBoard = _knifeGroup = _spoonGroup = _spotGlow = _dicedOnionsMesh = _mincedGarlicMesh = _potMesh = _stewMesh = null;

    // Clean up soup & smoke
    if (_soupMesh)    { _scene && _scene.remove(_soupMesh);    _soupMesh    = null; }
    if (_smokePoints) { _scene && _scene.remove(_smokePoints); _smokePoints = null; }
    _smokePosAttr = null; _smokeVelocities = null;

    if (_audioCtx) { try { _audioCtx.close(); } catch (_) {} _audioCtx = null; }
    _scene = _camera = _renderer = _meshes = null;
    _currentStep = 0; _initialized = false; _isXR = false;
    _activeSteps = RECIPES['squash-stew'].steps;
    _activeRecipeMeta = RECIPES['squash-stew'];
    _animType = 'none'; _activeLerps = []; _origPositions = {};
    console.log('[CookingGuide] destroyed');
  }

  function setXRActive(v) { _isXR = !!v; }

  return { init, goToStep, next, prev, reset, destroy, setXRActive };
})();

window.CookingGuide = CookingGuide;
