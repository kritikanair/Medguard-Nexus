import React from 'react';
import { NavLink } from 'react-router-dom';
import { ConnState } from '../hooks/useSocket';

// Connection state visual config
const CONN_CFG = {
  [ConnState.CONNECTED]:    { color: 'var(--green)',  label: 'WS LIVE',       dot: '#22c55e', anim: 'pulse-teal 2s infinite' },
  [ConnState.RECONNECTING]: { color: 'var(--amber)',  label: 'RECONNECTING…', dot: '#f59e0b', anim: 'blink 0.8s infinite'    },
  [ConnState.DISCONNECTED]: { color: 'var(--red)',    label: 'OFFLINE',       dot: '#ff3b5c', anim: 'none'                   },
};

const S = {
  nav: {
    height: 56,
    background: 'var(--bg-nav)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 28px',
    gap: 32,
    position: 'sticky',
    top: 0,
    zIndex: 100,
    backdropFilter: 'blur(10px)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textDecoration: 'none',
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'conic-gradient(var(--teal) 0deg 220deg, var(--red) 220deg 360deg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
    animation: 'spin-logo 6s linear infinite',
  },
  wordmark: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.12em',
    color: 'var(--text-primary)',
  },
  sub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--text-dim)',
    letterSpacing: '0.15em',
    marginTop: 1,
  },
  links: {
    display: 'flex',
    gap: 4,
    marginLeft: 24,
  },
  right: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  status: (state) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: CONN_CFG[state]?.color ?? 'var(--text-dim)',
    letterSpacing: '0.1em',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }),
  dot: (state) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: CONN_CFG[state]?.dot ?? '#475569',
    boxShadow: `0 0 6px ${CONN_CFG[state]?.dot ?? '#475569'}`,
    animation: CONN_CFG[state]?.anim ?? 'none',
    flexShrink: 0,
  }),
  streamBadge: (on) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    padding: '3px 8px',
    borderRadius: 3,
    border: `1px solid ${on ? 'var(--amber)' : 'var(--border)'}`,
    color: on ? 'var(--amber)' : 'var(--text-dim)',
    letterSpacing: '0.1em',
    animation: on ? 'blink 1.2s ease infinite' : 'none',
  }),
  phase: {
    fontFamily: 'var(--font-mono)',
    fontSize: 8,
    padding: '2px 7px',
    borderRadius: 3,
    border: '1px solid rgba(167,139,250,0.3)',
    color: 'var(--purple)',
    letterSpacing: '0.1em',
  },
};

const linkStyle = ({ isActive }) => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.1em',
  textDecoration: 'none',
  padding: '6px 14px',
  borderRadius: 4,
  color: isActive ? 'var(--teal)' : 'var(--text-dim)',
  background: isActive ? 'var(--teal-glow)' : 'transparent',
  border: `1px solid ${isActive ? 'var(--teal)44' : 'transparent'}`,
  transition: 'all 0.2s',
});

export default function Navbar({ connectionState = ConnState.DISCONNECTED, streaming }) {
  const cfg = CONN_CFG[connectionState] ?? CONN_CFG[ConnState.DISCONNECTED];

  return (
    <nav style={S.nav}>
      {/* Brand */}
      <NavLink to="/" style={S.brand}>
        <div style={S.logo}>✦</div>
        <div>
          <div style={S.wordmark}>MEDGUARD NEXUS</div>
          <div style={S.sub}>ANOMALY DETECTION SYSTEM</div>
        </div>
      </NavLink>

      {/* Navigation links */}
      <div style={S.links}>
        <NavLink to="/"    end style={linkStyle}>DASHBOARD</NavLink>
        <NavLink to="/logs"    style={linkStyle}>LIVE MONITOR</NavLink>
        <NavLink to="/twin"    style={linkStyle}>DIGITAL TWIN</NavLink>
      </div>

      {/* Right-side status */}
      <div style={S.right}>
        <span style={S.phase}>PHASE 2</span>
        <span style={S.streamBadge(streaming)}>
          {streaming ? '● STREAM LIVE' : '○ IDLE'}
        </span>
        <div style={S.status(connectionState)}>
          <div style={S.dot(connectionState)} />
          {cfg.label}
        </div>
      </div>
    </nav>
  );
}
