importScripts('./solver.js');

const MIN_PROGRESS_POST_MS = 100;
let activeController = null;
let activeJobId = null;
let lastProgressPost = 0;

function nowMs(){
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

self.onmessage = async (e) => {
  const { type, jobId, payload } = e.data || {};

  if (type === 'cancel'){
    if (activeController && jobId === activeJobId){
      activeController.abort();
    }
    return;
  }

  if (!payload) return;

  if (activeController){
    activeController.abort();
  }

  activeController = new AbortController();
  activeJobId = jobId;
  lastProgressPost = 0;

  try {
    const result = await self.DienstplanSolver.solve(payload, {
      signal: activeController.signal,
      onProgress: (done, total, meta) => {
        const now = nowMs();
        if (done === total || (now - lastProgressPost) >= MIN_PROGRESS_POST_MS){
          lastProgressPost = now;
          self.postMessage({ jobId, type: 'progress', done, total, meta });
        }
      },
    });

    self.postMessage({ jobId, type: 'done', result });
  } catch (err) {
    self.postMessage({
      jobId,
      type: 'error',
      message: String(err?.message || err),
      stack: String(err?.stack || ''),
    });
  }
};
