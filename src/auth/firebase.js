/**
 * Firebase Authentication.
 *
 * Loaded only when VITE_FIREBASE_* is configured. Firebase issues the identity;
 * the ID token is then handed to Supabase, whose Row-Level Security policies
 * key off the Firebase UID in the token's `sub` claim.
 *
 * The API key here is a public client identifier, not a secret — access is
 * controlled by Firebase Auth settings and Postgres RLS, not by hiding it.
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let auth = null;

function ensureAuth() {
  if (auth) return auth;
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  auth = getAuth(app);
  return auth;
}

/**
 * Register an auth-state callback and resolve once it has fired for the first
 * time, so boot can wait for the restored session rather than flashing the
 * signed-out board.
 */
export function watchAuth(callback) {
  const a = ensureAuth();
  return new Promise((resolve, reject) => {
    let settled = false;
    onAuthStateChanged(
      a,
      async (user) => {
        try {
          await callback(user);
        } catch (e) {
          console.error('[auth] state handler failed', e);
        }
        if (!settled) {
          settled = true;
          resolve(user);
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    );
  });
}

export async function signInWithGoogle() {
  const a = ensureAuth();
  await setPersistence(a, browserLocalPersistence);
  const result = await signInWithPopup(a, new GoogleAuthProvider());
  return result.user;
}

export async function signOutUser() {
  await signOut(ensureAuth());
}

/** Fresh ID token for Supabase. Firebase refreshes it automatically when stale. */
export async function getIdToken() {
  return ensureAuth().currentUser?.getIdToken() ?? null;
}
