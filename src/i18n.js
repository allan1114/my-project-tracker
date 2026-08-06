/** Bilingual (Traditional Chinese / English) string table and DOM application. */

const dict = {
  zh: {
    nav_dash: '📈 儀表板', nav_log: '📜 日誌', nav_team: '👥 隊員',
    search_title: '🔍 搜尋與篩選', ph_keyword: '輸入關鍵字...', all_members: '所有成員',
    ph_filter_tag: '過濾標籤...', add_title: '➕ 快速新增', ph_task_name: '任務名稱...',
    ph_tags: '標籤...', ph_img_url: '圖片 URL...', unassigned: '(未指派)', btn_add: '新增任務',
    col_todo: '📋 待辦', col_inprogress: '⚡ 進行中', col_onhold: '⏸️ 暫停',
    col_blocked: '⛔ 卡關', col_done: '✅ 完成', btn_clone: '©️ 複製',
    lbl_status: '狀態', lbl_assignee: '負責人', lbl_priority: '優先級', lbl_tags: '標籤',
    lbl_img: '圖片', ph_subtask: '新增細項...', btn_delete: '刪除任務',
    chart_status: '任務狀態分佈', chart_workload: '負責人工作量', chart_trend: '30 天完成趨勢',
    log_title: '📜 活動日誌', btn_clear_log: '清空', team_title: '👥 設定隊員',
    ph_name: '輸入名字...', btn_join: '加入', lbl_desc: '📝 詳細描述', lbl_comments: '💬 留言',
    view_kanban: '📋 看板', view_cal: '📅 日曆', view_dash: '📈 儀表板',
    btn_sort: '🚨 排序', btn_focus: '👀 專注', lbl_attach: '📎 附件',
    kpi_total: '任務總數', kpi_inprogress: '進行中', kpi_blocked: '卡關',
    kpi_overdue: '逾期', kpi_done_week: '本週完成', kpi_tracked: '已記錄時間',
    tbl_overdue: '逾期任務', tbl_task: '任務', tbl_assignee: '負責人', tbl_days: '逾期天數',
    none_overdue: '沒有逾期任務 🎉', unassigned_short: '未指派',
    sign_in: '登入', sign_out: '登出', guest: '訪客（僅本機）',
    st_todo: '待辦', st_inprogress: '進行中', st_onhold: '暫停', st_blocked: '卡關', st_done: '完成'
  },
  en: {
    nav_dash: '📈 Dashboard', nav_log: '📜 Logs', nav_team: '👥 Team',
    search_title: '🔍 Search & Filter', ph_keyword: 'Keyword...', all_members: 'All Members',
    ph_filter_tag: 'Filter tag...', add_title: '➕ Quick Add', ph_task_name: 'Task Name...',
    ph_tags: 'Tags...', ph_img_url: 'Image URL...', unassigned: '(Unassigned)', btn_add: 'Add Task',
    col_todo: '📋 To Do', col_inprogress: '⚡ In Progress', col_onhold: '⏸️ On Hold',
    col_blocked: '⛔ Blocked', col_done: '✅ Done', btn_clone: '©️ Clone',
    lbl_status: 'Status', lbl_assignee: 'Assignee', lbl_priority: 'Priority', lbl_tags: 'Tags',
    lbl_img: 'Image', ph_subtask: 'Add subtask...', btn_delete: 'Delete Task',
    chart_status: 'Status Distribution', chart_workload: 'Member Workload', chart_trend: '30-Day Completion Trend',
    log_title: '📜 Activity Log', btn_clear_log: 'Clear', team_title: '👥 Team Settings',
    ph_name: 'Enter name...', btn_join: 'Add', lbl_desc: '📝 Description', lbl_comments: '💬 Comments',
    view_kanban: '📋 Kanban', view_cal: '📅 Calendar', view_dash: '📈 Dashboard',
    btn_sort: '🚨 Sort', btn_focus: '👀 Focus', lbl_attach: '📎 Attachments',
    kpi_total: 'Total Tasks', kpi_inprogress: 'In Progress', kpi_blocked: 'Blocked',
    kpi_overdue: 'Overdue', kpi_done_week: 'Done This Week', kpi_tracked: 'Time Tracked',
    tbl_overdue: 'Overdue Tasks', tbl_task: 'Task', tbl_assignee: 'Assignee', tbl_days: 'Days Late',
    none_overdue: 'Nothing overdue 🎉', unassigned_short: 'Unassigned',
    sign_in: 'Sign in', sign_out: 'Sign out', guest: 'Guest (local only)',
    st_todo: 'To Do', st_inprogress: 'In Progress', st_onhold: 'On Hold', st_blocked: 'Blocked', st_done: 'Done'
  }
};

let currentLang = 'zh';
try {
  currentLang = localStorage.getItem('lang') || 'zh';
} catch {
  /* storage blocked */
}
if (!dict[currentLang]) currentLang = 'zh';

export function lang() {
  return currentLang;
}

export function isZh() {
  return currentLang === 'zh';
}

/** BCP 47 tag for Intl / toLocaleString. 'zh' alone formats inconsistently. */
export function localeTag() {
  return currentLang === 'zh' ? 'zh-HK' : 'en-US';
}

export function t(key) {
  return dict[currentLang][key] ?? key;
}

/** Pick the matching string from a {zh, en} pair — for one-off dialog text. */
export function pick(zh, en) {
  return currentLang === 'zh' ? zh : en;
}

export function setLang(next) {
  if (!dict[next]) return;
  currentLang = next;
  try {
    localStorage.setItem('lang', next);
  } catch {
    /* storage blocked */
  }
}

export function toggleLang() {
  setLang(currentLang === 'zh' ? 'en' : 'zh');
}

export function applyLanguage() {
  // Keep <html lang> in sync so assistive tech uses the right pronunciation.
  document.documentElement.lang = localeTag();
  const btn = document.getElementById('lang-btn-text');
  if (btn) btn.innerText = currentLang === 'zh' ? '中/EN' : 'EN/中';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = dict[currentLang][el.getAttribute('data-i18n')];
    if (v) el.innerText = v;
  });
  document.querySelectorAll('[data-ph]').forEach((el) => {
    const v = dict[currentLang][el.getAttribute('data-ph')];
    if (v) el.placeholder = v;
  });
}
