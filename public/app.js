/* global state */
let authToken = null;
let currentArtworks = [];
let currentEditId = null;

/* ====== SPA ROUTING ====== */
function route() {
  showView(window.location.pathname === '/admin' ? 'admin' : 'scanner');
}
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  document.getElementById('view-' + name).hidden = false;
  if (name === 'admin' && isAuthenticated()) initAdmin();
}
window.addEventListener('popstate', route);

/* ====== AUTH ====== */
function getAuthHeaders() {
  return authToken ? { 'Authorization': 'Basic ' + authToken } : {};
}
function isAuthenticated() { return !!authToken; }
function setAuth(user, pass) {
  authToken = btoa(user + ':' + pass);
  localStorage.setItem('artwork_auth', authToken);
}
function clearAuth() {
  authToken = null;
  localStorage.removeItem('artwork_auth');
}

// Restore auth from localStorage
const savedAuth = localStorage.getItem('artwork_auth');
if (savedAuth) authToken = savedAuth;

document.addEventListener('DOMContentLoaded', () => {
  route();
  if (isAuthenticated()) {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('admin-content').classList.remove('hidden');
    initAdmin();
  }
});

/* ====== LOGIN ====== */
document.getElementById('auth-btn').addEventListener('click', async () => {
  const user = document.getElementById('auth-user').value;
  const pass = document.getElementById('auth-pass').value;
  const token = btoa(user + ':' + pass);

  try {
    const r = await fetch('/api/artworks', { headers: { 'Authorization': 'Basic ' + token } });
    if (r.ok) {
      setAuth(user, pass);
      document.getElementById('auth-section').classList.add('hidden');
      document.getElementById('admin-content').classList.remove('hidden');
      document.getElementById('auth-error').classList.add('hidden');
      initAdmin();
    } else {
      document.getElementById('auth-error').textContent = 'Falsche Zugangsdaten';
      document.getElementById('auth-error').classList.remove('hidden');
    }
  } catch { location.reload(); }
});

// Enter key submits login
document.getElementById('auth-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('auth-btn').click();
});

document.getElementById('logout-btn').addEventListener('click', () => {
  clearAuth();
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('admin-content').classList.add('hidden');
});

/* ====== TABS ====== */
document.querySelectorAll('.nav-link[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

/* ====== ADMIN INIT ====== */
async function initAdmin() {
  await loadArtworks();
  updateStats();
}

async function loadArtworks() {
  try {
    const r = await fetch('/api/artworks');
    currentArtworks = await r.json();
    renderArtworkGrid();
    document.getElementById('compile-count').textContent = currentArtworks.length + ' Werke';
  } catch { /* silent */ }
}

function updateStats() {
  document.getElementById('stat-count').textContent = currentArtworks.length;
  document.getElementById('stat-compiled').textContent = currentArtworks.length > 0 ? 'Bereit' : 'Nein';
}

/* ====== ARTWORK GRID ====== */
function renderArtworkGrid() {
  const grid = document.getElementById('artwork-grid');
  if (currentArtworks.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">Noch keine Kunstwerke. Füge das erste hinzu.</p>';
    return;
  }
  grid.innerHTML = currentArtworks.map(a => `
    <div class="artwork-card" data-id="${a.id}">
      <img src="/data/images/${a.imageFile}" alt="${escapeHtml(a.title)}" loading="lazy">
      <div class="artwork-card-body">
        <h4>${escapeHtml(a.title)}</h4>
        <div class="artist-name">${escapeHtml(a.artist)}</div>
        <div class="artwork-actions">
          <button class="btn btn-secondary" onclick="editArtwork('${a.id}')">Bearbeiten</button>
          <button class="btn btn-ghost" onclick="deleteArtwork('${a.id}')" style="color:var(--danger)">Löschen</button>
        </div>
      </div>
    </div>
  `).join('');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

/* ====== UPLOAD AREA ====== */
const uploadArea = document.getElementById('upload-area');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const previewRemove = document.getElementById('preview-remove');

uploadArea.addEventListener('click', () => imageInput.click());
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleImageFile(e.dataTransfer.files[0]);
});
imageInput.addEventListener('change', () => {
  if (imageInput.files.length) handleImageFile(imageInput.files[0]);
});
previewRemove.addEventListener('click', e => {
  e.stopPropagation();
  clearImagePreview();
});

