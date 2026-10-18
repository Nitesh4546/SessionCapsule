// background.js
// Background service worker for Session Capsule extension.

// Set Chrome/Edge specific behavior to open the side panel when the toolbar action button is clicked
if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => {
      console.error("Error setting side panel behavior:", error);
    });
} else if (typeof chrome !== 'undefined' && chrome.action && chrome.action.setPopup) {
  // Mobile / Firefox Android fallback: use popup since side panel is unavailable
  chrome.action.setPopup({ popup: 'sidebar.html' });
}

// Log confirmation when the extension is loaded or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Session Capsule extension installed/updated. Reason:", details.reason);
  syncAlarms();
});

// ---- Scheduled session restoration ----
const REPEAT_MINUTES = { daily: 1440, weekly: 10080 };

function nextRun(s) {
  const step = REPEAT_MINUTES[s.repeat] * 60000;
  if (!step || s.when > Date.now()) return s.when;
  return s.when + Math.ceil((Date.now() - s.when) / step) * step;
}

// Cooldown tracker to prevent duplicate window launches for the same schedule or session
const recentRestorations = new Map();

function isRecentlyRestored(key, cooldownMs = 10000) {
  const lastTime = recentRestorations.get(key);
  const now = Date.now();
  if (lastTime && (now - lastTime) < cooldownMs) {
    return true;
  }
  recentRestorations.set(key, now);
  // Periodic cleanup of older keys
  if (recentRestorations.size > 50) {
    for (const [k, time] of recentRestorations.entries()) {
      if (now - time > 60000) recentRestorations.delete(k);
    }
  }
  return false;
}

// Helper to safely restore a session's tabs in exactly one new window
function restoreSessionWindow(session, scheduleId = null) {
  if (!session || !session.tabs) return;

  const sessionKey = 'session_' + session.id;
  const scheduleKey = scheduleId ? 'sch_' + scheduleId : sessionKey;

  // Prevent multiple concurrent or closely repeated window openings
  if (isRecentlyRestored(sessionKey) || (scheduleId && isRecentlyRestored(scheduleKey))) {
    console.log(`[SessionCapsule] Duplicate restoration prevented for session "${session.name || session.id}"`);
    return;
  }

  // Exclude internal browser URLs that cannot be created by extensions
  const urls = session.tabs
    .map((t) => t.url)
    .filter((u) => u && !/^(chrome|chrome-extension|edge|devtools|about):/i.test(u));

  if (urls.length > 0) {
    chrome.windows.create({ url: urls });
  } else {
    chrome.windows.create({});
  }
}

// Alarms may be cleared on browser restart, so recreate them.
function syncAlarms() {
  chrome.storage.local.get(['schedules', 'saved_sessions'], ({ schedules = [], saved_sessions = [] }) => {
    const valid = [];
    let updated = false;

    schedules.forEach((s) => {
      const session = saved_sessions.find((sess) => sess.id === s.sessionId);
      if (!session) {
        chrome.alarms.clear(s.id);
        updated = true;
        return; // Session no longer exists: drop schedule
      }

      const repeating = !!REPEAT_MINUTES[s.repeat];

      // If scheduled time has already passed
      if (s.when <= Date.now()) {
        if (!repeating) {
          // If a one-time schedule already passed in the past, clear it
          chrome.alarms.clear(s.id);
          updated = true;
          return;
        } else {
          // Advance repeating schedule to future run
          const nextWhen = nextRun(s);
          if (s.when !== nextWhen) {
            s.when = nextWhen;
            updated = true;
          }
        }
      }

      const nextWhen = repeating ? nextRun(s) : s.when;
      if (s.when !== nextWhen) {
        s.when = nextWhen;
        updated = true;
      }
      valid.push(s);

      const opts = { when: nextWhen };
      if (repeating) opts.periodInMinutes = REPEAT_MINUTES[s.repeat];
      chrome.alarms.create(s.id, opts);
    });

    if (updated || valid.length !== schedules.length) {
      chrome.storage.local.set({ schedules: valid });
    }
  });
}

chrome.runtime.onStartup.addListener(syncAlarms);

// Single handler for alarm triggers: restores the scheduled session once
chrome.alarms.onAlarm.addListener((alarm) => {
  chrome.storage.local.get(['schedules', 'saved_sessions'], ({ schedules = [], saved_sessions = [] }) => {
    const sch = schedules.find((s) => s.id === alarm.name);
    if (!sch) return;

    const session = saved_sessions.find((s) => s.id === sch.sessionId);
    if (session) {
      restoreSessionWindow(session, sch.id);
    }

    // Remove one-time schedules and schedules whose session no longer exists
    if (!session || !REPEAT_MINUTES[sch.repeat]) {
      chrome.alarms.clear(sch.id);
      chrome.storage.local.set({ schedules: schedules.filter((s) => s.id !== sch.id) });
    } else {
      // Advance repeating schedule to the next run time in storage for accurate UI badges
      sch.when = nextRun({ ...sch, when: Date.now() + 1000 });
      chrome.storage.local.set({ schedules });
    }
  });
});
