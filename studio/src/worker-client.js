export const createClient = () => {
  const worker = new Worker('/worker.js', { type: 'module' });
  let n = 0;
  const pending = new Map();
  worker.onmessage = (event) => {
    const { id, done, error, value, progress } = event.data;
    const p = pending.get(id);
    if (!p) return;
    if (progress) {
      if (p.onProgress) p.onProgress(progress);
      return;
    }
    if (done) {
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(value);
    }
  };
  worker.onerror = (event) => {
    for (const p of pending.values()) p.reject(new Error(event.message || 'worker failed'));
    pending.clear();
  };
  const call = (type, payload, { transfer = [], onProgress } = {}) =>
    new Promise((resolve, reject) => {
      const id = ++n;
      pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({ id, type, payload }, transfer);
    });
  return { call, worker };
};
