/**
 * MedGuard Nexus — DigitalTwin.js  (simulation rewrite)
 * Physical ↔ Virtual State Monitor with live simulation engine.
 *
 * LEFT  = PHYSICAL NETWORK  — animated metrics driven by real WebSocket logs
 * RIGHT = VIRTUAL TWIN      — hardcoded TWIN_BASELINE, always stable
 *
 * Ward phase progression: SYNCED → SCANNING → DESYNC → ISOLATED
 * Physical values animate per-phase; twin side never changes.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSocketCtx } from '../App';

// ─────────────────────────────────────────────────────────────────────────────
// TWIN BASELINE — Monday CIC-IDS2017 benign training data
// ─────────────────────────────────────────────────────────────────────────────

const TWIN_BASELINE = {
  'ICU':          { pkt_rate: 12,  bytes_s: 3200, iat_ms: 180, flow_dur_ms: 4800, protocol: 'HL7/FHIR',  devices: ['Ventilator x2', 'Patient Monitor x3'],  risk: 'CRITICAL' },
  'Emergency':    { pkt_rate: 45,  bytes_s: 8100, iat_ms: 95,  flow_dur_ms: 2100, protocol: 'DICOM/HL7', devices: ['ER Imaging', 'Defib Unit x2'],           risk: 'CRITICAL' },
  'Pharmacy':     { pkt_rate: 8,   bytes_s: 1400, iat_ms: 310, flow_dur_ms: 6200, protocol: 'REST',       devices: ['Dispenser Bot', 'Inventory System'],     risk: 'MEDIUM'   },
  'Oncology':     { pkt_rate: 28,  bytes_s: 5500, iat_ms: 140, flow_dur_ms: 3300, protocol: 'DICOM',      devices: ['Radiation Planner', 'CT Scanner'],       risk: 'HIGH'     },
  'General Ward': { pkt_rate: 6,   bytes_s: 900,  iat_ms: 420, flow_dur_ms: 8100, protocol: 'HTTP/REST',  devices: ['Nurse Station x4', 'Bed Sensors x8'],    risk: 'LOW'      },
};

const WARD_IDS = Object.keys(TWIN_BASELINE);

// ─────────────────────────────────────────────────────────────────────────────
// PHASE CONFIG — simulation engine
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_CONFIGS = {
  SYNCED: {
    label:            '✓ SYNCED',
    color:            '#00e5a0',
    topBarColor:      '#00e5a0',
    pktMultiplier:    1.0,
    bytesMultiplier:  1.0,
    scoreRange:       [0.15, 0.38],
    description:      'Physical state matches virtual twin baseline',
    alertLevel:       0,
  },
  SCANNING: {
    label:            '◎ SCANNING',
    color:            '#f59e0b',
    topBarColor:      '#f59e0b',
    pktMultiplier:    4.5,
    bytesMultiplier:  3.2,
    scoreRange:       [-0.05, 0.12],
    description:      'Anomalous probe activity — twin desync emerging',
    alertLevel:       1,
  },
  DESYNC: {
    label:            '⚠ DESYNC DETECTED',
    color:            '#ff3b5c',
    topBarColor:      '#ff3b5c',
    pktMultiplier:    85,
    bytesMultiplier:  62,
    scoreRange:       [-0.45, -0.12],
    description:      'CRITICAL — Physical traffic diverged from twin — DoS pattern confirmed',
    alertLevel:       2,
  },
  ISOLATED: {
    label:            '🔒 MICRO-ISOLATED',
    color:            '#38bdf8',
    topBarColor:      '#38bdf8',
    pktMultiplier:    0,
    bytesMultiplier:  0,
    scoreRange:       [0, 0],
    description:      'SOAR containment active — Digital Island deployed — twin preserved',
    alertLevel:       3,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const RISK_COLOR = {
  CRITICAL: 'var(--red)',
  HIGH:     'var(--amber)',
  MEDIUM:   'var(--amber)',
  LOW:      'var(--teal)',
};

const riskBadgeStyle = (risk) => ({
  fontFamily:    'var(--font-mono)',
  fontSize:       9,
  letterSpacing: '0.10em',
  color:          RISK_COLOR[risk] || 'var(--text-dim)',
  background:     risk === 'CRITICAL' ? 'rgba(255,59,92,0.12)'
                : risk === 'HIGH'     ? 'rgba(245,158,11,0.12)'
                : risk === 'MEDIUM'   ? 'rgba(245,158,11,0.12)'
                :                      'rgba(0,229,160,0.12)',
  border:        `1px solid ${RISK_COLOR[risk] || 'var(--border)'}`,
  borderRadius:   3,
  padding:       '2px 7px',
  marginLeft:     8,
});

const INITIAL_PHASES = {
  'ICU': 'SYNCED', 'Emergency': 'SYNCED', 'Pharmacy': 'SYNCED',
  'Oncology': 'SYNCED', 'General Ward': 'SYNCED',
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL SIMULATION STORE
// Lives outside React so it survives unmount/remount when the user navigates
// away from /twin and back. React useState resets on unmount — this does not.
// ─────────────────────────────────────────────────────────────────────────────

const _simStore = {
  wardPhases:      { ...INITIAL_PHASES },
  physicalMetrics: {},
  simLog:          [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: 'calc(100vh - 56px)',
    background: 'var(--bg-deep)',
    padding: '24px 28px',
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 16, flexWrap: 'wrap', gap: 12,
  },
  headerLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 11,
    color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 6,
  },
  heading: {
    fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600,
    color: 'var(--text-primary)', letterSpacing: '0.02em',
  },
  badges: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  badge: (border, bg) => ({
    display: 'flex', alignItems: 'center', gap: 7,
    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.10em',
    color: 'var(--text-secondary)', background: bg,
    border: `1px solid ${border}`, borderRadius: 4, padding: '6px 12px',
  }),
  badgeDot: (color) => ({
    width: 7, height: 7, borderRadius: '50%',
    background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0,
  }),
  badgeStatus: (color) => ({ color, fontWeight: 600, marginLeft: 2 }),

  // ── Global alert banner ───────────────────────────────────────────────────
  alertWrap: { marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 3 },
  alertIdle: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '14px 20px',
    fontFamily: 'var(--font-mono)', fontSize: 11,
    color: 'var(--text-dim)', letterSpacing: '0.06em',
  },
  alertClear: {
    background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.25)',
    borderRadius: 6, padding: '12px 18px',
    fontFamily: 'var(--font-mono)', fontSize: 11,
    color: '#00e5a0', letterSpacing: '0.06em',
  },
  alertTier: (color) => ({
    borderLeft: `3px solid ${color}`,
    background: `${color}14`,
    padding: '10px 16px',
    fontFamily: 'var(--font-mono)', fontSize: 11,
    color, letterSpacing: '0.05em',
    borderRadius: '0 4px 4px 0',
  }),

  // ── Ward cards ────────────────────────────────────────────────────────────
  cardGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 14 },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 8, overflow: 'hidden',
  },
  cardTopBar: (color) => ({ height: 4, background: color }),
  cardBody:   { padding: '16px 20px' },
  cardHeaderRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14, gap: 12, flexWrap: 'wrap',
  },
  cardWardName: {
    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
    color: 'var(--text-primary)', display: 'flex', alignItems: 'center',
  },
  stateLabel: (color, opacity) => ({
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
    letterSpacing: '0.10em', color, opacity, transition: 'opacity 0.15s',
  }),
  deviceList: {
    fontFamily: 'var(--font-mono)', fontSize: 10,
    color: 'var(--text-dim)', letterSpacing: '0.06em',
  },

  // Two-column body
  cardColumns: {
    display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 0, alignItems: 'stretch',
  },
  columnHeader: (color) => ({
    fontFamily: 'var(--font-mono)', fontSize: 9,
    letterSpacing: '0.16em', color, marginBottom: 10,
  }),
  metricRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  metricLabel: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' },
  metricValue: (color, large) => ({
    fontSize: large ? 15 : 12, fontWeight: large ? 600 : 400,
    fontFamily: 'var(--font-mono)', color: color || 'var(--text-secondary)',
  }),

  // Center divider
  dividerCol: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', width: 48, position: 'relative',
  },
  dividerLine: {
    width: 1, background: 'var(--border)',
    position: 'absolute', top: 0, bottom: 0,
  },
  vsCircle: {
    width: 24, height: 24, borderRadius: '50%',
    background: 'var(--bg-deep)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)',
    zIndex: 1, marginBottom: 8,
  },
  syncArrow: (color, opacity) => ({ fontSize: 20, color, opacity, zIndex: 1 }),

  // Card footer
  cardFooter: (color) => ({
    background: `${color}0d`,
    borderTop: `1px solid ${color}26`,
    padding: '10px 20px',
    fontFamily: 'var(--font-mono)', fontSize: 10,
    color, letterSpacing: '0.04em', lineHeight: 1.6,
  }),

  // ── Status bar ────────────────────────────────────────────────────────────
  statusBar: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '14px 20px', marginBottom: 14,
  },
  statusStats: { display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 10 },
  statItem: {
    fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)',
  },
  statValue: (color) => ({ color, fontWeight: 700 }),
  statusNote: {
    textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10,
    color: 'var(--text-dim)', letterSpacing: '0.06em',
    paddingTop: 8, borderTop: '1px solid var(--border)',
  },

  // ── Isolation panel ───────────────────────────────────────────────────────
  isoPanel: {
    background: 'var(--bg-card)', border: '1px solid rgba(56,189,248,0.25)',
    borderRadius: 6, padding: '16px 20px', marginBottom: 14,
  },
  isoPanelLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 10, color: '#38bdf8',
    letterSpacing: '0.15em', marginBottom: 12,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  isoDivider: { width: 24, height: 1, background: 'rgba(56,189,248,0.3)', flexShrink: 0 },
  isoRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '9px 12px', background: 'rgba(56,189,248,0.05)',
    border: '1px solid rgba(56,189,248,0.15)', borderRadius: 5,
    marginBottom: 8, flexWrap: 'wrap',
  },
  isoWard:  { fontFamily: 'var(--font-mono)', fontSize: 11, color: '#38bdf8', fontWeight: 600, minWidth: 90 },
  isoIp:    { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', flex: 1 },
  isoTs:    { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' },
  unblockBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
    padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
    border: '1px solid rgba(56,189,248,0.4)', background: 'rgba(56,189,248,0.08)',
    color: '#38bdf8', transition: 'all 0.2s',
  },

  // ── Incident log ──────────────────────────────────────────────────────────
  incidentPanel: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '16px 20px', marginBottom: 14,
  },
  incidentLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
    letterSpacing: '0.15em', marginBottom: 10,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  incidentDivider: { width: 24, height: 1, background: 'var(--border-glow)', flexShrink: 0 },
  incidentList: { maxHeight: 240, overflowY: 'auto' },
  incidentRow: (color) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 12px', borderBottom: '1px solid var(--bg-hover)',
    borderLeft: `2px solid ${color}`,
  }),
  incidentTs:  { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', minWidth: 60 },
  incidentWardBadge: (color) => ({
    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
    color, background: `${color}1a`, border: `1px solid ${color}40`,
    borderRadius: 3, padding: '1px 6px', whiteSpace: 'nowrap',
  }),
  incidentMsg: {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', flex: 1,
  },
  incidentEmpty: {
    padding: '24px 0', textAlign: 'center',
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
    letterSpacing: '0.06em',
  },

  // ── Architecture cards ────────────────────────────────────────────────────
  archRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  archCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 6, padding: 16,
  },
  archTitle: {
    fontFamily: 'var(--font-mono)', fontSize: 10,
    letterSpacing: '0.15em', color: 'var(--teal)', marginBottom: 8,
  },
  archDesc: {
    fontFamily: 'var(--font-body)', fontSize: 12,
    color: 'var(--text-secondary)', lineHeight: 1.6,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DigitalTwin() {
  const { logs, streaming, isolationEvents, unblockIP, frozenAt } = useSocketCtx();

  // Initialise from module-level store so state survives navigation away and back
  const [wardPhases,      setWardPhases]      = useState(() => ({ ..._simStore.wardPhases }));
  const [physicalMetrics, setPhysicalMetrics] = useState(() => ({ ..._simStore.physicalMetrics }));
  const [simLog,          setSimLog]          = useState(() => [..._simStore.simLog]);
  const [blinkState,      setBlinkState]      = useState(true);

  // ── Refs that always hold the latest committed values ─────────────────────
  const wardPhasesRef      = useRef({ ..._simStore.wardPhases });
  const physicalMetricsRef = useRef({ ..._simStore.physicalMetrics });

  // ── Blink ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setBlinkState(b => !b), 600);
    return () => clearInterval(t);
  }, []);

  // ── Simulation driver — reacts to real logs ───────────────────────────────
  useEffect(() => {
    if (!streaming) return;  // stream stopped — refs hold the frozen frame, don't touch them
    if (!logs || logs.length === 0) return;

    const recent = logs.slice(-50);

    // ── Phase transition logic ──────────────────────────────────────────────
    const prevPhases = wardPhasesRef.current;
    const nextPhases = { ...prevPhases };

    for (const wardId of WARD_IDS) {
      const wardLogs  = recent.filter(l => l.ward === wardId);
      if (wardLogs.length === 0) continue;

      const anomalies  = wardLogs.filter(l => l.verdict === 'ANOMALY');
      const anomRatio  = anomalies.length / wardLogs.length;
      const isIsolated = (isolationEvents || [])
        .filter(e => e.status === 'ACTIVE')
        .some(e => (e.ward || e.target_ward) === wardId);

      const newPhase = isIsolated        ? 'ISOLATED'
                     : anomRatio >= 0.5  ? 'DESYNC'
                     : anomRatio >= 0.15 ? 'SCANNING'
                     :                    'SYNCED';

      if (newPhase !== prevPhases[wardId]) {
        const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
        const messages = {
          SCANNING: `${wardId} — Anomalous probe activity detected. IAT deviation above threshold.`,
          DESYNC:   `${wardId} — CRITICAL DESYNC. DoS Hulk signature confirmed. SOAR evaluating.`,
          ISOLATED: `${wardId} — Node micro-isolated. Digital Island deployed. Twin baseline preserved.`,
          SYNCED:   `${wardId} — Traffic normalized. Resynchronized with virtual twin.`,
        };
        const colors = {
          SCANNING: '#f59e0b', DESYNC: '#ff3b5c', ISOLATED: '#38bdf8', SYNCED: '#00e5a0',
        };
        setSimLog(pl => {
          const next = [{
            id: Date.now() + wardId,
            timestamp: ts,
            ward: wardId,
            event: messages[newPhase],
            color: colors[newPhase],
          }, ...pl].slice(0, 40);
          _simStore.simLog = next;
          return next;
        });
        nextPhases[wardId] = newPhase;
      }
    }

    // Commit phases — update ref and store first so metrics below see fresh values
    wardPhasesRef.current  = nextPhases;
    _simStore.wardPhases   = nextPhases;
    setWardPhases(nextPhases);

    // ── Animated physical metrics ───────────────────────────────────────────
    const nextMetrics = { ...physicalMetricsRef.current };

    for (const wardId of WARD_IDS) {
      const phase    = nextPhases[wardId] || 'SYNCED';   // use freshly computed phase
      const cfg      = PHASE_CONFIGS[phase];
      const baseline = TWIN_BASELINE[wardId];
      const latestLog = [...logs].reverse().find(l => l.ward === wardId);
      const realScore = latestLog?.score ?? 0.25;
      const jitter    = 0.95 + Math.random() * 0.10;
      const [sMin, sMax] = cfg.scoreRange;
      const animScore = phase === 'ISOLATED'
        ? 0
        : (latestLog ? realScore : sMin + Math.random() * (sMax - sMin));

      nextMetrics[wardId] = {
        pkt_rate: (baseline.pkt_rate * cfg.pktMultiplier   * jitter).toFixed(1),
        bytes_s:  (baseline.bytes_s  * cfg.bytesMultiplier * jitter).toFixed(0),
        score:    typeof animScore === 'number' ? animScore.toFixed(4) : String(animScore),
        verdict:  phase === 'SYNCED'   ? 'NORMAL'
                : phase === 'ISOLATED' ? 'ISOLATED'
                :                        'ANOMALY',
        src_ip:   latestLog?.src_ip || '—',
      };
    }

    // Commit metrics — update ref and store, then React state
    physicalMetricsRef.current  = nextMetrics;
    _simStore.physicalMetrics   = nextMetrics;
    setPhysicalMetrics(nextMetrics);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, streaming, isolationEvents]);

  // ── Active isolations ─────────────────────────────────────────────────────
  const activeIsolations = useMemo(
    () => (isolationEvents || []).filter(e => e.status === 'ACTIVE'),
    [isolationEvents]
  );

  // ── Summary counts ────────────────────────────────────────────────────────
  const totalDesynced  = useMemo(() => WARD_IDS.filter(w => wardPhases[w] === 'DESYNC').length,    [wardPhases]);
  const totalIsolated  = useMemo(() => WARD_IDS.filter(w => wardPhases[w] === 'ISOLATED').length,  [wardPhases]);
  const totalScanning  = useMemo(() => WARD_IDS.filter(w => wardPhases[w] === 'SCANNING').length,  [wardPhases]);
  const totalSynced    = useMemo(() => WARD_IDS.filter(w => wardPhases[w] === 'SYNCED').length,    [wardPhases]);
  const allClear       = totalDesynced === 0 && totalIsolated === 0 && totalScanning === 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — Header
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={S.header}>
        <div>
          <div style={S.headerLabel}>MEDGUARD NEXUS // CYBER DIGITAL TWIN</div>
          <div style={S.heading}>Physical ↔ Virtual State Monitor</div>
        </div>
        <div style={S.badges}>
          <div style={S.badge(
            streaming ? 'rgba(34,197,94,0.4)'  : 'rgba(255,59,92,0.3)',
            streaming ? 'rgba(34,197,94,0.07)' : 'rgba(255,59,92,0.06)',
          )}>
            <div style={S.badgeDot(streaming ? '#22c55e' : '#ff3b5c')} />
            PHYSICAL NETWORK
            <span style={S.badgeStatus(streaming ? '#22c55e' : '#ff3b5c')}>
              {streaming ? 'LIVE' : 'IDLE'}
            </span>
          </div>
          <div style={S.badge('rgba(0,229,160,0.3)', 'rgba(0,229,160,0.06)')}>
            <div style={S.badgeDot('#00e5a0')} />
            VIRTUAL TWIN
            <span style={S.badgeStatus('var(--teal)')}>BASELINE ACTIVE</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — Global Alert Banner
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={S.alertWrap}>
        {!streaming ? (() => {
          const hasState = simLog.length > 0 || Object.values(wardPhases).some(p => p !== 'SYNCED');
          if (hasState) {
            return (
              <div style={{
                background: 'rgba(56,189,248,0.06)',
                border: '1px solid rgba(56,189,248,0.3)',
                borderLeft: '3px solid #38bdf8',
                borderRadius: 6,
                padding: '12px 20px',
                marginBottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  <span style={{ color: '#38bdf8', marginRight: 12 }}>❄ SIMULATION FROZEN</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Last session preserved — stream stopped at {frozenAt || '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(wardPhases).map(([ward, phase]) => {
                    const colors = { SYNCED: '#00e5a0', SCANNING: '#f59e0b', DESYNC: '#ff3b5c', ISOLATED: '#38bdf8' };
                    return (
                      <span key={ward} style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9,
                        padding: '2px 8px', borderRadius: 3,
                        background: `${colors[phase]}15`,
                        border: `1px solid ${colors[phase]}40`,
                        color: colors[phase],
                      }}>
                        {ward.split(' ')[0].toUpperCase()}: {phase}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          } else {
            return (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--text-dim)', borderRadius: 6, marginBottom: 0,
              }}>
                ◌&nbsp;&nbsp;Start the stream on Live Monitor to begin Digital Twin simulation
              </div>
            );
          }
        })() : allClear ? (
          <div style={S.alertClear}>
            ✓&nbsp;&nbsp;ALL SYSTEMS NOMINAL — Physical network synchronized with virtual twin across all 5 wards
          </div>
        ) : (
          <>
            {totalDesynced > 0 && (
              <div style={S.alertTier('#ff3b5c')}>
                ⚠&nbsp; {totalDesynced} WARD(S) IN CRITICAL DESYNC — DoS attack pattern active
              </div>
            )}
            {totalScanning > 0 && (
              <div style={S.alertTier('#f59e0b')}>
                ◎&nbsp; {totalScanning} WARD(S) SCANNING — Anomalous probe activity detected
              </div>
            )}
            {totalIsolated > 0 && (
              <div style={S.alertTier('#38bdf8')}>
                🔒&nbsp; {totalIsolated} WARD(S) MICRO-ISOLATED — Digital Island containment active
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — Ward Comparison Cards
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={S.cardGrid}>
        {WARD_IDS.map(wardId => {
          const baseline  = TWIN_BASELINE[wardId];
          const phase     = wardPhases[wardId] || 'SYNCED';
          const phaseCfg  = PHASE_CONFIGS[phase];
          const metrics   = physicalMetrics[wardId] || {};
          const isDesync  = phase === 'DESYNC';
          const isScanning = phase === 'SCANNING';
          const isIsolated = phase === 'ISOLATED';
          const isActive   = isDesync || isScanning || isIsolated;

          // Physical display values — show frozen metrics when stopped, dashes only if no data yet
          const physPktRate = (metrics.pkt_rate  != null) ? metrics.pkt_rate  : '—';
          const physBytesS  = (metrics.bytes_s   != null) ? metrics.bytes_s   : '—';
          const physScore   = (metrics.score     != null) ? metrics.score     : '—';
          const physVerdict = streaming
            ? (metrics.verdict ?? '—')
            : (metrics.verdict ?? (Object.keys(metrics).length === 0 ? 'START STREAM' : '—'));

          // Physical value colors
          const pktColor = isDesync   ? 'var(--red)'
                         : isScanning ? 'var(--amber)'
                         :              'var(--text-secondary)';

          const scoreNum = parseFloat(physScore);
          const scoreColor = !isNaN(scoreNum)
            ? (scoreNum < -0.1 ? 'var(--red)' : scoreNum < 0 ? 'var(--amber)' : 'var(--text-secondary)')
            : 'var(--text-dim)';

          const verdictColor = physVerdict === 'ANOMALY'  ? 'var(--red)'
                             : physVerdict === 'ISOLATED' ? '#38bdf8'
                             : physVerdict === 'NORMAL'   ? 'var(--teal)'
                             :                             'var(--text-dim)';

          // Arrow config
          const arrowChar    = isIsolated ? '🔒' : isDesync ? '⚠' : isScanning ? '◎' : '→';
          const arrowColor   = phaseCfg.color;
          const arrowOpacity = isDesync ? (blinkState ? 1 : 0.3) : 0.9;

          // State label blink: only DESYNC blinks
          const labelOpacity = isDesync ? (blinkState ? 1 : 0.4) : 1;

          return (
            <div key={wardId} style={S.card}>
              <div style={S.cardTopBar(phaseCfg.topBarColor)} />

              <div style={S.cardBody}>
                {/* Header row */}
                <div style={S.cardHeaderRow}>
                  <div style={S.cardWardName}>
                    {wardId}
                    <span style={riskBadgeStyle(baseline.risk)}>{baseline.risk}</span>
                  </div>
                  <div style={S.stateLabel(phaseCfg.color, labelOpacity)}>
                    {phaseCfg.label}{!streaming && phase !== 'SYNCED' ? ' ❄' : ''}
                  </div>
                  <div style={S.deviceList}>{baseline.devices.join(' · ')}</div>
                </div>

                {/* Two-column body */}
                <div style={S.cardColumns}>
                  {/* LEFT — Physical Network */}
                  <div>
                    <div style={S.columnHeader('rgba(255,59,92,0.7)')}>PHYSICAL NETWORK</div>
                    {/* PKT RATE */}
                    <div style={S.metricRow}>
                      <span style={S.metricLabel}>PKT RATE</span>
                      <span style={S.metricValue(pktColor, isDesync)}>
                        {physPktRate}{physPktRate !== '—' ? ' pkt/s' : ''}
                      </span>
                    </div>
                    {/* BYTES/S */}
                    <div style={S.metricRow}>
                      <span style={S.metricLabel}>BYTES/S</span>
                      <span style={S.metricValue('var(--text-secondary)')}>
                        {physBytesS}{physBytesS !== '—' ? ' B/s' : ''}
                      </span>
                    </div>
                    {/* ANOMALY SCORE */}
                    <div style={S.metricRow}>
                      <span style={S.metricLabel}>ANOMALY SCORE</span>
                      <span style={S.metricValue(scoreColor)}>{physScore}</span>
                    </div>
                    {/* VERDICT */}
                    <div style={S.metricRow}>
                      <span style={S.metricLabel}>VERDICT</span>
                      <span style={S.metricValue(verdictColor)}>{physVerdict}</span>
                    </div>
                  </div>

                  {/* CENTER divider */}
                  <div style={S.dividerCol}>
                    <div style={S.dividerLine} />
                    <div style={S.vsCircle}>vs</div>
                    <span style={S.syncArrow(arrowColor, arrowOpacity)}>{arrowChar}</span>
                  </div>

                  {/* RIGHT — Virtual Twin */}
                  <div>
                    <div style={S.columnHeader('rgba(0,229,160,0.7)')}>VIRTUAL TWIN</div>
                    {[
                      { label: 'PKT RATE',     value: `${baseline.pkt_rate} pkt/s` },
                      { label: 'BYTES/S',      value: `${baseline.bytes_s} B/s`    },
                      { label: 'EXPECTED IAT', value: `${baseline.iat_ms} ms`      },
                      { label: 'PROTOCOL',     value: baseline.protocol            },
                    ].map(({ label, value }) => (
                      <div key={label} style={S.metricRow}>
                        <span style={S.metricLabel}>{label}</span>
                        <span style={S.metricValue('var(--teal)')}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card footer */}
              {isActive && (
                <div style={S.cardFooter(phaseCfg.color)}>
                  {isIsolated && (
                    <>Node quarantined into Digital Island. All inbound/outbound traffic blocked.
                    Remaining {WARD_IDS.length - 1} wards continue normal operation. Twin baseline preserved.</>
                  )}
                  {isDesync && (
                    <>DESYNC — {physPktRate} pkt/s vs twin expected {baseline.pkt_rate} pkt/s —{' '}
                    {Number(physPktRate) > 0
                      ? `${(Number(physPktRate) / baseline.pkt_rate).toFixed(0)}x above baseline`
                      : 'N/A'
                    } — SOAR auto-isolating after 3 consecutive anomalies</>
                  )}
                  {isScanning && !isDesync && (
                    <>SCANNING — Probe activity detected. Physical IAT elevated vs Twin baseline {baseline.iat_ms} ms. SOAR monitoring.</>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 (a) — Twin Sync Status Bar
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={S.statusBar}>
        <div style={S.statusStats}>
          {[
            { label: 'WARDS MONITORED', value: 5,            color: 'var(--teal)'  },
            { label: 'IN SYNC',         value: totalSynced,  color: '#22c55e'      },
            { label: 'SCANNING',        value: totalScanning,color: 'var(--amber)' },
            { label: 'DESYNCED',        value: totalDesynced,color: 'var(--red)'   },
            { label: 'MICRO-ISOLATED',  value: totalIsolated,color: '#38bdf8'      },
            { label: 'TWIN UPTIME',     value: '100%',       color: 'var(--teal)'  },
          ].map(({ label, value, color }) => (
            <span key={label} style={S.statItem}>
              {label}: <span style={S.statValue(color)}>{value}</span>
            </span>
          ))}
        </div>
        <div style={S.statusNote}>
          Virtual twin maintains continuous baseline synchronization — compromised nodes are isolated without disrupting remaining infrastructure
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 (b) — Active Isolation Panel
      ══════════════════════════════════════════════════════════════════════ */}
      {activeIsolations.length > 0 && (
        <div style={S.isoPanel}>
          <div style={S.isoPanelLabel}>
            <span style={S.isoDivider} />
            ACTIVE MICRO-SEGMENTATION — DIGITAL ISLAND CONTAINMENT
          </div>
          {activeIsolations.map((ev, idx) => (
            <div key={ev.ip_address || idx} style={S.isoRow}>
              <span style={{ fontSize: 14 }}>🔒</span>
              <span style={S.isoWard}>{ev.ward || ev.target_ward || '—'}</span>
              <span style={S.isoIp}>{ev.ip_address || ev.ip || '—'}</span>
              <span style={S.isoIp}>{ev.attack_type || ev.type || 'ANOMALY'}</span>
              <span style={S.isoTs}>{ev.timestamp || '—'}</span>
              <button
                style={S.unblockBtn}
                onClick={() => unblockIP && unblockIP(ev.ip_address || ev.ip)}
              >
                UNBLOCK
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 (c) — Incident Log
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={S.incidentPanel}>
        <div style={S.incidentLabel}>
          <span style={S.incidentDivider} />
          {streaming
            ? 'SIMULATION INCIDENT LOG — REAL-TIME TWIN STATE TRANSITIONS'
            : simLog.length > 0
              ? `SIMULATION INCIDENT LOG — SESSION ENDED ${frozenAt || ''} — ${simLog.length} EVENTS RECORDED`
              : 'SIMULATION INCIDENT LOG'
          }
        </div>
        {!streaming && simLog.length > 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginTop: 4, marginBottom: 6 }}>
            Session preserved for review — restart stream to begin new simulation
          </div>
        )}
        <div style={S.incidentList}>
          {simLog.length === 0 ? (
            <div style={S.incidentEmpty}>
              {streaming
                ? 'Simulation running — waiting for first state transition…'
                : 'Start the stream to begin simulation'}
            </div>
          ) : (
            simLog.map(entry => (
              <div key={entry.id} style={S.incidentRow(entry.color)}>
                <span style={S.incidentTs}>{entry.timestamp}</span>
                <span style={S.incidentWardBadge(entry.color)}>{entry.ward}</span>
                <span style={S.incidentMsg}>{entry.event}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5 — Architecture Cards
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={S.archRow}>
        {[
          { title: 'DATA SOURCE',   desc: 'CIC-IDS2017 Wednesday traffic replayed at 750ms intervals via WebSocket. Flows scored by Isolation Forest model in real time. Live Scapy capture planned for Semester 2.' },
          { title: 'TWIN BASELINE', desc: 'Isolation Forest trained on Monday benign traffic. 20 features. RobustScaler normalization.' },
          { title: 'DESYNC LOGIC',  desc: 'Anomaly score below threshold = physical state diverges from virtual twin. SOAR auto-isolates after 3 consecutive desyncs from same IP.' },
        ].map(card => (
          <div key={card.title} style={S.archCard}>
            <div style={S.archTitle}>{card.title}</div>
            <div style={S.archDesc}>{card.desc}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
