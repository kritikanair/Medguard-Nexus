import React, { useEffect, useState } from 'react';
import MetricCard from '../components/MetricCard';
import ConfusionMatrix from '../components/ConfusionMatrix';
import ScoreDistributionChart from '../components/ScoreDistributionChart';
import LiveScoreGraph from '../components/LiveScoreGraph';
import { api } from '../api';
import { useStream } from '../hooks/useStream';

const S = {
  page: {
    minHeight: 'calc(100vh - 56px)',
    background: 'var(--bg-deep)',
    padding: '24px 28px',
  },
  header: {
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 28,
  },
  title: {
    fontFamily: 'var(--font-mono)', fontSize: 11,
    color: 'var(--text-dim)', letterSpacing: '0.15em',
    marginBottom: 6,
  },
  heading: {
    fontFamily: 'var(--font-body)', fontSize: 22,
    fontWeight: 600, color: 'var(--text-primary)',
    letterSpacing: '0.02em',
  },
  btn: (active) => ({
    fontFamily: 'var(--font-mono)', fontSize: 12,
    padding: '9px 22px', borderRadius: 4, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--red)' : 'var(--teal)'}`,
    background: active ? 'var(--red-glow)' : 'var(--teal-glow)',
    color: active ? 'var(--red)' : 'var(--teal)',
    letterSpacing: '0.08em', transition: 'all 0.2s',
  }),
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12, marginBottom: 24,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16, marginBottom: 16,
  },
  rowFull: {
    marginBottom: 16,
  },
  panel: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 6, padding: '20px 22px',
  },
  sectionLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 10,
    color: 'var(--text-dim)', letterSpacing: '0.15em',
    marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
  },
  divider: {
    width: 24, height: 1, background: 'var(--border-glow)',
  },
};

export default function Dashboard({ streaming: propStreaming }) {
  const [stats, setStats]       = useState(null);
  const [distData, setDistData] = useState(null);
  const { logs, streaming, handleStart, handleStop } = useStream();

  useEffect(() => {
    const fetchStats = () => api.getStats().then(setStats).catch(() => {});
    fetchStats();
    const t = setInterval(fetchStats, 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    api.getDistribution().then(setDistData).catch(() => {});
  }, []);

  const model   = stats?.model   || {};
  const session = stats?.session || {};
  const metrics = stats?.metrics || {};

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>MEDGUARD NEXUS // DETECTION ENGINE</div>
          <div style={S.heading}>Model Performance Dashboard</div>
        </div>
        <button
          style={S.btn(streaming)}
          onClick={streaming ? handleStop : handleStart}
        >
          {streaming ? '■ STOP STREAM' : '▶ START STREAM'}
        </button>
      </div>

      {/* Model metric cards */}
      <div style={S.sectionLabel}>
        <span style={S.divider} /> TRAINED MODEL — CIC-IDS2017
      </div>
      <div style={S.grid}>
        <MetricCard label="PRECISION"  value={model.precision?.toFixed(1) ?? '96.4'} color="var(--teal)"  sub="Alerts that are real" />
        <MetricCard label="RECALL"     value={model.recall?.toFixed(1)    ?? '63.7'} color="var(--red)"   sub="Attacks caught" />
        <MetricCard label="F1-SCORE"   value={model.f1?.toFixed(1)        ?? '76.7'} color="var(--amber)" sub="Harmonic mean" />
        <MetricCard label="ACCURACY"   value={model.accuracy?.toFixed(1)  ?? '85.9'} color="var(--green)" sub="Overall correct" />
      </div>

      {/* Score timeline + distribution */}
      <div style={S.rowFull}>
        <div style={S.panel}>
          <LiveScoreGraph logs={logs} threshold={model.threshold ?? -0.0185} />
        </div>
      </div>

      {/* Distribution + confusion matrix */}
      <div style={S.row}>
        <div style={S.panel}>
          <ScoreDistributionChart data={distData} />
        </div>
        <div style={S.panel}>
          <ConfusionMatrix
            tp={model.tp_model ?? 18516}
            fp={model.fp_model ?? 684}
            fn={model.fn_model ?? 10568}
            tn={model.tn_model ?? 50232}
          />
        </div>
      </div>

      {/* Live session stats */}
      {streaming && (
        <>
          <div style={{ ...S.sectionLabel, marginTop: 8 }}>
            <span style={S.divider} />
            <span style={{ animation: 'pulse-teal 1.5s infinite' }}>●</span>
            LIVE SESSION METRICS
          </div>
          <div style={S.grid}>
            <MetricCard label="FLOWS ANALYZED" value={session.total ?? 0}     unit=""  color="var(--teal)"  />
            <MetricCard label="ATTACKS FLAGGED" value={session.attacks ?? 0}  unit=""  color="var(--red)"   />
            <MetricCard label="LIVE PRECISION"  value={metrics.precision ?? 0} color="var(--teal)"  />
            <MetricCard label="LIVE RECALL"     value={metrics.recall ?? 0}   color="var(--amber)" />
          </div>
          <div style={{ ...S.row, marginTop: 16 }}>
            <div style={S.panel}>
              <ConfusionMatrix
                tp={session.tp ?? 0}
                fp={session.fp ?? 0}
                fn={session.fn ?? 0}
                tn={session.tn ?? 0}
                live
              />
            </div>
            <div style={S.panel}>
              <div style={S.sectionLabel}>MODEL DETAILS</div>
              {[
                ['Algorithm',     'Isolation Forest'],
                ['Contamination', '0.01 (pure normal train)'],
                ['Features',      `${model.features ?? 15} selected by separation`],
                ['Threshold',     `${model.threshold ?? -0.0185} (24th percentile)`],
                ['Training Data', 'Monday — 100% Benign'],
                ['Test Data',     'Wednesday — Benign + DoS Hulk'],
                ['Sample Size',   '80,000 rows each'],
                ['Recall Strategy', 'Threshold tuning, not contamination'],
              ].map(([k, v]) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '7px 0', borderBottom: '1px solid var(--bg-hover)',
                }}>
                  <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{k}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12, maxWidth: '60%', textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}