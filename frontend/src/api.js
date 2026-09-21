const BASE = 'http://localhost:5001/api';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  // ── Phase 1 (preserved) ──────────────────────────────────────────────────
  health:          () => get('/health'),
  getStats:        () => get('/stats'),
  getDistribution: () => get('/scores/distribution'),
  getLogs:         () => get('/logs'),
  getLogsAfter:    (id) => get(`/logs/latest/${id}`),
  startStream:     () => get('/stream/start'),
  stopStream:      () => get('/stream/stop'),
  predict:         () => get('/logs/latest/0').then(d => {
    const logs = d.logs ?? [];
    return logs[logs.length - 1] ?? null;
  }),

  // ── Phase 2 (new) ────────────────────────────────────────────────────────
  getHistory:    (limit = 100) => get(`/history?limit=${limit}`),
  getIsolations: ()            => get('/isolations'),
  getBlacklist:  ()            => get('/blacklist'),
  blockIP:       (ip)          => post('/isolate',  { ip }),
  unblockIP:     (ip)          => post('/unblock',  { ip }),
};
