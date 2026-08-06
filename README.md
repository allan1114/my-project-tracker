# my-project-tracker 📋

[![CI](https://github.com/allan1114/my-project-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/allan1114/my-project-tracker/actions/workflows/ci.yml)
[![Language](https://img.shields.io/badge/Language-Vanilla%20JS-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Build](https://img.shields.io/badge/Build-Vite-646cff.svg)](https://vite.dev)
[![Database](https://img.shields.io/badge/Database-Postgres-336791.svg)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)

A project management **Single Page Application** — Kanban, calendar and analytics — written in
vanilla JavaScript with no UI framework. It runs entirely offline against `localStorage`, and
optionally syncs to Postgres behind a Firebase login.

[Explore Demo](https://allan1114.github.io/my-project-tracker) ·
[Report Bug](https://github.com/allan1114/my-project-tracker/issues) ·
[Request Feature](https://github.com/allan1114/my-project-tracker/issues)

---

## 🚀 核心功能 (Core Features)

### 1. 看板系統 (Kanban Board)
- **5 狀態欄位**: 待辦 (To Do), 進行中 (In Progress), 暫停 (On Hold), 卡關 (Blocked), 完成 (Done).
- **拖放功能**: Drag tasks between columns, with a drop-target highlight.
- **豐富資訊**: Priority badge, tags, owner avatar, cover image and checklist progress at a glance.

### 2. 日曆視圖 (Calendar View) 📅
Monthly grid of due dates with month-to-month navigation.

### 3. 進階任務管理 (Task Management) ✅
- **Metadata**: Priority, assignee, due date, cover image, description.
- **Tagging**: `🐛 Bug`, `✨ Feature`, `🔥 Urgent`, `🎨 Design`, plus anything you type.
- **Sub-tasks**: Checklists with an auto-calculating progress bar.
- **Work timer**: Per-task time tracking that does *not* keep counting while the app is closed.
- **Comments**, **task duplication**, and link **attachments**.

### 4. 數據可視化 (Dashboard) 📈
A full view, not a popup: six KPI tiles (total, in progress, blocked, overdue, done this week,
time tracked), a status doughnut, per-assignee workload as a stacked bar, a 30-day completion
trend, and an overdue table sorted worst-first where every row links to its task.

The five status colours were **measured, not picked** — run through a categorical-palette
validator (lightness band, chroma floor, colour-vision-deficiency separation, normal-vision
separation, contrast) against the real light and dark chart surfaces. Two things came out of it:
the old slate `#94a3b8` read as gray and failed the chroma floor, and amber-on-hold beside
red-blocked cannot be separated for deuteranopes anywhere in the dark lightness band. Since
separation is measured on *adjacent* pairs, the charts draw in the order
`blocked → todo → onhold → inprogress → done` — deliberately not the board's column order — which
passes every check in both themes. Gold still sits at 2.38:1 on white, so every chart ships a
legend and the status breakdown is also rendered as a table: identity is never colour alone.

---

## 🛠 技術架構 (Technical Stack)

| Category | Technology |
| :--- | :--- |
| **Frontend** | Vanilla JS (ES modules), CSS3 Grid/Flexbox |
| **Build** | Vite |
| **Tests** | Vitest + jsdom, ESLint |
| **Charts** | Chart.js (lazy-loaded) |
| **Auth** *(optional)* | Firebase Authentication |
| **Database** *(optional)* | Supabase Postgres with Row-Level Security |

### 專案結構 (Project layout)

```
index.html              markup shell only
src/
  main.js               bootstrap + delegated event wiring
  state.js              in-memory store, notifies subscribers
  i18n.js               zh-HK / en-US string table
  backup.js             JSON export + import
  timer-sync.js         keeps work timers honest across sessions
  util/                 dom, storage, task shape + normalizer
  auth/                 Firebase Auth facade
  storage/              local (localStorage) and supabase (Postgres) adapters
  views/                kanban, calendar, task-modal, team, log, dashboard
  styles/               base, board, modal, dashboard
supabase/migrations/    SQL schema with RLS policies
tests/                  Vitest unit tests
```

---

## 📦 安裝與使用 (Getting started)

```bash
npm install
npm run dev      # dev server with hot reload
npm test         # unit tests
npm run lint     # ESLint
npm run build    # production bundle into dist/
```

With no configuration the app runs in **guest mode**: everything is stored in `localStorage`,
exactly as it always has. No account required.

---

## ☁️ 雲端同步設定 (Optional cloud sync)

Login is handled by **Firebase Auth**; data lives in **Supabase Postgres**. Firebase has no SQL
product — Firestore and RTDB are NoSQL document stores — so identity and storage are split, and
Supabase's Third-Party Auth accepts the Firebase ID token directly. Row-Level Security compares
`auth.jwt() ->> 'sub'` (the Firebase UID) against each row's `owner_uid`, so no custom backend or
token-exchange server is involved.

### 1. Firebase (login)
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method →** enable **Google**.
3. **Authentication → Settings → Authorized domains →** add your deploy domain
   (`allan1114.github.io`) and `localhost`.
4. **Project settings → Your apps → Web app** — copy the config values.

### 2. Supabase (storage)
1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`).
3. **Authentication → Sign In / Providers → Third-Party Auth →** add **Firebase**, entering your
   Firebase project ID. Without this step `auth.jwt()` carries no Firebase claims and every query
   returns zero rows.
4. **Project Settings → Data API** — copy the URL and the publishable `anon` key.

### 3. Configure
```bash
cp .env.example .env.local   # then fill in the values
```

For the GitHub Pages deploy, set the same names as **repository variables**
(Settings → Secrets and variables → Actions → Variables); `.github/workflows/deploy.yml` reads them.

> **On these keys:** the Firebase API key and the Supabase `anon` key are *public client
> identifiers*. They ship inside the JavaScript bundle by design, and access is controlled by
> Firebase Auth settings and Postgres RLS — not by keeping them hidden. The Supabase
> `service_role` key is a genuine secret and must never appear in this project.

### First sign-in
If the browser already holds a guest board, signing in offers a one-time upload into your
account. It only offers this when the cloud account is empty, it always asks first, and your local
copy is never deleted.

---

## 🗄 資料庫結構 (Database schema)

Normalized rather than a JSON blob per task:

| Table | Purpose |
| :--- | :--- |
| `members` | Team members, unique per `(owner_uid, name)` |
| `tasks` | Core task row; `status` and `priority` are `CHECK`-constrained |
| `task_tags` | Tags, composite PK on `(task_id, tag)` |
| `checklist_items` | Sub-tasks with explicit ordering |
| `comments` | Per-task discussion |
| `attachments` | Link and file references |
| `activities` | Audit log, capped at 50 entries |

Every table has RLS enabled. Owner-scoped tables compare `owner_uid` to the Firebase UID directly;
child tables authorize through their parent task via a single shared `owns_task()` predicate, so a
new child table cannot accidentally be given a weaker rule.

---

## 🛡️ Hardening notes

- **XSS-safe rendering**: every user-supplied field is HTML-escaped; there are no inline event
  handlers, and nothing is exposed on `window`.
- **URL allowlist**: attachment and image URLs must be absolute `http(s)`/`mailto`. Relative input
  is rejected rather than resolved against the app's own origin.
- **Resilient storage**: corrupt `localStorage` never halts boot, and quota errors surface to the user.
- **Input validation**: every task — typed, cloned, imported, or read from Postgres — passes through
  `normalizeTask()`, so an unrecognized status can't reach the renderer.
- **Honest timers**: a timer left running when the tab closes is reconciled against a heartbeat, so
  time the app spent closed is never billed to a task.
- **a11y**: icon-only buttons carry `aria-label`s, modals trap focus, priority is conveyed by emoji
  as well as colour, `<html lang>` tracks the selected language, and pinch-zoom is not disabled.

---

## 🎨 設計特色 (Design highlights)

- **Dark mode** across every surface, including tags, avatars, chips and charts.
- **Focus Mode**: hide Done and Blocked to reduce clutter.
- **Auto-Sort** by priority, **overdue** highlighting, and **bilingual** zh-HK / en-US switching.

## ⌨️ 鍵盤快捷鍵 (Keyboard shortcuts)

| Key | Action |
| :---: | :--- |
| <kbd>N</kbd> | Create new task (ignored while a modal is open) |
| <kbd>Esc</kbd> | Close the current modal |

---

## 🧪 開發 (Contributing)

`npm test` covers the pure logic — the task normalizer, timer arithmetic, filters, backup
parsing, the v12 migration and every dashboard aggregation. `npm run lint` and `npm run build`
round out what CI checks on each PR. If you touch the chart palette, re-run it through a
categorical-palette validator against both surfaces rather than eyeballing the result.

---

**Built with ❤️ by Alan**
*If you find this project useful, give it a ⭐!*
