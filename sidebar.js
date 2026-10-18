// sidebar.js
// Logic for the Session Capsule Sidebar Extension.

// State Variables
let savedSessions = [];
let maxSessionsLimit = 10;
let dedupeOnSave = true;
let searchQuery = '';
let schedules = [];
const expandedSessionIds = new Set();

// DOM Elements
const sessionNameInput = document.getElementById('session-name-input');
const saveSessionBtn = document.getElementById('save-session-btn');
const sessionsList = document.getElementById('sessions-list');
const emptyState = document.getElementById('empty-state');
const sessionCountSpan = document.getElementById('session-count');
const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const maxSessionsInput = document.getElementById('max-sessions-input');
const clearAllBtn = document.getElementById('clear-all-btn');
const toastContainer = document.getElementById('toast-container');
const sessionTagsInput = document.getElementById('session-tags-input');
const searchInput = document.getElementById('search-input');

// Initialize Sidebar
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

// Initialize Application Settings and Sessions
async function initApp() {
  // Update name input with auto-generated default
  refreshDefaultSessionName();

  // Load data from chrome.storage.local (with preview fallback)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['saved_sessions', 'max_sessions', 'schedules'], (result) => {
      if (result.saved_sessions) {
        let modified = false;
        savedSessions = result.saved_sessions.map((session) => {
          const cleaned = cleanSessionTabs(session.tabs || [], dedupeOnSave);
          if (cleaned.length !== (session.tabs || []).length) {
            modified = true;
            return { ...session, tabs: cleaned };
          }
          return session;
        });
        if (modified) {
          chrome.storage.local.set({ saved_sessions: savedSessions });
        }
      }
      if (result.max_sessions !== undefined) {
        maxSessionsLimit = parseInt(result.max_sessions, 10);
        maxSessionsInput.value = maxSessionsLimit;
      } else {
        // Default setup
        chrome.storage.local.set({ max_sessions: maxSessionsLimit });
      }

      schedules = result.schedules || [];
      
      renderSessions();
    });
  } else {
    // Development / Browser preview fallback sessions
    savedSessions = [
      {
        id: 'session-demo-1',
        name: 'Work & Research Project',
        timestamp: Date.now() - 3600000 * 2,
        tags: ['work', 'docs'],
        tabs: [
          { title: 'Google Chrome - Features & Speed', url: 'https://www.google.com/chrome' },
          { title: 'GitHub - Repository Dashboard', url: 'https://github.com' },
          { title: 'MDN Web Docs - HTML, CSS & JavaScript', url: 'https://developer.mozilla.org' }
        ]
      }
    ];
    renderSessions();
  }
}

// Set Event Listeners
function setupEventListeners() {
  // Save Session
  saveSessionBtn.addEventListener('click', saveCurrentSession);
  
  // Settings Panel Toggles
  toggleSettingsBtn.addEventListener('click', () => {
    refreshDefaultSessionName();
    settingsPanel.classList.add('open');
  });
  
  closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('open');
  });

  // Settings: Max Sessions Change
  maxSessionsInput.addEventListener('change', handleMaxSessionsChange);


  // Settings: Reset All
  clearAllBtn.addEventListener('click', handleClearAll);

  // Allow saving by pressing Enter in input field
  sessionNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveCurrentSession();
    }
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderSessions();
  });


  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.schedules) {
        schedules = changes.schedules.newValue || [];
        renderSessions();
      }
      if (changes.saved_sessions) {
        savedSessions = changes.saved_sessions.newValue || [];
        renderSessions();
      }
    });
  }
}

// Generate Default Name in Format: Session-YYYY-MM-DD-HH-MM
function generateDefaultSessionName() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `Session-${yyyy}-${mm}-${dd}-${hh}-${min}`;
}

// Refresh the value inside input field
function refreshDefaultSessionName() {
  sessionNameInput.value = generateDefaultSessionName();
}

