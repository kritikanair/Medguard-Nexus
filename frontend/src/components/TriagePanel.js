/**
 * MedGuard Nexus — TriagePanel.js
 * Slide-in forensics + triage drawer.
 *
 * Triggered by: clicking a traffic row OR a ward node.
 * Sections:
 *   1. Header with verdict badge
 *   2. IP Block / Unblock quick-action
 *   3. Raw feature vector display
 *   4. Flow details (timing, ports, bytes)
 *   5. AI threat narrative
 *   6. False-positive dismissal
 */

import React, { useState, useEffect } from 'react';

// ── Feature labels (friendly names for the 15 model features) ─────────────────
const FEATURE_LABELS = {
  'Flow Duration':                 ['Duration',          'μs'],
  'Total Fwd Packets':             ['Fwd Packets',       'pkt'],
  'Total Backward Packets':        ['Bwd Packets',       'pkt'],
  'Total Length of Fwd Packets':   ['Fwd Bytes',         'B'],
  'Fwd Packet Length Max':         ['Fwd Pkt Max',       'B'],
  'Fwd Packet Length Min':         ['Fwd Pkt Min',       'B'],
  'Fwd Packet Length Mean':        ['Fwd Pkt Mean',      'B'],
  'Fwd Packet Length Std':         ['Fwd Pkt Std',       'B'],
  'Bwd Packet Length Std':         ['Bwd Pkt Std',       'B'],
  'Flow Bytes/s':                  ['Flow Bytes/s',      'B/s'],
  'Flow Packets/s':                ['Flow Pkt/s',        'p/s'],
  'Flow IAT Std':                  ['IAT Std',           'μs'],
  'Fwd IAT Std':                   ['Fwd IAT Std',       'μs'],
  'Packet Length Variance':        ['Pkt Var',           ''],
  'Idle Mean':                     ['Idle Mean',         'μs'],
};

