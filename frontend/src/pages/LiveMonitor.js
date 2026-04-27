import React, { useRef, useEffect, useState } from 'react';
import { useStream } from '../hooks/useStream';
import AISummary from '../components/AISummary';

const COLS = [
  { key: 'id',         label: '#',          width: '4%'  },
  { key: 'timestamp',  label: 'TIME',       width: '7%'  },
  { key: 'src_ip',     label: 'SRC IP',     width: '12%' },
  { key: 'dst_ip',     label: 'DST IP',     width: '12%' },
  { key: 'port',       label: 'PORT',       width: '6%'  },
  { key: 'pkt_rate',   label: 'PKT/s',      width: '8%'  },
  { key: 'flow_bytes', label: 'BYTES/s',    width: '10%' },
  { key: 'score',      label: 'A.SCORE',    width: '9%'  },
  { key: 'verdict',    label: 'VERDICT',    width: '11%' },
  { key: 'true_label', label: 'TRUE LABEL', width: '11%' },
  { key: 'result',     label: 'RESULT',     width: '10%' },
];

function getRowResult(row) {
  if (row.is_tp) return { label: 'TRUE POS',  color: 'var(--teal)'  };
  if (row.is_fp) return { label: 'FALSE POS', color: 'var(--amber)' };
  if (row.verdict === 'ANOMALY') return { label: 'FALSE POS', color: 'var(--amber)' };
  if (row.true_label === 'DoS Hulk') return { label: 'MISSED',    color: 'var(--red)'   };
  return { label: 'TRUE NEG',  color: 'var(--green)' };
}

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
  controls: { display: 'flex', gap: 10, alignItems: 'center' },
  btn: (active, color = 'var(--teal)') => ({
    fontFamily: 'var(--font-mono)', fontSize: 12,
    padding: '8px 20px', borderRadius: 4, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--red)' : color}`,
    background: active ? 'var(--red-glow)' : 'transparent',
    color: active ? 'var(--red)' : color,
    letterSpacing: '0.08em', transition: 'all 0.2s',
  }),
  statsRow: {
    display: 'flex', gap: 20, marginBottom: 16,
    padding: '12px 16px',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 6,
  },
  stat: {
    fontFamily: 'var(--font-mono)', fontSize: 11,
  },
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
  tbody: {
    flex: 1, overflowY: 'auto',
    maxHeight: 'calc(100vh - 300px)',
  },
  tr: (verdict, isNew) => ({
    display: 'grid', padding: '9px 16px',
    borderBottom: '1px solid var(--bg-hover)',
    background: isNew
      ? (verdict === 'ANOMALY' ? 'rgba(255,59,92,0.08)' : 'rgba(0,229,160,0.04)')
      : 'transparent',
    transition: 'background 0.8s ease',
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
    padding: '2px 8px', borderRadius: 3,
    background: `${color}22`,
    border: `1px solid ${color}44`,
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
};

const gridTemplate = COLS.map(c => c.width).join(' ');

export default function LiveMonitor() {
  const { logs, streaming, handleStart, handleStop } = useStream();
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter]         = useState('ALL');
  const bodyRef                     = useRef(null);
  const prevLen                     = useRef(0);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && bodyRef.current && logs.length > prevLen.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
    prevLen.current = logs.length;
  }, [logs, autoScroll]);

  const attacks = logs.filter(l => l.verdict === 'ANOMALY').length;
  const normal  = logs.filter(l => l.verdict === 'NORMAL').length;

  const filtered = filter === 'ALL'    ? logs
    : filter === 'ATTACK' ? logs.filter(l => l.verdict === 'ANOMALY')
    : logs.filter(l => l.verdict === 'NORMAL');

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>MEDGUARD NEXUS // REAL-TIME MONITOR</div>
          <div style={S.heading}>Live Network Traffic Analysis</div>
        </div>
        <div style={S.controls}>
          {['ALL', 'ATTACK', 'NORMAL'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                ...S.btn(false, filter === f ? 'var(--teal)' : 'var(--border-glow)'),
                background: filter === f ? 'var(--teal-glow)' : 'transparent',
                color: filter === f ? 'var(--teal)' : 'var(--text-dim)',
                padding: '6px 14px',
              }}>
              {f}
            </button>
          ))}
          <button
            style={{ ...S.btn(false, 'var(--text-dim)'), padding: '6px 14px' }}
            onClick={() => setAutoScroll(a => !a)}
          >
            {autoScroll ? '↓ AUTO' : '○ PAUSED'}
          </button>
          <button style={S.btn(streaming)} onClick={streaming ? handleStop : handleStart}>
            {streaming ? '■ STOP' : '▶ START'}
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
        {streaming && (
          <span style={{ ...S.stat, color: 'var(--amber)', animation: 'blink 1s infinite' }}>
            ● STREAMING
          </span>
        )}
      </div>

      {/* AI Summary — live alerts or post-analysis report */}
      <AISummary logs={logs} streaming={streaming} />

      {/* Table */}
      <div style={S.tableWrap}>
        {/* Header */}
        <div style={{ ...S.thead, gridTemplateColumns: gridTemplate }}>
          {COLS.map(c => (
            <div key={c.key} style={S.th}>{c.label}</div>
          ))}
        </div>

        {/* Body */}
        <div ref={bodyRef} style={S.tbody}>
          {filtered.length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize: 28, opacity: 0.3 }}>◌</div>
              <div>{streaming ? 'Waiting for traffic...' : 'Press START to begin monitoring'}</div>
            </div>
          ) : (
            [...filtered].reverse().map((row, i) => {
              const isAttack = row.verdict === 'ANOMALY';
              const result   = getRowResult(row);
              const isNew    = i < 3;

              return (
                <div key={row.id} style={{
                  ...S.tr(row.verdict, isNew),
                  gridTemplateColumns: gridTemplate,
                }}>
                  <div style={{ ...S.td, color: 'var(--text-dim)' }}>{row.id}</div>
                  <div style={{ ...S.td, color: 'var(--text-dim)' }}>{row.timestamp}</div>
                  <div style={{ ...S.td, color: isAttack ? 'var(--red)' : 'var(--text-secondary)' }}>
                    {row.src_ip}
                  </div>
                  <div style={{ ...S.td, color: 'var(--text-dim)' }}>{row.dst_ip}</div>
                  <div style={{ ...S.td, color: 'var(--text-dim)' }}>{row.port}</div>
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
    </div>
  );
}