// Save Current Window Tabs (automatically cleans blank tabs and duplicate tabs)
function saveCurrentSession() {
  const name = sessionNameInput.value.trim() || generateDefaultSessionName();

  // Query active window tabs
  chrome.tabs.query({ currentWindow: true }, async (tabs) => {
    if (!tabs || tabs.length === 0) {
      showToast("No active tabs found to save.", "danger");
      return;
    }

    const initialCount = tabs.length;
    // Automatically remove blank tabs and duplicate tabs from the session being created
    const cleanedTabs = cleanSessionTabs(tabs, dedupeOnSave);

    if (cleanedTabs.length === 0) {
      showToast("No tabs saved (all open tabs are blank).", "danger");
      return;
    }

    const removedCount = initialCount - cleanedTabs.length;

    const customTags = sessionTagsInput
      ? sessionTagsInput.value
          .split(',')
          .map(t => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    // Create session object
    const newSession = {
      id: 'session_' + Date.now(),
      name: name,
      timestamp: Date.now(),
      tabs: cleanedTabs,
      tags: [...new Set(customTags)]
    };

    // FIFO Queue Logic
    let prunedCount = 0;
    // If sessions length is equal to or greater than limit, remove oldest (FIFO)
    // We store sessions in chronological order (oldest at index 0, newest pushed to end)
    while (savedSessions.length >= maxSessionsLimit) {
      savedSessions.shift(); // Remove oldest session
      prunedCount++;
    }

    // Add new session to storage
    savedSessions.push(newSession);

    // Save to storage.local
    chrome.storage.local.set({ saved_sessions: savedSessions }, () => {
      renderSessions();
      refreshDefaultSessionName(); // Refresh field for next save
      if (sessionTagsInput) sessionTagsInput.value = '';
      
      if (prunedCount > 0) {
        showToast("Saved! Oldest session deleted to stay within limit.", "success");
      } else if (removedCount > 0) {
        showToast(`Session saved! ${removedCount} duplicate/blank tab(s) removed.`, "success");
      } else {
        showToast("Session saved successfully!", "success");
      }
    });
  });
}

// Restore a Session (open all URLs in active window)
function restoreSession(sessionId) {
  const session = savedSessions.find(s => s.id === sessionId);
  if (!session) {
    showToast("Session not found.", "danger");
    return;
  }

  const validTabs = (session.tabs || []).filter(tab => !isBlankUrl(tab.url));
  if (validTabs.length === 0) {
    showToast("No tabs in this session to restore.", "danger");
    return;
  }

  // Restore tabs in the active window
  validTabs.forEach((tab) => {
    chrome.tabs.create({ url: tab.url });
  });

  showToast(`Restoring ${validTabs.length} tabs...`, "success");
}

// Delete a Single Session
function deleteSession(sessionId) {
  const sessionIndex = savedSessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) return;
  clearSchedule(sessionId, false);
  expandedSessionIds.delete(sessionId);

  const sessionName = savedSessions[sessionIndex].name;
  savedSessions.splice(sessionIndex, 1);

  chrome.storage.local.set({ saved_sessions: savedSessions }, () => {
    renderSessions();
    showToast(`Deleted "${sessionName}"`, "success");
  });
}

// Delete a single tab from a recorded session
function deleteTabFromSession(sessionId, tabObj) {
  const session = savedSessions.find(s => s.id === sessionId);
  if (!session || !session.tabs) return;

  const idx = session.tabs.indexOf(tabObj);
  if (idx !== -1) {
    session.tabs.splice(idx, 1);
  } else {
    return;
  }

  // If no tabs remain in this recorded session, delete the session
  if (session.tabs.length === 0) {
    deleteSession(sessionId);
    showToast("Session removed (no tabs remaining).", "success");
    return;
  }

  expandedSessionIds.add(sessionId);
  chrome.storage.local.set({ saved_sessions: savedSessions }, () => {
    renderSessions();
    showToast("Tab removed from session.", "success");
  });
}