function handleImageFile(file) {
  if (!file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    imagePreview.src = e.target.result;
    imagePreview.classList.remove('hidden');
    uploadPlaceholder.classList.add('hidden');
    previewRemove.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearImagePreview() {
  imagePreview.src = '';
  imagePreview.classList.add('hidden');
  uploadPlaceholder.classList.remove('hidden');
  previewRemove.classList.add('hidden');
  imageInput.value = '';
}

/* ====== ADD ARTWORK ====== */
document.getElementById('add-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('add-submit');
  const result = document.getElementById('add-result');
  btn.disabled = true;
  btn.textContent = 'Wird hinzugefügt...';
  result.className = 'result-msg hidden';

  const title = document.getElementById('title-input').value.trim();
  const artist = document.getElementById('artist-input').value.trim();
  if (!title || !artist) {
    result.textContent = 'Titel und Künstler sind Pflichtfelder';
    result.className = 'result-msg error';
    btn.disabled = false;
    btn.textContent = 'Werk hinzufügen';
    return;
  }

  const formData = new FormData();
  if (imageInput.files.length) formData.append('image', imageInput.files[0]);
  formData.append('metadata', JSON.stringify({
    title, artist,
    year: document.getElementById('year-input').value ? parseInt(document.getElementById('year-input').value) : null,
    medium: document.getElementById('medium-input').value,
    dimensions: document.getElementById('dimensions-input').value,
    description: document.getElementById('description-input').value,
  }));

  try {
    const r = await fetch('/api/artworks', { method: 'POST', headers: getAuthHeaders(), body: formData });
    const data = await r.json();
    if (r.ok) {
      result.textContent = '✅ Werk erfolgreich hinzugefügt! Jetzt targets.mind generieren.';
      result.className = 'result-msg success';
      document.getElementById('add-form').reset();
      clearImagePreview();
      await loadArtworks();
      updateStats();
    } else {
      result.textContent = '❌ ' + (data.error || 'Fehler beim Hinzufügen');
      result.className = 'result-msg error';
    }
  } catch (err) {
    result.textContent = '❌ Verbindungsfehler: ' + err.message;
    result.className = 'result-msg error';
  }
  btn.disabled = false;
  btn.textContent = 'Werk hinzufügen';
});

/* ====== EDIT ARTWORK ====== */
function editArtwork(id) {
  const a = currentArtworks.find(w => w.id === id);
  if (!a) return;
  currentEditId = id;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-card">
      <h3>Werk bearbeiten: ${escapeHtml(a.title)}</h3>
      <div class="form-grid">
        <div class="input-group">
          <input type="text" id="edit-title" value="${escapeHtml(a.title)}" required>
          <label>Titel</label>
        </div>
        <div class="input-group">
          <input type="text" id="edit-artist" value="${escapeHtml(a.artist)}" required>
          <label>Künstler</label>
        </div>
        <div class="input-group">
          <input type="number" id="edit-year" value="${a.year || ''}">
          <label>Jahr</label>
        </div>
        <div class="input-group">
          <input type="text" id="edit-medium" value="${escapeHtml(a.medium)}">
          <label>Medium</label>
        </div>
        <div class="input-group input-full">
          <input type="text" id="edit-dimensions" value="${escapeHtml(a.dimensions)}">
          <label>Maße</label>
        </div>
        <div class="input-group input-full">
          <textarea id="edit-description" rows="3">${escapeHtml(a.description)}</textarea>
          <label>Beschreibung</label>
        </div>
      </div>
      <div class="input-group">
        <input type="file" id="edit-image" accept="image/*">
        <label>Neues Bild (optional)</label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="edit-save-btn">Speichern</button>
        <button class="btn btn-ghost" id="edit-cancel-btn">Abbrechen</button>
      </div>
      <p id="edit-result" class="result-msg hidden"></p>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('edit-save-btn').addEventListener('click', async () => {
    const btn = document.getElementById('edit-save-btn');
    const result = document.getElementById('edit-result');
    btn.disabled = true;
    btn.textContent = 'Speichern...';
    result.className = 'result-msg hidden';

    const formData = new FormData();
    const imgInput = document.getElementById('edit-image');
    if (imgInput.files.length) formData.append('image', imgInput.files[0]);
    formData.append('metadata', JSON.stringify({
      title: document.getElementById('edit-title').value,
      artist: document.getElementById('edit-artist').value,
      year: document.getElementById('edit-year').value ? parseInt(document.getElementById('edit-year').value) : null,
      medium: document.getElementById('edit-medium').value,
      dimensions: document.getElementById('edit-dimensions').value,
      description: document.getElementById('edit-description').value,
    }));

    try {
      const r = await fetch('/api/artworks/' + id, { method: 'PUT', headers: getAuthHeaders(), body: formData });
      const data = await r.json();
      if (r.ok) {
        result.textContent = '✅ Gespeichert';
        result.className = 'result-msg success';
        modal.remove();
        await loadArtworks();
      } else {
        result.textContent = '❌ ' + (data.error || 'Fehler');
        result.className = 'result-msg error';
      }
    } catch { result.textContent = '❌ Fehler'; result.className = 'result-msg error'; }
    btn.disabled = false;
    btn.textContent = 'Speichern';
  });

  document.getElementById('edit-cancel-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* ====== DELETE ARTWORK ====== */
async function deleteArtwork(id) {
  const a = currentArtworks.find(w => w.id === id);
  if (!confirm(`"${a.title}" unwiderruflich löschen?\n\nNach dem Löschen muss targets.mind neu generiert werden.`)) return;

  try {
    const r = await fetch('/api/artworks/' + id, { method: 'DELETE', headers: getAuthHeaders() });
    if (r.ok) {
      await loadArtworks();
      updateStats();
    }
  } catch { /* silent */ }
}

/* ====== COMPILE TARGETS ====== */
document.getElementById('compile-btn').addEventListener('click', doCompile);

async function doCompile() {
  const result = document.getElementById('compile-result');
  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const btn = document.getElementById('compile-btn');

  if (currentArtworks.length === 0) {
    result.className = 'result-msg error';
    result.textContent = '❌ Keine Werke zum Kompilieren vorhanden';
    result.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Kompiliere...';
  result.className = 'result-msg hidden';
  progressContainer.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';

  try {
    // Load images in mindIndex order
    const sorted = [...currentArtworks].sort((a, b) => a.mindIndex - b.mindIndex);
    const images = await Promise.all(sorted.map(a => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject('Fehler beim Laden: ' + a.imageFile);
      img.src = '/data/images/' + a.imageFile;
    })));

    const compiler = new window.MINDAR.IMAGE.Compiler();
    await compiler.compileImageTargets(images, pct => {
      const p = Math.round(pct * 100);
      progressFill.style.width = p + '%';
      progressText.textContent = p + '%';
    });

    const buffer = await compiler.exportData();

    const r = await fetch('/api/targets', {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/octet-stream' },
      body: buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
    });

    const data = await r.json();
    if (r.ok) {
      result.className = 'result-msg success';
      result.textContent = `✅ targets.mind erfolgreich generiert (${(data.size/1024).toFixed(1)} KB) — Scanner erkennt jetzt alle Werke!`;
    } else {
      result.className = 'result-msg error';
      result.textContent = '❌ Fehler beim Speichern: ' + (data.error || 'Unbekannt');
    }
  } catch (e) {
    result.className = 'result-msg error';
    result.textContent = '❌ Fehler: ' + e.message;
  }

  progressFill.style.width = '100%';
  progressText.textContent = '100%';
  btn.disabled = false;
  btn.textContent = 'targets.mind generieren';
}

/* ====== SCANNER ====== */
document.getElementById('start-btn').addEventListener('click', async () => {
  const scene = document.getElementById('scene');
  const startOverlay = document.getElementById('start-overlay');

  try {
    // Request camera permission
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    stream.getTracks().forEach(t => t.stop());

    startOverlay.classList.add('hidden');
    document.getElementById('permission-overlay').classList.add('hidden');
    scene.components['mindar-image'].startAR();
    document.getElementById('scan-status').classList.remove('hidden');

    // Check for targets
    setTimeout(() => {
      fetch('/data/targets.mind', { method: 'HEAD' }).then(r => {
        if (!r.ok) {
          document.getElementById('no-targets').classList.remove('hidden');
          document.getElementById('scan-status').classList.add('hidden');
        }
      }).catch(() => {});
    }, 2000);
  } catch (err) {
    startOverlay.classList.add('hidden');
    document.getElementById('permission-overlay').classList.remove('hidden');
  }
});

document.getElementById('permission-retry-btn').addEventListener('click', () => {
  document.getElementById('start-btn').click();
});

// Attach targets from API
fetch('/api/artworks').then(r => r.json()).then(artworks => {
  const scene = document.getElementById('scene');
  artworks.forEach(artwork => {
    const entity = document.createElement('a-entity');
    entity.setAttribute('mindar-image-target', `targetIndex: ${artwork.mindIndex}`);
    entity.addEventListener('targetFound', () => showInfo(artwork));
    scene.appendChild(entity);
  });
}).catch(() => {});

function showInfo(artwork) {
  document.getElementById('scan-status').classList.add('hidden');
  document.getElementById('info-title').textContent = artwork.title;
  document.getElementById('info-artist').textContent = artwork.artist;
  document.getElementById('info-year').textContent = artwork.year || '';
  document.getElementById('info-medium').textContent = artwork.medium || '';
  document.getElementById('info-dimensions').textContent = artwork.dimensions || '';
  document.getElementById('info-description').textContent = artwork.description || '';
  document.getElementById('info-panel').classList.remove('hidden');
}

document.getElementById('close-info').addEventListener('click', () => {
  document.getElementById('info-panel').classList.add('hidden');
  document.getElementById('scan-status').classList.remove('hidden');
});
