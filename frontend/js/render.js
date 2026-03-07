function renderAnalysis(data) {
  let html = `URL: <a href="${escapeHtml(data.url)}" target="_blank">${escapeHtml(data.url)}</a>`;

  if (data.analysis) {
    html += renderGeminiAnalysis(data.analysis);
  }

  if (data.contentAnalysis) {
    html += renderContentAnalysis(data.contentAnalysis);
  }

  if (data.boundingBoxes?.length) {
    html += renderBoundingBoxes(data.boundingBoxes);
  }

  html += renderRawResponse(data);

  if (data.analysisError) {
    html += `<p class="error" style="margin-top:0.5rem;">Analysis: ${escapeHtml(data.analysisError)}</p>`;
  }

  return html;
}

function renderGeminiAnalysis(a) {
  let html = '<div class="analysis"><h2>Analysis</h2>';
  if (a.summary) html += `<p><strong>Summary:</strong> ${escapeHtml(a.summary)}</p>`;
  if (a.keyEvents?.length) html += renderList('Key events', a.keyEvents);
  if (a.timestamps?.length) {
    html += '<p><strong>Timestamps:</strong></p><ul>'
      + a.timestamps.map(t => `<li>${escapeHtml(t.time || '')} – ${escapeHtml(t.description || '')}</li>`).join('')
      + '</ul>';
  }
  if (a.detectedObjects?.length) html += renderList('Detected', a.detectedObjects);
  if (a.notableActions?.length) html += renderList('Notable actions', a.notableActions);
  html += '</div>';
  return html;
}

function renderContentAnalysis(c) {
  let html = '<div class="analysis analysis--stacked"><h2>Content analysis (LVIS ingredients &amp; scene)</h2>';
  if (c.error) {
    html += `<p class="error">${escapeHtml(c.error)}</p>`;
  } else {
    if (c.foodDetected?.length) html += `<p><strong>Detected ingredients &amp; items:</strong> ${escapeHtml(c.foodDetected.join(', '))}</p>`;
    if (c.caption) html += `<p><strong>Description:</strong> ${escapeHtml(c.caption)}</p>`;
    if (!c.foodDetected?.length && !c.caption) html += '<p>No ingredients or caption returned.</p>';
  }
  html += '</div>';
  return html;
}

function renderBoundingBoxes(boxes) {
  let html = '<div class="analysis analysis--stacked"><h2>Bounding Boxes (LVIS)</h2><ul>';
  for (const box of boxes) {
    html += '<li><strong>' + escapeHtml(box.name) + '</strong>'
      + ` (${(box.confidence * 100).toFixed(1)}%)`
      + ` [x:${box.x.toFixed(1)} y:${box.y.toFixed(1)} w:${box.w.toFixed(1)} h:${box.h.toFixed(1)}]`
      + (box.categories?.length ? ' — ' + escapeHtml(box.categories.join(', ')) : '')
      + '</li>';
  }
  html += '</ul></div>';
  return html;
}

function renderRawResponse(data) {
  return '<div class="analysis analysis--stacked">'
    + '<h2>Full API Response</h2>'
    + '<pre style="white-space:pre-wrap;word-break:break-all;font-size:0.75rem;max-height:400px;overflow:auto;">'
    + escapeHtml(JSON.stringify(data, null, 2))
    + '</pre></div>';
}

function renderList(title, items) {
  return `<p><strong>${title}:</strong></p><ul>`
    + items.map(item => `<li>${escapeHtml(item)}</li>`).join('')
    + '</ul>';
}