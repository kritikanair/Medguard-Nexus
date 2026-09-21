/**
 * MedGuard Nexus — WardTopology.js
 * Interactive SVG hospital digital-twin floor plan.
 *
 * Ward node states:
 *   NORMAL           → green glow, steady pulse
 *   ATTACK_DETECTED  → red pulse animation, warning badge
 *   ISOLATED         → blue containment shield/bubble, dashed ring
 *
 * Ward → IP mapping (mirrors sniffer.py / soar.py):
 *   192.168.1.x  →  ICU
 *   192.168.2.x  →  Emergency
 *   192.168.3.x  →  Pharmacy
 *   192.168.4.x  →  Oncology
 *   192.168.5-9.x → General Ward
 */

import React, { useMemo, useState, useEffect } from 'react';

// ── Ward definitions ───────────────────────────────────────────────────────────
const WARDS = [
  { id: 'ICU',       label: 'ICU',          sub: 'Intensive Care',  x: 80,  y: 60,  w: 140, h: 90,  icon: '🫀' },
  { id: 'Emergency', label: 'Emergency',    sub: 'ER / Trauma',     x: 280, y: 60,  w: 140, h: 90,  icon: '🚨' },
  { id: 'Pharmacy',  label: 'Pharmacy',     sub: 'Drug Dispensary', x: 80,  y: 210, w: 140, h: 90,  icon: '💊' },
  { id: 'Oncology',  label: 'Oncology',     sub: 'Cancer Centre',   x: 280, y: 210, w: 140, h: 90,  icon: '🔬' },
  { id: 'General Ward', label: 'General',   sub: 'General Ward',    x: 180, y: 135, w: 100, h: 80,  icon: '🏥' },
];

// Links between wards (line connections)
const LINKS = [
  { from: 'ICU',       to: 'Emergency' },
  { from: 'ICU',       to: 'Pharmacy'  },
  { from: 'ICU',       to: 'General Ward' },
  { from: 'Emergency', to: 'Oncology'  },
  { from: 'Emergency', to: 'General Ward' },
  { from: 'Pharmacy',  to: 'Oncology'  },
  { from: 'Pharmacy',  to: 'General Ward' },
  { from: 'Oncology',  to: 'General Ward' },
];

const IP_WARD = (ip) => {
  try {
    const octet = ip.split('.')[2];
    return { '1': 'ICU', '2': 'Emergency', '3': 'Pharmacy', '4': 'Oncology' }[octet] || 'General Ward';
  } catch { return 'General Ward'; }
};

const wardCenter = (ward) => ({
  cx: ward.x + ward.w / 2,
  cy: ward.y + ward.h / 2,
});

// ── Colour palette for each state ─────────────────────────────────────────────
const STATE_COLORS = {
  NORMAL:          { stroke: '#00e5a0', fill: 'rgba(0,229,160,0.06)',  glow: '0 0 16px rgba(0,229,160,0.4)',  text: '#00e5a0' },
  ATTACK_DETECTED: { stroke: '#ff3b5c', fill: 'rgba(255,59,92,0.10)', glow: '0 0 20px rgba(255,59,92,0.6)',  text: '#ff3b5c' },
  ISOLATED:        { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.08)', glow: '0 0 20px rgba(56,189,248,0.5)', text: '#38bdf8' },
};

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  wrapper: {
    background:   'var(--bg-card)',
    border:       '1px solid var(--border)',
    borderRadius: 8,
    padding:      '16px 20px',
    marginBottom: 16,
  },
  header: {
    display:       'flex',
    alignItems:    'center',
    justifyContent:'space-between',
    marginBottom:  12,
  },
  title: {
    fontFamily:    'var(--font-mono)',
    fontSize:      10,
    color:         'var(--text-dim)',
    letterSpacing: '0.18em',
  },
  legend: {
    display:    'flex',
    gap:        16,
    alignItems: 'center',
  },
  legendItem: (color) => ({
    display:    'flex',
    alignItems: 'center',
    gap:        6,
    fontFamily: 'var(--font-mono)',
    fontSize:   9,
    color:      color,
    letterSpacing: '0.1em',
  }),
  legendDot: (color) => ({
    width:        8,
    height:       8,
    borderRadius: '50%',
    background:   color,
    boxShadow:    `0 0 6px ${color}`,
  }),
  svg: {
    width:    '100%',
    height:   360,
    overflow: 'visible',
  },
  tooltip: {
    position:     'absolute',
    background:   '#0d1520',
    border:       '1px solid rgba(56,189,248,0.4)',
    borderRadius: 6,
    padding:      '8px 12px',
    fontFamily:   'var(--font-mono)',
    fontSize:     10,
    color:        '#e8edf5',
    pointerEvents:'none',
    zIndex:       200,
    minWidth:     160,
  },
};

