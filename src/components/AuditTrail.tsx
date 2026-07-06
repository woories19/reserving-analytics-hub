import React, { useState } from 'react';
import { ShieldCheck, Plus, Lock, Unlock } from 'lucide-react';
import { calculateRunHash } from '../math/validationMath';

export interface AuditLogEntry {
  timestamp: string;
  paramName: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface ReservingScenario {
  id: string;
  name: string;
  valuationDate: string;
  globalSelectionMethod: string;
  elr: number;
  tailFactor: number;
  clPaidTotal: number;
  clIncTotal: number;
  bfPaidTotal: number;
  bfIncTotal: number;
}

interface AuditTrailProps {
  auditLogs: AuditLogEntry[];
  currentRunDetails: {
    valuationDate: string;
    globalSelectionMethod: string;
    elr: number;
    tailFactor: number;
    clPaidTotal: number;
    clIncTotal: number;
    bfPaidTotal: number;
    bfIncTotal: number;
    cleanedRecords: any[];
    earnedPremiums: Record<string, number>;
    linkRatioSelections: Record<string, string>;
  };
  isLocked: boolean;
  onLockStateChange: (locked: boolean, hash: string, analystName: string, comments: string) => void;
  scenarios: ReservingScenario[];
  onSaveScenario: (name: string) => void;
}

export const AuditTrail: React.FC<AuditTrailProps> = ({
  auditLogs,
  currentRunDetails,
  isLocked,
  onLockStateChange,
  scenarios,
  onSaveScenario,
}) => {
  const [analystName, setAnalystName] = useState<string>('');
  const [comments, setComments] = useState<string>('');
  const [scenarioName, setScenarioName] = useState<string>('');
  const [runHash, setRunHash] = useState<string>('');

  // Checklist gates
  const [gate1, setGate1] = useState<boolean>(false);
  const [gate2, setGate2] = useState<boolean>(false);
  const [gate3, setGate3] = useState<boolean>(false);
  const [gate4, setGate4] = useState<boolean>(false);

  const isChecklistComplete = gate1 && gate2 && gate3 && gate4 && analystName.trim() !== '';

  const handleSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isChecklistComplete) return;

    // Calculate SHA-256 Run Hash
    const hash = await calculateRunHash(currentRunDetails.cleanedRecords, {
      valuationDate: currentRunDetails.valuationDate,
      granularity: 'annual', // default mapped
      segmentFilter: 'All',
      expectedLossRatio: currentRunDetails.elr,
      earnedPremiums: currentRunDetails.earnedPremiums,
      tailFactor: currentRunDetails.tailFactor,
      linkRatioSelections: currentRunDetails.linkRatioSelections,
    });

