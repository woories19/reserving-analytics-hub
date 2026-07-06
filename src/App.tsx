import { useState, useEffect } from 'react';
import { 
  Layers, FileSpreadsheet, FileText, History, 
  TrendingUp, Sun, Moon, RefreshCw, ShieldCheck, ClipboardList 
} from 'lucide-react';
import './App.css';

// Component Imports
import { FileUpload } from './components/FileUpload';
import { DataCleaner } from './components/DataCleaner';
import { AssumptionsPanel } from './components/AssumptionsPanel';
import type { AuditLogEntry, ReservingScenario } from './components/AuditTrail';
import { TriangleViewer } from './components/TriangleViewer';
import { ReservingEstimator } from './components/ReservingEstimator';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { AuditTrail } from './components/AuditTrail';

// Math & Utility Imports
import { type RawRow, type ColumnMapping, validateAndCleanData } from './math/validationMath';
import { 
  buildTriangles, calculateLinkRatios, estimateReserves, checkDiagnostics, type ReservingResult 
} from './math/actuarialMath';
import { exportToExcel, exportToPDF } from './math/exportUtils';
import { LoginPage } from './components/LoginPage';

function App() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('reserving-analytics-auth') === 'true';
  });

  // Theme State (Initializes from localStorage or system OS preference)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('reserving-analytics-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  // Step Routing: 'upload' | 'validation' | 'reserving'
  const [step, setStep] = useState<'upload' | 'validation' | 'reserving'>('upload');
  const [activeTab, setActiveTab] = useState<'triangles' | 'estimates' | 'diagnostics' | 'audit'>('triangles');

  // Raw File / Upload States
  const [fileName, setFileName] = useState<string>('');
  const [valuationDate, setValuationDate] = useState<string>('');
  const [granularity, setGranularity] = useState<'annual' | 'quarterly'>('annual');
  const [segmentFilter, setSegmentFilter] = useState<string>('All');
  
  // Working Dataset & Manual Repair states
  const [workingDataset, setWorkingDataset] = useState<RawRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    claimId: '',
    accidentDate: '',
    paymentDate: '',
    paidAmount: '',
    incurredAmount: '',
    segment: '',
    claimStatus: ''
  });
  const [validationRepairLog, setValidationRepairLog] = useState<any[]>([]);

  // Validation States
  const [cleanedRecords, setCleanedRecords] = useState<any[]>([]);
  const [validationSummary, setValidationSummary] = useState<any>({ totalRows: 0, cleanedCount: 0, duplicateCount: 0, issues: [] });

  // Assumptions & Reserving States
  const [elr, setElr] = useState<number>(65.0); // as percentage
  const [earnedPremiums, setEarnedPremiums] = useState<Record<string, number>>({});
  const [tailFactor, setTailFactor] = useState<number>(1.0000);
  const [globalSelectionMethod, setGlobalSelectionMethod] = useState<
    'volumeWeighted' | 'simpleAverage' | 'last3Years' | 'last5Years' | 'custom'
  >('volumeWeighted');
  const [largeLossThreshold, setLargeLossThreshold] = useState<number>(100000);
  
  // Selected Age-to-Age link factors (per column)
  const [selectedFactors, setSelectedFactors] = useState<number[]>([]);
  const [columnSelections, setColumnSelections] = useState<Record<string, string>>({});

  // Audit Logs & scenario version logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [scenarios, setScenarios] = useState<ReservingScenario[]>([]);

  // Lock & Sign-Off States
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [signOffDetails, setSignOffDetails] = useState({
    analystName: '',
    comments: '',
    hash: ''
  });

  // Toggle application CSS theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Toggle theme utility
  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('reserving-analytics-theme', nextTheme);
  };

  // Listen to OS prefers-color-scheme changes dynamically
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('reserving-analytics-theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Handle data mapping uploaded from FileUpload
  const handleDataUploaded = (
    data: RawRow[],
    mapping: ColumnMapping,
    fileN: string,
    params: {
      valuationDate: string;
      granularity: 'annual' | 'quarterly';
      segmentFilter: string;
      availableSegments: string[];
    }
  ) => {
    setFileName(fileN);
    setValuationDate(params.valuationDate);
    setGranularity(params.granularity);
    setSegmentFilter(params.segmentFilter);
    setColumnMapping(mapping);
    setWorkingDataset(data);
    setValidationRepairLog([]); // Reset repair log on new upload

    // Run first validation check
    const results = validateAndCleanData(data, mapping, params.valuationDate, params.segmentFilter);
    setCleanedRecords(results.cleaned);
    setValidationSummary(results.summary);

    // Dynamic initializations
    setStep('validation');
  };

  const handleProceedToReserving = () => {
    setStep('reserving');
  };

  // Re-run validation on dataset modification
  useEffect(() => {
    if (workingDataset.length === 0) return;
    const results = validateAndCleanData(workingDataset, columnMapping, valuationDate, segmentFilter, largeLossThreshold);
    setCleanedRecords(results.cleaned);
    setValidationSummary(results.summary);
  }, [workingDataset, columnMapping, valuationDate, segmentFilter, largeLossThreshold]);

  const handleRepairDataset = (updatedDataset: RawRow[], logEntries: any[]) => {
    setWorkingDataset(updatedDataset);
    setValidationRepairLog(prev => [...prev, ...logEntries]);
  };

  // Helper to log changes in parameters
  const logAssumptionChange = (paramName: string, oldValue: string, newValue: string, reason: string) => {
    const entry: AuditLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      paramName,
      oldValue,
      newValue,
      reason
    };
    setAuditLogs(prev => [entry, ...prev]);
  };

  // Reserving Calculations Chain
  // Automatically re-computes reserving tables on state adjustments
  const hasData = cleanedRecords.length > 0;
  
  // 1. Build triangles
  const { paidTriangle, incurredTriangle } = buildTriangles(cleanedRecords, granularity);
  const originPeriods = paidTriangle.originPeriods;
  const n = originPeriods.length;

  // 2. Compute links
  const paidLinks = calculateLinkRatios(paidTriangle);
  const incurredLinks = calculateLinkRatios(incurredTriangle);

  // Set default selected factors when triangles or method is updated
  useEffect(() => {
    if (n > 1) {
      const activeLinks = paidLinks; // default factors initial selection based on paid
      const defaultFactors = Array(n - 1).fill(1.0);
      for (let j = 0; j < n - 1; j++) {
        if (globalSelectionMethod === 'volumeWeighted') {
          defaultFactors[j] = activeLinks.volumeWeighted[j];
        } else if (globalSelectionMethod === 'simpleAverage') {
          defaultFactors[j] = activeLinks.simpleAverage[j];
        } else if (globalSelectionMethod === 'last3Years') {
          defaultFactors[j] = activeLinks.last3Years[j];
        } else if (globalSelectionMethod === 'last5Years') {
          defaultFactors[j] = activeLinks.last5Years[j];
        }
      }
      setSelectedFactors(defaultFactors);
    }
  }, [n, globalSelectionMethod, cleanedRecords]);

  // Recalculate reserving models
  let clPaid: ReservingResult[] = [];
  let clIncurred: ReservingResult[] = [];
  let bfPaid: ReservingResult[] = [];
  let bfIncurred: ReservingResult[] = [];
  let summary = { clPaidTotal: 0, clIncTotal: 0, bfPaidTotal: 0, bfIncTotal: 0 };
  let diagnostics = { erraticFactors: [] as number[], thinCells: [] as any[], nonConvergingTail: false };

  if (n > 1 && selectedFactors.length === n - 1) {
    // Projections
    const resPaid = estimateReserves(paidTriangle, selectedFactors, tailFactor, earnedPremiums, elr / 100);
    const resInc = estimateReserves(incurredTriangle, selectedFactors, tailFactor, earnedPremiums, elr / 100);
    
    clPaid = resPaid.chainLadder;
    clIncurred = resInc.chainLadder;
    bfPaid = resPaid.bf;
    bfIncurred = resInc.bf;

    summary = {
      clPaidTotal: resPaid.summary.clTotalReserve,
      clIncTotal: resInc.summary.clTotalReserve,
      bfPaidTotal: resPaid.summary.bfTotalReserve,
      bfIncTotal: resInc.summary.bfTotalReserve,
    };

    // Diagnostics checks (based on default paid triangle ratios stability)
    diagnostics = checkDiagnostics(paidTriangle, paidLinks, selectedFactors);
  }

  // Handle factor edits from the interactive viewer
  const handleFactorsChange = (factors: number[], selections: Record<string, string>) => {
    setSelectedFactors(factors);
    setColumnSelections(selections);
  };

  const handleLockStateChange = (locked: boolean, hash: string, analystName: string, comments: string) => {
    setIsLocked(locked);
    setSignOffDetails({ analystName, comments, hash });
  };

  const handleSaveScenario = (name: string) => {
    const newScenario: ReservingScenario = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      valuationDate,
      globalSelectionMethod,
      elr,
      tailFactor,
      clPaidTotal: summary.clPaidTotal,
      clIncTotal: summary.clIncTotal,
      bfPaidTotal: summary.bfPaidTotal,
      bfIncTotal: summary.bfIncTotal,
    };
    setScenarios(prev => [newScenario, ...prev]);
    logAssumptionChange('Saved Reserving Scenario', '--', name, 'Created version backup');
  };

  const triggerExcelExport = () => {
    exportToExcel({
      fileName,
      valuationDate,
      segmentFilter,
      granularity,
      elr: elr / 100,
      tailFactor,
      paidTriangle,
      incurredTriangle,
      paidLinks,
      incurredLinks,
      selectedFactors,
      clPaid,
      clIncurred,
      bfPaid,
      bfIncurred,
      earnedPremiums,
      auditLogs,
      validationRepairLog,
      signOffDetails: {
        isLocked,
        hash: signOffDetails.hash,
        analystName: signOffDetails.analystName,
        comments: signOffDetails.comments
      }
    });
  };

  const triggerPDFExport = () => {
    exportToPDF({
      fileName,
      valuationDate,
      segmentFilter,
      granularity,
      elr: elr / 100,
      tailFactor,
      paidTriangle,
      incurredTriangle,
      paidLinks,
      incurredLinks,
      selectedFactors,
      clPaid,
      clIncurred,
      bfPaid,
      bfIncurred,
      earnedPremiums,
      auditLogs,
      validationRepairLog,
      signOffDetails: {
        isLocked,
        hash: signOffDetails.hash,
        analystName: signOffDetails.analystName,
        comments: signOffDetails.comments
      }
    });
  };

  if (!isAuthenticated) {
    return <LoginPage onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation / Header */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 32 32" style={{ width: '22px', height: '22px' }}>
              <defs>
                <linearGradient id="headerStairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
              <path d="M4,26 L26,26 L26,20 L18,20 L18,12 L10,12 L10,4 L4,4 Z" fill="url(#headerStairGrad)" />
              <circle cx="7" cy="8" r="1.6" fill="#ffffff" opacity="0.95" />
              <circle cx="14" cy="16" r="1.6" fill="#ffffff" opacity="0.95" />
            </svg>
          </div>
          <span>Reserving Analytics</span> Hub
          <span className="badge badge-warning" style={{ marginLeft: '10px', fontSize: '0.675rem', padding: '2px 8px' }}>STAGING BUILD</span>
          <span className="badge" style={{ marginLeft: '6px', fontSize: '0.675rem', padding: '2px 8px', backgroundColor: 'var(--border-color)', color: 'var(--color-secondary)', border: '1px solid var(--border-color)' }}>v1.1.2</span>
        </div>
        
        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', fontSize: '0.85rem' }}>
            <span style={{ 
              fontWeight: step === 'upload' ? 800 : 500, 
              color: step === 'upload' ? 'var(--accent-blue)' : 'var(--color-muted)' 
            }}>
              1. Upload & Map
            </span>
            <span style={{ color: 'var(--color-muted)' }}>&rarr;</span>
            <span style={{ 
              fontWeight: step === 'validation' ? 800 : 500, 
              color: step === 'validation' ? 'var(--accent-blue)' : 'var(--color-muted)' 
            }}>
              2. Cleanse Audit
            </span>
            <span style={{ color: 'var(--color-muted)' }}>&rarr;</span>
            <span style={{ 
              fontWeight: step === 'reserving' ? 800 : 500, 
              color: step === 'reserving' ? 'var(--accent-blue)' : 'var(--color-muted)' 
            }}>
              3. Reserving Workspace
            </span>
          </div>

          {/* Theme & reset controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={toggleTheme}
              style={{ padding: '6px', borderRadius: '50%' }}
              title="Toggle Theme"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            {step !== 'upload' && (
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  if (confirm('Are you sure you want to clear your current reserving workspace and start over?')) {
                    setStep('upload');
                    setCleanedRecords([]);
                    setAuditLogs([]);
                    setScenarios([]);
                    setIsLocked(false);
                    setEarnedPremiums({});
                    setWorkingDataset([]);
                    setValidationRepairLog([]);
                    setColumnMapping({
                      claimId: '',
                      accidentDate: '',
                      paymentDate: '',
                      paidAmount: '',
                      incurredAmount: '',
                      segment: '',
                      claimStatus: ''
                    });
                  }
                }}
                style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', gap: '4px', alignItems: 'center' }}
              >
                <RefreshCw size={12} /> Reset
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main app panel wrapper */}
      <main className="container" style={{ flexGrow: 1 }}>
        {step === 'upload' && (
          <FileUpload onDataLoaded={handleDataUploaded} />
        )}

        {step === 'validation' && (
          <DataCleaner 
            summary={validationSummary} 
            cleanedCount={cleanedRecords.length}
            onProceed={handleProceedToReserving}
            workingDataset={workingDataset}
            columnMapping={columnMapping}
            validationRepairLog={validationRepairLog}
            onRepair={handleRepairDataset}
          />
        )}

        {step === 'reserving' && hasData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Row: Assumptions and parameters */}
            <div style={{ display: isLocked ? 'none' : 'block' }}>
              <AssumptionsPanel 
                originPeriods={originPeriods}
                linkFactors={selectedFactors}
                onAssumptionsChange={(assumptions) => {
                  setElr(assumptions.expectedLossRatio * 100);
                  setEarnedPremiums(assumptions.earnedPremiums);
                  setTailFactor(assumptions.tailFactor);
                  setGlobalSelectionMethod(assumptions.globalSelectionMethod);
                  setLargeLossThreshold(assumptions.largeLossThreshold);
                }}
                initialAssumptions={{
                  expectedLossRatio: elr / 100,
                  earnedPremiums,
                  tailFactor,
                  globalSelectionMethod,
                  largeLossThreshold,
                }}
                onLogAssumptionChange={logAssumptionChange}
              />
            </div>

            {/* If Locked banner */}
            {isLocked && (
              <div 
                className="card card-glass" 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  borderLeft: '4px solid var(--status-success)',
                  backgroundColor: 'rgba(16,185,129,0.03)',
                  padding: '16px var(--space-lg)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ShieldCheck size={28} style={{ color: 'var(--status-success)' }} />
                  <div>
                    <h4 style={{ color: 'var(--status-success)' }}>Locked Actuarial Reserving Ledger</h4>
                    <p style={{ fontSize: '0.825rem' }}>
                      Certified by <strong>{signOffDetails.analystName}</strong>. Code signature: <code>{signOffDetails.hash.slice(0, 16)}...</code>
                    </p>
                  </div>
                </div>
                
                {/* Export options */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={triggerExcelExport} 
                    className="btn btn-secondary"
                    style={{ display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 600 }}
                  >
                    <FileSpreadsheet size={16} /> Export review sheet (.xlsx)
                  </button>
                  <button 
                    onClick={triggerPDFExport} 
                    className="btn btn-primary"
                    style={{ display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 600 }}
                  >
                    <FileText size={16} /> Export Memo (.pdf)
                  </button>
                </div>
              </div>
            )}

            {/* Reserving workspaces section */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
              {/* Tab headers */}
              <div style={{ padding: '0 24px', backgroundColor: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)' }}>
                <div className="tabs" style={{ marginBottom: 0 }}>
                  <button 
                    className={`tab-btn ${activeTab === 'triangles' ? 'active' : ''}`}
                    onClick={() => setActiveTab('triangles')}
                  >
                    <Layers size={16} /> Development Triangles
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'estimates' ? 'active' : ''}`}
                    onClick={() => setActiveTab('estimates')}
                  >
                    <TrendingUp size={16} /> Reserving Projections
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('diagnostics')}
                  >
                    <ClipboardList size={16} /> Diagnostics & Tail Fits
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                    onClick={() => setActiveTab('audit')}
                  >
                    <History size={16} /> Audit Trail & Sign-Off
                  </button>
                </div>
              </div>

              {/* Tab contents panel */}
              <div style={{ padding: '24px' }}>
                {activeTab === 'triangles' && (
                  <TriangleViewer 
                    paidTriangle={paidTriangle}
                    incurredTriangle={incurredTriangle}
                    paidLinks={paidLinks}
                    incurredLinks={incurredLinks}
                    globalSelectionMethod={globalSelectionMethod}
                    selectedFactors={selectedFactors}
                    onFactorsChange={handleFactorsChange}
                    onLogAssumptionChange={logAssumptionChange}
                    diagnostics={diagnostics}
                  />
                )}

                {activeTab === 'estimates' && (
                  <ReservingEstimator 
                    clPaid={clPaid}
                    clIncurred={clIncurred}
                    bfPaid={bfPaid}
                    bfIncurred={bfIncurred}
                    summary={{
                      clPaidTotal: summary.clPaidTotal,
                      clIncTotal: summary.clIncTotal,
                      bfPaidTotal: summary.bfPaidTotal,
                      bfIncTotal: summary.bfIncTotal,
                    }}
                  />
                )}

                {activeTab === 'diagnostics' && (
                  <DiagnosticsPanel 
                    diagnostics={diagnostics}
                    linkFactors={selectedFactors}
                    originPeriods={originPeriods}
                    issues={validationSummary.issues}
                    workingDataset={workingDataset}
                  />
                )}

                {activeTab === 'audit' && (
                  <AuditTrail 
                    auditLogs={auditLogs}
                    currentRunDetails={{
                      valuationDate,
                      globalSelectionMethod,
                      elr,
                      tailFactor,
                      clPaidTotal: summary.clPaidTotal,
                      clIncTotal: summary.clIncTotal,
                      bfPaidTotal: summary.bfPaidTotal,
                      bfIncTotal: summary.bfIncTotal,
                      cleanedRecords,
                      earnedPremiums,
                      linkRatioSelections: columnSelections,
                    }}
                    isLocked={isLocked}
                    onLockStateChange={handleLockStateChange}
                    scenarios={scenarios}
                    onSaveScenario={handleSaveScenario}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
