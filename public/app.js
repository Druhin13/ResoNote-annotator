const state = {
  tags: null,
  allTracks: [],
  assignedTracks: [],
  currentIndex: 0,
  current: null,
  selections: {
    Emotional_Tone: new Set(),
    Thematic_Content: new Set(),
    Narrative_Structure: new Set(),
    Lyrical_Style: new Set(),
  },
  filtered: {},
  fusers: {},
  progress: 0,
  skippedTracks: [],
  completedAnnotations: [],
  sessionId: null,
  fontScale: 1,
};

const $title = document.getElementById("track-title");
const $subtitle = document.getElementById("track-subtitle");
const $lyrics = document.getElementById("lyrics");
const $toast = document.getElementById("toast");
const $toastIcon = document.querySelector(".toast-icon");
const $toastMessage = document.querySelector(".toast-message");
const $progress = document.getElementById("progress-count");
const $progressPercentage = document.getElementById("progress-percentage");
const $progressCircle = document.getElementById("progress-circle");
const $totalSelections = document.getElementById("total-selections");
const $queueCount = document.getElementById("queue-count");
const $loading = document.getElementById("loading");
const $completionModal = document.getElementById("completion-modal");
const $zoomLevel = document.getElementById("zoom-level");

const buttons = {
  confirm: document.getElementById("btn-confirm"),
  clear: document.getElementById("btn-clear"),
  skip: document.getElementById("btn-skip"),
  download: document.getElementById("btn-download"),
  downloadModal: document.getElementById("btn-download-modal"),
  copyLyrics: document.getElementById("btn-copy-lyrics"),
  zoomIn: document.getElementById("btn-zoom-in"),
  zoomOut: document.getElementById("btn-zoom-out"),
  zoomReset: document.getElementById("btn-zoom-reset"),
};

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateSessionId() {
  return 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function updateFontScale() {
  document.documentElement.style.setProperty('--font-scale', state.fontScale);
  const percentage = Math.round(state.fontScale * 100);
  $zoomLevel.textContent = `${percentage}%`;
  
  const savedScale = {
    scale: state.fontScale,
    timestamp: Date.now()
  };
  localStorage.setItem('resonote-font-scale', JSON.stringify(savedScale));
}

function increaseTextSize() {
  if (state.fontScale < 2.0) {
    state.fontScale = Math.round((state.fontScale + 0.1) * 10) / 10;
    updateFontScale();
    showToast(`Text size: ${Math.round(state.fontScale * 100)}%`, "Text", "info");
  }
}

function decreaseTextSize() {
  if (state.fontScale > 0.5) {
    state.fontScale = Math.round((state.fontScale - 0.1) * 10) / 10;
    updateFontScale();
    showToast(`Text size: ${Math.round(state.fontScale * 100)}%`, "Text", "info");
  }
}

function resetTextSize() {
  state.fontScale = 1.0;
  updateFontScale();
  showToast("Text size reset to 100%", "Reset", "info");
}

function loadFontScaleFromStorage() {
  try {
    const saved = localStorage.getItem('resonote-font-scale');
    if (saved) {
      const scaleData = JSON.parse(saved);
      const age = Date.now() - scaleData.timestamp;
      
      if (age < 7 * 24 * 60 * 60 * 1000) {
        state.fontScale = scaleData.scale;
        updateFontScale();
      }
    }
  } catch (e) {
    console.warn('Failed to load font scale from localStorage:', e);
  }
}

async function copyLyrics() {
  if (!state.current || !state.current.lyrics) {
    showToast("No lyrics available to copy", "Warning", "warning");
    return;
  }
  
  try {
    await navigator.clipboard.writeText(state.current.lyrics);
    
    buttons.copyLyrics.classList.add('copy-success');
    buttons.copyLyrics.innerHTML = '<i class="ph ph-check"></i>';
    
    showToast("Lyrics copied to clipboard!", "Success", "success");
    
    setTimeout(() => {
      buttons.copyLyrics.classList.remove('copy-success');
      buttons.copyLyrics.innerHTML = '<i class="ph ph-copy"></i>';
    }, 2000);
    
  } catch (error) {
    console.error('Failed to copy lyrics:', error);
    
    const textArea = document.createElement('textarea');
    textArea.value = state.current.lyrics;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      showToast("Lyrics copied to clipboard!", "Success", "success");
      buttons.copyLyrics.classList.add('copy-success');
      buttons.copyLyrics.innerHTML = '<i class="ph ph-check"></i>';
      
      setTimeout(() => {
        buttons.copyLyrics.classList.remove('copy-success');
        buttons.copyLyrics.innerHTML = '<i class="ph ph-copy"></i>';
      }, 2000);
    } catch (fallbackError) {
      showToast("Failed to copy lyrics", "Error", "error");
    }
    
    document.body.removeChild(textArea);
  }
}

