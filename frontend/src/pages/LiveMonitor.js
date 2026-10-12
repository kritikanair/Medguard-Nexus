import React, { useRef, useEffect, useState } from 'react';
import { useSocketCtx } from '../App';
import AISummary from '../components/AISummary';
import WardTopology from '../components/WardTopology';
import TriagePanel from '../components/TriagePanel';

const COLS = [
  { key: 'id',         label: '#',          width: '4%'  },
  { key: 'timestamp',  label: 'TIME',       width: '7%'  },
  { key: 'src_ip',     label: 'SRC IP',     width: '12%' },
  { key: 'dst_ip',     label: 'DST IP',     width: '11%' },
  { key: 'port',       label: 'PORT',       width: '5%'  },
  { key: 'ward',       label: 'WARD',       width: '10%' },
  { key: 'pkt_rate',   label: 'PKT/s',      width: '7%'  },
  { key: 'flow_bytes', label: 'BYTES/s',    width: '8%'  },
  { key: 'score',      label: 'A.SCORE',    width: '8%'  },
  { key: 'verdict',    label: 'VERDICT',    width: '10%' },
  { key: 'true_label', label: 'LABEL',      width: '9%'  },
  { key: 'result',     label: 'RESULT',     width: '9%'  },
];

function getRowResult(row) {
  if (row.is_tp) return { label: 'TRUE POS',  color: 'var(--teal)'  };
  if (row.is_fp) return { label: 'FALSE POS', color: 'var(--amber)' };
  if (row.verdict === 'ANOMALY') return { label: 'FALSE POS', color: 'var(--amber)' };
  if (row.true_label === 'DoS Hulk') return { label: 'MISSED', color: 'var(--red)' };
  return { label: 'TRUE NEG',  color: 'var(--green)' };
}

const WARD_COLOR = {
  ICU:           '#38bdf8',
  Emergency:     '#f59e0b',
  Pharmacy:      '#a78bfa',
  Oncology:      '#00e5a0',
  'General Ward':'#94a3b8',
};

