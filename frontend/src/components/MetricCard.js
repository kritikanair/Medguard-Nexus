import React from 'react';

const S = {
  card: (color) => ({
    background: 'var(--bg-card)',
    border: `1px solid ${color}33`,
    borderRadius: 8,
    padding: '18px 20px',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.2s, box-shadow 0.2s',
    cursor: 'default',
  }),
  accent: (color) => ({
    position: 'absolute',
    top: 0, left: 0,
    width: '100%', height: 2,
    background: `linear-gradient(90deg, ${color}, transparent)`,
  }),
  glow: (color) => ({
    position: 'absolute',
    bottom: -20, right: -20,
    width: 80, height: 80,
    borderRadius: '50%',
    background: `${color}11`,
    filter: 'blur(20px)',
    pointerEvents: 'none',
  }),
  label: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--text-dim)',
    letterSpacing: '0.17em',
    marginBottom: 10,
  },
  value: (color) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: 32,
    fontWeight: 700,
    color,
    lineHeight: 1,
    marginBottom: 6,
  }),
  unit: {
    fontSize: 14,
    opacity: 0.7,
    marginLeft: 2,
  },
  sub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-dim)',
    letterSpacing: '0.05em',
  },
};

export default function MetricCard({ label, value, color = 'var(--teal)', unit = '%', sub }) {
  const displayUnit = (unit !== undefined && unit !== '') ? unit : '%';
  return (
    <div style={S.card(color)} className="metric-card">
      <div style={S.accent(color)} />
      <div style={S.glow(color)} />
      <div style={S.label}>{label}</div>
      <div style={S.value(color)}>
        {value}
        <span style={S.unit}>{displayUnit}</span>
      </div>
      {sub && <div style={S.sub}>{sub}</div>}
    </div>
  );
}
