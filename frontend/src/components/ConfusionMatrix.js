import React from 'react';

const CELLS = [
  { key: 'tp', label: 'TRUE POS',  color: 'var(--teal)', desc: 'Attacks correctly flagged',   row: 0, col: 0 },
  { key: 'fp', label: 'FALSE POS', color: 'var(--amber)', desc: 'Normal flagged as attack',    row: 0, col: 1 },
  { key: 'fn', label: 'FALSE NEG', color: 'var(--red)',   desc: 'Attacks missed',              row: 1, col: 0 },
  { key: 'tn', label: 'TRUE NEG',  color: 'var(--green)', desc: 'Normal correctly passed',     row: 1, col: 1 },
];

const fmt = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

const S = {
  wrap: { width: '100%' },
  heading: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-dim)',
    letterSpacing: '0.15em',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  divider: { width: 24, height: 1, background: 'var(--border-glow)' },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '1fr 1fr',
    gap: 8,
  },
  axisRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 6,
    paddingLeft: 4,
  },
  axisLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--text-dim)',
    letterSpacing: '0.12em',
  },
  cell: (color) => ({
    background: `${color}0d`,
    border: `1px solid ${color}33`,
    borderRadius: 6,
    padding: '14px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    transition: 'background 0.3s',
  }),
  cellLabel: (color) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: 8,
    color,
    letterSpacing: '0.12em',
  }),
  cellValue: (color) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: 22,
    fontWeight: 700,
    color,
    lineHeight: 1,
  }),
  cellDesc: {
    fontFamily: 'var(--font-mono)',
    fontSize: 8,
    color: 'var(--text-dim)',
    textAlign: 'center',
  },
};

export default function ConfusionMatrix({ tp = 0, fp = 0, fn = 0, tn = 0, live = false }) {
  const vals = { tp, fp, fn, tn };
  return (
    <div style={S.wrap}>
      <div style={S.heading}>
        <span style={S.divider} />
        {live ? '● LIVE ' : ''}CONFUSION MATRIX
        {live && <span style={{ color: 'var(--amber)', animation: 'blink 1.2s infinite' }}>●</span>}
      </div>

      {/* Column axis labels */}
      <div style={S.axisRow}>
        <span style={S.axisLabel}>PREDICTED: ATTACK</span>
        <span style={S.axisLabel}>PREDICTED: NORMAL</span>
      </div>

      <div style={S.grid}>
        {CELLS.map(({ key, label, color, desc }) => (
          <div key={key} style={S.cell(color)}>
            <span style={S.cellLabel(color)}>{label}</span>
            <span style={S.cellValue(color)}>{fmt(vals[key])}</span>
            <span style={S.cellDesc}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
