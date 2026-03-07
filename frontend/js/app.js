/* global CookingAR */
'use strict';

/**
 * app.js — Aki screen navigation + app-level state machine
 *
 * Screens:  splash → nation → upload → detect → recipe → ar → story → word
 * State is kept in AkiApp.state. All screens read from and write to this.
 */
const AkiApp = (() => {
  // ── App state ──────────────────────────────────────────────────────────────
  const state = {
    selectedNation: 'Anishinaabe',
    uploadData:     null,   // raw API response from /api/upload
    activeRecipe:   null,   // { recipe, score, matchedIngredients }
    currentScreen:  'splash',
  };

  // ── Screen map ─────────────────────────────────────────────────────────────
  const SCREENS = ['splash','nation','upload','detect','recipe','ar','story','word'];

  // Screens that show the bottom nav
  const NAV_SCREENS = new Set(['upload','detect','recipe','ar','story','word']);

  // ── Navigate ───────────────────────────────────────────────────────────────
  function goTo(screenName) {
    if (!SCREENS.includes(screenName)) return;

    const prev = document.querySelector('.screen.screen--active');
    if (prev) {
      prev.classList.remove('screen--active');
      prev.classList.add('screen--exit');
      setTimeout(() => prev.classList.remove('screen--exit'), 400);
    }

    const next = document.querySelector(`[data-screen="${screenName}"]`);
    if (next) {
      next.classList.add('screen--active');
      // Scroll to top of new screen
      next.scrollTop = 0;
    }

    state.currentScreen = screenName;

    // Bottom nav visibility
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.style.display = NAV_SCREENS.has(screenName) ? 'flex' : 'none';

    // Update bottom nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.nav === screenName);
    });

    // Screen-specific side effects
    if (screenName === 'ar') _onShowAR();
    if (screenName === 'ar') return; // CookingAR already mounted by renderDetection
  }

  // ── AR: ensure CookingAR is mounted when AR screen is shown ───────────────
  function _onShowAR() {
    const viewport = document.getElementById('ar-viewport');
    const img      = document.getElementById('detect-img');
    if (!viewport || !img || !state.uploadData) return;

    const data = state.uploadData;

    // Pick best detection
    let detection = null;
    if (data.boundingBoxes?.length) detection = data.boundingBoxes[0];
    if (!detection) {
      const foods = data.contentAnalysis?.foodDetected;
      const first = Array.isArray(foods) && foods.length
        ? (typeof foods[0] === 'object' ? foods[0].label : foods[0]) : null;
      if (first) detection = { name: first, x: 0.1, y: 0.1, w: 0.8, h: 0.8, confidence: 1 };
    }
    if (!detection) {
      const obj = data.analysis?.detectedObjects?.[0] || 'ingredient';
      detection = { name: obj, x: 0.1, y: 0.1, w: 0.8, h: 0.8, confidence: 1 };
    }

    const contextData = data.analysis ? {
      indigenousContext: data.analysis.indigenousContext || null,
      recipes:           data.analysis.recipes           || [],
      nutritionNotes:    data.analysis.nutritionNotes    || null,
    } : null;

    if (window.CookingAR) CookingAR.mount(viewport, img, detection, contextData);

    // Update AR card label
    const label = document.getElementById('ar-step-label');
    const text  = document.getElementById('ar-step-text');
    if (label) label.textContent = `Storyboard — ${detection.name}`;
    if (text)  text.textContent  = 'Watch the 4-scene storyboard: Arrival → Reveal → Preparation → Story.';
    viewport.classList.add('ar-ready');
  }

  // ── Nation selection ───────────────────────────────────────────────────────
  function initNationGrid() {
    const grid = document.getElementById('nation-grid');
    if (!grid) return;
    grid.addEventListener('click', e => {
      const card = e.target.closest('.nation-card');
      if (!card) return;
      grid.querySelectorAll('.nation-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedNation = card.dataset.nation || 'All';
    });
  }

  // ── Bottom nav clicks ──────────────────────────────────────────────────────
  function initBottomNav() {
    document.querySelectorAll('.nav-item[data-nav]').forEach(item => {
      item.addEventListener('click', () => {
        const target = item.dataset.nav;
        // Only allow nav to screens we've visited (have data for)
        if (target === 'recipe' && !state.uploadData) { goTo('upload'); return; }
        if (target === 'story'  && !state.uploadData) { goTo('upload'); return; }
        if (target === 'ar'     && !state.uploadData) { goTo('upload'); return; }
        goTo(target);
      });
    });
  }

  // ── Wire all static buttons ────────────────────────────────────────────────
  function initButtons() {
    // Splash
    $('btn-start-scan')?.addEventListener('click', () => goTo('nation'));
    $('btn-explore-recipes')?.addEventListener('click', () => goTo('recipe'));

    // Nation
    $('btn-nation-continue')?.addEventListener('click', () => goTo('upload'));
    $('btn-nation-skip')?.addEventListener('click',     () => {
      state.selectedNation = 'All';
      goTo('upload');
    });

    // Detection
    $('btn-find-recipes')?.addEventListener('click', () => goTo('recipe'));
    $('btn-scan-more')?.addEventListener('click', () => {
      if (window.CookingAR) CookingAR.unmount();
      goTo('upload');
    });

    // AR
    $('ar-btn-back')?.addEventListener('click', () => {
      if (window.CookingAR) CookingAR.unmount();
      goTo('recipe');
    });
    $('ar-btn-story')?.addEventListener('click', () => goTo('story'));

    // Word screen
    $('btn-word-scan')?.addEventListener('click', () => {
      if (window.CookingAR) CookingAR.unmount();
      goTo('upload');
    });
  }

  // ── TTS helper — plays audio from /api/story or ElevenLabs ────────────────
  async function speakText(text, audioEl) {
    if (!text || !audioEl) return;
    try {
      const res = await fetch('/api/story/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      audioEl.src = URL.createObjectURL(blob);
      audioEl.play();
    } catch (e) {
      console.log('[AkiApp] TTS not available:', e.message);
    }
  }

  // ── Wire audio chips ───────────────────────────────────────────────────────
  function initAudioChips() {
    // Detection screen: hear Ojibwe name
    $('audio-chip')?.addEventListener('click', () => {
      const ojibwe = $('detect-ojibwe')?.textContent?.trim();
      if (ojibwe && ojibwe !== '–') speakText(ojibwe, $('detect-audio'));
    });

    // Story screen
    $('story-play-btn')?.addEventListener('click', () => {
      const body = $('story-body')?.textContent?.trim();
      if (body) speakText(body, $('story-audio'));
    });

    // Word screen
    $('word-play-btn')?.addEventListener('click', () => {
      const word = $('word-ojibwe')?.textContent?.trim();
      if (word && word !== '–') speakText(word, $('word-audio'));
    });
  }

  // ── Ingredient row click: hear Ojibwe name ─────────────────────────────────
  function initIngredientTap() {
    document.getElementById('recipe-ingredients')?.addEventListener('click', e => {
      const row  = e.target.closest('.ingredient-row');
      if (!row)  return;
      const name = row.querySelector('.ingredient-ojibwe')?.textContent?.trim();
      if (name)  speakText(name, $('detect-audio'));
    });
  }

  // ── Step "Watch in AR" buttons ────────────────────────────────────────────
  function initARStepBtns() {
    document.getElementById('recipe-steps')?.addEventListener('click', e => {
      if (e.target.closest('.step-ar-btn')) goTo('ar');
    });
  }

  // ── Utility ────────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    initNationGrid();
    initBottomNav();
    initButtons();
    initAudioChips();
    initIngredientTap();
    initARStepBtns();

    // Hide bottom nav on start
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.style.display = 'none';

    // Start on splash
    goTo('splash');
  }

  // Wait for DOM
  document.addEventListener('DOMContentLoaded', init);

  return { goTo, state, speakText };
})();
