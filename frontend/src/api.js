const BASE = 'http://localhost:5000/api';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  health:          () => get('/health'),
  getStats:        () => get('/stats'),
  getDistribution: () => get('/scores/distribution'),
  getLogs:         () => get('/logs'),
  getLogsAfter:    (id) => get(`/logs/latest/${id}`),
  startStream:     () => get('/stream/start'),
  stopStream:      () => get('/stream/stop'),

  // Single predict call (30% attack bias — handled by backend sampling)
  predict: () => get('/logs/latest/0').then(d => {
    const logs = d.logs ?? [];
    return logs[logs.length - 1] ?? null;
  }),
};
