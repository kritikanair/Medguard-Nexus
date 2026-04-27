import React, { useState, useEffect, useRef } from 'react';

// ── Severity config ───────────────────────────────────────────────
const SEV = {
  INFO:     { color: 'var(--teal)',  bg: 'rgba(0,229,160,0.06)',  icon: '◆', border: 'rgba(0,229,160,0.2)'  },
  MEDIUM:   { color: 'var(--amber)', bg: 'rgba(245,158,11,0.07)', icon: '▲', border: 'rgba(245,158,11,0.25)' },
  HIGH:     { color: 'var(--red)',   bg: 'rgba(255,59,92,0.07)',  icon: '⬡', border: 'rgba(255,59,92,0.25)'  },
  CRITICAL: { color: 'var(--red)',   bg: 'rgba(255,59,92,0.12)',  icon: '⚠', border: 'rgba(255,59,92,0.45)'  },
};

const RISK_COLOR = {
  LOW:      'var(--green)',
  MEDIUM:   'var(--amber)',
  HIGH:     'var(--red)',
  CRITICAL: 'var(--red)',
};

// ── Alert generation logic ────────────────────────────────────────
function generateAlert(logs, prevCount) {
  if (logs.length === 0 || logs.length === prevCount) return null;

  const newLogs    = logs.slice(prevCount);
  const recent10   = logs.slice(-10);
  const rAttacks   = recent10.filter(l => l.verdict === 'ANOMALY');
  const latest     = newLogs[newLogs.length - 1];

  // Critical burst
  if (rAttacks.length >= 7)
    return { level: 'CRITICAL', msg: `BURST DETECTED — ${rAttacks.length}/10 recent flows are DoS Hulk attacks. Immediate containment advised.` };

  // RDP targeting
  const rdpHit = newLogs.find(l => l.verdict === 'ANOMALY' && l.port === 3389);
  if (rdpHit)
    return { level: 'HIGH', msg: `RDP port 3389 targeted by ${rdpHit.src_ip} — possible lateral movement / brute-force.` };

  // High packet rate
  const bigFlow = newLogs.find(l => l.verdict === 'ANOMALY' && l.pkt_rate > 500);
  if (bigFlow)
    return { level: 'HIGH', msg: `High-volume DoS flow from ${bigFlow.src_ip} — ${bigFlow.pkt_rate.toFixed(0)} pkt/s detected (score ${bigFlow.score}).` };

  // New anomaly
  if (latest?.verdict === 'ANOMALY')
    return { level: 'MEDIUM', msg: `Anomalous flow: ${latest.src_ip} → ${latest.dst_ip}:${latest.port}  |  score ${latest.score}  |  classified DoS Hulk` };

  // Elevated rate
  const rate = (rAttacks.length / recent10.length) * 100;
  if (rate > 30)
    return { level: 'MEDIUM', msg: `Elevated attack rate: ${rate.toFixed(0)}% of the last 10 flows flagged as malicious.` };

  // All clear
  if (rAttacks.length === 0)
    return { level: 'INFO', msg: `Network traffic nominal — all recent flows classified BENIGN. No threats detected.` };

  return null;
}

// ── Final report generation ───────────────────────────────────────
function buildReport(logs) {
  const total   = logs.length;
  if (total === 0) return null;

  const attacks  = logs.filter(l => l.verdict === 'ANOMALY').length;
  const normal   = total - attacks;
  const rate     = (attacks / total) * 100;
  const tp       = logs.filter(l => l.is_tp).length;
  const fp       = logs.filter(l => l.is_fp).length;
  const fn       = logs.filter(l => !l.is_tp && l.true_label === 'DoS Hulk').length;
  const tn       = normal - fp;
  const avgScore = attacks > 0
    ? (logs.filter(l => l.verdict === 'ANOMALY').reduce((s, l) => s + l.score, 0) / attacks).toFixed(4)
    : 'N/A';
  const uniqueIPs = [...new Set(logs.filter(l => l.verdict === 'ANOMALY').map(l => l.src_ip))];
  const risk      = rate > 60 ? 'CRITICAL' : rate > 30 ? 'HIGH' : rate > 10 ? 'MEDIUM' : 'LOW';

  const obs = [];
  if (attacks === 0) {
    obs.push({ icon: '✓', msg: 'Zero anomalies detected across all monitored flows — network appears clean.' });
  } else {
    obs.push({ icon: '⚠', msg: `${attacks} DoS Hulk attack(s) identified out of ${total} flows (${rate.toFixed(1)}% attack rate).` });
  }
  if (fp > 0) obs.push({ icon: '⚡', msg: `${fp} false positive(s) observed — consider raising the detection threshold to reduce alert fatigue.` });
  if (fn > 0) obs.push({ icon: '⬡', msg: `${fn} missed attack(s) (false negatives) — lowering the threshold may improve recall.` });
  if (uniqueIPs.length > 0) obs.push({ icon: '◉', msg: `${uniqueIPs.length} unique attacker IP(s). Primary source: ${uniqueIPs[0]}.` });
  if (rate > 40) obs.push({ icon: '🔴', msg: 'High attack density suggests an active DoS Hulk campaign. Recommend immediate network isolation.' });
  else if (rate > 0 && rate <= 40) obs.push({ icon: 'ℹ', msg: `Attack rate (${rate.toFixed(1)}%) is within tolerable range but continues to warrant active monitoring.` });

  return { total, attacks, normal, rate: rate.toFixed(1), tp, fp, fn, tn, avgScore, uniqueIPs, risk, obs };
}