async function loadData() {
  try {
    showLoading(true);
    
    state.sessionId = generateSessionId();
    
    const [tRes, lRes] = await Promise.all([
      fetch("/api/tags"),
      fetch("/api/tracks"),
    ]);
    
    if (!tRes.ok || !lRes.ok) {
      throw new Error('Failed to load data');
    }
    
    state.tags = await tRes.json();
    state.allTracks = (await lRes.json()).filter((x) => x.track_id && x.lyrics);
    
    state.assignedTracks = shuffleArray(state.allTracks).slice(0, 50);
    
    for (const f of Object.keys(state.selections)) {
      state.filtered[f] = state.tags[f] || [];
      state.fusers[f] = new Fuse(state.tags[f] || [], {
        includeScore: true,
        threshold: 0.35,
      });
    }
    
    const idx = await fetch("/data/annotations/_index.json")
      .then((r) => (r.ok ? r.json() : { total: 0 }))
      .catch(() => ({ total: 0 }));
    
    state.progress = 0;
    updateProgress();
    
    showLoading(false);
    showToast("Data loaded successfully!", "Success", "success");
    
    showNextTrack();
    
  } catch (error) {
    console.error('Error loading data:', error);
    showToast("Failed to load data. Please refresh.", "Error", "error");
    showLoading(false);
  }
}

function showLoading(show) {
  if (show) {
    $loading.classList.remove('hidden');
  } else {
    setTimeout(() => {
      $loading.classList.add('hidden');
    }, 500);
  }
}

function updateProgress() {
  $progress.textContent = state.progress;
  
  const completed = state.currentIndex;
  const total = state.assignedTracks.length + state.skippedTracks.length;
  const remaining = Math.max(0, total - completed);
  
  $queueCount.textContent = remaining;
  
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  $progressPercentage.textContent = `${Math.min(percentage, 100)}%`;
  
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  if ($progressCircle) {
    $progressCircle.style.strokeDashoffset = offset;
  }
  
  if (remaining === 0 && state.progress > 0) {
    showCompletionModal();
  }
}

function updateSelectionCount() {
  const total = Object.values(state.selections).reduce((sum, set) => sum + set.size, 0);
  $totalSelections.textContent = total;
  
  $totalSelections.style.transform = 'scale(1.2)';
  setTimeout(() => {
    $totalSelections.style.transform = 'scale(1)';
  }, 150);
}

function showNextTrack() {
  if (state.currentIndex >= state.assignedTracks.length) {
    if (state.skippedTracks.length > 0) {
      state.assignedTracks.push(...state.skippedTracks);
      state.skippedTracks = [];
      showToast("Showing skipped tracks", "Info", "info");
    } else {
      showCompletionModal();
      return;
    }
  }
  
  const track = state.assignedTracks[state.currentIndex];
  if (!track) return;
  
  state.current = track;
  $title.textContent = track.track_name || "Unknown Track";
  $subtitle.textContent = [track.artist_name, track.track_id]
    .filter(Boolean)
    .join(" • ");
  $lyrics.textContent = track.lyrics || "No lyrics available";
  
  updateProgress();
  
  $lyrics.style.opacity = '0';
  setTimeout(() => {
    $lyrics.style.opacity = '1';
  }, 100);
}

function showCompletionModal() {
  $completionModal.style.display = 'flex';
  if (buttons.download) {
    buttons.download.style.display = 'inline-flex';
  }
  showToast("All tracks completed! You can now download your annotations.", "Success", "success");
}

