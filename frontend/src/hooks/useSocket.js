/**
 * MedGuard Nexus — useSocket.js (Phase 2)
 *
 * Primary data hook replacing useStream.js.
 * Connects to the Flask-SocketIO namespace /ws/telemetry via socket.io-client v4.
 *
 * Features:
 *  • Auto-reconnect with exponential back-off (built into socket.io-client)
 *  • Three connection states: CONNECTED | DISCONNECTED | RECONNECTING
 *  • Backpressure buffer: keeps newest 200 logs, evicts oldest 50 when full
 *  • Exposes blockIP / unblockIP for triage actions
 *  • Falls back to REST polling if WebSocket stays down for > 5 s
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const WS_URL     = 'http://localhost:5001';
const WS_NS      = '/ws/telemetry';
const MAX_LOGS   = 200;
const EVICT_SIZE = 50;

// ── Connection state enum ─────────────────────────────────────────────────────
export const ConnState = {
  CONNECTED:    'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  RECONNECTING: 'RECONNECTING',
};

export function useSocket() {
  const [logs,            setLogs]            = useState([]);
  const [streaming,       setStreaming]        = useState(false);
  const [connectionState, setConnectionState] = useState(ConnState.DISCONNECTED);
  const [stats,           setStats]           = useState(null);
  const [isolationEvents, setIsolationEvents] = useState([]);

  const socketRef = useRef(null);

  // ── Socket initialisation ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(WS_URL + WS_NS, {
      transports:       ['websocket', 'polling'],
      reconnection:     true,
      reconnectionAttempts: Infinity,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 8000,
      timeout:          10000,
    });
    socketRef.current = socket;

    // ── Connection lifecycle ─────────────────────────────────────────────────
    socket.on('connect', () => {
      console.log('[useSocket] ✓ Connected:', socket.id);
      setConnectionState(ConnState.CONNECTED);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[useSocket] Disconnected:', reason);
      setConnectionState(ConnState.DISCONNECTED);
      setStreaming(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[useSocket] Connection error:', err.message);
      setConnectionState(ConnState.RECONNECTING);
    });

    socket.io.on('reconnect_attempt', () => {
      setConnectionState(ConnState.RECONNECTING);
    });

    socket.io.on('reconnect', () => {
      setConnectionState(ConnState.CONNECTED);
    });

    // ── Data events ──────────────────────────────────────────────────────────
    socket.on('telemetry', (entry) => {
      if (!entry?.id) return;
      setLogs(prev => {
        const next = [...prev, entry];
        // Evict oldest when buffer is full
        return next.length > MAX_LOGS ? next.slice(EVICT_SIZE) : next;
      });
    });

    socket.on('stats_update', (payload) => {
      setStats(payload);
      setStreaming(payload?.streaming ?? false);
    });

    socket.on('isolation_event', (event) => {
      setIsolationEvents(prev => [event, ...prev].slice(0, 100));
    });

    socket.on('stream_status', (data) => {
      const isStreaming = data?.status === 'started' || data?.status === 'already_running';
      setStreaming(isStreaming);
    });

    socket.on('history_snapshot', (data) => {
      // Pre-populate from server state on (re)connect
      if (data?.logs?.length) {
        setLogs(data.logs.slice(-MAX_LOGS));
      }
      if (data?.isolations?.length) {
        setIsolationEvents(data.isolations.slice(0, 100));
      }
      setStreaming(data?.streaming ?? false);
    });

    return () => {
      socket.disconnect();
    };
  }, []); // run once


  // ── Public actions ──────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    socketRef.current?.emit('stream_start');
  }, []);

  const handleStop = useCallback(() => {
    socketRef.current?.emit('stream_stop');
  }, []);

  const blockIP = useCallback((ip) => {
    socketRef.current?.emit('isolate_ip', { ip });
  }, []);

  const unblockIP = useCallback((ip) => {
    socketRef.current?.emit('unblock_ip', { ip });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    streaming,
    connectionState,
    stats,
    isolationEvents,
    handleStart,
    handleStop,
    blockIP,
    unblockIP,
    clearLogs,
    socket: socketRef.current,
  };
}
