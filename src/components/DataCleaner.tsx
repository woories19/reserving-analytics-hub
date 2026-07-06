import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Filter, Database, X, Check, Search } from 'lucide-react';
import type { RawRow, ColumnMapping, ValidationSummary, ValidationIssue } from '../math/validationMath';

interface DataCleanerProps {
  summary: ValidationSummary;
  cleanedCount: number;
  onProceed: () => void;
  workingDataset: RawRow[];
  columnMapping: ColumnMapping;
  validationRepairLog: any[];
  onRepair: (updatedDataset: RawRow[], logEntries: any[]) => void;
}

export const DataCleaner: React.FC<DataCleanerProps> = ({
  summary,
  cleanedCount,
  onProceed,
  workingDataset,
  columnMapping,
  validationRepairLog,
  onRepair
}) => {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [hasReviewed, setHasReviewed] = useState<boolean>(false);

  // Editor states
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [localDataset, setLocalDataset] = useState<RawRow[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showIssuesOnly, setShowIssuesOnly] = useState<boolean>(false);
  const [focusedRowIdx, setFocusedRowIdx] = useState<number | null>(null);

  // Sync local editor dataset with app master working dataset
  useEffect(() => {
    setLocalDataset(workingDataset);
  }, [workingDataset]);

  const errors = summary.issues.filter(i => i.severity === 'error');
  const hasErrors = errors.length > 0;

  // Filtered issues for the dashboard list
  const filteredIssues = summary.issues.filter(issue => {
    const matchesSeverity = severityFilter === 'all' || issue.severity === severityFilter;
    const matchesType = typeFilter === 'all' || issue.type === typeFilter;
    return matchesSeverity && matchesType;
  });

  const issueTypes = Array.from(new Set(summary.issues.map(i => i.type)));

  // Cell editor handler
  const handleCellChange = (rIdx: number, headerKey: string, newValue: string) => {
    const nextDataset = [...localDataset];
    nextDataset[rIdx] = { ...nextDataset[rIdx], [headerKey]: newValue };
    setLocalDataset(nextDataset);
  };

  // Exclude row handler
  const handleExcludeRow = (rIdx: number) => {
    const nextDataset = [...localDataset];
    nextDataset[rIdx] = { ...nextDataset[rIdx], __excluded: true };
    setLocalDataset(nextDataset);
  };

  // Include row handler (revert exclusion)
  const handleIncludeRow = (rIdx: number) => {
    const nextDataset = [...localDataset];
    const updated = { ...nextDataset[rIdx] };
    delete updated.__excluded;
    nextDataset[rIdx] = updated;
    setLocalDataset(nextDataset);
  };

  // Apply edits to parent master state and generate audit logs of modifications
  const applyCorrections = () => {
    const logs: any[] = [];
    const timestamp = new Date().toLocaleTimeString();

    const finalDataset = localDataset.map((row, rIdx) => {
      const originalRow = workingDataset[rIdx];
      if (!originalRow) return row;

      // Log Exclusions
      if (row.__excluded && !originalRow.__excluded) {
        logs.push({
          timestamp,
          rowIdx: rIdx + 1,
          claimId: String(originalRow[columnMapping.claimId] || 'UNMAPPED'),
          field: 'Row Exclusion',
          oldValue: 'Active',
          newValue: 'EXCLUDED',
          action: 'exclude',
          justification: 'Manually excluded row due to validation errors'
        });
        return row;
      }

      // Log Re-inclusions
      if (!row.__excluded && originalRow.__excluded) {
        logs.push({
          timestamp,
          rowIdx: rIdx + 1,
          claimId: String(originalRow[columnMapping.claimId] || 'UNMAPPED'),
          field: 'Row Inclusion',
          oldValue: 'EXCLUDED',
          newValue: 'Active',
          action: 'include',
          justification: 'Re-included previously excluded row'
        });
        return row;
      }

      // Compare mapped fields for text edits
      const fieldsToCompare = [
        columnMapping.claimId,
        columnMapping.accidentDate,
        columnMapping.paymentDate,
        columnMapping.paidAmount,
        columnMapping.incurredAmount,
        columnMapping.segment,
        columnMapping.claimStatus,
        columnMapping.notificationDate
      ].filter(Boolean) as string[];

      const updatedRow = { ...row };

      fieldsToCompare.forEach(header => {
        const origVal = originalRow[header];
        const newVal = row[header];
        if (origVal !== newVal) {
          logs.push({
            timestamp,
            rowIdx: rIdx + 1,
            claimId: String(originalRow[columnMapping.claimId] || 'UNMAPPED'),
            field: header,
            oldValue: String(origVal ?? ''),
            newValue: String(newVal ?? ''),
            action: 'edit',
            justification: `Manually corrected raw data value for [${header}]`
          });
        }
      });

      return updatedRow;
    });

    onRepair(finalDataset, logs);
    setIsEditorOpen(false); // Close editor on save
  };

  // Automated duplicate cleanup tool
  const autoFixDuplicates = () => {
    const nextDataset = [...localDataset];
    const logs: any[] = [];
    const timestamp = new Date().toLocaleTimeString();
    
    // Find all duplicate issues
    const duplicates = summary.issues.filter(i => i.type === 'duplicate');
    
    duplicates.forEach(issue => {
      const rIdx = issue.rowIdx - 1;
      if (rIdx >= 0 && rIdx < nextDataset.length && !nextDataset[rIdx].__excluded) {
        nextDataset[rIdx] = { ...nextDataset[rIdx], __excluded: true };
        logs.push({
          timestamp,
          rowIdx: issue.rowIdx,
          claimId: issue.claimId || 'UNMAPPED',
          field: 'Row (Duplicate Check)',
          oldValue: 'Duplicate Record',
          newValue: 'EXCLUDED',
          action: 'autofix',
          justification: issue.description
        });
      }
    });

    onRepair(nextDataset, logs);
  };

  // Repaired spreadsheet download trigger
  const downloadRepairedCSV = () => {
    // Keep active rows
    const activeRows = workingDataset.filter(row => !row.__excluded);
    if (activeRows.length === 0) return;

    const headers = Object.keys(activeRows[0]).filter(k => k !== '__excluded');
    
    const csvContent = [
      headers.join(','),
      ...activeRows.map(row => 
        headers.map(h => {
          const cell = String(row[h] ?? '').replace(/"/g, '""');
          return cell.includes(',') || cell.includes('\n') || cell.includes('"') ? `"${cell}"` : cell;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'repaired_claims_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Cell issue checking helper
  const getCellIssue = (rowIdx: number, headerKey: string): ValidationIssue | undefined => {
    return summary.issues.find(issue => {
      if (issue.rowIdx !== rowIdx) return false;
      if (issue.type === 'duplicate' && headerKey === columnMapping.claimId) return true;
      return issue.field === headerKey;
    });
  };

  // Cell highlight style helper
  const getCellHighlightStyle = (rowIdx: number, headerKey: string, isExcluded: boolean) => {
    if (isExcluded) return { opacity: 0.5 };
    const issue = getCellIssue(rowIdx, headerKey);
    if (!issue) return {};

    if (issue.severity === 'error') {
      return {
        border: '1.5px solid var(--status-error)',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        color: 'var(--status-error)',
        fontWeight: 600
      };
    } else {
      return {
        border: '1.5px solid var(--status-warning)',
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        color: 'var(--status-warning)',
        fontWeight: 600
      };
    }
  };

  // Filter local dataset rows in the editor based on query and issue checkboxes
  const displayedEditorRows = localDataset
    .map((row, rIdx) => ({ row, rIdx }))
    .filter(({ row, rIdx }) => {
      const rowIdx = rIdx + 1;
      
      // Filter issues only
      if (showIssuesOnly) {
        const hasIssue = summary.issues.some(i => i.rowIdx === rowIdx);
        if (!hasIssue) return false;
      }

      // Filter text query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches = Object.values(row).some(v => String(v || '').toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '20px' }}>
        Data Quality & Validation Audit
      </h2>

      {/* Scorecard row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '16px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Rows Processed</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: '4px' }}>{summary.totalRows}</span>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '16px', borderLeft: '4px solid var(--status-success)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Valid Reserving Records</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--status-success)', marginTop: '4px' }}>{cleanedCount}</span>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '16px', borderLeft: '4px solid var(--status-error)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Duplicates Purged</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--status-error)', marginTop: '4px' }}>{summary.duplicateCount}</span>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '16px', borderLeft: `4px solid ${hasErrors ? 'var(--status-error)' : 'var(--status-warning)'}` }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Flagged Issues</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: hasErrors ? 'var(--status-error)' : 'var(--status-warning)', marginTop: '4px' }}>
            {summary.issues.length}
          </span>
        </div>
      </div>

      {/* 1. Launch Reserving Ledger Editor Banner */}
      <div 
        className="card card-glass" 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '20px 24px', 
          marginBottom: '24px',
          borderLeft: '4px solid var(--accent-blue)',
          background: 'linear-gradient(135deg, rgba(37,99,235,0.03) 0%, rgba(255,255,255,0) 100%)'
        }}
      >
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', margin: 0 }}>
            <Database size={18} style={{ color: 'var(--accent-blue)' }} /> Reserving Ledger Spreadsheet Workspace
          </h3>
          <p style={{ fontSize: '0.825rem', color: 'var(--color-muted)', marginTop: '4px', maxWidth: '650px' }}>
            Open a fully-fledged, full-screen claims transaction editor. Identify anomalies highlighted directly inside cells, correct typos, or exclude records.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setLocalDataset(workingDataset);
            setIsEditorOpen(true);
          }}
          style={{ fontWeight: 600, display: 'flex', gap: '6px', alignItems: 'center', padding: '10px 18px' }}
        >
          Launch Reserving Ledger Editor
        </button>
      </div>

      {/* 2. Validation Repair Logs Audit List */}
      {validationRepairLog.length > 0 && (
        <div className="card" style={{ marginBottom: '24px', backgroundColor: 'rgba(var(--color-primary-rgb), 0.01)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem' }}>Validation Repair Logs ({validationRepairLog.length} changes)</h3>
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={downloadRepairedCSV}
              style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', gap: '4px', alignItems: 'center' }}
            >
              Download Cleaned Dataset (.csv)
            </button>
          </div>
          <div className="table-container" style={{ maxHeight: '180px', marginBottom: 0 }}>
            <table className="actuarial-table" style={{ fontSize: '0.775rem' }}>
              <thead>
                <tr>
                  <th style={{ width: '100px', textAlign: 'left' }}>Timestamp</th>
                  <th style={{ width: '50px', textAlign: 'center' }}>Row</th>
                  <th>Claim ID</th>
                  <th>Field</th>
                  <th>Original Value</th>
                  <th>Repaired Value</th>
                  <th style={{ textAlign: 'left' }}>Justification</th>
                </tr>
              </thead>
              <tbody>
                {validationRepairLog.map((log, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: 'left', fontFamily: 'var(--font-mono)' }}>{log.timestamp}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{log.rowIdx}</td>
                    <td style={{ textAlign: 'left' }}>{log.claimId}</td>
                    <td>{log.field}</td>
                    <td><code>{log.oldValue}</code></td>
                    <td><code>{log.newValue}</code></td>
                    <td style={{ textAlign: 'left', fontStyle: 'italic' }}>{log.justification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Original Issues Viewer List */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
          <h3>Validation Audit Log</h3>
          
          {/* Filters controls */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
              <Filter size={14} /> Filter:
            </span>
            <select 
              value={severityFilter} 
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
            >
              <option value="all">All Severities</option>
              <option value="error">Errors Only</option>
              <option value="warning">Warnings Only</option>
            </select>
            <select 
              value={typeFilter} 
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
            >
              <option value="all">All Issue Types</option>
              {issueTypes.map(t => <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>)}
            </select>
          </div>
        </div>

        {summary.issues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--status-success)' }}>
            <CheckCircle2 size={48} style={{ marginBottom: '12px', strokeWidth: 1.5 }} />
            <h4 style={{ color: 'var(--status-success)' }}>Perfect Data Health! No validation anomalies found.</h4>
            <p style={{ fontSize: '0.875rem' }}>All fields, date sequences, and amounts passed checks.</p>
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '250px', marginBottom: '0' }}>
            <table className="actuarial-table">
              <thead>
                <tr>
                  <th style={{ width: '80px', textAlign: 'center' }}>Row</th>
                  <th style={{ width: '150px' }}>Claim ID</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Severity</th>
                  <th style={{ width: '150px', textAlign: 'center' }}>Issue Type</th>
                  <th style={{ width: '180px' }}>Field / Value</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue, idx) => (
                  <tr key={idx} style={{ backgroundColor: issue.severity === 'error' ? 'rgba(239,68,68,0.02)' : 'none' }}>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{issue.rowIdx}</td>
                    <td style={{ textAlign: 'left' }}>{issue.claimId || '--'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${issue.severity === 'error' ? 'badge-danger' : 'badge-warning'}`}>
                        {issue.severity.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)' }}>
                      {issue.type.replace('_', ' ').toUpperCase()}
                    </td>
                    <td style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px', textAlign: 'right' }}>
                      <code style={{ fontSize: '0.75rem' }}>{String(issue.value)}</code>
                    </td>
                    <td style={{ textAlign: 'left', fontSize: '0.825rem', color: 'var(--color-primary)' }}>
                      {issue.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Analyst Sign-off Checkpoint */}
      <div className="card card-glass" style={{ borderLeft: '4px solid var(--accent-blue)', padding: '24px' }}>
        <h3 style={{ marginBottom: '12px' }}>
          Data Sign-off Checklist
        </h3>
        
        {hasErrors ? (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ display: 'block', marginBottom: '4px' }}>Validation Blocked: Critical Errors Found</strong>
              Your claims file contains fatal data errors (e.g. missing IDs, payments before accident date). Actuarial calculations cannot proceed safely. Launch the Reserving Ledger Editor above to repair these items.
            </div>
          </div>
        ) : (
          <p style={{ marginBottom: '16px', fontSize: '0.9rem' }}>
            There are no fatal errors in the dataset. However, please review the warnings and statistical outliers flagged above. Once satisfied that the data is appropriate for reserving, sign off below to proceed.
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '24px' }}>
          <input 
            type="checkbox" 
            id="audit-review"
            checked={hasReviewed}
            onChange={(e) => setHasReviewed(e.target.checked)}
            disabled={hasErrors}
            style={{ width: '18px', height: '18px', marginTop: '3px', cursor: hasErrors ? 'not-allowed' : 'pointer' }}
          />
          <label 
            htmlFor="audit-review" 
            style={{ 
              fontWeight: 500, 
              cursor: hasErrors ? 'not-allowed' : 'pointer', 
              color: hasErrors ? 'var(--color-muted)' : 'var(--color-primary)',
              fontSize: '0.9rem'
            }}
          >
            I have audited the data cleaning log and outliers. I confirm that all warnings are reviewed, and this data is fit for General Insurance claims development analysis.
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
            Status: {hasErrors ? 'Locked due to errors' : hasReviewed ? 'Approved to proceed' : 'Pending review'}
          </span>
          <button 
            onClick={onProceed} 
            className="btn btn-primary" 
            disabled={hasErrors || !hasReviewed}
            style={{ fontSize: '1rem', padding: '10px 20px' }}
          >
            Initialize Reserving Dashboard <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* FULL SCREEN SPREADSHEET WORKSPACE OVERLAY */}
      {isEditorOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            background: 'var(--bg-app)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn var(--transition-fast) ease-out'
          }}
        >
          {/* Header Workspace Bar */}
          <div 
            style={{ 
              height: '64px', 
              padding: '0 24px', 
              borderBottom: '1px solid var(--border-color)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              background: 'var(--bg-surface)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div 
                style={{ 
                  width: '28px', 
                  height: '28px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center'
                }}
              >
                <svg viewBox="0 0 32 32" style={{ width: '26px', height: '26px' }}>
                  <defs>
                    <linearGradient id="workspaceStairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#1d4ed8" />
                    </linearGradient>
                  </defs>
                  <path d="M4,26 L26,26 L26,20 L18,20 L18,12 L10,12 L10,4 L4,4 Z" fill="url(#workspaceStairGrad)" />
                  <circle cx="7" cy="8" r="1.6" fill="#ffffff" opacity="0.95" />
                  <circle cx="14" cy="16" r="1.6" fill="#ffffff" opacity="0.95" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>Reserving Ledger Spreadsheet Workspace</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Interactive Audit & Edit Session</span>
              </div>
            </div>

            {/* Middle Controls: Search and Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--color-muted)' }} />
                <input 
                  type="text" 
                  placeholder="Search Claim / Policy..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: '6px 12px 6px 30px', fontSize: '0.8rem', width: '220px', borderRadius: '6px' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500 }}>
                <input 
                  type="checkbox" 
                  checked={showIssuesOnly} 
                  onChange={(e) => setShowIssuesOnly(e.target.checked)}
                  style={{ width: '15px', height: '15px' }}
                />
                Show Flagged Rows Only
              </label>
            </div>

            {/* Right Controls: Auto-Fix and Exits */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {summary.issues.some(i => i.type === 'duplicate') && (
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={autoFixDuplicates}
                  style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                >
                  Auto-Exclude Duplicates
                </button>
              )}
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setIsEditorOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '6px 12px' }}
              >
                <X size={14} /> Discard Changes
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={applyCorrections}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '6px 12px' }}
              >
                <Check size={14} /> Apply & Re-Validate
              </button>
            </div>
          </div>

          {/* Main Workspace Body Split */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left Main Pane: Spreadsheet grid */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px', background: 'var(--bg-app)' }}>
              <div 
                className="card" 
                style={{ 
                  padding: 0, 
                  overflow: 'visible', 
                  borderRadius: 'var(--radius-md)', 
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
                }}
              >
                <table className="actuarial-table" style={{ fontSize: '0.75rem', borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)' }}>
                    <tr>
                      <th style={{ width: '45px', textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>Row</th>
                      <th>Claim Number</th>
                      <th>Policy Number</th>
                      <th>Product</th>
                      <th>Peril</th>
                      <th>Accident Date</th>
                      <th>Notification Date</th>
                      <th>Transaction Date</th>
                      <th style={{ textAlign: 'right' }}>Paid Amount ($)</th>
                      <th style={{ textAlign: 'right' }}>Incurred Amount ($)</th>
                      <th>Transaction Type</th>
                      <th>LOB Segment</th>
                      <th>Claim Status</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Exclusion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedEditorRows.length === 0 ? (
                      <tr>
                        <td colSpan={14} style={{ textAlign: 'center', padding: '48px', color: 'var(--color-muted)' }}>
                          No rows match your query/filter.
                        </td>
                      </tr>
                    ) : (
                      displayedEditorRows.map(({ row, rIdx }) => {
                        const rowIdx = rIdx + 1;
                        const isExcluded = row.__excluded;
                        const rowIssues = summary.issues.filter(i => i.rowIdx === rowIdx);
                        const isErrorRow = rowIssues.some(i => i.severity === 'error');
                        const isFocused = rowIdx === focusedRowIdx;

                        return (
                          <tr 
                            key={rowIdx}
                            style={{ 
                              opacity: isExcluded ? 0.45 : 1,
                              textDecoration: isExcluded ? 'line-through' : 'none',
                              backgroundColor: isFocused 
                                ? 'rgba(37, 99, 235, 0.08)' 
                                : isExcluded 
                                  ? 'rgba(var(--color-primary-rgb), 0.01)' 
                                  : isErrorRow 
                                    ? 'rgba(239, 68, 68, 0.01)' 
                                    : 'var(--bg-surface)',
                              border: isFocused ? '2px solid var(--accent-blue)' : 'none',
                              transition: 'background-color var(--transition-fast)'
                            }}
                          >
                            <td style={{ textAlign: 'center', fontWeight: 600, borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)' }}>
                              {rowIdx}
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row[columnMapping.claimId] || ''}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, columnMapping.claimId, e.target.value)}
                                style={{ 
                                  padding: '4px 6px', 
                                  fontSize: '0.725rem', 
                                  width: '90px', 
                                  border: '1px solid transparent',
                                  ...getCellHighlightStyle(rowIdx, columnMapping.claimId, isExcluded) 
                                }}
                                title={getCellIssue(rowIdx, columnMapping.claimId)?.description}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row['Policy Number'] || ''}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, 'Policy Number', e.target.value)}
                                style={{ padding: '4px 6px', fontSize: '0.725rem', width: '95px', border: '1px solid transparent' }}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row['Product'] || ''}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, 'Product', e.target.value)}
                                style={{ padding: '4px 6px', fontSize: '0.725rem', width: '120px', border: '1px solid transparent' }}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row['Peril'] || ''}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, 'Peril', e.target.value)}
                                style={{ padding: '4px 6px', fontSize: '0.725rem', width: '110px', border: '1px solid transparent' }}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row[columnMapping.accidentDate] || ''}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, columnMapping.accidentDate, e.target.value)}
                                style={{ 
                                  padding: '4px 6px', 
                                  fontSize: '0.725rem', 
                                  width: '90px', 
                                  fontFamily: 'var(--font-mono)',
                                  border: '1px solid transparent',
                                  ...getCellHighlightStyle(rowIdx, columnMapping.accidentDate, isExcluded)
                                }}
                                placeholder="YYYY-MM-DD"
                                title={getCellIssue(rowIdx, columnMapping.accidentDate)?.description}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={columnMapping.notificationDate ? row[columnMapping.notificationDate] : ''}
                                disabled={isExcluded}
                                onChange={(e) => columnMapping.notificationDate && handleCellChange(rIdx, columnMapping.notificationDate, e.target.value)}
                                style={{ 
                                  padding: '4px 6px', 
                                  fontSize: '0.725rem', 
                                  width: '90px', 
                                  fontFamily: 'var(--font-mono)',
                                  border: '1px solid transparent',
                                  ...getCellHighlightStyle(rowIdx, columnMapping.notificationDate || '', isExcluded)
                                }}
                                placeholder="YYYY-MM-DD"
                                title={columnMapping.notificationDate ? getCellIssue(rowIdx, columnMapping.notificationDate)?.description : undefined}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row[columnMapping.paymentDate] || ''}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, columnMapping.paymentDate, e.target.value)}
                                style={{ 
                                  padding: '4px 6px', 
                                  fontSize: '0.725rem', 
                                  width: '90px', 
                                  fontFamily: 'var(--font-mono)',
                                  border: '1px solid transparent',
                                  ...getCellHighlightStyle(rowIdx, columnMapping.paymentDate, isExcluded)
                                }}
                                placeholder="YYYY-MM-DD"
                                title={getCellIssue(rowIdx, columnMapping.paymentDate)?.description}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row[columnMapping.paidAmount] ?? 0}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, columnMapping.paidAmount, e.target.value)}
                                style={{ 
                                  padding: '4px 6px', 
                                  fontSize: '0.725rem', 
                                  width: '90px', 
                                  textAlign: 'right', 
                                  fontFamily: 'var(--font-mono)',
                                  border: '1px solid transparent',
                                  ...getCellHighlightStyle(rowIdx, columnMapping.paidAmount, isExcluded)
                                }}
                                title={getCellIssue(rowIdx, columnMapping.paidAmount)?.description}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row[columnMapping.incurredAmount] ?? 0}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, columnMapping.incurredAmount, e.target.value)}
                                style={{ 
                                  padding: '4px 6px', 
                                  fontSize: '0.725rem', 
                                  width: '90px', 
                                  textAlign: 'right', 
                                  fontFamily: 'var(--font-mono)',
                                  border: '1px solid transparent',
                                  ...getCellHighlightStyle(rowIdx, columnMapping.incurredAmount, isExcluded)
                                }}
                                title={getCellIssue(rowIdx, columnMapping.incurredAmount)?.description}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row['Transaction Type'] || ''}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, 'Transaction Type', e.target.value)}
                                style={{ padding: '4px 6px', fontSize: '0.725rem', width: '130px', border: '1px solid transparent' }}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row[columnMapping.segment || 'segment'] || ''}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, columnMapping.segment || 'segment', e.target.value)}
                                style={{ padding: '4px 6px', fontSize: '0.725rem', width: '80px', border: '1px solid transparent' }}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={row[columnMapping.claimStatus || 'Status'] || ''}
                                disabled={isExcluded}
                                onChange={(e) => handleCellChange(rIdx, columnMapping.claimStatus || 'Status', e.target.value)}
                                style={{ padding: '4px 6px', fontSize: '0.725rem', width: '75px', border: '1px solid transparent' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {isExcluded ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleIncludeRow(rIdx)}
                                  style={{ padding: '2px 6px', fontSize: '0.65rem' }}
                                >
                                  Include
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => handleExcludeRow(rIdx)}
                                  style={{ padding: '2px 6px', fontSize: '0.65rem', backgroundColor: 'var(--status-error)', color: 'white' }}
                                >
                                  Exclude
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Pane Sidebar: Validation Feed */}
            <div 
              style={{ 
                width: '340px', 
                borderLeft: '1px solid var(--border-color)', 
                background: 'var(--bg-surface)', 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden' 
              }}
            >
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={16} style={{ color: 'var(--status-warning)' }} /> Active Validation Issues ({summary.issues.length})
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px' }}>
                  Click an issue below to automatically jump to and focus that record in the spreadsheet.
                </p>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {summary.issues.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--status-success)' }}>
                    <CheckCircle2 size={36} style={{ marginBottom: '8px', strokeWidth: 1.5 }} />
                    <h4 style={{ fontSize: '0.85rem' }}>No issues found!</h4>
                    <p style={{ fontSize: '0.75rem' }}>All transactions satisfy mathematical and formatting checks.</p>
                  </div>
                ) : (
                  summary.issues.map((issue, idx) => (
                    <div 
                      key={idx}
                      onClick={() => {
                        setFocusedRowIdx(issue.rowIdx);
                        // Scroll element to view
                        setTimeout(() => {
                          const elements = document.getElementsByTagName('input');
                          for (let el of elements) {
                            if (el.title === issue.description || el.value === String(issue.value)) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.focus();
                              break;
                            }
                          }
                        }, 50);
                      }}
                      style={{
                        padding: '10px var(--space-sm)',
                        borderRadius: '6px',
                        marginBottom: '8px',
                        cursor: 'pointer',
                        border: '1px solid var(--border-color)',
                        backgroundColor: focusedRowIdx === issue.rowIdx 
                          ? 'rgba(37,99,235,0.05)' 
                          : issue.severity === 'error' 
                            ? 'rgba(239,68,68,0.02)' 
                            : 'transparent',
                        borderColor: focusedRowIdx === issue.rowIdx 
                          ? 'var(--accent-blue)' 
                          : issue.severity === 'error' 
                            ? 'rgba(239,68,68,0.2)' 
                            : 'var(--border-color)',
                        transition: 'all var(--transition-fast)'
                      }}
                      onMouseOver={(e) => {
                        if (focusedRowIdx !== issue.rowIdx) {
                          e.currentTarget.style.backgroundColor = 'rgba(var(--color-primary-rgb), 0.02)';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (focusedRowIdx !== issue.rowIdx) {
                          e.currentTarget.style.backgroundColor = issue.severity === 'error' ? 'rgba(239,68,68,0.02)' : 'transparent';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--color-muted)' }}>Row {issue.rowIdx}</span>
                        <span className={`badge ${issue.severity === 'error' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.6rem', padding: '1px 4px' }}>
                          {issue.severity.toUpperCase()}
                        </span>
                      </div>
                      <h4 style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--color-primary)', marginTop: '4px' }}>
                        {issue.type.replace('_', ' ').toUpperCase()} on [{issue.field}]
                      </h4>
                      <p style={{ fontSize: '0.725rem', color: 'var(--color-primary)', marginTop: '4px', lineHeight: 1.3 }}>
                        {issue.description}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer Status Bar */}
          <div 
            style={{ 
              height: '50px', 
              padding: '0 24px', 
              borderTop: '1px solid var(--border-color)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              background: 'var(--bg-surface)' 
            }}
          >
            <div style={{ display: 'flex', gap: '20px', fontSize: '0.775rem', color: 'var(--color-muted)' }}>
              <span>Total rows: <strong>{localDataset.length}</strong></span>
              <span>Excluded rows: <strong>{localDataset.filter(r => r.__excluded).length}</strong></span>
              <span>Unresolved Issues: <strong style={{ color: hasErrors ? 'var(--status-error)' : 'var(--status-warning)' }}>{summary.issues.length}</strong></span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontStyle: 'italic' }}>
              * Hover cursor over highlighted cells to read details. Apply changes to commit.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
