import React from 'react';
import { NavLink } from 'react-router-dom';

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
  dot: (ok) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: ok ? 'var(--green)' : 'var(--red)',
    boxShadow: ok ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
    animation: ok ? 'pulse-teal 2s infinite' : 'none',
  }),
  status: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-dim)',
    letterSpacing: '0.1em',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
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

export default function Navbar({ health, streaming }) {
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
        <NavLink to="/"     end style={linkStyle}>DASHBOARD</NavLink>
        <NavLink to="/logs"     style={linkStyle}>LIVE MONITOR</NavLink>
      </div>

      {/* Right-side status */}
      <div style={S.right}>
        <span style={S.streamBadge(streaming)}>
          {streaming ? '● STREAM LIVE' : '○ IDLE'}
        </span>
        <div style={S.status}>
          <div style={S.dot(health)} />
          {health ? 'API ONLINE' : 'API OFFLINE'}
        </div>
      </div>
    </nav>
  );
}
