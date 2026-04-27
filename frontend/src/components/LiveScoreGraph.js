import React, { useMemo } from 'react';

const MAX_POINTS = 60;

const S = {
  wrap: { width: '100%' },
  heading: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-dim)',
    letterSpacing: '0.15em',
    marginBottom: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  divider: { width: 24, height: 1, background: 'var(--border-glow)' },
  svgWrap: {
    width: '100%',
    height: 160,
    position: 'relative',
  },
  legend: {
    display: 'flex',
    gap: 20,
    marginTop: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-dim)',
    alignItems: 'center',
  },
  dot: c => ({ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block', marginRight: 5 }),
};

export default function LiveScoreGraph({ logs = [], threshold = -0.0185 }) {
  const points = useMemo(() => logs.slice(-MAX_POINTS), [logs]);

  const W = 900, H = 160;
  const PAD_L = 36, PAD_R = 10, PAD_T = 10, PAD_B = 20;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  // Dynamic y-range
  const allScores = points.map(p => p.score);
  const minS = Math.min(-0.5, ...allScores) - 0.05;
  const maxS = Math.max(0.55, ...allScores) + 0.05;

  const toX = (i) => PAD_L + (i / Math.max(points.length - 1, 1)) * plotW;
  const toY = (s) => PAD_T + (1 - (s - minS) / (maxS - minS)) * plotH;

  const thY   = toY(threshold);
  const zeroY = toY(0);

  // Build polyline path
  const linePath = points.length < 2 ? '' :
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.score).toFixed(1)}`).join(' ');

  // Area fill path
  const areaPath = points.length < 2 ? '' :
    `${linePath} L${toX(points.length - 1).toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${PAD_L},${(PAD_T + plotH).toFixed(1)} Z`;

  return (
    <div style={S.wrap}>
      <div style={S.heading}>
        <span style={S.divider} />
        LIVE ANOMALY SCORE — LAST {points.length || '—'} FLOWS
        {points.length > 0 && (
          <span style={{ color: 'var(--amber)', animation: 'blink 1s infinite', marginLeft: 'auto' }}>● LIVE</span>
        )}
      </div>

      <div style={S.svgWrap}>
        {points.length === 0 ? (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)', fontSize: 11,
          }}>
            Start stream to see live scores
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }}
            preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="var(--teal)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--teal)" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Zero line */}
            <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
              stroke="var(--border-glow)" strokeWidth="0.5" strokeDasharray="4 4" />

            {/* Threshold line */}
            <line x1={PAD_L} y1={thY} x2={W - PAD_R} y2={thY}
              stroke="var(--amber)" strokeWidth="1" strokeDasharray="6 3"
              style={{ filter: 'drop-shadow(0 0 3px var(--amber))' }} />
            <text x={PAD_L + 4} y={thY - 4}
              fill="var(--amber)" fontSize={9} fontFamily="var(--font-mono)">
              τ = {threshold.toFixed(4)}
            </text>

            {/* Area fill */}
            <path d={areaPath} fill="url(#areaGrad)" />

            {/* Line */}
            <path d={linePath} fill="none"
              stroke="var(--teal)" strokeWidth="1.5"
              style={{ filter: 'drop-shadow(0 0 4px var(--teal))' }} />

            {/* Dots — color by verdict */}
            {points.map((p, i) => (
              <circle key={i}
                cx={toX(i).toFixed(1)} cy={toY(p.score).toFixed(1)} r="3"
                fill={p.verdict === 'ANOMALY' ? 'var(--red)' : 'var(--teal)'}
                style={{ filter: p.verdict === 'ANOMALY' ? 'drop-shadow(0 0 4px var(--red))' : 'none' }}
              />
            ))}

            {/* Y-axis labels */}
            {[minS, (minS + maxS) / 2, maxS].map((v, i) => (
              <text key={i} x={PAD_L - 4} y={toY(v) + 4}
                fill="var(--text-dim)" fontSize={8} fontFamily="var(--font-mono)"
                textAnchor="end">
                {v.toFixed(2)}
              </text>
            ))}
          </svg>
        )}
      </div>

      <div style={S.legend}>
        <span><span style={S.dot('var(--teal)')} />NORMAL</span>
        <span><span style={S.dot('var(--red)')} />ANOMALY</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>
          {points.length > 0 && `Latest: ${points[points.length - 1].score.toFixed(4)}`}
        </span>
      </div>
    </div>
  );
}
