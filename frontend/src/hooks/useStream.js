import { useState, useEffect, useRef, useCallback } from 'react';

const BASE = 'http://localhost:5000/api';
const POLL_MS = 1500; // ms between predictions

async function fetchPredict() {
  const res = await fetch(`${BASE}/predict`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchHealth() {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useStream() {
  const [logs, setLogs]           = useState([]);
  const [streaming, setStreaming] = useState(false);
  const timerRef                  = useRef(null);
  const activeRef                 = useRef(false); // mirrors streaming without stale closure

  // ── Core poll: one call to /api/predict ─────────────
  const poll = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      const entry = await fetchPredict();
      if (entry && entry.id) {
        setLogs(prev => {
          const updated = [...prev, entry];
          return updated.slice(-200); // keep last 200 rows
        });
      }
    } catch (err) {
      console.warn('[useStream] predict failed:', err.message);
    }
  }, []);

  // ── Start / stop internal timer ──────────────────────
  const startPolling = useCallback(() => {
    if (timerRef.current) return;
    activeRef.current = true;
    // Immediate first call, then repeat
    poll();
    timerRef.current = setInterval(poll, POLL_MS);
  }, [poll]);

  const stopPolling = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Public handlers ──────────────────────────────────
  const handleStart = useCallback(() => {
    setStreaming(true);
  }, []);

  const handleStop = useCallback(() => {
    setStreaming(false);
  }, []);

  // ── React to streaming state change ─────────────────
  useEffect(() => {
    if (streaming) {
      startPolling();
    } else {
      stopPolling();
    }
    return stopPolling; // cleanup on unmount
  }, [streaming, startPolling, stopPolling]);

  // ── On mount: sync streaming status from backend ─────
  useEffect(() => {
    fetchHealth()
      .then(d => {
        if (d.streaming) setStreaming(true);
      })
      .catch(() => {});
  }, []);

  return { logs, streaming, handleStart, handleStop };
}
