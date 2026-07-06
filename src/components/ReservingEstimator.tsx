import React, { useState } from 'react';
import type { ReservingResult } from '../math/actuarialMath';

interface ReservingEstimatorProps {
  clPaid: ReservingResult[];
  clIncurred: ReservingResult[];
  bfPaid: ReservingResult[];
  bfIncurred: ReservingResult[];
  summary: {
    clPaidTotal: number;
    clIncTotal: number;
    bfPaidTotal: number;
    bfIncTotal: number;
  };
}

export const ReservingEstimator: React.FC<ReservingEstimatorProps> = ({
  clPaid,
  clIncurred,
  bfPaid,
  bfIncurred,
  summary,
}) => {
  const [methodView, setMethodView] = useState<'cl' | 'bf'>('cl');
  const [dataSelection, setDataSelection] = useState<'paid' | 'incurred'>('paid');

  const activeResults = 
    methodView === 'cl' 
      ? (dataSelection === 'paid' ? clPaid : clIncurred)
      : (dataSelection === 'paid' ? bfPaid : bfIncurred);

  const originPeriods = activeResults.map(r => r.originPeriod);

  // SVG Chart Dimensions
  const chartHeight = 240;
  const chartWidth = 720;
  const padding = { top: 20, right: 30, bottom: 40, left: 60 };

  // Calculate scales for SVG chart
  const clPaidReserves = clPaid.map(r => Math.max(0, r.outstandingReserve));
  const clIncReserves = clIncurred.map(r => Math.max(0, r.outstandingReserve));
  const bfPaidReserves = bfPaid.map(r => Math.max(0, r.outstandingReserve));
  const bfIncReserves = bfIncurred.map(r => Math.max(0, r.outstandingReserve));
  
  const maxReserve = Math.max(
    ...clPaidReserves,
    ...clIncReserves,
    ...bfPaidReserves,
    ...bfIncReserves,
    10000 // avoid division by zero
  );

  const scaleY = (val: number) => {
    const usableHeight = chartHeight - padding.top - padding.bottom;
    return chartHeight - padding.bottom - (val / maxReserve) * usableHeight;
  };

  const scaleX = (idx: number) => {
    const usableWidth = chartWidth - padding.left - padding.right;
    const barWidth = usableWidth / originPeriods.length;
    return padding.left + idx * barWidth + barWidth / 2;
  };

  return (
    <div>
      {/* 1. Reserving Methods Summary Scorecard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px', borderTop: '4px solid var(--accent-blue)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-secondary)', fontWeight: 600 }}>Paid Chain-Ladder</span>
          <h4 style={{ fontSize: '1.25rem', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            ${summary.clPaidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Outstanding Reserve</span>
        </div>
        <div className="card" style={{ padding: '16px', borderTop: '4px solid var(--status-success)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-secondary)', fontWeight: 600 }}>Incurred Chain-Ladder</span>
          <h4 style={{ fontSize: '1.25rem', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            ${summary.clIncTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Outstanding Reserve</span>
        </div>
        <div className="card" style={{ padding: '16px', borderTop: '4px solid var(--status-warning)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-secondary)', fontWeight: 600 }}>Paid Bornhuetter-Ferguson</span>
          <h4 style={{ fontSize: '1.25rem', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            ${summary.bfPaidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Outstanding Reserve</span>
        </div>
        <div className="card" style={{ padding: '16px', borderTop: '4px solid var(--status-info)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-secondary)', fontWeight: 600 }}>Incurred Bornhuetter-Ferguson</span>
          <h4 style={{ fontSize: '1.25rem', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            ${summary.bfIncTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Outstanding Reserve</span>
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`btn ${methodView === 'cl' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMethodView('cl')}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            Chain-Ladder projections
          </button>
          <button 
            className={`btn ${methodView === 'bf' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMethodView('bf')}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            Bornhuetter-Ferguson (BF) projections
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`btn ${dataSelection === 'paid' ? 'btn-secondary' : 'btn-secondary'}`}
            onClick={() => setDataSelection(prev => prev === 'paid' ? 'incurred' : 'paid')}
            style={{ 
              padding: '6px 12px', 
              fontSize: '0.825rem',
              borderColor: 'var(--border-color)',
              color: 'var(--accent-blue)',
              fontWeight: 600
            }}
          >
            Source Data: {dataSelection.toUpperCase()}
          </button>
        </div>
      </div>

      {/* 2. Detailed Reserves Estimate Table */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '12px' }}>
          Ultimate Estimates & Reserves ({methodView === 'cl' ? 'Chain-Ladder' : 'Bornhuetter-Ferguson'} - {dataSelection.toUpperCase()})
        </h3>
        <div className="table-container" style={{ marginBottom: 0 }}>
          <table className="actuarial-table">
            <thead>
              {methodView === 'cl' ? (
                <tr>
                  <th style={{ textAlign: 'left' }}>Accident Period</th>
                  <th>Observed Claims ($)</th>
                  <th>Selected Link Factor</th>
                  <th>CDF to Ultimate</th>
                  <th>CL Ultimate Claims ($)</th>
                  <th>CL Outstanding Reserve ($)</th>
                </tr>
              ) : (
                <tr>
                  <th style={{ textAlign: 'left' }}>Accident Period</th>
                  <th>Observed Claims ($)</th>
                  <th>CDF to Ultimate</th>
                  <th>Unpaid Claims %</th>
                  <th>Prior Expected Ultimate ($)</th>
                  <th>BF Outstanding Reserve ($)</th>
                  <th>BF Ultimate Claims ($)</th>
                </tr>
              )}
            </thead>
            <tbody>
              {activeResults.map((row) => {
                const isCl = methodView === 'cl';
                
                // For BF, let's show percentage unpaid
                const pctUnpaid = row.cdfToUltimate > 0 ? (1 - 1 / row.cdfToUltimate) * 100 : 0;
                
                // Show Expected Ultimate
                // Expected reserve = Expected ultimate * % unpaid
                // EP * ELR = expected ultimate = expected reserve / % unpaid (if EP is not explicitly loaded, back-calculate)
                // Actually, we pass in the Expected losses which is EP * ELR
                const EP_ELR = pctUnpaid > 0 ? (row.outstandingReserve / (pctUnpaid / 100)) : 0;

                return (
                  <tr key={row.originPeriod}>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>{row.originPeriod}</td>
                    <td>{row.cumulativeClaims.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    
                    {isCl ? (
                      <>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{row.linkRatioSelected > 0 ? row.linkRatioSelected.toFixed(4) : '--'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{row.cdfToUltimate.toFixed(4)}</td>
                        <td style={{ fontWeight: 600 }}>{row.ultimateClaims.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
                          {row.outstandingReserve.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{row.cdfToUltimate.toFixed(4)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{pctUnpaid.toFixed(1)}%</td>
                        <td>{EP_ELR.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
                          {row.outstandingReserve.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td style={{ fontWeight: 600 }}>{row.ultimateClaims.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      </>
                    )}
                  </tr>
                );
              })}

              {/* Total Row */}
              <tr className="summary-row">
                <td style={{ textAlign: 'left' }}>Total</td>
                <td>
                  {activeResults.reduce((acc, r) => acc + r.cumulativeClaims, 0)
                    .toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                
                {methodView === 'cl' ? (
                  <>
                    <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>--</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>--</td>
                    <td>
                      {activeResults.reduce((acc, r) => acc + r.ultimateClaims, 0)
                        .toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td>
                      {activeResults.reduce((acc, r) => acc + r.outstandingReserve, 0)
                        .toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>--</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>--</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>--</td>
                    <td>
                      {activeResults.reduce((acc, r) => acc + r.outstandingReserve, 0)
                        .toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td>
                      {activeResults.reduce((acc, r) => acc + r.ultimateClaims, 0)
                        .toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Visual SVG Reserve Comparison Chart */}
      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>
          Outstanding Reserve Comparison by Accident Period
        </h3>
        
        <div style={{ overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
          <svg width={chartWidth} height={chartHeight} style={{ backgroundColor: 'transparent' }}>
            {/* Grid lines & background */}
            <rect 
              x={padding.left} 
              y={padding.top} 
              width={chartWidth - padding.left - padding.right} 
              height={chartHeight - padding.top - padding.bottom} 
              fill="rgba(var(--color-primary-rgb), 0.01)" 
              stroke="var(--border-color)"
            />

            {/* Horizontal axis grid marks */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((tick, i) => {
              const usableHeight = chartHeight - padding.top - padding.bottom;
              const yVal = padding.top + tick * usableHeight;
              const reserveVal = Math.round((1 - tick) * maxReserve);
              return (
                <g key={i}>
                  <line 
                    x1={padding.left} 
                    y1={yVal} 
                    x2={chartWidth - padding.right} 
                    y2={yVal} 
                    stroke="var(--border-color)" 
                    strokeDasharray="4 4" 
                  />
                  <text 
                    x={padding.left - 8} 
                    y={yVal + 4} 
                    textAnchor="end" 
                    fontSize="10" 
                    fill="var(--color-muted)"
                    fontFamily="var(--font-mono)"
                  >
                    ${reserveVal.toLocaleString()}
                  </text>
                </g>
              );
            })}

            {/* Bars for each Accident Period */}
            {originPeriods.map((ay, idx) => {
              const xCenter = scaleX(idx);
              const barWidth = 10;
              
              // Heights of the four methods
              const hPaidCl = scaleY(clPaidReserves[idx]);
              const hIncCl = scaleY(clIncReserves[idx]);
              const hPaidBf = scaleY(bfPaidReserves[idx]);
              const hIncBf = scaleY(bfIncReserves[idx]);
              
              const yOrigin = chartHeight - padding.bottom;

              return (
                <g key={ay}>
                  {/* Paid CL Bar (Blue) */}
                  <rect 
                    x={xCenter - 22} 
                    y={hPaidCl} 
                    width={barWidth} 
                    height={Math.max(0, yOrigin - hPaidCl)} 
                    fill="#3b82f6" 
                    rx="2"
                  >
                    <title>{`Paid CL: $${clPaidReserves[idx].toLocaleString()}`}</title>
                  </rect>
                  {/* Incurred CL Bar (Green) */}
                  <rect 
                    x={xCenter - 10} 
                    y={hIncCl} 
                    width={barWidth} 
                    height={Math.max(0, yOrigin - hIncCl)} 
                    fill="#10b981" 
                    rx="2"
                  >
                    <title>{`Incurred CL: $${clIncReserves[idx].toLocaleString()}`}</title>
                  </rect>
                  {/* Paid BF Bar (Orange) */}
                  <rect 
                    x={xCenter + 2} 
                    y={hPaidBf} 
                    width={barWidth} 
                    height={Math.max(0, yOrigin - hPaidBf)} 
                    fill="#f59e0b" 
                    rx="2"
                  >
                    <title>{`Paid BF: $${bfPaidReserves[idx].toLocaleString()}`}</title>
                  </rect>
                  {/* Incurred BF Bar (Teal) */}
                  <rect 
                    x={xCenter + 14} 
                    y={hIncBf} 
                    width={barWidth} 
                    height={Math.max(0, yOrigin - hIncBf)} 
                    fill="#06b6d4" 
                    rx="2"
                  >
                    <title>{`Incurred BF: $${bfIncReserves[idx].toLocaleString()}`}</title>
                  </rect>
                  {/* Accident Period label */}
                  <text 
                    x={xCenter} 
                    y={chartHeight - padding.bottom + 16} 
                    textAnchor="middle" 
                    fontSize="10" 
                    fontWeight="600"
                    fill="var(--color-primary)"
                  >
                    {ay}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: '#3b82f6', borderRadius: '3px' }} />
            <span>Paid Chain-Ladder</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: '#10b981', borderRadius: '3px' }} />
            <span>Incurred Chain-Ladder</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: '#f59e0b', borderRadius: '3px' }} />
            <span>Paid BF</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: '#06b6d4', borderRadius: '3px' }} />
            <span>Incurred BF</span>
          </div>
        </div>
      </div>
    </div>
  );
};