// Add a tab to a recorded session
function addTabToSession(sessionId, tabToAdd) {
  const session = savedSessions.find(s => s.id === sessionId);
  if (!session) return false;

  let rawUrl = (tabToAdd.url || '').trim();
  if (!rawUrl) {
    showToast("URL cannot be empty.", "danger");
    return false;
  }

  // Prepend https:// if protocol is missing
  if (!/^[a-zA-Z]+:\/\//.test(rawUrl)) {
    rawUrl = 'https://' + rawUrl;
  }

  try {
    new URL(rawUrl);
  } catch (e) {
    showToast("Invalid URL format.", "danger");
    return false;
  }

  if (isBlankUrl(rawUrl)) {
    showToast("Cannot add empty or blank tab.", "danger");
    return false;
  }

  // Check deduplication if enabled
  if (dedupeOnSave) {
    const norm = normalizeUrl(rawUrl);
    const exists = (session.tabs || []).some(t => normalizeUrl(t.url) === norm);
    if (exists) {
      showToast("Tab is already in this session.", "danger");
      return false;
    }
  }

  let finalTitle = (tabToAdd.title || '').trim();
  if (!finalTitle) {
    try {
      finalTitle = new URL(rawUrl).hostname.replace(/^www\./, '') || rawUrl;
    } catch (e) {
      finalTitle = rawUrl;
    }
  }

  const newTab = {
    title: finalTitle,
    url: rawUrl,
    favIconUrl: tabToAdd.favIconUrl || ''
  };

  if (!session.tabs) session.tabs = [];
  session.tabs.push(newTab);

  expandedSessionIds.add(sessionId);
  chrome.storage.local.set({ saved_sessions: savedSessions }, () => {
    renderSessions();
    showToast(`Added "${finalTitle}" to "${session.name}".`, "success");
  });

  return true;
}

// Add the active browser tab to a recorded session
function addActiveTabToSession(sessionId) {
  const session = savedSessions.find(s => s.id === sessionId);
  if (!session) return;

  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        showToast("No active tab found.", "danger");
        return;
      }
      const activeTab = tabs[0];
      if (isBlankUrl(activeTab.url)) {
        showToast("Current tab is empty/blank.", "danger");
        return;
      }
      addTabToSession(sessionId, {
        title: activeTab.title || activeTab.url,
        url: activeTab.url,
        favIconUrl: activeTab.favIconUrl || ''
      });
    });
  } else {
    showToast("Tabs API unavailable.", "danger");
  }
}

function getNextRun(sch) {
  const repeatMinutes = { daily: 1440, weekly: 10080 };
  const step = (repeatMinutes[sch.repeat] || 0) * 60000;
  if (!step || sch.when > Date.now()) return sch.when;
  return sch.when + Math.ceil((Date.now() - sch.when) / step) * step;
}

function setSchedule(sessionId, whenMs, repeat) {
  if (!whenMs || whenMs <= Date.now()) {
    showToast("Pick a future date and time.", "danger");
    return;
  }
  clearSchedule(sessionId, false);

  const sch = { id: 'sch_' + Date.now(), sessionId, when: whenMs, repeat };
  schedules.push(sch);

  const opts = { when: whenMs };
  if (repeat === 'daily') opts.periodInMinutes = 1440;
  if (repeat === 'weekly') opts.periodInMinutes = 10080;
  chrome.alarms.create(sch.id, opts);

  chrome.storage.local.set({ schedules }, () => {
    renderSessions();
    showToast("Restoration scheduled.", "success");
  });
}

function clearSchedule(sessionId, notify = true) {
  schedules.filter(s => s.sessionId === sessionId).forEach(s => chrome.alarms.clear(s.id));
  schedules = schedules.filter(s => s.sessionId !== sessionId);
  chrome.storage.local.set({ schedules }, () => {
    if (notify) {
      renderSessions();
      showToast("Schedule removed.", "success");
    }
  });
}

// Clear all Saved Sessions
function handleClearAll() {
  if (savedSessions.length === 0) {
    showToast("No sessions to clear.", "danger");
    return;
  }

  const confirmed = confirm("Are you sure you want to permanently delete all saved sessions?");
  if (confirmed) {
    savedSessions = [];
    schedules.forEach(s => chrome.alarms.clear(s.id));
    schedules = [];
    chrome.storage.local.set({ saved_sessions: savedSessions, schedules: [] }, () => {
      renderSessions();
      settingsPanel.classList.remove('open');
      showToast("All saved sessions cleared.", "success");
    });
  }
}

