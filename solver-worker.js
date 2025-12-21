importScripts('./solver.js');

self.onmessage = async (e) => {
  const { jobId, payload } = e.data || {};

  try {
    const result = await self.DienstplanSolver.solve(payload, {
      onProgress: (done, total, meta) => {
        self.postMessage({ jobId, type: 'progress', done, total, meta });
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
