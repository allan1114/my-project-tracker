/**
 * One-time upload of a guest board into a freshly signed-in cloud account.
 *
 * Deliberately opt-in: signing in on a shared machine should not silently push
 * whatever was on that browser into your account. Local data is never deleted
 * afterwards — it stays as a fallback and as the guest-mode board.
 */

import { readLocalSnapshot } from './local.js';
import { pick } from '../i18n.js';

export function hasLocalData(snapshot = readLocalSnapshot()) {
  return Array.isArray(snapshot.tasks) && snapshot.tasks.length > 0;
}

/**
 * Offer to upload local data when the cloud account is empty.
 * Returns true if anything was uploaded.
 */
export async function offerMigration(cloudAdapter) {
  const snapshot = readLocalSnapshot();
  if (!hasLocalData(snapshot)) return false;

  let empty;
  try {
    empty = await cloudAdapter.isEmpty();
  } catch (e) {
    console.error('[migrate] could not inspect cloud account', e);
    return false;
  }
  // Only offer into an empty account — never merge into an existing board,
  // where duplicate ids would collide and re-imports would pile up.
  if (!empty) return false;

  const n = snapshot.tasks.length;
  const ok = confirm(
    pick(
      `在此瀏覽器找到 ${n} 個本機任務。要上傳到你的帳戶嗎？\n\n本機資料不會被刪除。`,
      `Found ${n} task(s) stored in this browser. Upload them to your account?\n\nYour local copy will not be deleted.`
    )
  );
  if (!ok) return false;

  try {
    await cloudAdapter.importSnapshot(snapshot);
    return true;
  } catch (e) {
    console.error('[migrate] upload failed', e);
    alert(pick('上傳失敗：', 'Upload failed: ') + (e?.message || e));
    return false;
  }
}