// ── Styles ────────────────────────────────────────────────────────
const S = {
  panel: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 18px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-panel)',
  },
  panelTitle: {
    fontFamily: 'var(--font-mono)', fontSize: 10,
    color: 'var(--text-dim)', letterSpacing: '0.18em',
  },
  liveTag: {
    fontFamily: 'var(--font-mono)', fontSize: 9,
    padding: '2px 7px', borderRadius: 3,
    background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.3)',
    color: 'var(--red)', animation: 'blink 1.2s infinite', letterSpacing: '0.1em',
  },
  alertList: {
    padding: '10px 14px',
    display: 'flex', flexDirection: 'column', gap: 6,
    maxHeight: 160, overflowY: 'auto',
  },
  alertRow: (sev) => ({
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '8px 12px', borderRadius: 5,
    background: SEV[sev].bg,
    border: `1px solid ${SEV[sev].border}`,
    animation: 'slide-down 0.25s ease',
  }),
  alertIcon: (sev) => ({
    fontFamily: 'var(--font-mono)', fontSize: 12,
    color: SEV[sev].color, flexShrink: 0, marginTop: 1,
  }),
  alertText: (sev) => ({
    fontFamily: 'var(--font-mono)', fontSize: 11,
    color: SEV[sev].color, lineHeight: 1.5,
  }),
  alertTime: {
    fontFamily: 'var(--font-mono)', fontSize: 10,
    color: 'var(--text-dim)', marginLeft: 'auto', flexShrink: 0,
  },
  empty: {
    padding: '20px', textAlign: 'center',
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
  },

  // Report styles
  reportWrap: { padding: '16px 20px' },
  riskBanner: (risk) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderRadius: 6, marginBottom: 16,
    background: `${RISK_COLOR[risk]}11`,
    border: `1px solid ${RISK_COLOR[risk]}44`,
  }),
  riskLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 10,
    color: 'var(--text-dim)', letterSpacing: '0.15em',
  },
  riskValue: (risk) => ({
    fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700,
    letterSpacing: '0.08em', color: RISK_COLOR[risk],
  }),
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8, marginBottom: 14,
  },
  statBox: (color) => ({
    background: 'var(--bg-panel)', borderRadius: 5,
    padding: '10px 12px',
    border: `1px solid ${color}22`,
  }),
  statLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 8,
    color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 4,
  },
  statValue: (color) => ({
    fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color,
  }),
  obsList: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '10px 0', borderTop: '1px solid var(--border)',
  },
  obsRow: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    fontFamily: 'var(--font-mono)', fontSize: 11,
    color: 'var(--text-secondary)', lineHeight: 1.5,
  },
  obsIcon: { flexShrink: 0, color: 'var(--text-dim)' },
  sig: {
    marginTop: 12, paddingTop: 10,
    borderTop: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)', fontSize: 9,
    color: 'var(--text-dim)', letterSpacing: '0.12em',
    display: 'flex', justifyContent: 'space-between',
  },
};

