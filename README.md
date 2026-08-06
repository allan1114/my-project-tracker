# # my-project-tracker 📋

[![Language](https://img.shields.io/badge/Language-Vanilla%20JS-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Style](https://img.shields.io/badge/Style-CSS3%20%2F%20Flexbox-blue.svg)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![Storage](https://img.shields.io/badge/Storage-localStorage-green.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)

A lightweight, high-performance **Single Page Application (SPA)** for project management. Built with pure HTML, CSS, and Vanilla JavaScript—no frameworks required.

[Explore Demo](https://allan1114.github.io/my-project-tracker) · [Report Bug](https://github.com/allan1114/my-project-tracker/issues) · [Request Feature](https://github.com/allan1114/my-project-tracker/issues)

---

## 🚀 核心功能 (Core Features)

### 1. 看板系統 (Kanban Board)
Efficiently manage your workflow with a dynamic drag-and-drop interface.
- **5 狀態欄位**: 待辦 (To Do), 進行中 (In Progress), 暫停 (On Hold), 卡關 (Blocked), 完成 (Done).
- **拖放功能**: Seamlessly move tasks between columns.
- **豐富資訊**: Displays priority, tags, owner, cover image, and progress bar at a glance.

### 2. 日曆視圖 (Calendar View) 📅
- Monthly overview of all tasks.
- Visual mapping of deadlines.
- Intuitive navigation between months.

### 3. 進階任務管理 (Task Management) ✅
Every task is a powerhouse of information:
- **Metadata**: Priority (High/Med/Low), Assignee, Deadlines.
- **Tagging**: Categorize with `🐛 Bug`, `✨ Feature`, `🔥 Urgent`, `🎨 Design`.
- **Sub-tasks**: Interactive checklists with an auto-calculating progress bar.
- **Tools**: Integrated **Work Timer**, Comment system, and Task Duplication.
- **Attachments**: Link-based attachments with simulated upload interface.

### 4. 數據可視化 (Dashboard) 📈
Powered by **Chart.js**:
- **Task Distribution**: Doughnut chart for status overview.
- **Workload Analysis**: Bar chart comparing member assignments.

---

## 🛠 技術架構 (Technical Stack)

| Category | Technology | Usage |
| :--- | :--- | :--- |
| **Frontend** | HTML5 / CSS3 | Semantic structure and responsive Grid/Flexbox layouts. |
| **Logic** | Vanilla JavaScript | All application logic, DOM manipulation, and state management. |
| **Charts** | Chart.js | Rendering interactive project analytics. |
| **Effects** | Canvas-confetti | Celebration animation upon task completion. |
| **Fonts** | Google Fonts | Inter typeface for modern readability. |

### 資料存儲 (Data Storage)
The app utilizes `localStorage` for persistent data without a backend:
- `v13_tasks`: Task data & states.
- `v13_members`: Team member profiles.
- `v13_activities`: Audit logs.
- `lang` / `theme`: User preferences.

v12 data (if present) is automatically merged into v13 on first load.

---

## 🛡️ v13.1 Hardening Notes

- **XSS-safe rendering**: all user-supplied fields (task names, tags, comments, attachments, member names, log entries) are HTML-escaped; inline `onclick` interpolation has been replaced with delegated `data-action` handlers.
- **URL allowlist**: attachment/image URLs are filtered to `http(s)`/`mailto` — `javascript:` / `data:` schemes render as inert.
- **Resilient storage**: corrupt `localStorage` no longer halts boot; quota errors are surfaced to the user.
- **Timer & chart lifecycle**: the 1-second timer interval only runs while a task modal is open; Chart.js instances are destroyed on dashboard close. Switching between tasks finalizes the previous task's running timer.
- **a11y**: icon-only buttons have `aria-label`s; modals trap focus; priority indicators include emoji (not color alone).
- **Search debounce**: keyword/tag filters debounce 300 ms to stay smooth on large boards.
- **Import safety**: malformed JSON imports show an error instead of crashing.

---

## 🎨 設計特色 (Design Highlights)

- **Modern UI**: Clean Indigo-based (#4f46e5) color palette with card-based design and fluid transitions.
- **Dark Mode**: Toggle between light and dark themes effortlessly.
- **Focus Mode**: Hide "Done" and "Blocked" columns to reduce clutter.
- **UX Polish**:
  - **Auto-Sort**: Tasks automatically reorder based on priority.
  - **Visual Alerts**: Red borders for overdue tasks.
  - **Bilingual**: Instant switch between Traditional Chinese and English.

---

## ⌨️ 鍵盤快捷鍵 (Keyboard Shortcuts)

| Key | Action |
| :---: | :--- |
| <kbd>N</kbd> | Create New Task |
| <kbd>Esc</kbd> | Close Current Modal / Popup |

---

## 📦 安裝與使用 (Installation)

Since this is a pure Vanilla JS project, no installation is required.

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/my-project-tracker.git
   ```
2. Open `index.html` in any modern web browser.
3. (Optional) Use **Live Server** in VS Code for a better development experience.

---

## 🤝 適用場景 (Use Cases)

- 🧑‍💻 **個人專案管理**: Track your side projects and learning progress.
- 👥 **小型團隊協作**: Manage small team tasks without complex software overhead.
- 🏃 **Agile/Scrum**: Use the Kanban for daily standup tracking.
- ✅ **待辦事項管理**: A robust alternative to simple To-Do lists.


---

**Built with ❤️ by Alan **
*If you find this project useful, give it a ⭐!*
