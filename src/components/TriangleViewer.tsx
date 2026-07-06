import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Triangle, LinkRatios } from '../math/actuarialMath';

interface TriangleViewerProps {
  paidTriangle: Triangle;
  incurredTriangle: Triangle;
  paidLinks: LinkRatios;
  incurredLinks: LinkRatios;
  globalSelectionMethod: 'volumeWeighted' | 'simpleAverage' | 'last3Years' | 'last5Years' | 'custom';
  selectedFactors: number[];
  onFactorsChange: (factors: number[], selections: Record<string, string>) => void;
  onLogAssumptionChange: (paramName: string, oldValue: string, newValue: string, reason: string) => void;
  diagnostics: {
    erraticFactors: number[];
    thinCells: Array<{ row: number; col: number }>;
  };
}

export const TriangleViewer: React.FC<TriangleViewerProps> = ({
  paidTriangle,
  incurredTriangle,
  paidLinks,
  incurredLinks,
  globalSelectionMethod,
  selectedFactors,
  onFactorsChange,
  onLogAssumptionChange,
  diagnostics,
}) => {
  const [viewType, setViewType] = useState<'paid' | 'incurred'>('paid');
  const [displayMode, setDisplayMode] = useState<'cumulative' | 'incremental'>('cumulative');

  const activeTriangle = viewType === 'paid' ? paidTriangle : incurredTriangle;
  const activeLinks = viewType === 'paid' ? paidLinks : incurredLinks;
  const n = activeTriangle.originPeriods.length;

  // Track the source selection for each link ratio column (e.g. { "0": "volumeWeighted", "1": "custom" })
  const [columnSelections, setColumnSelections] = useState<Record<string, string>>({});
  // Track custom manual input values
  const [customRatios, setCustomRatios] = useState<Record<string, number>>({});

  // Reset/Initialize column selections when global selection method or LOB details change
  useEffect(() => {
    const initialSelections: Record<string, string> = {};
    for (let j = 0; j < n - 1; j++) {
      initialSelections[String(j)] = globalSelectionMethod;
    }
    setColumnSelections(initialSelections);
    setCustomRatios({});
  }, [globalSelectionMethod, n, viewType]);

  // Compute final selected factors based on columnSelections
  useEffect(() => {
    if (n <= 1) return;
    const finalFactors = Array(n - 1).fill(1.0);
    
    for (let j = 0; j < n - 1; j++) {
      const selection = columnSelections[String(j)] || globalSelectionMethod;
      
      if (selection === 'volumeWeighted') {
        finalFactors[j] = activeLinks.volumeWeighted[j];
      } else if (selection === 'simpleAverage') {
        finalFactors[j] = activeLinks.simpleAverage[j];
      } else if (selection === 'last3Years') {
        finalFactors[j] = activeLinks.last3Years[j];
      } else if (selection === 'last5Years') {
        finalFactors[j] = activeLinks.last5Years[j];
      } else if (selection === 'custom') {
        finalFactors[j] = customRatios[String(j)] !== undefined ? customRatios[String(j)] : activeLinks.volumeWeighted[j];
      }
    }
    
    // Check if factors changed before triggering callback to prevent infinite render loops
    const hasChanged = finalFactors.some((val, idx) => val !== selectedFactors[idx]);
    if (hasChanged) {
      onFactorsChange(finalFactors, columnSelections);
    }
  }, [columnSelections, customRatios, activeLinks, globalSelectionMethod, n]);

  const handleColumnSelectionChange = (colIdx: number, value: string) => {
    const oldSelection = columnSelections[String(colIdx)] || globalSelectionMethod;
    setColumnSelections(prev => ({ ...prev, [String(colIdx)]: value }));
    
    onLogAssumptionChange(
      `Link Selection (${viewType.toUpperCase()} Col ${colIdx + 1})`,
      oldSelection,
      value,
      `Updated link ratio selection method for development step ${colIdx + 1} to ${colIdx + 2}`
    );
  };

  const handleCustomRatioChange = (colIdx: number, value: string) => {
    const numericVal = parseFloat(value) || 1.0;
    setCustomRatios(prev => ({ ...prev, [String(colIdx)]: numericVal }));
  };

  const handleCustomRatioBlur = (colIdx: number) => {
    const newVal = customRatios[String(colIdx)] || activeLinks.volumeWeighted[colIdx];
    onLogAssumptionChange(
      `Custom Factor (${viewType.toUpperCase()} Col ${colIdx + 1})`,
      'Calculated Average',
      newVal.toFixed(4),
      'Entered manual link factor override'
    );
  };

  // Find max value in triangle for heatmap normalization
  const maxTriangleVal = Math.max(
    ...activeTriangle.values.map(row => Math.max(...row.filter(v => !isNaN(v) && isFinite(v))))
  );

  const getHeatmapColor = (val: number) => {
    if (isNaN(val) || val <= 0 || maxTriangleVal <= 0) return 'transparent';
    const ratio = val / maxTriangleVal;
    // We blend between low-color and high-color depending on the ratio
    // Let's use Tailwind/CSS variables for HSL theme blending
    // Light mode: theme blue HSL(222, 80%, 96%) to HSL(222, 80%, 75%)
    // Dark mode: HSL(222, 50%, 15%) to HSL(222, 80%, 35%)
    // We'll compute and apply opacity overlays using inline styles for high control!
    return `rgba(37, 99, 235, ${Math.min(ratio * 0.45, 0.45)})`;
  };

  const isThinCell = (rIdx: number, cIdx: number) => {
    return diagnostics.thinCells.some(cell => cell.row === rIdx && cell.col === cIdx);
  };

  return (
    <div>
      {/* Header controls for view options */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => setViewType('paid')} 
            className={`btn ${viewType === 'paid' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: '0.875rem' }}
          >
            Paid Claims
          </button>
          <button 
            onClick={() => setViewType('incurred')} 
            className={`btn ${viewType === 'incurred' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: '0.875rem' }}
          >
            Incurred Claims
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)', fontWeight: 600 }}>DISPLAY:</span>
          <button 
            onClick={() => setDisplayMode(prev => prev === 'cumulative' ? 'incremental' : 'cumulative')} 
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {displayMode === 'cumulative' ? 'Cumulative Values' : 'Incremental Values'}
          </button>
        </div>
      </div>

      {/* 1. Claims Development Triangle */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '12px' }}>
          Claims Development Triangle ({viewType.toUpperCase()} - {displayMode.toUpperCase()})
        </h3>
        <div className="table-container" style={{ marginBottom: 0 }}>
          <table className="actuarial-table">
            <thead>
              <tr>
                <th>Accident Period</th>
                {activeTriangle.developmentPeriods.map(d => (
                  <th key={d} style={{ textAlign: 'right' }}>Dev Period {d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeTriangle.originPeriods.map((ay, rIdx) => (
                <tr key={ay}>
                  <td style={{ fontWeight: 600 }}>{ay}</td>
                  {activeTriangle.developmentPeriods.map((d, cIdx) => {
                    const isKnown = cIdx < n - rIdx;
                    const rawVal = displayMode === 'cumulative' 
                      ? activeTriangle.values[rIdx][cIdx] 
                      : activeTriangle.incrementalValues[rIdx][cIdx];
                    const cellBg = isKnown ? getHeatmapColor(rawVal) : 'rgba(var(--color-primary-rgb), 0.02)';
                    const thin = isKnown && isThinCell(rIdx, cIdx);

                    return (
                      <td 
                        key={d} 
                        className="heatmap-cell"
                        style={{ 
                          backgroundColor: cellBg,
                          color: isKnown ? 'var(--color-primary)' : 'var(--color-muted)',
                          fontStyle: isKnown ? 'normal' : 'italic',
                          border: thin ? '1px dashed var(--status-warning)' : undefined
                        }}
                        title={thin ? "Thin cell: low amount or negative incremental development." : undefined}
                      >
                        {isKnown ? (
                          <>
                            {rawVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            {thin && <AlertTriangle size={10} style={{ color: 'var(--status-warning)', marginLeft: '4px', display: 'inline' }} />}
                          </>
                        ) : (
                          '--'
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Age-to-Age (Link) Ratios Table */}
      <div className="card">
        <h3 style={{ marginBottom: '12px' }}>
          Age-to-Age Link Ratios ({viewType.toUpperCase()})
        </h3>
        <div className="table-container" style={{ overflowX: 'auto', marginBottom: 0 }}>
          <table className="actuarial-table">
            <thead>
              <tr>
                <th>Origin Period</th>
                {activeLinks.developmentPeriods.map(d => (
                  <th key={d} style={{ textAlign: 'right' }}>{d} &rarr; {d + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeTriangle.originPeriods.map((ay, rIdx) => (
                <tr key={ay}>
                  <td style={{ fontWeight: 600 }}>{ay}</td>
                  {activeLinks.developmentPeriods.map((d, cIdx) => {
                    const ratio = activeLinks.ratios[rIdx][cIdx];
                    const isKnown = !isNaN(ratio) && isFinite(ratio);
                    return (
                      <td 
                        key={d}
                        style={{ 
                          color: isKnown ? 'var(--color-primary)' : 'var(--color-muted)',
                          backgroundColor: diagnostics.erraticFactors.includes(cIdx + 1) && isKnown ? 'rgba(245,158,11,0.04)' : undefined
                        }}
                      >
                        {isKnown ? ratio.toFixed(4) : '--'}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Statistical Averages rows */}
              <tr className="summary-row" style={{ borderTop: '2px solid var(--border-color)' }}>
                <td style={{ fontWeight: 600, color: 'var(--color-muted)' }}>Volume Weighted</td>
                {activeLinks.volumeWeighted.map((val, idx) => (
                  <td key={idx} style={{ fontFamily: 'var(--font-mono)' }}>{val.toFixed(4)}</td>
                ))}
              </tr>
              <tr className="summary-row">
                <td style={{ fontWeight: 600, color: 'var(--color-muted)' }}>Simple Average</td>
                {activeLinks.simpleAverage.map((val, idx) => (
                  <td key={idx} style={{ fontFamily: 'var(--font-mono)' }}>{val.toFixed(4)}</td>
                ))}
              </tr>
              <tr className="summary-row">
                <td style={{ fontWeight: 600, color: 'var(--color-muted)' }}>Last 3 Years Avg</td>
                {activeLinks.last3Years.map((val, idx) => (
                  <td key={idx} style={{ fontFamily: 'var(--font-mono)' }}>{val.toFixed(4)}</td>
                ))}
              </tr>
              <tr className="summary-row">
                <td style={{ fontWeight: 600, color: 'var(--color-muted)' }}>Last 5 Years Avg</td>
                {activeLinks.last5Years.map((val, idx) => (
                  <td key={idx} style={{ fontFamily: 'var(--font-mono)' }}>{val.toFixed(4)}</td>
                ))}
              </tr>

              {/* Selection row (Dropdown + custom input per column) */}
              <tr 
                style={{ 
                  backgroundColor: 'rgba(37,99,235,0.04)', 
                  fontWeight: 700, 
                  borderTop: '2px solid var(--accent-blue)',
                  borderBottom: '2px solid var(--accent-blue)'
                }}
              >
                <td style={{ color: 'var(--accent-blue)', fontWeight: 800 }}>SELECTED FACTORS</td>
                {activeLinks.developmentPeriods.map((d, cIdx) => {
                  const selection = columnSelections[String(cIdx)] || globalSelectionMethod;
                  const isCustom = selection === 'custom';
                  const activeFactor = selectedFactors[cIdx] || 1.0;
                  const hasVolWarn = diagnostics.erraticFactors.includes(cIdx + 1);

                  return (
                    <td key={d} style={{ padding: '4px', verticalAlign: 'middle', borderLeft: '1px solid rgba(37,99,235,0.2)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
                        {/* Selector Dropdown */}
                        <select
                          value={selection}
                          onChange={(e) => handleColumnSelectionChange(cIdx, e.target.value)}
                          style={{
                            padding: '2px 4px',
                            fontSize: '0.75rem',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--color-primary)',
                            borderRadius: '4px',
                          }}
                        >
                          <option value="volumeWeighted">Vol-Wtd</option>
                          <option value="simpleAverage">Simple</option>
                          <option value="last3Years">L3Y</option>
                          <option value="last5Years">L5Y</option>
                          <option value="custom">Custom</option>
                        </select>

                        <input
                          type="number"
                          value={
                            isCustom && customRatios[String(cIdx)] !== undefined 
                              ? customRatios[String(cIdx)] 
                              : parseFloat(activeFactor.toFixed(4))
                          }
                          onChange={(e) => handleCustomRatioChange(cIdx, e.target.value)}
                          onBlur={() => handleCustomRatioBlur(cIdx)}
                          disabled={!isCustom}
                          step="0.0001"
                          style={{
                            padding: '2px 4px',
                            fontSize: '0.8rem',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            border: '1px solid var(--border-color)',
                            backgroundColor: isCustom ? 'var(--highlight-cell-changed)' : 'transparent',
                            color: isCustom ? 'var(--color-primary)' : 'var(--color-secondary)',
                            fontWeight: isCustom ? 700 : 500,
                            borderRadius: '4px',
                          }}
                        />
                        
                        {hasVolWarn && (
                          <span style={{ fontSize: '0.65rem', color: 'var(--status-warning)', display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                            <AlertTriangle size={8} /> Volatile
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