// Handle Max Sessions Setting Update
function handleMaxSessionsChange() {
  let newLimit = parseInt(maxSessionsInput.value, 10);
  
  if (isNaN(newLimit) || newLimit < 1) {
    newLimit = 1;
    maxSessionsInput.value = 1;
  } else if (newLimit > 100) {
    newLimit = 100;
    maxSessionsInput.value = 100;
  }

  maxSessionsLimit = newLimit;
  chrome.storage.local.set({ max_sessions: maxSessionsLimit });

  // If new limit is lower than current sessions count, ask to prune or prune immediately
  if (savedSessions.length > maxSessionsLimit) {
    const overflowCount = savedSessions.length - maxSessionsLimit;
    // Prune immediately (FIFO - oldest are at the beginning of the array)
    savedSessions.splice(0, overflowCount);
    
    chrome.storage.local.set({ saved_sessions: savedSessions }, () => {
      renderSessions();
      showToast(`Pruned ${overflowCount} oldest sessions to match new limit of ${maxSessionsLimit}.`, "success");
    });
  } else {
    showToast(`Maximum limit set to ${maxSessionsLimit} sessions.`, "success");
  }
}

// Check if a URL represents a blank / new tab page
function isBlankUrl(url) {
  if (!url) return true;
  const trimmed = url.trim().toLowerCase().replace(/\/$/, '');
  return (
    trimmed === '' ||
    trimmed === 'about:blank' ||
    trimmed === 'about:newtab' ||
    trimmed === 'chrome://newtab' ||
    trimmed === 'edge://newtab' ||
    trimmed.startsWith('chrome-search://local-ntp')
  );
}

// Clean and deduplicate tabs for a session
function cleanSessionTabs(tabsList, dedupe = true) {
  if (!Array.isArray(tabsList)) return [];
  const seen = new Set();
  const cleaned = [];
  tabsList.forEach((tab) => {
    const url = tab.url || '';
    if (isBlankUrl(url)) return;
    const key = normalizeUrl(url);
    if (!dedupe || !seen.has(key)) {
      seen.add(key);
      cleaned.push({
        title: tab.title && tab.title.trim() ? tab.title : (url || 'Untitled Tab'),
        url: url,
        favIconUrl: tab.favIconUrl || ''
      });
    }
  });
  return cleaned;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch (e) {
    return url;
  }
}

function getDomain(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || 'other';
  } catch (e) {
    return 'other';
  }
}