    setRunHash(hash);
    onLockStateChange(true, hash, analystName, comments);
  };

  const handleUnlock = () => {
    setGate4(false); // require re-confirming best estimate
    onLockStateChange(false, '', '', '');
  };

  const handleCreateScenario = () => {
    if (scenarioName.trim() === '') return;
    onSaveScenario(scenarioName);
    setScenarioName('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      {/* LEFT: Scenario Comparison & Audit trail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Scenario Versioning */}
        <div className="card">
          <h3 style={{ marginBottom: '16px' }}>
            Reserving Scenario Management
          </h3>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input 
              type="text" 
              placeholder="Save current state as (e.g. baseline, high-elr)"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              disabled={isLocked}
              style={{ fontSize: '0.85rem' }}
            />
            <button 
              className="btn btn-secondary" 
              onClick={handleCreateScenario}
              disabled={isLocked || scenarioName.trim() === ''}
              style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Plus size={14} /> Save Scenario
            </button>
          </div>

          {scenarios.length === 0 ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
              * No scenarios saved yet. Save scenarios to compare reserving reserves side-by-side.
            </span>
          ) : (
            <div className="table-container" style={{ marginBottom: 0 }}>
              <table className="actuarial-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Scenario</th>
                    <th>VW CL Paid ($)</th>
                    <th>VW CL Incurred ($)</th>
                    <th>BF Paid ($)</th>
                    <th>BF Incurred ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Current Active scenario row */}
                  <tr style={{ backgroundColor: 'rgba(37,99,235,0.03)', fontWeight: 600 }}>
                    <td style={{ textAlign: 'left' }}>Current Active</td>
                    <td>{currentRunDetails.clPaidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td>{currentRunDetails.clIncTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td>{currentRunDetails.bfPaidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td>{currentRunDetails.bfIncTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  </tr>
                  
                  {/* Saved scenarios */}
                  {scenarios.map(sc => (
                    <tr key={sc.id}>
                      <td style={{ textAlign: 'left', fontWeight: 600 }}>{sc.name}</td>
                      <td>{sc.clPaidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td>{sc.clIncTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td>{sc.bfPaidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td>{sc.bfIncTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Change log trail */}
        <div className="card">
          <h3 style={{ marginBottom: '16px' }}>
            Chronological Audit log
          </h3>

          {auditLogs.length === 0 ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
              * No modifications logged yet. All changes to parameters are tracked here.
            </span>
          ) : (
            <div className="table-container" style={{ maxHeight: '210px', marginBottom: 0 }}>
              <table className="actuarial-table" style={{ fontSize: '0.775rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', width: '130px' }}>Timestamp</th>
                    <th style={{ textAlign: 'left' }}>Parameter</th>
                    <th>Old Value</th>
                    <th>New Value</th>
                    <th style={{ textAlign: 'left' }}>Reason / Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, idx) => (
                    <tr key={idx}>
                      <td style={{ textAlign: 'left', fontFamily: 'var(--font-mono)' }}>{log.timestamp}</td>
                      <td style={{ textAlign: 'left', fontWeight: 600 }}>{log.paramName}</td>
                      <td><code>{log.oldValue}</code></td>
                      <td><code>{log.newValue}</code></td>
                      <td style={{ textAlign: 'left', fontStyle: 'italic' }}>{log.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Reserving sign-off checklist and locks */}
      <div className="card card-glass" style={{ borderLeft: '4px solid var(--status-success)' }}>
        <h3 style={{ marginBottom: '16px' }}>
          Reserving Checkpoint & Sign-off
        </h3>

        {!isLocked ? (
          <form onSubmit={handleSignOff}>
            <p style={{ marginBottom: '16px', fontSize: '0.875rem' }}>
              Complete the pre-sign-off quality gates. Signing off will lock parameters to generate an official SHA-256 authenticated reserving report.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="gate1" 
                  checked={gate1} 
                  onChange={(e) => setGate1(e.target.checked)}
                  style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }}
                />
                <label htmlFor="gate1" style={{ fontSize: '0.825rem', cursor: 'pointer' }}>
                  I have audited raw claims validation flags and verified outliers.
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="gate2" 
                  checked={gate2} 
                  onChange={(e) => setGate2(e.target.checked)}
                  style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }}
                />
                <label htmlFor="gate2" style={{ fontSize: '0.825rem', cursor: 'pointer' }}>
                  I confirm that dynamic Earned Premiums inputs match Underwriting accounting.
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="gate3" 
                  checked={gate3} 
                  onChange={(e) => setGate3(e.target.checked)}
                  style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }}
                />
                <label htmlFor="gate3" style={{ fontSize: '0.825rem', cursor: 'pointer' }}>
                  I have analyzed development diagnostics, erratic CV columns, and tail trends.
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="gate4" 
                  checked={gate4} 
                  onChange={(e) => setGate4(e.target.checked)}
                  style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }}
                />
                <label htmlFor="gate4" style={{ fontSize: '0.825rem', cursor: 'pointer' }}>
                  <strong>I certify that these results represent my best estimate of outstanding liabilities.</strong>
                </label>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                Analyst Name / Peer Reviewer *
              </label>
              <input 
                type="text" 
                placeholder="Enter your full name"
                value={analystName}
                onChange={(e) => setAnalystName(e.target.value)}
                required
                style={{ fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                Assumptions Justification / Comments
              </label>
              <textarea 
                rows={3}
                placeholder="Add comments, tail justifications, LOB specifics, or reinsurance factors used..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                style={{ fontSize: '0.85rem', resize: 'vertical' }}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={!isChecklistComplete}
              style={{ width: '100%', fontSize: '1rem', padding: '12px 24px', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}
            >
              <Lock size={18} /> Sign-off & Lock Reserving Calculations
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div 
              style={{ 
                backgroundColor: 'var(--status-success-bg)', 
                color: 'var(--status-success)', 
                padding: '24px', 
                borderRadius: 'var(--radius-lg)', 
                border: '1px solid var(--status-success-border)',
                marginBottom: '20px'
              }}
            >
              <ShieldCheck size={48} style={{ margin: '0 auto 12px' }} />
              <h4 style={{ color: 'var(--status-success)' }}>Report Locked & Signed Off</h4>
              <p style={{ fontSize: '0.85rem', marginTop: '6px', color: 'var(--color-primary)' }}>
                Analyst: <strong>{analystName}</strong>
              </p>
              {comments && (
                <p style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '8px', color: 'var(--color-secondary)' }}>
                  "{comments}"
                </p>
              )}
            </div>

            {/* Run Fingerprint info */}
            <div style={{ textAlign: 'left', backgroundColor: 'var(--bg-app)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
              <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-primary)' }}>
                Run Authentication Fingerprint (SHA-256)
              </strong>
              <code style={{ fontSize: '0.725rem', wordBreak: 'break-all', display: 'block', marginTop: '4px', color: 'var(--accent-blue)' }}>
                {runHash}
              </code>
            </div>

            <button 
              className="btn btn-secondary" 
              onClick={handleUnlock}
              style={{ width: '100%', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}
            >
              <Unlock size={16} /> Unlock / Amend Parameters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
