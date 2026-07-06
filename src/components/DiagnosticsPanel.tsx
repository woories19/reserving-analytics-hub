import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface DiagnosticsPanelProps {
  diagnostics: {
    erraticFactors: number[];
    thinCells: Array<{ row: number; col: number }>;
    nonConvergingTail: boolean;
  };
  linkFactors: number[];
  originPeriods: string[];
  issues?: any[];
  workingDataset?: any[];
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  diagnostics,
  linkFactors,
  originPeriods,
  issues,
  workingDataset,
}) => {
  const { erraticFactors, thinCells, nonConvergingTail } = diagnostics;

  // Fit stats locally for visual plotting
  const dataPoints: Array<{ x: number; y: number }> = [];
  linkFactors.forEach((f, idx) => {
    if (f > 1.0001) {
      dataPoints.push({
        x: idx + 1,
        y: f - 1.0,
      });
    }
  });

  // Calculate fit curve parameters again for plotting
  let a = 0;
  let b = 0;
  let r2 = 0;
  let hasValidFit = false;

  if (dataPoints.length >= 2) {
    const logData = dataPoints.map(p => ({ x: p.x, y: Math.log(p.y) }));
    const N = logData.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;

    logData.forEach(p => {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
      sumYY += p.y * p.y;
    });

    const denom = N * sumXX - sumX * sumX;
    if (denom !== 0) {
      const B = (N * sumXY - sumX * sumY) / denom;
      const A = (sumY - B * sumX) / N;

      a = Math.exp(A);
      b = Math.exp(B);
      hasValidFit = b < 1.0; // valid only if decaying

      // Calculate R2
      const meanY = sumY / N;
      let ssTot = 0;
      let ssRes = 0;
      logData.forEach(p => {
        const predY = A + B * p.x;
        ssTot += Math.pow(p.y - meanY, 2);
        ssRes += Math.pow(p.y - predY, 2);
      });
      r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    }
  }

  // Visual stability index computation
  const totalIssues = erraticFactors.length + thinCells.length + (nonConvergingTail ? 1 : 0);
  const getStabilityRating = () => {
    if (totalIssues === 0) return { name: 'EXCELLENT', color: 'var(--status-success)', bg: 'var(--status-success-bg)' };
    if (totalIssues <= 2) return { name: 'STABLE (WITH WARNINGS)', color: 'var(--status-warning)', bg: 'var(--status-warning-bg)' };
    return { name: 'VOLATILE / UNSTABLE', color: 'var(--status-error)', bg: 'var(--status-error-bg)' };
  };

  const rating = getStabilityRating();

  // SVG dimensions for tail-curve fit plotting
  const svgW = 400;
  const svgH = 200;
  const pad = { t: 15, r: 20, b: 35, l: 45 };

  const plotPoints = dataPoints.map(p => {
    // scale coordinates
    // x max is originPeriods.length
    const maxX = Math.max(originPeriods.length, 5);
    const maxY = Math.max(...dataPoints.map(pt => pt.y), 0.1);
    
    const usableW = svgW - pad.l - pad.r;
    const usableH = svgH - pad.t - pad.b;

    return {
      cx: pad.l + (p.x / maxX) * usableW,
      cy: svgH - pad.b - (p.y / maxY) * usableH,
      label: `Dev ${p.x}: ${(p.y + 1).toFixed(4)}`,
      xRaw: p.x,
      yRaw: p.y
    };
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px' }}>
      {/* 1. Diagnostics Warnings Panel */}
      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>
          Development Diagnostics Audit
        </h3>

        {/* Health Rating badge banner */}
        <div 
          style={{ 
            backgroundColor: rating.bg, 
            color: rating.color, 
            padding: '12px 16px', 
            borderRadius: 'var(--radius-md)', 
            fontWeight: 700, 
            fontSize: '0.95rem',
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            border: `1px solid ${rating.color}40`
          }}
        >
          <span>TRIANGLE STABILITY RATING:</span>
          <span>{rating.name}</span>
        </div>

        {/* Individual warnings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Erratic Link Ratios */}
          {erraticFactors.length > 0 ? (
            <div className="alert alert-warning" style={{ margin: 0, padding: '12px' }}>
              <AlertTriangle size={20} style={{ flexShrink: 0, color: 'var(--status-warning)' }} />
              <div>
                <strong style={{ fontSize: '0.875rem' }}>Erratic Development Column Volatility</strong>
                <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                  High Coefficient of Variation (CV &gt; 8%) was detected in development columns:{' '}
                  <strong>{erraticFactors.map(f => `${f} to ${f+1}`).join(', ')}</strong>. 
                  This indicates historical development patterns are highly volatile.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.825rem', color: 'var(--status-success)' }}>
              <CheckCircle2 size={16} /> Link ratios development speed is historically consistent across periods.
            </div>
          )}

          {/* Thin Cells */}
          {thinCells.length > 0 ? (
            <div className="alert alert-warning" style={{ margin: 0, padding: '12px' }}>
              <AlertTriangle size={20} style={{ flexShrink: 0, color: 'var(--status-warning)' }} />
              <div>
                <strong style={{ fontSize: '0.875rem' }}>Sparse Claim Cells / Negative Development</strong>
                <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                  <strong>{thinCells.length}</strong> triangle cells contain low claim amounts (&lt; $5k) or negative incremental changes (reversals). 
                  This increases the sensitivity of calculations to single large claim updates.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.825rem', color: 'var(--status-success)' }}>
              <CheckCircle2 size={16} /> No sparse values or negative development columns detected in cells.
            </div>
          )}

          {/* Tail Non-Convergence */}
          {nonConvergingTail ? (
            <div className="alert alert-error" style={{ margin: 0, padding: '12px' }}>
              <AlertCircle size={20} style={{ flexShrink: 0, color: 'var(--status-error)' }} />
              <div>
                <strong style={{ fontSize: '0.875rem' }}>Tail Pattern Non-Convergence Warning</strong>
                <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                  The final observed age-to-age link factor (<strong>{linkFactors[linkFactors.length - 1]?.toFixed(4)}</strong>) is still greater than 1.015. 
                  Reserves should include an adjusted tail factor to avoid underestimating liabilities.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.825rem', color: 'var(--status-success)' }}>
              <CheckCircle2 size={16} /> Claims development converges cleanly to 1.000 before the observed tail limits.
            </div>
          )}
        </div>
      </div>

      {/* 2. Curve-Fitting Analysis Visualizer */}
      <div className="card">
        <h3 style={{ marginBottom: '12px' }}>
          Tail Curve-Fitting Model
        </h3>

        {hasValidFit ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
              <span>Fitted Curve: <code>f(t) - 1 = {a.toFixed(4)} &times; {b.toFixed(4)}^t</code></span>
              <span className={`badge ${r2 > 0.8 ? 'badge-success' : 'badge-warning'}`}>
                R² = {r2.toFixed(2)} ({r2 > 0.8 ? 'Strong Fit' : 'Moderate Fit'})
              </span>
            </div>

            {/* SVG Plot */}
            <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: 'var(--bg-app)', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
              <svg width={svgW} height={svgH} style={{ backgroundColor: 'transparent' }}>
                {/* Axes */}
                <line x1={pad.l} y1={svgH - pad.b} x2={svgW - pad.r} y2={svgH - pad.b} stroke="var(--border-color)" />
                <line x1={pad.l} y1={pad.t} x2={pad.l} y2={svgH - pad.b} stroke="var(--border-color)" />

                {/* X-axis Label */}
                <text x={svgW / 2} y={svgH - 6} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
                  Development Period (t)
                </text>
                
                {/* Y-axis Label */}
                <text x={12} y={svgH / 2} textAnchor="middle" transform={`rotate(-90 12 ${svgH / 2})`} fontSize="9" fill="var(--color-muted)">
                  (Link Ratio - 1.0)
                </text>

                {/* Plot the observed data points */}
                {plotPoints.map((pt, idx) => (
                  <g key={idx}>
                    <circle 
                      cx={pt.cx} 
                      cy={pt.cy} 
                      r="4" 
                      fill="var(--accent-blue)" 
                    />
                    <text 
                      x={pt.cx} 
                      y={pt.cy - 6} 
                      textAnchor="middle" 
                      fontSize="8" 
                      fill="var(--color-secondary)"
                      fontWeight="600"
                    >
                      t={pt.xRaw}
                    </text>
                  </g>
                ))}

                {/* Plot the fitted decay line */}
                {plotPoints.length > 1 && (() => {
                  const linePaths: string[] = [];
                  const maxX = Math.max(originPeriods.length, 5);
                  const maxY = Math.max(...dataPoints.map(pt => pt.y), 0.1);
                  const usableW = svgW - pad.l - pad.r;
                  const usableH = svgH - pad.t - pad.b;

                  for (let x = 1; x <= maxX; x += 0.2) {
                    const y = a * Math.pow(b, x);
                    const cx = pad.l + (x / maxX) * usableW;
                    const cy = svgH - pad.b - (y / maxY) * usableH;
                    
                    if (cy >= pad.t && cy <= svgH - pad.b) {
                      linePaths.push(`${cx},${cy}`);
                    }
                  }

                  return linePaths.length > 1 ? (
                    <polyline 
                      points={linePaths.join(' ')} 
                      fill="none" 
                      stroke="var(--status-error)" 
                      strokeWidth="2" 
                      strokeDasharray="2 2"
                    />
                  ) : null;
                })()}
              </svg>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '8px' }}>
              <Info size={12} />
              <span>Dotted red line represents the fitted log-linear decay path of age-to-age factors.</span>
            </div>
          </div>
        ) : (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--color-muted)' }}>
            <AlertTriangle size={32} style={{ marginBottom: '8px' }} />
            <h5 style={{ color: 'var(--color-secondary)' }}>Curve Fitting Unavailable</h5>
            <p style={{ fontSize: '0.85rem' }}>Upload a file containing at least 3 periods to enable tail fitting regression.</p>
          </div>
        )}
      </div>

      {/* 3. Large Loss Red Flags Detail (Spanning full width below) */}
      {(() => {
        const largeLosses = (issues || []).filter(i => i.type === 'large_loss');
        if (largeLosses.length === 0) return null;

        return (
          <div className="card" style={{ gridColumn: 'span 2', borderLeft: '4px solid var(--status-error)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-error)', fontSize: '1rem' }}>
                <AlertCircle size={18} /> Large Loss Volatility Risk Alert
              </h3>
              <span className="badge badge-danger" style={{ backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error)', fontWeight: 600 }}>
                {largeLosses.length} LARGE LOSSES DETECTED
              </span>
            </div>
            <p style={{ fontSize: '0.825rem', color: 'var(--color-primary)', marginBottom: '16px', lineHeight: 1.4 }}>
              <strong>Reserving Volatility Warning:</strong> Large claims represent severe, low-frequency shocks that do not develop along normal attritional paths. 
              Applying standard Chain-Ladder link ratios to a development triangle containing unadjusted large losses can lead to severe distortion. 
              Consider applying a separate large-loss reserving analysis or adjusting/excluding these rows inside the spreadsheet editor.
            </p>
            <div className="table-container" style={{ maxHeight: '180px', marginBottom: 0 }}>
              <table className="actuarial-table" style={{ fontSize: '0.775rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '60px', textAlign: 'center' }}>Row</th>
                    <th>Claim Number</th>
                    <th>Policy Number</th>
                    <th>Product</th>
                    <th>Peril</th>
                    <th>LOB Segment</th>
                    <th style={{ textAlign: 'right' }}>Flagged Value ($)</th>
                    <th style={{ textAlign: 'left' }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {largeLosses.map((issue, idx) => {
                    const originalRow = workingDataset ? workingDataset[issue.rowIdx - 1] : null;
                    return (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{issue.rowIdx}</td>
                        <td style={{ fontWeight: 600 }}>{issue.claimId || '--'}</td>
                        <td>{originalRow?.['Policy Number'] || '--'}</td>
                        <td>{originalRow?.['Product'] || '--'}</td>
                        <td>{originalRow?.['Peril'] || '--'}</td>
                        <td>{originalRow?.['LOB Segment'] || '--'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--status-error)' }}>
                          ${issue.value.toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'left', fontStyle: 'italic' }}>{issue.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
