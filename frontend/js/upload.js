document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const resultEl = document.getElementById('result');
  resultEl.innerHTML = 'Uploading…';
  resultEl.className = '';

  const formData = new FormData();
  formData.append('file', document.getElementById('file').files[0]);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    resultEl.className = 'url';
    resultEl.innerHTML = renderAnalysis(data);
  } catch (err) {
    resultEl.className = 'error';
    resultEl.textContent = err.message;
  }
});