function downloadAnnotations() {
  const downloadData = {
    session_id: state.sessionId,
    completed_at: new Date().toISOString(),
    total_tracks: 50,
    completed_tracks: state.progress,
    annotations: state.completedAnnotations,
    assigned_tracks: state.assignedTracks.map(track => ({
      track_id: track.track_id,
      track_name: track.track_name,
      artist_name: track.artist_name
    }))
  };
  
  const blob = new Blob([JSON.stringify(downloadData, null, 2)], {
    type: 'application/json'
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resonote-annotations-${state.sessionId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast("Annotations downloaded successfully!", "Success", "success");
}

function tagMarkup(f, v) {
  const id = `${f}-${v}`.replace(/[^a-z0-9\-]/g, "");
  const escapedValue = v.replace(/"/g, '&quot;');
  return `<label class="tag" data-facet="${f}" data-value="${escapedValue}"><input type="checkbox" id="${id}" style="display: none;">${v}</label>`;
}

function renderFacets() {
  document.querySelectorAll(".facet-card").forEach((fct) => {
    const facet = fct.dataset.facet;
    const body = fct.querySelector(".facet-body");
    
    if (!state.filtered[facet] || !body) return;
    
    body.innerHTML = state.filtered[facet]
      .map((v) => tagMarkup(facet, v))
      .join("");
    
    state.filtered[facet].forEach((v) => {
      const el = body.querySelector(`[data-value="${v.replace(/"/g, '&quot;')}"]`);
      if (!el) return;
      
      if (state.selections[facet].has(v)) {
        el.classList.add("selected");
      }
      
      el.addEventListener("click", (e) => {
        e.preventDefault();
        toggleTag(facet, v, el);
      });
    });
  });
  
  updateSelectionCount();
}

function toggleTag(facet, value, element) {
  const set = state.selections[facet];
  
  if (set.has(value)) {
    set.delete(value);
    element.classList.remove("selected");
  } else {
    set.add(value);
    element.classList.add("selected");
  }
  
  updateSelectionCount();
  
  const ripple = document.createElement('div');
  ripple.style.cssText = `
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: scale(0);
    animation: ripple 0.6s linear;
    pointer-events: none;
  `;
  
  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (rect.width / 2 - size / 2) + 'px';
  ripple.style.top = (rect.height / 2 - size / 2) + 'px';
  
  element.style.position = 'relative';
  element.appendChild(ripple);
  
  setTimeout(() => {
    if (ripple.parentNode) {
      ripple.remove();
    }
  }, 600);
}

function attachSearch() {
  document.querySelectorAll(".facet-card").forEach((fct) => {
    const facet = fct.dataset.facet;
    const input = fct.querySelector(".facet-search");
    
    if (!input || !state.fusers[facet]) return;
    
    input.addEventListener("input", (e) => {
      const q = e.target.value.trim();
      
      if (q) {
        const results = state.fusers[facet].search(q);
        state.filtered[facet] = results.map((r) => r.item);
      } else {
        state.filtered[facet] = state.tags[facet] || [];
      }
      
      renderFacets();
    });
    
    input.addEventListener("focus", () => {
      input.parentElement.style.transform = "scale(1.02)";
    });
    
    input.addEventListener("blur", () => {
      input.parentElement.style.transform = "scale(1)";
    });
  });
}

function resetSelections() {
  for (const f of Object.keys(state.selections)) {
    state.selections[f].clear();
  }
  
  document.querySelectorAll(".facet-search").forEach(input => {
    input.value = "";
  });
  
  for (const f of Object.keys(state.selections)) {
    state.filtered[f] = state.tags[f] || [];
  }
  
  renderFacets();
  showToast("All selections cleared", "Clear", "info");
}

function skipTrack() {
  if (!state.current) return;
  
  state.skippedTracks.push(state.current);
  state.currentIndex++;
  resetSelections();
  showNextTrack();
  showToast("Track skipped", "Skip", "info");
}

async function save() {
  if (!state.current) {
    showToast("No track selected", "Warning", "warning");
    return;
  }
  
  const totalSelections = Object.values(state.selections).reduce((sum, set) => sum + set.size, 0);
  if (totalSelections === 0) {
    showToast("Please select at least one tag", "Warning", "warning");
    return;
  }
  
  try {
    buttons.confirm.disabled = true;
    const originalHTML = buttons.confirm.innerHTML;
    buttons.confirm.innerHTML = '<i class="ph ph-spinner ph-spin"></i>Saving...';
    
    const annotationData = {
      track_id: state.current.track_id,
      track_name: state.current.track_name,
      artist_name: state.current.artist_name,
      selections: {
        Emotional_Tone: [...state.selections.Emotional_Tone],
        Thematic_Content: [...state.selections.Thematic_Content],
        Narrative_Structure: [...state.selections.Narrative_Structure],
        Lyrical_Style: [...state.selections.Lyrical_Style],
      },
      annotated_at: new Date().toISOString(),
      session_id: state.sessionId
    };
    
    state.completedAnnotations.push(annotationData);
    
    const payload = {
      track_id: state.current.track_id,
      selections: annotationData.selections,
    };
    
    const res = await fetch("/api/annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    
    if (res.ok) {
      state.progress += 1;
      state.currentIndex++;
      updateProgress();
      showToast(`Annotations saved! (${totalSelections} tags)`, "Success", "success");
      
      setTimeout(() => {
        resetSelections();
        showNextTrack();
      }, 800);
      
    } else {
      throw new Error('Save failed');
    }
    
  } catch (error) {
    console.error('Save error:', error);
    showToast("Failed to save annotations", "Error", "error");
    state.completedAnnotations.pop();
  } finally {
    buttons.confirm.disabled = false;
    buttons.confirm.innerHTML = '<i class="ph ph-floppy-disk"></i>Save Annotations';
  }
}

function showToast(message, icon = "Info", type = "info") {
  if ($toastIcon && $toastMessage) {
    $toastIcon.textContent = icon;
    $toastMessage.textContent = message;
    
    $toast.className = `toast show ${type}`;
    
    setTimeout(() => {
      $toast.classList.remove("show");
    }, 3000);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    switch(e.key) {
      case 's':
        e.preventDefault();
        save();
        break;
      case 'j':
        e.preventDefault();
        skipTrack();
        break;
      case 'd':
        e.preventDefault();
        if (state.progress === 50) {
          downloadAnnotations();
        }
        break;
      case 'c':
        e.preventDefault();
        copyLyrics();
        break;
      case '=':
      case '+':
        e.preventDefault();
        increaseTextSize();
        break;
      case '-':
        e.preventDefault();
        decreaseTextSize();
        break;
      case '0':
        e.preventDefault();
        resetTextSize();
        break;
    }
  }
});

async function init() {
  try {
    loadFontScaleFromStorage();
    await loadData();
    attachSearch();
    renderFacets();
    
  } catch (error) {
    console.error('Initialization error:', error);
    showToast("Failed to initialize application", "Error", "error");
  }
}

if (buttons.confirm) {
  buttons.confirm.addEventListener("click", save);
}

if (buttons.clear) {
  buttons.clear.addEventListener("click", resetSelections);
}

if (buttons.skip) {
  buttons.skip.addEventListener("click", skipTrack);
}

if (buttons.download) {
  buttons.download.addEventListener("click", downloadAnnotations);
}

if (buttons.downloadModal) {
  buttons.downloadModal.addEventListener("click", downloadAnnotations);
}

if (buttons.copyLyrics) {
  buttons.copyLyrics.addEventListener("click", copyLyrics);
}

if (buttons.zoomIn) {
  buttons.zoomIn.addEventListener("click", increaseTextSize);
}

if (buttons.zoomOut) {
  buttons.zoomOut.addEventListener("click", decreaseTextSize);
}

if (buttons.zoomReset) {
  buttons.zoomReset.addEventListener("click", resetTextSize);
}

const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
  @keyframes ripple {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
`;
document.head.appendChild(rippleStyle);

function saveToLocalStorage() {
  try {
    const sessionData = {
      sessionId: state.sessionId,
      completedAnnotations: state.completedAnnotations,
      assignedTracks: state.assignedTracks,
      currentIndex: state.currentIndex,
      progress: state.progress,
      timestamp: Date.now()
    };
    localStorage.setItem('resonote-session', JSON.stringify(sessionData));
  } catch (e) {
    console.warn('Failed to save session to localStorage:', e);
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('resonote-session');
    if (saved) {
      const sessionData = JSON.parse(saved);
      const age = Date.now() - sessionData.timestamp;
      
      if (age < 24 * 60 * 60 * 1000) {
        state.sessionId = sessionData.sessionId;
        state.completedAnnotations = sessionData.completedAnnotations || [];
        state.assignedTracks = sessionData.assignedTracks || [];
        state.currentIndex = sessionData.currentIndex || 0;
        state.progress = sessionData.progress || 0;
        return true;
      } else {
        localStorage.removeItem('resonote-session');
      }
    }
  } catch (e) {
    console.warn('Failed to load session from localStorage:', e);
  }
  return false;
}

window.addEventListener('beforeunload', () => {
  saveToLocalStorage();
});

setInterval(() => {
  if (state.sessionId) {
    saveToLocalStorage();
  }
}, 30000);

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showToast("An unexpected error occurred", "Error", "error");
});

window.addEventListener('beforeunload', (event) => {
  const totalSelections = Object.values(state.selections).reduce((sum, set) => sum + set.size, 0);
  
  if (totalSelections > 0 && state.current && state.progress < 50) {
    event.preventDefault();
    event.returnValue = 'You have unsaved annotations. Are you sure you want to leave?';
    return event.returnValue;
  }
});

init();