function getThreatNarrative(entry) {
  if (!entry) return '';
  const { verdict, score, pkt_rate, flow_bytes, port, src_ip, ward } = entry;

  if (verdict === 'NORMAL') {
    return `Flow from ${src_ip} (${ward}) exhibits benign behaviour. ` +
      `Anomaly score ${score} is well above the detection threshold. ` +
      `Packet rate ${Number(pkt_rate).toFixed(1)} pkt/s and flow volume ${Number(flow_bytes).toFixed(0)} B/s ` +
      `are consistent with normal network usage. No action required.`;
  }

  const portLabels = { 80: 'HTTP', 443: 'HTTPS', 445: 'SMB', 3389: 'RDP', 22: 'SSH', 8080: 'Alt-HTTP' };
  const portLabel  = portLabels[port] || `port ${port}`;

  if (Number(pkt_rate) > 1000) {
    return `⚠ HIGH-VOLUME DoS DETECTED — ${src_ip} (${ward}) is flooding ${portLabel} ` +
      `at ${Number(pkt_rate).toFixed(0)} pkt/s with ${Number(flow_bytes / 1000).toFixed(1)}KB/s bandwidth. ` +
      `Anomaly score ${score} is ${Math.abs(score).toFixed(4)} below the isolation threshold. ` +
      `Classify as DoS Hulk. Immediate isolation recommended.`;
  }

  if (port === 3389) {
    return `🔴 RDP LATERAL MOVEMENT — ${src_ip} (${ward}) targeting RDP (3389). ` +
      `Score ${score} indicates anomalous traffic pattern. ` +
      `Possible credential brute-force or session hijack. Isolate and audit.`;
  }

  return `Anomalous flow detected from ${src_ip} (${ward}) on ${portLabel}. ` +
    `Isolation Forest score ${score} triggered at threshold. ` +
    `Flow rate: ${Number(pkt_rate).toFixed(1)} pkt/s, ${Number(flow_bytes).toFixed(0)} B/s. ` +
    `Review and contain if confirmed malicious.`;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  backdrop: {
    position:   'fixed',
    inset:      0,
    background: 'rgba(8,13,20,0.7)',
    backdropFilter: 'blur(2px)',
    zIndex:     300,
  },
  drawer: (open) => ({
    position:   'fixed',
    top:        0,
    right:      0,
    height:     '100vh',
    width:      420,
    background: '#0a1019',
    borderLeft: '1px solid rgba(56,189,248,0.2)',
    zIndex:     301,
    overflowY:  'auto',
    transform:  open ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
    display:    'flex',
    flexDirection: 'column',
  }),
  closeBtn: {
    position:   'absolute',
    top:        16,
    right:      16,
    background: 'transparent',
    border:     '1px solid var(--border)',
    color:      'var(--text-dim)',
    borderRadius: 4,
    padding:    '4px 10px',
    cursor:     'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize:   11,
  },
  header: {
    padding:      '24px 20px 16px',
    borderBottom: '1px solid var(--border)',
    background:   'rgba(8,13,20,0.8)',
  },
  label: {
    fontFamily:    'var(--font-mono)',
    fontSize:      9,
    color:         'var(--text-dim)',
    letterSpacing: '0.18em',
    marginBottom:  6,
  },
  title: {
    fontFamily: 'var(--font-mono)',
    fontSize:   14,
    fontWeight: 700,
    color:      'var(--text-primary)',
    marginBottom: 8,
  },
  badge: (color) => ({
    display:    'inline-flex',
    alignItems: 'center',
    gap:        5,
    padding:    '3px 10px',
    borderRadius: 4,
    border:     `1px solid ${color}44`,
    background: `${color}11`,
    color:      color,
    fontFamily: 'var(--font-mono)',
    fontSize:   10,
    letterSpacing: '0.08em',
  }),
  section: {
    padding:      '14px 20px',
    borderBottom: '1px solid var(--bg-hover)',
  },
  sectionTitle: {
    fontFamily:    'var(--font-mono)',
    fontSize:      9,
    color:         'var(--text-dim)',
    letterSpacing: '0.15em',
    marginBottom:  10,
    display:       'flex',
    alignItems:    'center',
    gap:           8,
  },
  divider: {
    flex:       1,
    height:     1,
    background: 'var(--border)',
  },
  actionBtn: (variant) => ({
    padding:    '8px 16px',
    borderRadius: 4,
    cursor:     'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize:   11,
    letterSpacing: '0.08em',
    transition: 'all 0.2s',
    border:     variant === 'block'
      ? '1px solid rgba(255,59,92,0.5)'
      : variant === 'unblock'
        ? '1px solid rgba(0,229,160,0.5)'
        : '1px solid var(--border)',
    background: variant === 'block'
      ? 'rgba(255,59,92,0.08)'
      : variant === 'unblock'
        ? 'rgba(0,229,160,0.08)'
        : 'transparent',
    color: variant === 'block' ? '#ff3b5c' : variant === 'unblock' ? '#00e5a0' : 'var(--text-dim)',
  }),
  featureGrid: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 6,
  },
  featureItem: {
    background:   '#0d1520',
    borderRadius: 4,
    padding:      '6px 8px',
    border:       '1px solid var(--border)',
  },
  featureLabel: {
    fontFamily:    'var(--font-mono)',
    fontSize:      8,
    color:         'var(--text-dim)',
    letterSpacing: '0.12em',
    marginBottom:  2,
  },
  featureValue: {
    fontFamily: 'var(--font-mono)',
    fontSize:   11,
    color:      'var(--teal)',
    fontWeight: 600,
  },
  narrative: {
    fontFamily:  'var(--font-mono)',
    fontSize:    11,
    color:       'var(--text-secondary)',
    lineHeight:  1.7,
    background:  '#080d14',
    borderRadius: 4,
    padding:     '10px 12px',
    border:      '1px solid var(--border)',
  },
  metaRow: {
    display:        'flex',
    justifyContent: 'space-between',
    padding:        '5px 0',
    borderBottom:   '1px solid rgba(148,163,184,0.06)',
    fontFamily:     'var(--font-mono)',
    fontSize:       11,
  },
  metaKey:   { color: 'var(--text-dim)', fontSize: 10 },
  metaValue: { color: 'var(--text-secondary)' },
  fpBtn: {
    padding:    '6px 14px',
    borderRadius: 4,
    cursor:     'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize:   10,
    border:     '1px solid rgba(245,158,11,0.4)',
    background: 'rgba(245,158,11,0.06)',
    color:      'var(--amber)',
    letterSpacing: '0.08em',
  },
};

