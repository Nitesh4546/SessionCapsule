// background.js
// Background service worker for Session Capsule extension.

// Set Chrome/Edge specific behavior to open the side panel when the toolbar action button is clicked
if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => {
      console.error("Error setting side panel behavior:", error);
    });
} else if (typeof browser !== 'undefined' && browser.sidebarAction && browser.sidebarAction.toggle) {
  // Firefox desktop: toggle sidebar on action click
  browser.action.onClicked.addListener(() => {
    browser.sidebarAction.toggle();
  });
} else if (typeof chrome !== 'undefined' && chrome.action && chrome.action.setPopup) {
  // Mobile / Firefox Android fallback: use popup since side panel is unavailable
  chrome.action.setPopup({ popup: 'sidebar.html' });
}

// One-time safe data migration on extension update
function migrateDataOnUpdate(callback) {
  try {
    chrome.storage.local.get(['schema_version', 'saved_sessions', 'max_sessions', 'theme', 'schedules'], (result) => {
      try {
        if (chrome.runtime.lastError) {
          console.error("Migration read error:", chrome.runtime.lastError);
          if (callback) callback();
          return;
        }

        const currentSchemaVersion = result.schema_version || 1;
        if (currentSchemaVersion >= 2) {
          if (callback) callback();
          return;
        }

        let hasChanges = false;
        const updates = {};

        // Migrate saved_sessions: fill missing fields only, never delete or reorder
        if (Array.isArray(result.saved_sessions)) {
          const migratedSessions = result.saved_sessions.map((session, index) => {
            if (!session || typeof session !== 'object') return session;
            let sessionChanged = false;
            const updated = { ...session };

            if (!updated.id) {
              updated.id = 'session_' + (updated.timestamp || Date.now()) + '_' + index;
              sessionChanged = true;
            }
            if (typeof updated.name !== 'string' || !updated.name.trim()) {
              updated.name = 'Untitled session';
              sessionChanged = true;
            }
            if (typeof updated.timestamp !== 'number' || isNaN(updated.timestamp)) {
              updated.timestamp = Date.now();
              sessionChanged = true;
            }
            if (!Array.isArray(updated.tags)) {
              updated.tags = [];
              sessionChanged = true;
            }
            if (!Array.isArray(updated.tabs)) {
              updated.tabs = [];
              sessionChanged = true;
            } else {
              const updatedTabs = updated.tabs.map((tab) => {
                if (!tab || typeof tab !== 'object') {
                  sessionChanged = true;
                  return { title: 'Untitled Tab', url: '', favIconUrl: '' };
                }
                const tTitle = (typeof tab.title === 'string' && tab.title.trim()) ? tab.title.trim() : (tab.url || 'Untitled Tab');
                const tUrl = typeof tab.url === 'string' ? tab.url : '';
                const tFav = typeof tab.favIconUrl === 'string' ? tab.favIconUrl : '';
                if (tab.title !== tTitle || tab.url !== tUrl || tab.favIconUrl !== tFav) {
                  sessionChanged = true;
                  return { ...tab, title: tTitle, url: tUrl, favIconUrl: tFav };
                }
                return tab;
              });
              updated.tabs = updatedTabs;
            }

            if (sessionChanged) {
              hasChanges = true;
            }
            return updated;
          });

          if (hasChanges) {
            updates.saved_sessions = migratedSessions;
          }
        }

        // max_sessions check
        if (result.max_sessions === undefined) {
          updates.max_sessions = 10;
          hasChanges = true;
        }

        // theme check
        if (!result.theme) {
          updates.theme = 'system';
          hasChanges = true;
        }

        // schedules check
        if (!Array.isArray(result.schedules)) {
          updates.schedules = [];
          hasChanges = true;
        }

        // Record schema version 2 so migration runs once
        updates.schema_version = 2;

        chrome.storage.local.set(updates, () => {
          if (chrome.runtime.lastError) {
            console.error("Migration write error:", chrome.runtime.lastError);
          } else {
            console.log("Session Capsule update migration completed safely.");
          }
          if (callback) callback();
        });
      } catch (err) {
        console.error("Error during migration execution:", err);
        if (callback) callback();
      }
    });
  } catch (err) {
    console.error("Error initiating migration:", err);
    if (callback) callback();
  }
}

// Log confirmation when the extension is loaded or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Session Capsule extension installed/updated. Reason:", details.reason);
  if (details.reason === 'update') {
    migrateDataOnUpdate(() => {
      syncAlarms();
    });
  } else {
    syncAlarms();
  }
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

  if (typeof chrome.windows !== 'undefined' && chrome.windows && chrome.windows.create) {
    if (urls.length > 0) {
      chrome.windows.create({ url: urls });
    } else {
      chrome.windows.create({});
    }
  } else if (typeof chrome.tabs !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    urls.forEach((u) => chrome.tabs.create({ url: u }));
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
