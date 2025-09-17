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

const buttons = {
  confirm: document.getElementById("btn-confirm"),
  clear: document.getElementById("btn-clear"),
  skip: document.getElementById("btn-skip"),
};

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function loadData() {
  try {
    showLoading(true);
    
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
    
    state.progress = idx.total || 0;
    updateProgress();
    
    showLoading(false);
    showToast("Data loaded successfully!", "✓", "success");
    
    showNextTrack();
    
  } catch (error) {
    console.error('Error loading data:', error);
    showToast("Failed to load data. Please refresh.", "×", "error");
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
  const remaining = total - completed;
  
  $queueCount.textContent = remaining;
  
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  $progressPercentage.textContent = `${Math.min(percentage, 100)}%`;
  
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  if ($progressCircle) {
    $progressCircle.style.strokeDashoffset = offset;
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
      showToast("Showing skipped tracks", "↻", "info");
    } else {
      showToast("All tracks completed!", "✓", "success");
      $title.textContent = "All tracks completed!";
      $subtitle.textContent = "Thank you for your annotations";
      $lyrics.textContent = "You have successfully annotated all assigned tracks.";
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
  showToast("All selections cleared", "×", "info");
}

function skipTrack() {
  if (!state.current) return;
  
  state.skippedTracks.push(state.current);
  state.currentIndex++;
  resetSelections();
  showNextTrack();
  showToast("Track skipped", "⏭", "info");
}

async function save() {
  if (!state.current) {
    showToast("No track selected", "!", "warning");
    return;
  }
  
  const totalSelections = Object.values(state.selections).reduce((sum, set) => sum + set.size, 0);
  if (totalSelections === 0) {
    showToast("Please select at least one tag", "!", "warning");
    return;
  }
  
  try {
    buttons.confirm.disabled = true;
    const originalHTML = buttons.confirm.innerHTML;
    buttons.confirm.innerHTML = '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>Saving...';
    
    const payload = {
      track_id: state.current.track_id,
      selections: {
        Emotional_Tone: [...state.selections.Emotional_Tone],
        Thematic_Content: [...state.selections.Thematic_Content],
        Narrative_Structure: [...state.selections.Narrative_Structure],
        Lyrical_Style: [...state.selections.Lyrical_Style],
      },
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
      showToast(`Annotations saved! (${totalSelections} tags)`, "✓", "success");
      
      setTimeout(() => {
        resetSelections();
        showNextTrack();
      }, 800);
      
    } else {
      throw new Error('Save failed');
    }
    
  } catch (error) {
    console.error('Save error:', error);
    showToast("Failed to save annotations", "×", "error");
  } finally {
    buttons.confirm.disabled = false;
    buttons.confirm.innerHTML = '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg>Save Annotations';
  }
}

function showToast(message, icon = "i", type = "info") {
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
    }
  }
});

async function init() {
  try {
    await loadData();
    attachSearch();
    renderFacets();
    
  } catch (error) {
    console.error('Initialization error:', error);
    showToast("Failed to initialize application", "×", "error");
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

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showToast("An unexpected error occurred", "×", "error");
});

window.addEventListener('beforeunload', (event) => {
  const totalSelections = Object.values(state.selections).reduce((sum, set) => sum + set.size, 0);
  
  if (totalSelections > 0 && state.current) {
    event.preventDefault();
    event.returnValue = 'You have unsaved annotations. Are you sure you want to leave?';
    return event.returnValue;
  }
});

init();