// ── Ward Node (SVG group) ─────────────────────────────────────────────────────
function WardNode({ ward, state, attackCount, onClick, onHover }) {
  const col    = STATE_COLORS[state] || STATE_COLORS.NORMAL;
  const center = wardCenter(ward);
  const animId = `shield-${ward.id.replace(/\s/g, '')}`;

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={() => onClick(ward, state)}
      onMouseEnter={(e) => onHover(ward, state, attackCount, e)}
      onMouseLeave={() => onHover(null, null, 0, null)}
    >
      {/* Glow shadow rect */}
      <rect
        x={ward.x - 3} y={ward.y - 3}
        width={ward.w + 6} height={ward.h + 6}
        rx={10}
        fill="none"
        stroke={col.stroke}
        strokeWidth={1}
        opacity={0.3}
        style={{ filter: `blur(6px)` }}
      />

      {/* Main ward rect */}
      <rect
        x={ward.x} y={ward.y}
        width={ward.w} height={ward.h}
        rx={8}
        fill={col.fill}
        stroke={col.stroke}
        strokeWidth={state === 'ISOLATED' ? 2 : 1.5}
        strokeDasharray={state === 'ISOLATED' ? '6 3' : 'none'}
        style={{
          filter: col.glow ? `drop-shadow(${col.glow})` : 'none',
          transition: 'all 0.5s ease',
        }}
      >
        {state === 'ATTACK_DETECTED' && (
          <animate attributeName="opacity" values="1;0.6;1" dur="0.8s" repeatCount="indefinite" />
        )}
        {state === 'ISOLATED' && (
          <animateTransform attributeName="strokeDashoffset" type="translate"
            from="0" to="18" dur="1.5s" repeatCount="indefinite" />
        )}
      </rect>

      {/* Isolation bubble ring */}
      {state === 'ISOLATED' && (
        <ellipse
          cx={center.cx} cy={center.cy}
          rx={ward.w / 2 + 14} ry={ward.h / 2 + 14}
          fill="none"
          stroke="rgba(56,189,248,0.35)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        >
          <animateTransform attributeName="transform" type="rotate"
            from={`0 ${center.cx} ${center.cy}`}
            to={`360 ${center.cx} ${center.cy}`}
            dur="6s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* Icon */}
      <text
        x={center.cx} y={ward.y + 22}
        textAnchor="middle"
        fontSize={18}
        style={{ userSelect: 'none' }}
      >{ward.icon}</text>

      {/* Ward name */}
      <text
        x={center.cx} y={ward.y + 42}
        textAnchor="middle"
        fill={col.text}
        fontSize={11}
        fontWeight={600}
        fontFamily="'JetBrains Mono', monospace"
        letterSpacing="0.08em"
      >{ward.label}</text>

      {/* Sub-label */}
      <text
        x={center.cx} y={ward.y + 56}
        textAnchor="middle"
        fill="rgba(148,163,184,0.6)"
        fontSize={8}
        fontFamily="'JetBrains Mono', monospace"
        letterSpacing="0.1em"
      >{ward.sub}</text>

      {/* Attack badge */}
      {attackCount > 0 && state !== 'ISOLATED' && (
        <g>
          <circle cx={ward.x + ward.w - 6} cy={ward.y + 6} r={10} fill="#ff3b5c" />
          <text
            x={ward.x + ward.w - 6} y={ward.y + 10}
            textAnchor="middle"
            fill="white"
            fontSize={8}
            fontWeight={700}
            fontFamily="monospace"
          >{attackCount > 99 ? '99+' : attackCount}</text>
        </g>
      )}

      {/* Isolation shield badge */}
      {state === 'ISOLATED' && (
        <text
          x={ward.x + ward.w - 10} y={ward.y + 14}
          textAnchor="middle"
          fontSize={14}
          style={{ userSelect: 'none' }}
        >🔒</text>
      )}

      {/* State label */}
      <text
        x={center.cx} y={ward.y + ward.h - 10}
        textAnchor="middle"
        fill={col.text}
        fontSize={7}
        fontFamily="'JetBrains Mono', monospace"
        letterSpacing="0.15em"
        opacity={0.8}
      >{state.replace('_', ' ')}</text>
    </g>
  );
}

// ── Data-flow particle (animated circle along a link) ─────────────────────────
function FlowParticle({ x1, y1, x2, y2, color, delay = 0 }) {
  const id = `path-${x1}-${y1}-${x2}-${y2}`;
  return (
    <g>
      <path id={id} d={`M${x1},${y1} L${x2},${y2}`} fill="none" stroke="none" />
      <circle r={3} fill={color} opacity={0.9}>
        <animateMotion dur="2s" repeatCount="indefinite" begin={`${delay}s`}>
          <mpath href={`#${id}`} />
        </animateMotion>
        <animate attributeName="opacity" values="0;1;1;0" dur="2s" repeatCount="indefinite" begin={`${delay}s`} />
      </circle>
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WardTopology({ logs = [], isolationEvents = [], streaming = false, onNodeClick }) {
  const [hovered, setHovered] = useState(null); // { ward, state, count, x, y }

  // Derive ward states from latest logs + isolation events
  const wardStates = useMemo(() => {
    const states   = {};
    const counts   = {};
    const isolated = new Set(
      isolationEvents
        .filter(e => e.status === 'ACTIVE')
        .map(e => e.target_ward || IP_WARD(e.ip_address || ''))
    );

    // Count attacks per ward from latest 30 logs
    const recent = logs.slice(-30);
    for (const entry of recent) {
      const ward = entry.ward || IP_WARD(entry.src_ip || '');
      if (entry.verdict === 'ANOMALY') {
        counts[ward] = (counts[ward] || 0) + 1;
      }
    }

    for (const w of WARDS) {
      if (isolated.has(w.id)) {
        states[w.id] = 'ISOLATED';
      } else if ((counts[w.id] || 0) >= 2) {
        states[w.id] = 'ATTACK_DETECTED';
      } else {
        states[w.id] = 'NORMAL';
      }
    }
    return { states, counts };
  }, [logs, isolationEvents]);

  // Link colours based on connected ward states
  const getLinkColor = (fromId, toId) => {
    const fromState = wardStates.states[fromId];
    const toState   = wardStates.states[toId];
    if (fromState === 'ISOLATED' || toState === 'ISOLATED') return 'rgba(56,189,248,0.3)';
    if (fromState === 'ATTACK_DETECTED' || toState === 'ATTACK_DETECTED') return 'rgba(255,59,92,0.4)';
    return 'rgba(0,229,160,0.15)';
  };

  const handleHover = (ward, state, count, e) => {
    if (!ward || !e) { setHovered(null); return; }
    const rect = e.currentTarget.closest('svg').getBoundingClientRect();
    setHovered({ ward, state, count, x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 40 });
  };

  const handleNodeClick = (ward, state) => {
    if (onNodeClick) onNodeClick(ward, state);
  };

  const wardById = Object.fromEntries(WARDS.map(w => [w.id, w]));

  return (
    <div style={{ position: 'relative' }}>
      <div style={S.wrapper}>
        <div style={S.header}>
          <div>
            <span style={S.title}>HOSPITAL NETWORK TOPOLOGY — DIGITAL TWIN</span>
          </div>
          <div style={S.legend}>
            {[
              { label: 'NORMAL',   color: '#00e5a0' },
              { label: 'ATTACK',   color: '#ff3b5c' },
              { label: 'ISOLATED', color: '#38bdf8' },
            ].map(({ label, color }) => (
              <div key={label} style={S.legendItem(color)}>
                <div style={S.legendDot(color)} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <svg style={S.svg} viewBox="0 0 500 360">
          {/* Background grid */}
          <defs>
            <pattern id="topo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,229,160,0.04)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="500" height="360" fill="url(#topo-grid)" />

          {/* Links */}
          {LINKS.map(({ from, to }) => {
            const fw = wardById[from];
            const tw = wardById[to];
            if (!fw || !tw) return null;
            const fc = wardCenter(fw);
            const tc = wardCenter(tw);
            return (
              <g key={`${from}-${to}`}>
                <line
                  x1={fc.cx} y1={fc.cy}
                  x2={tc.cx} y2={tc.cy}
                  stroke={getLinkColor(from, to)}
                  strokeWidth={1.5}
                  strokeDasharray={wardStates.states[from] === 'ISOLATED' || wardStates.states[to] === 'ISOLATED' ? '4 4' : 'none'}
                />
                {/* Data-flow particles when streaming */}
                {streaming && (
                  <FlowParticle
                    x1={fc.cx} y1={fc.cy}
                    x2={tc.cx} y2={tc.cy}
                    color={getLinkColor(from, to).replace('0.', '0.9').replace('rgba', 'rgba')}
                    delay={Math.random() * 2}
                  />
                )}
              </g>
            );
          })}

          {/* Ward nodes */}
          {WARDS.map(ward => (
            <WardNode
              key={ward.id}
              ward={ward}
              state={wardStates.states[ward.id] || 'NORMAL'}
              attackCount={wardStates.counts[ward.id] || 0}
              onClick={handleNodeClick}
              onHover={handleHover}
            />
          ))}

          {/* Central MedGuard nexus marker */}
          <circle cx={230} cy={175} r={5} fill="var(--teal)" opacity={0.6}>
            {streaming && (
              <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
            )}
          </circle>
          <text x={230} y={198} textAnchor="middle" fill="rgba(0,229,160,0.4)"
            fontSize={7} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.15em">NEXUS</text>
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div style={{ ...S.tooltip, left: hovered.x, top: hovered.y }}>
            <div style={{ marginBottom: 4, color: STATE_COLORS[hovered.state]?.text }}>
              {hovered.ward.icon} {hovered.ward.label} — <b>{hovered.state.replace('_', ' ')}</b>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 9 }}>
              {hovered.ward.sub}
            </div>
            {hovered.count > 0 && (
              <div style={{ marginTop: 4, color: '#ff3b5c', fontSize: 9 }}>
                ⚠ {hovered.count} recent attack{hovered.count !== 1 ? 's' : ''}
              </div>
            )}
            {hovered.state === 'ISOLATED' && (
              <div style={{ marginTop: 4, color: '#38bdf8', fontSize: 9 }}>
                🔒 Network access blocked — click to triage
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
