/**
 * Optional visual flourishes.
 *
 * canvas-confetti is lazy-loaded so a blocked CDN, an offline user, or a
 * failed chunk costs a missing animation rather than a ReferenceError on the
 * path that completes a task.
 */

let confettiFn = null;
let loadFailed = false;

async function getConfetti() {
  if (confettiFn || loadFailed) return confettiFn;
  try {
    const mod = await import('canvas-confetti');
    confettiFn = mod.default;
  } catch (e) {
    loadFailed = true;
    console.warn('[effects] confetti unavailable', e);
  }
  return confettiFn;
}

export function celebrate() {
  getConfetti().then((fn) => {
    if (!fn) return;
    try {
      fn({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (e) {
      console.warn('[effects] confetti failed', e);
    }
  });
}
