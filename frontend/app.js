/* =========================================================================
 * AI Photo Search - frontend logic
 * Cloud Computing Spring 2026 - Assignment 3
 * ========================================================================= */

(() => {
  'use strict';

  // ----- Config ------------------------------------------------------------
  const CONFIG = {
    API_BASE: 'https://uqssgiub6b.execute-api.us-east-1.amazonaws.com/v1',
    API_KEY: 'inDVxT8xRA2Pieh65WK9F1VrNzpLtsl6fVQrS006',
  };

  // ----- SDK client (API Gateway generated SDK) ----------------------------
  // Used for GET /search. Upload keeps raw fetch to guarantee binary passthrough.
  const apigClient = apigClientFactory.newClient({ apiKey: CONFIG.API_KEY });

  // ----- DOM refs ----------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const dropzone = $('dropzone');
  const dropzoneInner = $('dropzoneInner');
  const fileInput = $('fileInput');
  const previewImg = $('previewImg');
  const labelsInput = $('labelsInput');
  const uploadForm = $('uploadForm');
  const uploadBtn = $('uploadBtn');

  const searchForm = $('searchForm');
  const searchInput = $('searchInput');
  const searchBtn = $('searchBtn');

  const resultsGrid = $('resultsGrid');
  const resultsMeta = $('resultsMeta');
  const emptyState = $('emptyState');

  const toastContainer = $('toastContainer');

  const lightbox = $('lightbox');
  const lightboxImg = $('lightbox-img');
  const lightboxChips = $('lightbox-chips');
  const lightboxClose = $('lightbox-close');
  const lightboxBackdrop = $('lightbox-backdrop');

  let selectedFile = null;

  // ===========================================================================
  // Lightbox
  // ===========================================================================
  function openLightbox(url, labels) {
    lightboxImg.src = url;
    lightboxImg.alt = labels.length ? labels.join(', ') : 'photo';
    lightboxChips.innerHTML = labels
      .map((l) => `<span class="lb-chip">${escapeHtml(l)}</span>`)
      .join('');
    lightbox.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.style.display = 'none';
    document.body.style.overflow = '';
    lightboxImg.src = '';
  }

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxBackdrop.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.style.display === 'flex') {
      closeLightbox();
    }
  });

  // ===========================================================================
  // Toast notifications
  // ===========================================================================
  const ICONS = {
    success:
      '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:
      '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#ed4956" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:
      '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#0095f6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  function showToast({ title, message, type = 'info', duration = 3500 }) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      ${ICONS[type] || ICONS.info}
      <div>
        <p class="toast-title">${escapeHtml(title)}</p>
        ${message ? `<p class="toast-message">${escapeHtml(message)}</p>` : ''}
      </div>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ===========================================================================
  // Loading-state helpers (button spinner)
  // ===========================================================================
  function setBtnLoading(btn, loading) {
    const label = btn.querySelector('.btn-label');
    const spinner = btn.querySelector('.btn-spinner');
    btn.disabled = loading;
    if (label) label.classList.toggle('hidden', loading);
    if (spinner) spinner.classList.toggle('hidden', !loading);
  }

  // ===========================================================================
  // Drag & drop + file picker
  // ===========================================================================
  function handleFileSelected(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast({
        title: 'Invalid file type',
        message: 'Please select an image (JPG / PNG / JPEG).',
        type: 'error',
      });
      fileInput.value = '';
      return;
    }

    selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewImg.classList.remove('hidden');
      dropzoneInner.classList.add('hidden');
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    handleFileSelected(file);
  });

  // Drag & drop
  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
      } catch (_) {
        /* Some older browsers don't support DataTransfer here; preview still works. */
      }
      handleFileSelected(file);
    }
  });

  // ===========================================================================
  // Filename sanitiser - S3 keys can't contain spaces / random unicode safely
  // ===========================================================================
  function sanitizeFilename(name) {
    const lastDot = name.lastIndexOf('.');
    const base = lastDot > 0 ? name.slice(0, lastDot) : name;
    const ext = lastDot > 0 ? name.slice(lastDot) : '';
    const cleanBase = base
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const safeBase = cleanBase || 'photo';
    const stamp = Date.now();
    return `${stamp}-${safeBase}${ext.toLowerCase()}`;
  }

  // ===========================================================================
  // Upload (PUT binary directly to API Gateway -> S3 proxy)
  // ===========================================================================
  async function uploadPhoto(file, customLabels) {
    const filename = sanitizeFilename(file.name);
    const url = `${CONFIG.API_BASE}/upload/${encodeURIComponent(filename)}`;

    console.log('[upload] PUT', url);
    console.log('[upload] Content-Type:', file.type);
    console.log('[upload] x-amz-meta-customLabels:', customLabels || '(none)');
    console.log('[upload] file size:', file.size, 'bytes');

    const headers = {
      'x-api-key': CONFIG.API_KEY,
      'Content-Type': file.type || 'application/octet-stream',
    };

    if (customLabels) {
      headers['x-amz-meta-customLabels'] = customLabels;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: file,
    });

    console.log('[upload] response status:', response.status, response.statusText);

    if (!response.ok) {
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch (_) {
        /* ignore */
      }
      console.error('[upload] response body:', bodyText);
      throw new Error(`HTTP ${response.status} ${response.statusText}${bodyText ? ': ' + bodyText : ''}`);
    }

    return { filename };
  }

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      showToast({
        title: 'No image selected',
        message: 'Please choose an image to upload first.',
        type: 'error',
      });
      return;
    }

    const customLabels = (labelsInput.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');

    setBtnLoading(uploadBtn, true);
    showToast({
      title: 'Uploading…',
      message: selectedFile.name,
      type: 'info',
      duration: 1800,
    });

    try {
      const { filename } = await uploadPhoto(selectedFile, customLabels);
      showToast({
        title: 'Upload successful',
        message: `Saved as "${filename}". It may take a few seconds to be indexed.`,
        type: 'success',
        duration: 5000,
      });
      uploadForm.reset();
      previewImg.src = '';
      previewImg.classList.add('hidden');
      dropzoneInner.classList.remove('hidden');
      selectedFile = null;
    } catch (err) {
      console.error('[upload] failed:', err);
      showToast({
        title: 'Upload failed',
        message: err.message || 'Something went wrong. Check the console for details.',
        type: 'error',
        duration: 6000,
      });
    } finally {
      setBtnLoading(uploadBtn, false);
    }
  });

  // ===========================================================================
  // Search (GET /search?q=...) — via API Gateway SDK
  // ===========================================================================
  async function searchPhotos(query) {
    console.log('[search] SDK searchGet q=', query);

    let rawData;
    try {
      const sdkResponse = await apigClient.searchGet({ q: query }, null, {});
      console.log('[search] SDK response status:', sdkResponse.status);
      rawData = sdkResponse.data;
    } catch (sdkErr) {
      const status = sdkErr.response && sdkErr.response.status;
      console.error('[search] SDK error, status:', status, sdkErr);
      throw new Error(status ? `HTTP ${status}` : (sdkErr.message || 'Search failed'));
    }

    // Normalise: handle both plain object and Lambda Proxy wrapper
    let data = rawData;
    if (data && data.body !== undefined) {
      console.log('[search] unwrapping Lambda proxy response');
      try {
        data = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
      } catch (_) {
        console.warn('[search] could not parse body string');
      }
    }

    console.log('[search] parsed results:', JSON.stringify(data));
    return data || { results: [] };
  }

  function renderResults(results, query) {
    resultsGrid.innerHTML = '';

    if (!results || results.length === 0) {
      emptyState.classList.remove('hidden');
      emptyState.querySelector('p').textContent = query
        ? `No photos found for "${query}".`
        : 'Search results will appear here.';
      resultsMeta.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    resultsMeta.classList.remove('hidden');
    resultsMeta.textContent = `Found ${results.length} photo${results.length === 1 ? '' : 's'} for "${query}".`;

    const fragment = document.createDocumentFragment();
    results.forEach((item) => {
      // Support both string URLs and {url, labels} objects
      const photoUrl = typeof item === 'string' ? item : (item.url || '');
      const labels = (typeof item === 'object' && Array.isArray(item.labels))
        ? item.labels
        : [];

      const tile = document.createElement('div');
      tile.className = 'photo-tile';
      tile.title = labels.length ? labels.join(', ') : 'photo';
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');

      tile.innerHTML = `
        <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(labels.join(', ') || 'photo')}" loading="lazy" />
        <div class="photo-overlay">
          <span class="photo-labels">${escapeHtml(labels.join(' · ') || '')}</span>
        </div>
      `;

      const img = tile.querySelector('img');
      img.addEventListener('error', () => {
        img.style.display = 'none';
        tile.style.display = 'flex';
        tile.style.alignItems = 'center';
        tile.style.justifyContent = 'center';
        tile.style.color = 'var(--text-muted)';
        tile.style.fontSize = '12px';
        tile.textContent = 'Image unavailable';
      });

      tile.addEventListener('click', () => openLightbox(photoUrl, labels));
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openLightbox(photoUrl, labels);
      });

      fragment.appendChild(tile);
    });

    resultsGrid.appendChild(fragment);
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const query = (searchInput.value || '').trim();
    if (!query) {
      showToast({
        title: 'Empty query',
        message: 'Please type something to search.',
        type: 'error',
      });
      return;
    }

    setBtnLoading(searchBtn, true);

    try {
      const data = await searchPhotos(query);
      const results = (data && data.results) || [];
      renderResults(results, query);

      if (results.length === 0) {
        showToast({
          title: 'No matches',
          message: `No photos matched "${query}".`,
          type: 'info',
        });
      }
    } catch (err) {
      console.error('[search] failed:', err);
      showToast({
        title: 'Search failed',
        message: err.message || 'Something went wrong. Check the console for details.',
        type: 'error',
        duration: 6000,
      });
    } finally {
      setBtnLoading(searchBtn, false);
    }
  });

  // ===========================================================================
  // Boot
  // ===========================================================================
  console.log('[Photo Album] frontend ready · API:', CONFIG.API_BASE);
})();
