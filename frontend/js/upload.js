/* global AkiApp, AkiRender, escapeHtml */
'use strict';

/**
 * upload.js — handles file selection + POST /api/upload
 * Works with the new 8-screen UI via AkiApp.goTo() and AkiRender.*
 */
(() => {
  let _fileInput  = null;
  let _uploadData = null; // last successful response

  // ── Progress steps ─────────────────────────────────────────────────────────
  const STEPS = ['pstep-1','pstep-2','pstep-3'];

  function setStep(index) {
    STEPS.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('aki-progress__step--active','aki-progress__step--done');
      if (i < index)  el.classList.add('aki-progress__step--done');
      if (i === index) el.classList.add('aki-progress__step--active');
      const spinner = el.querySelector('.spinner');
      if (spinner) spinner.classList.toggle('spinner--faint', i !== index);
    });
  }

  function showProgress(visible) {
    const zone  = document.getElementById('upload-zone');
    const prog  = document.getElementById('upload-progress');
    const or    = document.querySelector('.or-divider');
    const cam   = document.getElementById('btn-camera-roll');
    if (zone) zone.style.display  = visible ? 'none' : '';
    if (prog) prog.style.display  = visible ? ''     : 'none';
    if (or)   or.style.display    = visible ? 'none' : '';
    if (cam)  cam.style.display   = visible ? 'none' : '';
  }

  function showError(message) {
    const el = document.getElementById('upload-error');
    if (!el) return;
    el.textContent   = message;
    el.style.display = message ? '' : 'none';
    showProgress(false);
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  async function doUpload(file) {
    showError('');
    showProgress(true);
    setStep(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      setStep(1);
      await new Promise(r => setTimeout(r, 100));

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);

      setStep(2);
      await new Promise(r => setTimeout(r, 80));

      _uploadData = data;
      AkiApp.state.uploadData = data;

      // Populate all downstream screens
      showProgress(false);
      AkiRender.renderDetection(data, file);
      AkiRender.renderRecipe(data);
      AkiRender.renderStory(data);
      AkiRender.renderWord(data);

      // Navigate to detection result
      AkiApp.goTo('detect');

    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }

  // ── Wire upload zone (click + drag-drop) ──────────────────────────────────
  function initUploadZone() {
    const zone = document.getElementById('upload-zone');
    if (!zone) return;

    zone.addEventListener('click', () => _fileInput?.click());

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files?.[0];
      if (file) doUpload(file);
    });
  }

  // ── Wire camera roll button ────────────────────────────────────────────────
  function initCameraRoll() {
    document.getElementById('btn-camera-roll')?.addEventListener('click', () => {
      _fileInput?.click();
    });
  }

  // ── Wire hidden file input ────────────────────────────────────────────────
  function initFileInput() {
    _fileInput = document.getElementById('file-input');
    if (!_fileInput) return;
    _fileInput.addEventListener('change', () => {
      const file = _fileInput.files?.[0];
      if (file) {
        doUpload(file);
        _fileInput.value = ''; // reset so same file can be re-selected
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initFileInput();
    initUploadZone();
    initCameraRoll();
  });

})();
