<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Session Capsule Logo">
</p>

# Session Capsule

**Session Capsule** is a modern, lightweight, and privacy-focused browser extension designed with a clean Google Chrome-inspired aesthetic. It allows you to effortlessly capture, organize, schedule, and restore your active window tab sessions directly from the browser's side panel or popup.

<p align="center">
  <a href="https://addons.mozilla.org/en-US/firefox/addon/sessioncapsule/">
    <img src="https://img.shields.io/badge/Firefox-Add--ons-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white" alt="Get Firefox Extension">
  </a>
  &nbsp;
  <img src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Manifest V3">
  &nbsp;
  <img src="https://img.shields.io/badge/Storage-100%25%20Local-34A853?style=for-the-badge" alt="Local Storage">
</p>

---

## ✨ Features

### 🚀 Session Capsule
- **1-Click Window Capture**: Save all open tabs in your active window instantly with an automatically generated timestamp name (`Session-YYYY-MM-DD-HH-MM`) or custom session name.
- **Smart Tab Filtering**: Automatically filters out empty pages (`about:blank`, new tab pages) and deduplicates identical URLs when saving, keeping your live browser tabs untouched.
- **Instant Restore**: Reopen an entire tab session in a new window with a single click, or expand the session card to view and open individual links.
- **Add Tabs to Saved Sessions**:
  - **1-Click Active Tab Add**: Click the `+` icon on any session card header to immediately append your currently active tab.
  - **Custom URL Input**: Expand any session to manually input specific URLs and custom titles.
- **Interactive Tab Deletion**: Remove individual tabs (`×`) from any saved session dynamically with automatic session pruning if empty.

### ⏰ Automated Scheduling & Reminders
- **Scheduled Launches**: Set sessions to automatically open at specific dates and times using browser alarms (`chrome.alarms`).
- **Recurrence Options**: Choose between **Once**, **Daily**, or **Weekly** recurring schedules.
- **Duplicate Window Protection**: Intelligent deduplication ensures scheduled sessions launch cleanly into a single browser window.
- **Missed Alarm Catch-up**: Safely catches up and executes missed scheduled sessions upon browser launch.

### 🔍 Search & Categorization
- **Custom Tagging**: Tag sessions with comma-separated labels (e.g., `work`, `research`, `reading`) when saving.
- **Real-Time Instant Search**: Fast, responsive search that filters across session names, custom tags, domain names, tab titles, and URLs.
- **Domain Breakdown**: Groups saved tabs by domain with clean uppercase headers and favicons.

### 🎨 Google Chrome-Inspired Design Language
- **Minimal & Polished Aesthetics**: Clean light surfaces (`#ffffff`, `#f8f9fa`), subtle cards, Google Blue accents (`#1a73e8`), and fluid micro-transitions.
- **Ultra-Minimal Header**: Sleek top utility bar featuring solely the unobtrusive settings gear icon, aligned with the first section to maximize screen real estate.
- **Native System Theme Tracking**: Dynamically and automatically switches between light mode and neutral charcoal dark mode (`#202124`) based on your operating system or browser settings.
- **Configurable FIFO Storage Limits**: Set your preferred maximum saved sessions limit (default: 10). When reached, older sessions are pruned automatically to preserve memory.
- **Privacy & Security**: 100% local storage via `chrome.storage.local`. No external tracking, telemetry, or third-party servers.

---

## 📸 Preview & Demos

### Firefox
<p align="center">
  <img src=".img/preview3.png" width="360" alt="Session Capsule Firefox Light Mode">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src=".img/preview4.png" width="360" alt="Session Capsule Firefox Dark Mode">
</p>

### Chrome
<p align="center">
  <img src=".img/preview1.png" width="360" alt="Session Capsule Chrome Light Mode">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src=".img/preview2.png" width="360" alt="Session Capsule Chrome Dark Mode">
</p>

---

## 🏗️ Project Architecture

```text
├── manifest.json          # Manifest V3 extension configuration & permissions
├── background.js          # Service worker for Side Panel behavior & scheduled alarms
├── sidebar.html           # Main Sidebar / Popup interface markup
├── sidebar.js             # Core controller logic, storage management & interactions
├── sidebar.css            # Google Chrome-inspired design system & theme variables
├── icons/                 # Extension toolbar and application icons (16px, 48px, 128px)
└── .img/                  # Previews, screenshots, and walkthrough demo assets
```

---

## 📥 Installation

### 🦊 Firefox
Install the published version directly from Firefox Add-ons:
1. Visit [SessionCapsule on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/sessioncapsule/).
2. Click **Add to Firefox** and grant permissions.

### 🌐 Google Chrome, Brave, Edge & Opera
To install the unpacked extension in developer mode:

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Nitesh4546/Sessions-Capsule.git
   ```
2. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`, `brave://extensions/`).
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left toolbar.
5. Select the project folder (or `SessionCapsule/v7.0` where `manifest.json` resides).
6. Pin **Session Capsule** to your browser toolbar and click the icon to open the side panel!

---

## ⚙️ Settings & Customization

Click the **Settings (`⚙`)** icon in the top-right corner of the extension to configure:
- **Maximum saved sessions**: Adjust the FIFO session retention limit (1–100).
- **Clear All Saved Sessions**: One-click reset to purge all saved session data.

---

## 🔒 Privacy & Permissions

Session Capsule strictly operates with minimal permissions required for functionality:
- `tabs`: Query open tabs in the current window to capture URLs, titles, and favicons.
- `storage`: Store your saved sessions, tags, and settings locally on your machine.
- `sidePanel`: Open the sidebar panel when the extension action icon is clicked.
- `alarms`: Trigger scheduled session launches at user-defined dates and times.

No personal data is collected, stored remotely, or transmitted across networks.

---

## 📄 License

Distributed under the MIT License. Feel free to use, modify, and distribute.