function getAutoTags(session) {
  const counts = {};
  session.tabs.forEach(t => {
    const d = getDomain(t.url);
    counts[d] = (counts[d] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
}

function sessionMatches(session, q) {
  if (!q) return true;
  if (session.name.toLowerCase().includes(q)) return true;
  if ((session.tags || []).some(t => t.includes(q))) return true;
  return session.tabs.some(t =>
    (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q)
  );
}



// Fetch Favicon Helper
function getFaviconUrl(url, originalFavicon) {
  if (originalFavicon && !originalFavicon.startsWith('chrome://') && !originalFavicon.startsWith('about:')) {
    return originalFavicon;
  }
  
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=32`;
    }
  } catch (e) {
    // Leave it to default fallback icon
  }
  
  // Return standard icon SVG marker data URI or empty string for default icon css
  return '';
}

// Render Saved Sessions List
function renderSessions() {
  const count = savedSessions.length;
  sessionCountSpan.textContent = count;

  if (count === 0) {
    emptyState.classList.remove('hidden');
    sessionsList.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  sessionsList.classList.remove('hidden');

  // Remember currently expanded session cards so re-rendering keeps them open
  document.querySelectorAll('.session-card.expanded').forEach(el => {
    if (el.dataset.id) expandedSessionIds.add(el.dataset.id);
  });

  // Clear existing items
  sessionsList.innerHTML = '';

  // Render from newest to oldest in the list (view order), 
  // but remember FIFO logic targets index 0 of the savedSessions array.
  // So we reverse for display purposes.
  const displaySessions = [...savedSessions].reverse().filter(s => sessionMatches(s, searchQuery));

  if (displaySessions.length === 0) {
    sessionsList.innerHTML = '<div class="no-results">No matching sessions.</div>';
    return;
  }

  displaySessions.forEach((session) => {
    const card = document.createElement('div');
    card.className = 'session-card';
    card.dataset.id = session.id;
    if (expandedSessionIds.has(session.id)) {
      card.classList.add('expanded');
    }

    // Format Date/Time
    const dateStr = new Date(session.timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const tabCountText = session.tabs.length === 1 ? '1 tab' : `${session.tabs.length} tabs`;

    const sch = schedules.find(s => s.sessionId === session.id);
    const nextWhen = sch ? getNextRun(sch) : 0;
    const schLabel = sch
      ? new Date(nextWhen).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) +
        (sch.repeat !== 'none' ? ' · ' + sch.repeat : '')
      : '';

    // Card Header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'session-card-header';
    cardHeader.innerHTML = `
      <div class="session-info">
        <div class="session-name" title="${escapeHtml(session.name)}">${escapeHtml(session.name)}</div>
        <div class="session-meta">
          <span class="session-date">${dateStr}</span>
          <span class="tab-badge">${tabCountText}</span>
          ${sch ? `<span class="tab-badge">⏰ ${escapeHtml(schLabel)}</span>` : ''}
        </div>
        <div class="tag-row">
          ${(session.tags || []).map(t => `<span class="tag-chip custom">${escapeHtml(t)}</span>`).join('')}
          ${getAutoTags(session).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
      <div class="session-actions">
        <button class="action-btn add-tab-btn" title="Add Current Tab to Session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button class="action-btn restore-btn" title="Restore Session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
        <button class="action-btn schedule-btn" title="Schedule Restore">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </button>
        <button class="action-btn delete-btn" title="Delete Session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
        <button class="action-btn toggle-details-btn" title="View Tabs">
          <svg class="expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
    `;

    // Accordion click toggle
    cardHeader.addEventListener('click', () => {
      const isExpanded = card.classList.contains('expanded');
      
      // Collapse other expanded ones (optional, for accordion cleanliness)
      document.querySelectorAll('.session-card.expanded').forEach(c => {
        if (c !== card) {
          c.classList.remove('expanded');
          if (c.dataset.id) expandedSessionIds.delete(c.dataset.id);
        }
      });
      
      if (isExpanded) {
        card.classList.remove('expanded');
        expandedSessionIds.delete(session.id);
      } else {
        card.classList.add('expanded');
        expandedSessionIds.add(session.id);
      }
    });

    // Wire up buttons
    const sessionActions = cardHeader.querySelector('.session-actions');
    sessionActions.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    cardHeader.querySelector('.add-tab-btn').addEventListener('click', () => addActiveTabToSession(session.id));
    cardHeader.querySelector('.restore-btn').addEventListener('click', () => restoreSession(session.id));
    cardHeader.querySelector('.delete-btn').addEventListener('click', () => deleteSession(session.id));
    cardHeader.querySelector('.toggle-details-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      cardHeader.click();
    });

    // Schedule Panel
    const schedulePanel = document.createElement('div');
    schedulePanel.className = 'schedule-panel hidden';
    schedulePanel.innerHTML = `
      <input type="datetime-local" class="sch-when" aria-label="Schedule restoration date and time">
      <select class="sch-repeat" aria-label="Schedule recurrence">
        <option value="none">Once</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>
      <button class="btn primary-btn sch-set">Set</button>
      ${sch ? '<button class="btn secondary-btn sch-clear">Remove</button>' : ''}
    `;

    // Populate existing or default schedule values
    const whenInput = schedulePanel.querySelector('.sch-when');
    const repeatSelect = schedulePanel.querySelector('.sch-repeat');
    if (sch) {
      const schTime = getNextRun(sch);
      const localIso = new Date(schTime - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      whenInput.value = localIso;
      repeatSelect.value = sch.repeat || 'none';
    } else {
      const defaultTime = Date.now() + 3600000;
      const localIso = new Date(defaultTime - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      whenInput.value = localIso;
    }

    cardHeader.querySelector('.schedule-btn').addEventListener('click', () => {
      schedulePanel.classList.toggle('hidden');
    });
    schedulePanel.querySelector('.sch-set').addEventListener('click', () => {
      const v = schedulePanel.querySelector('.sch-when').value;
      setSchedule(session.id, v ? new Date(v).getTime() : 0, schedulePanel.querySelector('.sch-repeat').value);
    });
    const clearBtn = schedulePanel.querySelector('.sch-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => clearSchedule(session.id));

    // Session Details Accordion
    const cardDetails = document.createElement('div');
    cardDetails.className = 'session-card-details';
    
    const tabList = document.createElement('ul');
    tabList.className = 'tab-list';

    let lastDomain = null;
    [...session.tabs]
      .sort((a, b) => getDomain(a.url).localeCompare(getDomain(b.url)))
      .forEach((tab) => {
      const domain = getDomain(tab.url);
      if (domain !== lastDomain) {
        const header = document.createElement('li');
        header.className = 'domain-header';
        header.textContent = domain;
        tabList.appendChild(header);
        lastDomain = domain;
      }
      const tabItem = document.createElement('li');
      tabItem.className = 'tab-item-row';
      const faviconUrl = getFaviconUrl(tab.url, tab.favIconUrl);

      const a = document.createElement('a');
      a.className = 'tab-item';
      a.href = '#';
      a.title = tab.title + '\n' + tab.url;
      
      const faviconDiv = document.createElement('div');
      faviconDiv.className = 'tab-favicon';
      
      const fallbackSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;color:var(--text-tertiary)"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;

      if (faviconUrl) {
        const img = document.createElement('img');
        img.src = faviconUrl;
        img.alt = '';
        img.addEventListener('error', () => {
          img.style.display = 'none';
          faviconDiv.innerHTML = fallbackSvg;
        });
        faviconDiv.appendChild(img);
      } else {
        faviconDiv.innerHTML = fallbackSvg;
      }

      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title';
      titleSpan.textContent = tab.title;

      a.appendChild(faviconDiv);
      a.appendChild(titleSpan);

      // Clicking a tab inside details opens just that tab
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        chrome.tabs.create({ url: tab.url });
        showToast("Opening tab...", "success");
      });

      // Small cross button to delete this tab from the recorded session
      const deleteTabBtn = document.createElement('button');
      deleteTabBtn.className = 'tab-delete-btn';
      deleteTabBtn.title = 'Remove tab from session';
      deleteTabBtn.setAttribute('aria-label', 'Remove tab from session');
      deleteTabBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      deleteTabBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteTabFromSession(session.id, tab);
      });

      tabItem.appendChild(a);
      tabItem.appendChild(deleteTabBtn);
      tabList.appendChild(tabItem);
    });

    // Add Tab Container inside Accordion Details
    const addTabContainer = document.createElement('div');
    addTabContainer.className = 'session-add-tab-container';
    addTabContainer.innerHTML = `
      <div class="add-tab-bar">
        <button class="add-tab-action-btn add-current-tab-btn" title="Add active browser tab to this session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Add Current Tab</span>
        </button>
        <button class="add-tab-action-btn toggle-custom-url-btn" title="Add tab by entering a URL">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          <span>Add URL</span>
        </button>
      </div>
      <form class="custom-url-form hidden" autocomplete="off">
        <div class="custom-url-inputs">
          <input type="text" class="custom-url-input" placeholder="https://example.com" aria-label="Tab URL" required>
          <input type="text" class="custom-title-input" placeholder="Page Title (optional)" aria-label="Tab Title">
        </div>
        <div class="custom-url-actions">
          <button type="submit" class="btn primary-btn add-url-submit-btn">Add</button>
          <button type="button" class="btn secondary-btn cancel-url-btn">Cancel</button>
        </div>
      </form>
    `;

    addTabContainer.querySelector('.add-current-tab-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addActiveTabToSession(session.id);
    });

    const customUrlForm = addTabContainer.querySelector('.custom-url-form');
    const toggleCustomBtn = addTabContainer.querySelector('.toggle-custom-url-btn');
    const urlInput = customUrlForm.querySelector('.custom-url-input');
    const titleInput = customUrlForm.querySelector('.custom-title-input');
    const cancelBtn = customUrlForm.querySelector('.cancel-url-btn');

    toggleCustomBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isHidden = customUrlForm.classList.contains('hidden');
      customUrlForm.classList.toggle('hidden');
      if (isHidden) {
        urlInput.focus();
      }
    });

    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      customUrlForm.reset();
      customUrlForm.classList.add('hidden');
    });

    customUrlForm.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    customUrlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const urlVal = urlInput.value.trim();
      const titleVal = titleInput.value.trim();
      if (!urlVal) return;
      const success = addTabToSession(session.id, { url: urlVal, title: titleVal });
      if (success) {
        customUrlForm.reset();
        customUrlForm.classList.add('hidden');
      }
    });

    cardDetails.appendChild(tabList);
    cardDetails.appendChild(addTabContainer);
    card.appendChild(cardHeader);
    card.appendChild(schedulePanel);
    card.appendChild(cardDetails);
    sessionsList.appendChild(card);
  });
}

// Escape HTML utility to prevent XSS injection from tab titles/names
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Floating Toast Notification Manager (Anti-Spam / Deduplication)
let activeToast = null;
let toastDismissTimeout = null;
let toastRepeatCount = 1;

function showToast(message, type = 'success') {
  if (!toastContainer) return;

  // If the same message and type is already active, increment counter and reset timer
  if (activeToast && activeToast.dataset.message === message && activeToast.dataset.type === type) {
    toastRepeatCount++;
    const textSpan = activeToast.querySelector('.toast-message');
    if (textSpan) {
      textSpan.textContent = `${message} (×${toastRepeatCount})`;
    }

    // Trigger subtle bump animation for immediate visual feedback
    activeToast.classList.remove('toast-bump');
    void activeToast.offsetWidth; // force reflow
    activeToast.classList.add('toast-bump');

    // Reset auto-dismiss timer
    if (toastDismissTimeout) clearTimeout(toastDismissTimeout);
    toastDismissTimeout = setTimeout(() => dismissToast(activeToast), 2200);
    return;
  }

  // If a different toast is currently showing, remove immediately to avoid piling
  if (activeToast) {
    dismissToast(activeToast, true);
  }

  // Clear any existing toasts in container to ensure no piling
  Array.from(toastContainer.children).forEach(el => el.remove());

  toastRepeatCount = 1;
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'danger' ? 'toast-danger' : ''}`;
  toast.dataset.message = message;
  toast.dataset.type = type;

  toast.innerHTML = `
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Close Notification">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  activeToast = toast;

  // Close toast on button click
  toast.querySelector('.toast-close').addEventListener('click', () => {
    dismissToast(toast);
  });

  // Pause dismiss on hover
  toast.addEventListener('mouseenter', () => {
    if (toastDismissTimeout) clearTimeout(toastDismissTimeout);
  });
  toast.addEventListener('mouseleave', () => {
    if (activeToast === toast) {
      toastDismissTimeout = setTimeout(() => dismissToast(toast), 1800);
    }
  });

  // Auto remove toast after 2.2 seconds
  toastDismissTimeout = setTimeout(() => {
    dismissToast(toast);
  }, 2200);

  toastContainer.appendChild(toast);
}

function dismissToast(toast, immediate = false) {
  if (toastDismissTimeout) {
    clearTimeout(toastDismissTimeout);
    toastDismissTimeout = null;
  }
  if (activeToast === toast) {
    activeToast = null;
    toastRepeatCount = 1;
  }
  if (immediate) {
    toast.remove();
  } else {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    // Safety fallback if animationend doesn't fire
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 250);
  }
}
