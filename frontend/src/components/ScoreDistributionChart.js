import React, { useMemo } from 'react';

// Pure CSS histogram — no external chart library needed
const BINS = 30;
const MIN_SCORE = -0.5;
const MAX_SCORE = 0.6;
const BIN_WIDTH = (MAX_SCORE - MIN_SCORE) / BINS;

function bin(scores) {
  const counts = new Array(BINS).fill(0);
  scores.forEach(s => {
    const idx = Math.floor((s - MIN_SCORE) / BIN_WIDTH);
    const clamped = Math.max(0, Math.min(BINS - 1, idx));
    counts[clamped]++;
  });
  return counts;
}

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
  chartArea: {
    display: 'flex',
    alignItems: 'flex-end',
    height: 120,
    gap: 1,
    padding: '0 4px',
    position: 'relative',
  },
  bar: (height, color) => ({
    flex: 1,
    height: `${height}%`,
    background: color,
    borderRadius: '2px 2px 0 0',
    transition: 'height 0.4s ease',
    minHeight: 1,
    opacity: 0.8,
  }),
  thresholdLine: (pct) => ({
    position: 'absolute',
    left: `${pct}%`,
    top: 0, bottom: 0,
    width: 1,
    background: 'var(--amber)',
    boxShadow: '0 0 6px var(--amber)',
    pointerEvents: 'none',
  }),
  thresholdLabel: (pct) => ({
    position: 'absolute',
    left: `calc(${pct}% + 4px)`,
    top: 6,
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--amber)',
  }),
  legend: {
    display: 'flex',
    gap: 20,
    marginTop: 12,
    paddingLeft: 4,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-dim)',
  },
  legendDot: (c) => ({
    width: 10,
    height: 10,
    borderRadius: 2,
    background: c,
  }),
  xAxis: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: 4,
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--text-dim)',
  },
};

export default function ScoreDistributionChart({ data }) {
  const benignBins = useMemo(() =>
    bin(data?.benign_scores ?? []), [data?.benign_scores]);
  const attackBins = useMemo(() =>
    bin(data?.attack_scores ?? []), [data?.attack_scores]);

  const maxCount = Math.max(...benignBins, ...attackBins, 1);

  const threshold  = data?.threshold ?? -0.0185;
  const threshPct  = ((threshold - MIN_SCORE) / (MAX_SCORE - MIN_SCORE)) * 100;

  if (!data) {
    return (
      <div style={S.wrap}>
        <div style={S.heading}><span style={S.divider}/>SCORE DISTRIBUTION</div>
        <div style={{ height: 120, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.heading}><span style={S.divider}/>SCORE DISTRIBUTION</div>

      <div style={S.chartArea}>
        {/* Render combined bars — benign on top of attack */}
        {benignBins.map((bCount, i) => {
          const aCount = attackBins[i];
          const totalH  = ((bCount + aCount) / maxCount) * 100;
          const attackH = (aCount / (bCount + aCount + 0.001)) * 100;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'stretch', justifyContent: 'flex-end', height: `${totalH}%`,
              gap: 0, transition: 'height 0.4s' }}>
              <div style={{ flex: attackH, background: 'var(--red)', opacity: 0.75,
                borderRadius: '2px 2px 0 0', minHeight: aCount > 0 ? 1 : 0 }} />
              <div style={{ flex: 100 - attackH, background: 'var(--teal)', opacity: 0.7,
                minHeight: bCount > 0 ? 1 : 0 }} />
            </div>
          );
        })}

        {/* Threshold line */}
        <div style={S.thresholdLine(Math.max(2, Math.min(98, threshPct)))}>
          <div style={S.thresholdLabel(Math.max(2, Math.min(85, threshPct)))}>
            τ = {threshold.toFixed(4)}
          </div>
        </div>
      </div>

      <div style={S.xAxis}>
        <span>{MIN_SCORE.toFixed(2)}</span>
        <span>Anomaly Score →</span>
        <span>{MAX_SCORE.toFixed(2)}</span>
      </div>

      <div style={S.legend}>
        <div style={S.legendItem}>
          <div style={S.legendDot('var(--teal)')} /> BENIGN
          <span style={{ color: 'var(--text-secondary)' }}>μ={data.benign_mean?.toFixed(3)}</span>
        </div>
        <div style={S.legendItem}>
          <div style={S.legendDot('var(--red)')} /> ATTACK
          <span style={{ color: 'var(--text-secondary)' }}>μ={data.attack_mean?.toFixed(3)}</span>
        </div>
        <div style={S.legendItem}>
          <div style={{ ...S.legendDot('var(--amber)'), width: 2, height: 10 }} />
          THRESHOLD
        </div>
      </div>
    </div>
  );
}