const S = {
  page: {
    minHeight: 'calc(100vh - 56px)',
    background: 'var(--bg-deep)',
    padding: '24px 28px',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  title: {
    fontFamily: 'var(--font-mono)', fontSize: 11,
    color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 4,
  },
  heading: {
    fontFamily: 'var(--font-body)', fontSize: 22,
    fontWeight: 600, color: 'var(--text-primary)',
  },
  controls: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  btn: (active, color = 'var(--teal)') => ({
    fontFamily: 'var(--font-mono)', fontSize: 11,
    padding: '7px 16px', borderRadius: 4, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--red)' : color}`,
    background: active ? 'var(--red-glow)' : 'transparent',
    color: active ? 'var(--red)' : color,
    letterSpacing: '0.08em', transition: 'all 0.2s',
  }),
  statsRow: {
    display: 'flex', gap: 20, marginBottom: 12,
    padding: '10px 16px',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    flexWrap: 'wrap',
  },
  stat: { fontFamily: 'var(--font-mono)', fontSize: 11 },
  tableWrap: {
    flex: 1,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 6, overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  },
  thead: {
    display: 'grid', padding: '10px 16px',
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0,
  },
  th: {
    fontFamily: 'var(--font-mono)', fontSize: 9,
    color: 'var(--text-dim)', letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  tbody: { flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 340px)' },
  tr: (verdict, isNew) => ({
    display: 'grid', padding: '8px 16px',
    borderBottom: '1px solid var(--bg-hover)',
    background: isNew
      ? (verdict === 'ANOMALY' ? 'rgba(255,59,92,0.08)' : 'rgba(0,229,160,0.04)')
      : 'transparent',
    transition: 'background 0.8s ease',
    cursor: 'pointer',
    animation: isNew
      ? (verdict === 'ANOMALY' ? 'row-flash-red 0.8s ease' : 'row-flash-green 0.8s ease')
      : 'none',
  }),
  td: {
    fontFamily: 'var(--font-mono)', fontSize: 11,
    color: 'var(--text-secondary)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    display: 'flex', alignItems: 'center',
  },
  badge: (color) => ({
    padding: '2px 7px', borderRadius: 3,
    background: `${color}22`, border: `1px solid ${color}44`,
    color, fontSize: 10, fontFamily: 'var(--font-mono)',
    letterSpacing: '0.06em',
  }),
  empty: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', gap: 12,
    fontFamily: 'var(--font-mono)', fontSize: 12,
    padding: '60px 0',
  },
  isolationSidebar: {
    marginBottom: 12,
    background: 'var(--bg-card)',
    border: '1px solid rgba(56,189,248,0.2)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  isoHeader: {
    padding: '8px 14px',
    background: 'rgba(56,189,248,0.05)',
    borderBottom: '1px solid rgba(56,189,248,0.15)',
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: '#38bdf8',
    letterSpacing: '0.15em',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
};

const gridTemplate = COLS.map(c => c.width).join(' ');

export default function LiveMonitor() {
  const { logs, streaming, handleStart, handleStop, isolationEvents, blockIP, unblockIP, frozenAt, clearLogs } = useSocketCtx();
  const [autoScroll,  setAutoScroll]  = useState(true);
  const [filter,      setFilter]      = useState('ALL');
  const [triageEntry, setTriageEntry] = useState(null);
  const bodyRef  = useRef(null);
  const prevLen  = useRef(0);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bodyRef.current && logs.length > prevLen.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
    prevLen.current = logs.length;
  }, [logs, autoScroll]);

  const attacks  = logs.filter(l => l.verdict === 'ANOMALY').length;
  const normal   = logs.filter(l => l.verdict === 'NORMAL').length;

  const blocked  = new Set(
    (isolationEvents || [])
      .filter(e => e.status === 'ACTIVE')
      .map(e => e.ip_address)
  );

  const filtered = filter === 'ALL'      ? logs
    : filter === 'ATTACK'  ? logs.filter(l => l.verdict === 'ANOMALY')
    : filter === 'NORMAL'  ? logs.filter(l => l.verdict === 'NORMAL')
    : logs.filter(l => blocked.has(l.src_ip));

  const activeIsolations = (isolationEvents || []).filter(e => e.status === 'ACTIVE');

  const handleRowClick = (row) => setTriageEntry(row);
  const handleWardClick = (ward, state) => {
    // Open triage for the most recent attack from this ward
    const wardEntry = [...logs].reverse().find(
      l => l.ward === ward.id && l.verdict === 'ANOMALY'
    );
    if (wardEntry) setTriageEntry(wardEntry);
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>MEDGUARD NEXUS // REAL-TIME MONITOR</div>
          <div style={S.heading}>Live Network Traffic Analysis</div>
        </div>
        <div style={S.controls}>
          {['ALL', 'ATTACK', 'NORMAL', 'ISOLATED'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                ...S.btn(false, filter === f ? 'var(--teal)' : 'var(--border-glow)'),
                background: filter === f ? 'var(--teal-glow)' : 'transparent',
                color: filter === f ? 'var(--teal)' : 'var(--text-dim)',
                padding: '5px 12px',
              }}>
              {f}
            </button>
          ))}
          <button
            style={{ ...S.btn(false, 'var(--text-dim)'), padding: '5px 12px' }}
            onClick={() => setAutoScroll(a => !a)}
          >
            {autoScroll ? '↓ AUTO' : '○ PAUSED'}
          </button>
          <button style={S.btn(streaming)} onClick={streaming ? handleStop : handleStart}>
            {streaming ? '■ STOP' : logs.length > 0 ? '↺ RESTART' : '▶ START'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={S.statsRow}>
        <span style={{ ...S.stat, color: 'var(--text-dim)' }}>
          FLOWS: <span style={{ color: 'var(--teal)' }}>{logs.length}</span>
        </span>
        <span style={{ ...S.stat, color: 'var(--text-dim)' }}>
          ATTACKS: <span style={{ color: 'var(--red)' }}>{attacks}</span>
        </span>
        <span style={{ ...S.stat, color: 'var(--text-dim)' }}>
          NORMAL: <span style={{ color: 'var(--green)' }}>{normal}</span>
        </span>
        <span style={{ ...S.stat, color: 'var(--text-dim)' }}>
          ATTACK RATE: <span style={{ color: 'var(--amber)' }}>
            {logs.length ? ((attacks / logs.length) * 100).toFixed(1) : '0.0'}%
          </span>
        </span>
        {activeIsolations.length > 0 && (
          <span style={{ ...S.stat, color: '#38bdf8' }}>
            🔒 ISOLATED: <span>{activeIsolations.length}</span>
          </span>
        )}
        {streaming ? (
          <span style={{ ...S.stat, color: 'var(--amber)', animation: 'blink 1s infinite' }}>
            ● WS STREAMING
          </span>
        ) : logs.length > 0 ? (
          <span style={{ ...S.stat, color: '#38bdf8' }}>
            ❄ FROZEN — {frozenAt || 'last session'}
          </span>
        ) : null}
      </div>

      {/* Active isolations sidebar */}
      {activeIsolations.length > 0 && (
        <div style={S.isolationSidebar}>
          <div style={S.isoHeader}>
            🔒 ACTIVE SOAR ISOLATIONS ({activeIsolations.length})
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
            {activeIsolations.map(e => (
              <div key={e.id ?? e.ip_address} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 10px', borderRadius: 4,
                background: 'rgba(56,189,248,0.06)',
                border: '1px solid rgba(56,189,248,0.2)',
                fontFamily: 'var(--font-mono)', fontSize: 10,
              }}>
                <span style={{ color: '#38bdf8' }}>{e.ip_address}</span>
                <span style={{ color: 'var(--text-dim)' }}>→ {e.target_ward}</span>
                <button
                  onClick={() => unblockIP(e.ip_address)}
                  style={{
                    background: 'transparent', border: '1px solid rgba(0,229,160,0.3)',
                    color: 'var(--teal)', cursor: 'pointer',
                    borderRadius: 3, padding: '1px 6px',
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                  }}>
                  UNBLOCK
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ward topology map */}
      <WardTopology
        logs={logs}
        isolationEvents={isolationEvents || []}
        streaming={streaming}
        onNodeClick={handleWardClick}
      />

      {/* AI Summary */}
      <AISummary logs={logs} streaming={streaming} />

      {/* Frozen session banner */}
      {!streaming && logs.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px',
          background: 'rgba(56,189,248,0.04)',
          border: '1px solid rgba(56,189,248,0.2)',
          borderRadius: 6, marginBottom: 8,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: '#38bdf8',
        }}>
          <span>❄ {logs.length} flows preserved from last session — stopped at {frozenAt || '—'}</span>
          <button
            onClick={clearLogs}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,59,92,0.3)',
              color: 'var(--red)', cursor: 'pointer',
              borderRadius: 3, padding: '2px 10px',
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
            }}
          >
            CLEAR
          </button>
        </div>
      )}

      {/* Traffic table */}
      <div style={S.tableWrap}>
        <div style={{ ...S.thead, gridTemplateColumns: gridTemplate }}>
          {COLS.map(c => (
            <div key={c.key} style={S.th}>{c.label}</div>
          ))}
        </div>
        <div ref={bodyRef} style={S.tbody}>
          {filtered.length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize: 28, opacity: 0.3 }}>◌</div>
              <div>{streaming ? 'Waiting for traffic…' : 'Press START to begin monitoring'}</div>
            </div>
          ) : (
            [...filtered].reverse().map((row, i) => {
              const isAttack = row.verdict === 'ANOMALY';
              const result   = getRowResult(row);
              const isNew    = i < 3;
              const isBlockd = blocked.has(row.src_ip);
              const wardCol  = WARD_COLOR[row.ward] || 'var(--text-dim)';

              return (
                <div
                  key={row.id}
                  style={{ ...S.tr(row.verdict, isNew), gridTemplateColumns: gridTemplate }}
                  onClick={() => handleRowClick(row)}
                  title="Click to open triage panel"
                >
                  <div style={{ ...S.td, color: 'var(--text-dim)' }}>{row.id}</div>
                  <div style={{ ...S.td, color: 'var(--text-dim)' }}>{row.timestamp}</div>
                  <div style={{ ...S.td, color: isAttack ? 'var(--red)' : 'var(--text-secondary)' }}>
                    {isBlockd && <span style={{ marginRight: 4 }}>🔒</span>}
                    {row.src_ip}
                  </div>
                  <div style={{ ...S.td, color: 'var(--text-dim)' }}>{row.dst_ip}</div>
                  <div style={{ ...S.td, color: 'var(--text-dim)' }}>{row.port}</div>
                  <div style={{ ...S.td }}>
                    <span style={S.badge(wardCol)}>{row.ward || '—'}</span>
                  </div>
                  <div style={{ ...S.td, color: 'var(--text-secondary)' }}>
                    {Number(row.pkt_rate).toFixed(1)}
                  </div>
                  <div style={{ ...S.td, color: 'var(--text-secondary)' }}>
                    {Number(row.flow_bytes) > 10000
                      ? `${(row.flow_bytes / 1000).toFixed(1)}K`
                      : Number(row.flow_bytes).toFixed(0)}
                  </div>
                  <div style={{
                    ...S.td,
                    color: row.score < (row.threshold ?? -0.0185) ? 'var(--red)' : 'var(--teal)',
                    fontWeight: isAttack ? 600 : 400,
                  }}>
                    {row.score}
                  </div>
                  <div style={S.td}>
                    <span style={S.badge(isAttack ? 'var(--red)' : 'var(--green)')}>
                      {row.verdict}
                    </span>
                  </div>
                  <div style={S.td}>
                    <span style={S.badge(row.true_label === 'DoS Hulk' ? 'var(--red)' : 'var(--teal)')}>
                      {row.true_label === 'DoS Hulk' ? 'DOS HULK' : 'BENIGN'}
                    </span>
                  </div>
                  <div style={S.td}>
                    <span style={S.badge(result.color)}>{result.label}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Triage Panel */}
      {triageEntry && (
        <TriagePanel
          entry={triageEntry}
          isBlocked={blocked.has(triageEntry?.src_ip)}
          onClose={() => setTriageEntry(null)}
          onBlock={(ip) => { blockIP(ip); setTriageEntry(null); }}
          onUnblock={(ip) => { unblockIP(ip); }}
        />
      )}
    </div>
  );
}