import React, { useState, useEffect } from 'react';
import { Info, Copy } from 'lucide-react';
import { fitTailFactor } from '../math/actuarialMath';

interface AssumptionsPanelProps {
  originPeriods: string[];
  linkFactors: number[]; // the currently calculated/selected link factors to run tail-fitting on
  onAssumptionsChange: (assumptions: {
    expectedLossRatio: number;
    earnedPremiums: Record<string, number>;
    tailFactor: number;
    globalSelectionMethod: 'volumeWeighted' | 'simpleAverage' | 'last3Years' | 'last5Years' | 'custom';
    largeLossThreshold: number;
  }) => void;
  initialAssumptions?: {
    expectedLossRatio: number;
    earnedPremiums: Record<string, number>;
    tailFactor: number;
    globalSelectionMethod: 'volumeWeighted' | 'simpleAverage' | 'last3Years' | 'last5Years' | 'custom';
    largeLossThreshold: number;
  };
  onLogAssumptionChange: (paramName: string, oldValue: string, newValue: string, reason: string) => void;
}

export const AssumptionsPanel: React.FC<AssumptionsPanelProps> = ({
  originPeriods,
  linkFactors,
  onAssumptionsChange,
  initialAssumptions,
  onLogAssumptionChange,
}) => {
  const [elr, setElr] = useState<number>(
    initialAssumptions ? initialAssumptions.expectedLossRatio * 100 : 65.0
  );
  const [earnedPremiums, setEarnedPremiums] = useState<Record<string, number>>(
    initialAssumptions?.earnedPremiums || {}
  );
  const [tailFactor, setTailFactor] = useState<number>(initialAssumptions?.tailFactor || 1.000);
  const [globalSelectionMethod, setGlobalSelectionMethod] = useState<
    'volumeWeighted' | 'simpleAverage' | 'last3Years' | 'last5Years' | 'custom'
  >(initialAssumptions?.globalSelectionMethod || 'volumeWeighted');
  const [largeLossThreshold, setLargeLossThreshold] = useState<number>(
    initialAssumptions?.largeLossThreshold || 100000
  );

  const [fittedTail, setFittedTail] = useState<{ factor: number; r2: number }>({ factor: 1.0, r2: 0 });
  const [premiumQuickFill, setPremiumQuickFill] = useState<string>('');

  // 1. Fit tail factor when link factors change
  useEffect(() => {
    if (linkFactors.length > 0) {
      const fit = fitTailFactor(linkFactors);
      setFittedTail({ factor: fit.tailFactor, r2: fit.r2 });
    }
  }, [linkFactors]);

  // 2. Initialize and handle dynamic premium inputs for detected years
  useEffect(() => {
    const updatedPremiums = { ...earnedPremiums };
    let changed = false;
    originPeriods.forEach(ay => {
      if (updatedPremiums[ay] === undefined) {
        updatedPremiums[ay] = 10000000; // Default $10M
        changed = true;
      }
    });
    if (changed) {
      setEarnedPremiums(updatedPremiums);
    }
  }, [originPeriods]);

  // 3. Propagate changes to parent
  useEffect(() => {
    onAssumptionsChange({
      expectedLossRatio: elr / 100, // convert percentage to decimal
      earnedPremiums,
      tailFactor,
      globalSelectionMethod,
      largeLossThreshold,
    });
  }, [elr, earnedPremiums, tailFactor, globalSelectionMethod, largeLossThreshold]);

  const handlePremiumChange = (ay: string, val: string) => {
    const parsedVal = parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
    setEarnedPremiums(prev => ({ ...prev, [ay]: parsedVal }));
  };

  const handleLogPremiumBlur = (ay: string, originalVal: number) => {
    const newVal = earnedPremiums[ay] || 0;
    if (originalVal !== newVal) {
      onLogAssumptionChange(
        `Earned Premium (${ay})`,
        `$${originalVal.toLocaleString()}`,
        `$${newVal.toLocaleString()}`,
        'Manual premium edit'
      );
    }
  };

  const applyQuickFill = () => {
    const fillAmount = parseFloat(premiumQuickFill.replace(/[^0-9.]/g, '')) || 0;
    if (fillAmount > 0) {
      const updated: Record<string, number> = {};
      originPeriods.forEach(ay => {
        updated[ay] = fillAmount;
      });
      setEarnedPremiums(updated);
      onLogAssumptionChange(
        'All Earned Premiums (Quick Fill)',
        'Various',
        `$${fillAmount.toLocaleString()}`,
        'Applied quick-fill template'
      );
    }
  };

  const useFittedTailFactor = () => {
    const oldTail = tailFactor;
    setTailFactor(fittedTail.factor);
    onLogAssumptionChange(
      'Tail Factor',
      oldTail.toFixed(4),
      fittedTail.factor.toFixed(4),
      `Applied curve-fitted tail factor (R² = ${fittedTail.r2.toFixed(2)})`
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      {/* Reserving Parameters (ELR, Tail, Selections) */}
      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>
          Actuarial Parameters & Assumptions
        </h3>

        {/* Global selection method */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
            Default Link Ratio Selector Method
          </label>
          <select
            value={globalSelectionMethod}
            onChange={(e) => {
              const oldVal = globalSelectionMethod;
              const newVal = e.target.value as any;
              setGlobalSelectionMethod(newVal);
              onLogAssumptionChange('Global Link Ratio Method', oldVal, newVal, 'Changed default link selection method');
            }}
          >
            <option value="volumeWeighted">Volume-Weighted Average (Recommended)</option>
            <option value="simpleAverage">Simple Average (All Years)</option>
            <option value="last3Years">Last 3 Years Average</option>
            <option value="last5Years">Last 5 Years Average</option>
            <option value="custom">Custom Manual Override (per column)</option>
          </select>
        </div>

        {/* Expected Loss Ratio */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
            Expected Loss Ratio (ELR %) - Bornhuetter-Ferguson
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              value={elr}
              onChange={(e) => setElr(parseFloat(e.target.value) || 0)}
              onBlur={() => {
                if (initialAssumptions?.expectedLossRatio !== elr / 100) {
                  onLogAssumptionChange(
                    'Expected Loss Ratio (ELR)',
                    `${(initialAssumptions?.expectedLossRatio || 0.65) * 100}%`,
                    `${elr}%`,
                    'Manual adjustment'
                  );
                }
              }}
              step="0.1"
              min="10"
              max="200"
              style={{ width: '120px' }}
            />
            <span style={{ fontWeight: 600 }}>%</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Info size={12} /> Used to set prior expected losses for the BF method.
            </span>
          </div>
        </div>

        {/* Large Loss Threshold */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
            Large Loss Red Flag Threshold ($)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600 }}>$</span>
            <input
              type="number"
              value={largeLossThreshold}
              onChange={(e) => setLargeLossThreshold(parseFloat(e.target.value) || 0)}
              onBlur={() => {
                const initialVal = initialAssumptions?.largeLossThreshold || 100000;
                if (initialVal !== largeLossThreshold) {
                  onLogAssumptionChange(
                    'Large Loss Threshold',
                    `$${initialVal.toLocaleString()}`,
                    `$${largeLossThreshold.toLocaleString()}`,
                    'Manual adjustment of large loss red flag trigger limit'
                  );
                }
              }}
              step="10000"
              min="1000"
              style={{ width: '140px' }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Info size={12} /> Exposing judgment limit above which claims trigger visual outliers.
            </span>
          </div>
        </div>

        {/* Tail Factor & Curve Fitting */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
            Tail Development Factor (TDF)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <input
              type="number"
              value={tailFactor}
              onChange={(e) => setTailFactor(parseFloat(e.target.value) || 1.0)}
              onBlur={() => {
                if (initialAssumptions?.tailFactor !== tailFactor) {
                  onLogAssumptionChange(
                    'Tail Factor',
                    (initialAssumptions?.tailFactor || 1.0).toFixed(4),
                    tailFactor.toFixed(4),
                    'Manual tail adjustment'
                  );
                }
              }}
              step="0.0001"
              min="0.5"
              max="2.0"
              style={{ width: '120px' }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
              Projects development from the last observed year to ultimate.
            </span>
          </div>

          {/* Curve fit output box */}
          {fittedTail.factor > 1.0 ? (
            <div 
              style={{ 
                backgroundColor: 'var(--bg-app)', 
                padding: '12px', 
                borderRadius: 'var(--radius-sm)', 
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                  Exponential Curve-Fitting Result
                </strong>
                <span style={{ fontSize: '0.785rem', color: 'var(--color-muted)' }}>
                  Suggested Tail: <strong>{fittedTail.factor.toFixed(4)}</strong> (R² = {fittedTail.r2.toFixed(2)})
                </span>
              </div>
              <button 
                type="button"
                className="btn btn-secondary" 
                style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', gap: '4px', alignItems: 'center' }}
                onClick={useFittedTailFactor}
              >
                <Copy size={12} /> Apply Fit
              </button>
            </div>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
              * Fitting curve will populate when sufficient link ratios are selected.
            </span>
          )}
        </div>
      </div>

      {/* Earned Premiums Inputs Table */}
      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>
          Underwriting Earned Premiums
        </h3>

        {/* Quick Fill Box */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Quick-fill premium (e.g. 10000000)"
            value={premiumQuickFill}
            onChange={(e) => setPremiumQuickFill(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={applyQuickFill}
            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
          >
            Apply All
          </button>
        </div>

        {/* Premiums List */}
        <div className="table-container" style={{ maxHeight: '215px', marginBottom: 0 }}>
          <table className="actuarial-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Accident Period</th>
                <th>Earned Premium ($)</th>
              </tr>
            </thead>
            <tbody>
              {originPeriods.map(ay => (
                <tr key={ay}>
                  <td style={{ textAlign: 'left', fontWeight: 600 }}>{ay}</td>
                  <td>
                    <input
                      type="text"
                      value={(earnedPremiums[ay] || 0).toLocaleString()}
                      onChange={(e) => handlePremiumChange(ay, e.target.value)}
                      onBlur={() => handleLogPremiumBlur(ay, initialAssumptions?.earnedPremiums?.[ay] || 10000000)}
                      style={{ 
                        padding: '4px 8px', 
                        fontSize: '0.85rem', 
                        textAlign: 'right', 
                        fontFamily: 'var(--font-mono)',
                        border: 'none',
                        borderBottom: '1px solid var(--border-color)',
                        borderRadius: 0,
                        boxShadow: 'none',
                        backgroundColor: 'transparent'
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
