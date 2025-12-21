importScripts('./solver.js');

const MIN_PROGRESS_POST_MS = 100;

function nowMs(){
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type !== 'slice') return;

  try {
    const payload = msg.payload;
    const sliceAttempts = Math.max(0, Number(msg.sliceAttempts || 0));

    let state = Number.isFinite(msg.rngState) ? (msg.rngState >>> 0) : (Date.now() >>> 0);
    function xorshift32(){
      state ^= (state << 13);
      state ^= (state >>> 17);
      state ^= (state << 5);
      state >>>= 0;
      return state;
    }
    Math.random = () => (xorshift32() / 4294967296);

    const slicePayload = {
      ...payload,
      settings: { ...(payload?.settings || {}), attempts: sliceAttempts },
    };

    let lastProgressPost = 0;

    const result = await self.DienstplanSolver.solve(slicePayload, {
      onProgress: (done, total, meta) => {
        const now = nowMs();
        if (done === total || (now - lastProgressPost) >= MIN_PROGRESS_POST_MS){
          lastProgressPost = now;
          self.postMessage({
            type: 'progress',
            done,
            totalSlice: total,
            bestCost: meta && typeof meta.bestCost === 'number' ? meta.bestCost : null,
          });
        }
      },
    });

    self.postMessage({ type: 'done', result: { best: result, rngState: state } });
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: String(err?.message || err),
    });
  }
};