// ── Main component ────────────────────────────────────────────────
export default function AISummary({ logs, streaming }) {
  const [alerts, setAlerts]         = useState([]);
  const [report, setReport]         = useState(null);
  const [showReport, setShowReport] = useState(false);
  const prevCountRef                = useRef(0);
  const prevStreamRef               = useRef(false);

  // Generate live alerts as new logs arrive
  useEffect(() => {
    if (!streaming) return;
    const alert = generateAlert(logs, prevCountRef.current);
    if (alert) {
      const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
      setAlerts(prev => [{ ...alert, ts, id: Date.now() }, ...prev].slice(0, 30));
    }
    prevCountRef.current = logs.length;
  }, [logs, streaming]);

  // When streaming stops → build final report
  useEffect(() => {
    if (prevStreamRef.current && !streaming && logs.length > 0) {
      const r = buildReport(logs);
      setReport(r);
      setShowReport(true);
    }
    prevStreamRef.current = streaming;
  }, [streaming, logs]);

  // Reset on new stream start
  useEffect(() => {
    if (streaming) {
      setReport(null);
      setShowReport(false);
      setAlerts([]);
      prevCountRef.current = 0;
    }
  }, [streaming]);

  // ── Live alert panel ────────────────────────────────────────
  if (streaming || (!showReport && alerts.length > 0)) {
    return (
      <div style={S.panel}>
        <div style={S.panelHeader}>
          <span style={{ fontSize: 10 }}>🤖</span>
          <span style={S.panelTitle}>AI THREAT INTELLIGENCE — LIVE ANALYSIS</span>
          {streaming && <span style={S.liveTag}>● LIVE</span>}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
            {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={S.alertList}>
          {alerts.length === 0 ? (
            <div style={S.empty}>Monitoring… waiting for first event</div>
          ) : alerts.map(a => (
            <div key={a.id} style={S.alertRow(a.level)}>
              <span style={S.alertIcon(a.level)}>{SEV[a.level].icon}</span>
              <span style={S.alertText(a.level)}>
                <b style={{ marginRight: 6 }}>[{a.level}]</b>{a.msg}
              </span>
              <span style={S.alertTime}>{a.ts}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Post-analysis report ─────────────────────────────────────
  if (showReport && report) {
    return (
      <div style={S.panel}>
        <div style={S.panelHeader}>
          <span style={{ fontSize: 10 }}>🤖</span>
          <span style={S.panelTitle}>AI POST-ANALYSIS REPORT</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
            generated {new Date().toLocaleTimeString()}
          </span>
        </div>

        <div style={S.reportWrap}>
          {/* Risk Banner */}
          <div style={S.riskBanner(report.risk)}>
            <div>
              <div style={S.riskLabel}>OVERALL RISK ASSESSMENT</div>
              <div style={S.riskValue(report.risk)}>{report.risk}</div>
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.8 }}>
              <div>DOMINANT THREAT: <span style={{ color: 'var(--red)' }}>DoS Hulk</span></div>
              <div>UNIQUE ATTACKERS: <span style={{ color: 'var(--amber)' }}>{report.uniqueIPs.length}</span></div>
              <div>AVG ANOMALY SCORE: <span style={{ color: 'var(--teal)' }}>{report.avgScore}</span></div>
            </div>
          </div>

          {/* Stats grid */}
          <div style={S.statsGrid}>
            {[
              { label: 'FLOWS ANALYZED', value: report.total,   color: 'var(--teal)'  },
              { label: 'ANOMALIES',      value: report.attacks, color: 'var(--red)'   },
              { label: 'NORMAL FLOWS',   value: report.normal,  color: 'var(--green)' },
              { label: 'ATTACK RATE',    value: `${report.rate}%`, color: 'var(--amber)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={S.statBox(color)}>
                <div style={S.statLabel}>{label}</div>
                <div style={S.statValue(color)}>{value}</div>
              </div>
            ))}
          </div>

          {/* Confusion summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
            {[
              { label: 'TRUE POS',  value: report.tp, color: 'var(--teal)'  },
              { label: 'FALSE POS', value: report.fp, color: 'var(--amber)' },
              { label: 'FALSE NEG', value: report.fn, color: 'var(--red)'   },
              { label: 'TRUE NEG',  value: report.tn, color: 'var(--green)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                textAlign: 'center', padding: '6px 8px', borderRadius: 4,
                border: `1px solid ${color}22`, background: `${color}08`,
              }}>
                <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Key observations */}
          <div style={S.obsList}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 4 }}>
              KEY OBSERVATIONS
            </div>
            {report.obs && report.obs.map((o, i) => (
              <div key={i} style={S.obsRow}>
                <span style={S.obsIcon}>{o.icon}</span>
                <span>{o.msg}</span>
              </div>
            ))}
          </div>

          {/* Signature */}
          <div style={S.sig}>
            <span>MEDGUARD NEXUS // ISOLATION FOREST v1.0 // CIC-IDS2017</span>
            <span>threshold: {logs[0]?.threshold ?? -0.0185}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