// ── Main component ──────────────────────────────────────────────────────────────
export default function TriagePanel({ entry, isBlocked, onClose, onBlock, onUnblock }) {
  const [open,       setOpen]       = useState(false);
  const [dismissed,  setDismissed]  = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Animate in
  useEffect(() => {
    if (entry) {
      setOpen(true);
      setDismissed(false);
      setConfirming(false);
    } else {
      setOpen(false);
    }
  }, [entry]);

  if (!entry) return null;

  const isAttack     = entry.verdict === 'ANOMALY';
  const verdictColor = isAttack ? '#ff3b5c' : '#00e5a0';
  const narrative    = getThreatNarrative(entry);

  // Build feature vector from entry
  const featureEntries = Object.entries(FEATURE_LABELS).map(([key, [label, unit]]) => ({
    key, label, unit,
    value: entry[key] !== undefined
      ? Number(entry[key]).toFixed(2)
      : '—',
  }));

  const handleBlock = () => {
    if (confirming) {
      onBlock?.(entry.src_ip);
      setConfirming(false);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div style={S.backdrop} onClick={onClose} />

      {/* Drawer */}
      <div style={S.drawer(open)}>
        <button style={S.closeBtn} onClick={onClose}>✕ CLOSE</button>

        {/* Header */}
        <div style={S.header}>
          <div style={S.label}>TRIAGE PANEL — FLOW FORENSICS</div>
          <div style={S.title}>
            {entry.src_ip}
            <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> → </span>
            {entry.dst_ip}:{entry.port}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={S.badge(verdictColor)}>
              {isAttack ? '⚠' : '✓'} {entry.verdict}
            </span>
            <span style={S.badge('#38bdf8')}>
              🏥 {entry.ward || 'Unknown Ward'}
            </span>
            <span style={{ ...S.badge('var(--text-dim)'), fontSize: 9 }}>
              #{entry.id} · {entry.timestamp}
            </span>
          </div>
        </div>

        {/* IP Action */}
        <div style={S.section}>
          <div style={S.sectionTitle}>
            🔒 CONTAINMENT ACTIONS <div style={S.divider} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isBlocked ? (
              <button
                style={S.actionBtn('block')}
                onClick={handleBlock}
              >
                {confirming ? '⚠ CONFIRM BLOCK' : `🚫 Block ${entry.src_ip}`}
              </button>
            ) : (
              <button style={S.actionBtn('unblock')} onClick={() => onUnblock?.(entry.src_ip)}>
                ✓ Unblock {entry.src_ip}
              </button>
            )}
            {isBlocked && (
              <span style={{ ...S.badge('#38bdf8'), fontSize: 9 }}>🔒 CURRENTLY ISOLATED</span>
            )}
          </div>
          {confirming && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
              Click again within 3s to confirm IP block
            </div>
          )}
        </div>

        {/* Flow details */}
        <div style={S.section}>
          <div style={S.sectionTitle}>
            📊 FLOW DETAILS <div style={S.divider} />
          </div>
          {[
            ['Anomaly Score', entry.score],
            ['Threshold',     entry.threshold ?? -0.0185],
            ['Packet Rate',   `${Number(entry.pkt_rate).toFixed(1)} pkt/s`],
            ['Flow Bytes/s',  `${Number(entry.flow_bytes).toFixed(0)} B/s`],
            ['True Label',    entry.true_label],
            ['TP / FP',       entry.is_tp ? 'True Positive' : entry.is_fp ? 'False Positive' : 'N/A'],
          ].map(([k, v]) => (
            <div key={k} style={S.metaRow}>
              <span style={S.metaKey}>{k}</span>
              <span style={{
                ...S.metaValue,
                color: k === 'Anomaly Score'
                  ? (isAttack ? '#ff3b5c' : '#00e5a0')
                  : 'var(--text-secondary)',
              }}>{String(v)}</span>
            </div>
          ))}
        </div>

        {/* Feature vector */}
        <div style={S.section}>
          <div style={S.sectionTitle}>
            🧬 RAW FEATURE VECTOR <div style={S.divider} />
          </div>
          <div style={S.featureGrid}>
            {featureEntries.map(({ key, label, unit, value }) => (
              <div key={key} style={S.featureItem}>
                <div style={S.featureLabel}>{label}</div>
                <div style={S.featureValue}>
                  {value} <span style={{ fontSize: 8, color: 'var(--text-dim)', fontWeight: 400 }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI threat narrative */}
        <div style={S.section}>
          <div style={S.sectionTitle}>
            🤖 AI THREAT ANALYSIS <div style={S.divider} />
          </div>
          <div style={S.narrative}>{narrative}</div>
        </div>

        {/* False-positive dismissal */}
        {isAttack && !dismissed && (
          <div style={{ ...S.section, display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={S.sectionTitle}>⚡ FALSE POSITIVE?</div>
            <button style={S.fpBtn} onClick={() => setDismissed(true)}>
              ✕ Dismiss as FP
            </button>
          </div>
        )}
        {dismissed && (
          <div style={{ ...S.section, color: 'var(--amber)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            ✓ Marked as false positive — analyst review noted.
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />
        <div style={{
          padding: '12px 20px',
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
          borderTop: '1px solid var(--border)',
        }}>
          MEDGUARD NEXUS // ISOLATION FOREST v2 // {new Date().toLocaleDateString()}
        </div>
      </div>
    </>
  );
}
