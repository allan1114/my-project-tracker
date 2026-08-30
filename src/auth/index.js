/**
 * Authentication facade.
 *
 * The app must run without any backend configured, so this module resolves to
 * a guest session whenever Firebase credentials are absent. Callers never
 * branch on whether auth exists — they just get a user or null.
 */

import { $ } from '../util/dom.js';
import { t, pick } from '../i18n.js';
// Static: the local adapter is in the entry chunk anyway (main.js needs it to
// boot), so importing it dynamically here only produced a bundler warning.
import { createLocalAdapter } from '../storage/local.js';

let user = null;
let handlers = {};

export function currentUser() {
  return user;
}

export function currentUserName() {
  return user?.displayName || user?.email || null;
}

export function isConfigured() {
  return Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID);
}

export function renderAuthChip() {
  const box = $('auth-box');
  if (!box) return;

  if (!isConfigured()) {
    box.innerHTML = `<span class="auth-user"><span class="sync-dot"></span>${t('guest')}</span>`;
    return;
  }
  if (user) {
    const label = currentUserName() || '';
    const initial = (label[0] || '?').toUpperCase();
    box.innerHTML =
      `<span class="auth-user"><span class="sync-dot cloud" title="Synced"></span>` +
      `<span class="auth-avatar">${initial}</span>${label}</span>` +
      `<button class="nav-btn" data-action="signOut">${t('sign_out')}</button>`;
  } else {
    box.innerHTML =
      `<span class="auth-user"><span class="sync-dot"></span>${t('guest')}</span>` +
      `<button class="nav-btn" data-action="signIn">${t('sign_in')}</button>`;
  }
}

/**
 * Wire up auth. `onAdapterChange` is called with the storage adapter that
 * matches the current session — local when signed out, cloud when signed in.
 */
export async function initAuth(opts = {}) {
  handlers = opts;
  renderAuthChip();
  if (!isConfigured()) return;

  const { watchAuth } = await import('./firebase.js');
  await watchAuth(async (nextUser) => {
    user = nextUser;
    renderAuthChip();
    await handlers.onAdapterChange?.(await adapterForUser(nextUser));
  });
}

/**
 * Which cloud backend a signed-in session uses.
 *
 * Firestore is the default: it needs nothing beyond the Firebase project that
 * already provides login. Supabase is chosen when its keys are present so that
 * a deployment already storing boards in Postgres keeps loading them after
 * this change rather than opening onto an empty Firestore. Set
 * VITE_CLOUD_BACKEND to force either one.
 */
export function cloudBackend() {
  const forced = import.meta.env.VITE_CLOUD_BACKEND;
  if (forced === 'firestore' || forced === 'supabase') return forced;
  const supabaseConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );
  return supabaseConfigured ? 'supabase' : 'firestore';
}

async function createCloudAdapter(nextUser) {
  if (cloudBackend() === 'supabase') {
    const { createSupabaseAdapter } = await import('../storage/supabase.js');
    return createSupabaseAdapter(nextUser);
  }
  const { createFirestoreAdapter } = await import('../storage/firestore.js');
  return createFirestoreAdapter(nextUser);
}

async function adapterForUser(nextUser) {
  if (!nextUser) return createLocalAdapter();
  try {
    const cloud = await createCloudAdapter(nextUser);
    // First sign-in on a browser that already has a guest board: offer to
    // bring it along rather than presenting an empty account.
    const { offerMigration } = await import('../storage/migrate.js');
    await offerMigration(cloud);
    return cloud;
  } catch (e) {
    console.error('[auth] cloud storage unavailable, staying local', e);
    alert(pick('無法連線至雲端資料庫，改用本機儲存', 'Cloud database unavailable — using local storage'));
    return createLocalAdapter();
  }
}

export async function signIn() {
  if (!isConfigured()) return;
  const { signInWithGoogle } = await import('./firebase.js');
  try {
    await signInWithGoogle();
  } catch (e) {
    console.error('[auth] sign-in failed', e);
    alert(pick('登入失敗', 'Sign-in failed') + ': ' + (e?.message || e));
  }
}

export async function signOut() {
  if (!isConfigured()) return;
  const { signOutUser } = await import('./firebase.js');
  await signOutUser();
}
