import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, ArrowRight } from 'lucide-react';
import type { RawRow, ColumnMapping } from '../math/validationMath';

interface FileUploadProps {
  onDataLoaded: (
    data: RawRow[],
    mapping: ColumnMapping,
    fileName: string,
    params: {
      valuationDate: string;
      granularity: 'annual' | 'quarterly';
      segmentFilter: string;
      availableSegments: string[];
    }
  ) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const [parsedData, setParsedData] = useState<RawRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  
  // Mapping States
  const [mapping, setMapping] = useState<ColumnMapping>({
    claimId: '',
    accidentDate: '',
    paymentDate: '',
    paidAmount: '',
    incurredAmount: '',
    segment: '',
    claimStatus: ''
  });

  // Parameter States
  const [valuationDate, setValuationDate] = useState<string>(
    new Date(2025, 11, 31).toISOString().slice(0, 10) // Default to end of 2025
  );
  const [granularity, setGranularity] = useState<'annual' | 'quarterly'>('annual');
  const [segmentFilter, setSegmentFilter] = useState<string>('All');
  const [availableSegments, setAvailableSegments] = useState<string[]>([]);
  const [isMappingActive, setIsMappingActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect columns based on common names
  const autoDetectMapping = (cols: string[]) => {
    const newMapping = { ...mapping };
    
    cols.forEach(col => {
      const c = col.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Claim ID
      if (c.includes('claimid') || c === 'id' || c.includes('claimno') || c.includes('ref')) {
        newMapping.claimId = col;
      }
      // Accident Date
      else if (c.includes('accident') || c.includes('loss') || c === 'acd' || c.includes('occured')) {
        newMapping.accidentDate = col;
      }
      // Payment/Transaction Date
      else if (c.includes('paymentdate') || c.includes('transdate') || c.includes('paiddate') || c.includes('pmtdate')) {
        newMapping.paymentDate = col;
      }
      // Paid Amount
      else if (c.includes('paidamount') || c === 'paid' || c.includes('pmtamt') || c.includes('payment')) {
        newMapping.paidAmount = col;
      }
      // Incurred Amount
      else if (c.includes('incurred') || c === 'inc' || c.includes('totalincurred') || c.includes('incurredamount')) {
        newMapping.incurredAmount = col;
      }
      // Segment / LOB
      else if (c.includes('segment') || c.includes('lob') || c.includes('lineofbusiness') || c.includes('class')) {
        newMapping.segment = col;
      }
      // Claim Status
      else if (c.includes('status') || c.includes('closed') || c.includes('state')) {
        newMapping.claimStatus = col;
      }
    });

    setMapping(newMapping);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFileName(selectedFile.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json: RawRow[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (json.length > 0) {
        setParsedData(json);
        const firstRow = json[0];
        const cols = Object.keys(firstRow);
        setHeaders(cols);
        autoDetectMapping(cols);
        setIsMappingActive(true);

        // Scan segments if segment column is mapped
        updateAvailableSegments(json, mapping.segment || '');
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const generateDemoData = (): RawRow[] => {
    const demoData: RawRow[] = [];
    const accidentYears = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
    const segments = ['Motor', 'Property'];
    let claimIdCounter = 1000;

    const addDays = (dateStr: string, days: number): string => {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    accidentYears.forEach(year => {
      segments.forEach(seg => {
        // 6 claims per year per segment
        const numClaims = 6;
        for (let c = 0; c < numClaims; c++) {
          claimIdCounter++;
          const claimNumber = `CLM-${claimIdCounter}`;
          const policyNumber = `POL-${claimIdCounter + 5000}`;
          
          // Random accident date in the year
          const accMonth = Math.floor(Math.random() * 12) + 1;
          const accDay = Math.floor(Math.random() * 28) + 1;
          const accDateStr = `${year}-${String(accMonth).padStart(2, '0')}-${String(accDay).padStart(2, '0')}`;
          
          // Notification date: 1 to 12 days after accident
          const notifDays = Math.floor(Math.random() * 12) + 1;
          const notifDateStr = addDays(accDateStr, notifDays);

          // Product & Peril selection
          const product = seg === 'Motor' ? 'Private Passenger Auto' : 'Residential Property';
          const perils = seg === 'Motor' 
            ? ['Vehicle Collision', 'Third-Party Liability', 'Theft']
            : ['Fire Damage', 'Water Leakage', 'Windstorm Damage'];
          const peril = perils[c % perils.length];
          
          // Claim Ultimate Value between $10k and $100k
          const ultimate = Math.floor(10000 + Math.random() * 90000);
          
          // Define development steps
          const devSteps = [
            { delayMonths: 3, ratio: 0.35 },
            { delayMonths: 15, ratio: 0.30 },
            { delayMonths: 27, ratio: 0.20 },
            { delayMonths: 39, ratio: 0.10 },
            { delayMonths: 51, ratio: 0.05 },
          ];

          let cumPaid = 0;
          for (let sIdx = 0; sIdx < devSteps.length; sIdx++) {
            const step = devSteps[sIdx];
            const payYear = year + Math.floor((accMonth - 1 + step.delayMonths) / 12);
            const payMonth = ((accMonth - 1 + step.delayMonths) % 12) + 1;
            const payDateStr = `${payYear}-${String(payMonth).padStart(2, '0')}-${String(accDay).padStart(2, '0')}`;

            // Only add transaction if it occurs on or before valuation date (2024-12-31)
            if (payYear <= 2024) {
              cumPaid += ultimate * step.ratio;
              // Outstanding reserves decay
              const outstanding = sIdx === devSteps.length - 1 ? 0 : (ultimate - cumPaid);
              const incurred = cumPaid + outstanding;
              
              demoData.push({
                'Claim Number': claimNumber,
                'Policy Number': policyNumber,
                'Product': product,
                'Peril': peril,
                'Accident Date': accDateStr,
                'Notification Date': notifDateStr,
                'Transaction Date': payDateStr,
                'Paid Amount ($)': Math.round(cumPaid),
                'Incurred Amount ($)': Math.round(incurred),
                'Transaction Type': sIdx === devSteps.length - 1 ? 'Claim Closeout Payment' : 'Partial Claim Payment',
                'LOB Segment': seg,
                'Claim Status': sIdx === devSteps.length - 1 ? 'Closed' : 'Open'
              });
            }
          }
        }
      });
    });

    // Add duplicates to showcase validation audit
    demoData.push({ ...demoData[0] });
    demoData.push({ ...demoData[10] });

    // Add 1 chronological reporting date sequence error (Notification before Accident)
    demoData.push({
      'Claim Number': 'CLM-ERR98',
      'Policy Number': 'POL-99998',
      'Product': 'Private Passenger Auto',
      'Peril': 'Vehicle Collision',
      'Accident Date': '2023-06-15',
      'Notification Date': '2023-06-10', // 5 days before Accident!
      'Transaction Date': '2023-07-01',
      'Paid Amount ($)': 2500,
      'Incurred Amount ($)': 3500,
      'Transaction Type': 'Partial Claim Payment',
      'LOB Segment': 'Motor',
      'Claim Status': 'Open'
    });

    // Add 1 chronological transaction date sequence error (Transaction before Notification)
    demoData.push({
      'Claim Number': 'CLM-ERR99',
      'Policy Number': 'POL-99999',
      'Product': 'Residential Property',
      'Peril': 'Water Leakage',
      'Accident Date': '2023-06-01',
      'Notification Date': '2023-06-10',
      'Transaction Date': '2023-06-05', // 5 days before Notification!
      'Paid Amount ($)': 5000,
      'Incurred Amount ($)': 5000,
      'Transaction Type': 'Partial Claim Payment',
      'LOB Segment': 'Property',
      'Claim Status': 'Open'
    });

    // Add 1 missing claim ID
    demoData.push({
      'Claim Number': '', // Empty ID
      'Policy Number': 'POL-99990',
      'Product': 'Residential Property',
      'Peril': 'Windstorm Damage',
      'Accident Date': '2024-05-10',
      'Notification Date': '2024-05-12',
      'Transaction Date': '2024-08-10',
      'Paid Amount ($)': 12000,
      'Incurred Amount ($)': 15000,
      'Transaction Type': 'Partial Claim Payment',
      'LOB Segment': 'Property',
      'Claim Status': 'Open'
    });

    // Add 1 statistical outlier
    demoData.push({
      'Claim Number': 'CLM-OUTLIER',
      'Policy Number': 'POL-88888',
      'Product': 'Private Passenger Auto',
      'Peril': 'Third-Party Liability',
      'Accident Date': '2020-03-15',
      'Notification Date': '2020-03-16',
      'Transaction Date': '2021-03-15',
      'Paid Amount ($)': 1500000, // Very high
      'Incurred Amount ($)': 1500000,
      'Transaction Type': 'Large Loss Advance Payment',
      'LOB Segment': 'Motor',
      'Claim Status': 'Closed'
    });

    return demoData;
  };

  const handleLoadDemoData = () => {
    const data = generateDemoData();
    setHeaders([
      'Claim Number', 
      'Policy Number', 
      'Product', 
      'Peril', 
      'Accident Date', 
      'Notification Date', 
      'Transaction Date', 
      'Paid Amount ($)', 
      'Incurred Amount ($)', 
      'Transaction Type', 
      'LOB Segment', 
      'Claim Status'
    ]);
    setParsedData(data);
    setFileName('actuarial_demo_claims_ledger.csv');
    setMapping({
      claimId: 'Claim Number',
      accidentDate: 'Accident Date',
      paymentDate: 'Transaction Date',
      paidAmount: 'Paid Amount ($)',
      incurredAmount: 'Incurred Amount ($)',
      segment: 'LOB Segment',
      claimStatus: 'Claim Status',
      notificationDate: 'Notification Date'
    });
    setAvailableSegments(['Motor', 'Property']);
    setSegmentFilter('All');
    setValuationDate('2024-12-31');
    setIsMappingActive(true);
  };

  const handleDownloadDemoCSV = () => {
    const data = generateDemoData();
    const headers = [
      'Claim Number', 
      'Policy Number', 
      'Product', 
      'Peril', 
      'Accident Date', 
      'Notification Date', 
      'Transaction Date', 
      'Paid Amount ($)', 
      'Incurred Amount ($)', 
      'Transaction Type', 
      'LOB Segment', 
      'Claim Status'
    ];
    
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
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
    link.setAttribute('download', 'actuarial_demo_claims_ledger.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateAvailableSegments = (data: RawRow[], segmentCol: string) => {
    if (!segmentCol) {
      setAvailableSegments([]);
      setSegmentFilter('All');
      return;
    }
    const segments = new Set<string>();
    data.forEach(row => {
      if (row[segmentCol]) {
        segments.add(String(row[segmentCol]));
      }
    });
    setAvailableSegments(Array.from(segments).sort());
  };

  const handleMappingChange = (field: keyof ColumnMapping, value: string) => {
    const updated = { ...mapping, [field]: value };
    setMapping(updated);
    
    if (field === 'segment') {
      updateAvailableSegments(parsedData, value);
    }
  };

  const isMappingComplete = () => {
    return (
      mapping.claimId &&
      mapping.accidentDate &&
      mapping.paymentDate &&
      mapping.paidAmount &&
      mapping.incurredAmount
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMappingComplete()) return;

    onDataLoaded(parsedData, mapping, fileName, {
      valuationDate,
      granularity,
      segmentFilter,
      availableSegments,
    });
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="card card-glass" style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h2 style={{ marginBottom: '8px' }}>Claims Data Upload & Mapping</h2>
        <p style={{ marginBottom: '24px' }}>
          Upload a raw claims transaction list (CSV or Excel) to construct development triangles and estimate reserves.
        </p>

        {!isMappingActive ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '48px',
              cursor: 'pointer',
              transition: 'border-color var(--transition-fast)',
              backgroundColor: 'rgba(var(--color-primary-rgb), 0.01)'
            }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
            onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          >
            <Upload size={48} style={{ color: 'var(--accent-blue)', marginBottom: '16px' }} />
            <h3>Drag & drop your file here, or click to browse</h3>
            <p style={{ fontSize: '0.875rem', marginTop: '8px' }}>Supports CSV, XLS, XLSX formats</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              style={{ display: 'none' }} 
              accept=".csv, .xls, .xlsx" 
            />
            
            <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)', display: 'block', marginBottom: '10px' }}>
                Want to review the reserving workspace immediately?
              </span>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLoadDemoData();
                  }}
                  style={{ fontWeight: 600, padding: '8px 16px' }}
                >
                  Load Actuarial Demo Data
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadDemoCSV();
                  }}
                  style={{ fontWeight: 600, padding: '8px 16px', border: '1px solid var(--border-color)' }}
                >
                  Download Demo CSV File
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <FileSpreadsheet size={24} style={{ color: 'var(--status-success)' }} />
            <span style={{ fontWeight: 600 }}>{fileName}</span>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '4px 12px', fontSize: '0.8rem' }}
              onClick={() => {
                setIsMappingActive(false);
                setParsedData([]);
              }}
            >
              Change File
            </button>
          </div>
        )}
      </div>

      {isMappingActive && (
        <form onSubmit={handleSubmit}>
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>
              1. Column Mapping Check
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Claim ID *</label>
                <select 
                  value={mapping.claimId} 
                  onChange={(e) => handleMappingChange('claimId', e.target.value)}
                  required
                >
                  <option value="">-- Select Column --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Accident / Loss Date *</label>
                <select 
                  value={mapping.accidentDate} 
                  onChange={(e) => handleMappingChange('accidentDate', e.target.value)}
                  required
                >
                  <option value="">-- Select Column --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Payment / Valuation Date *</label>
                <select 
                  value={mapping.paymentDate} 
                  onChange={(e) => handleMappingChange('paymentDate', e.target.value)}
                  required
                >
                  <option value="">-- Select Column --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Paid Amount *</label>
                <select 
                  value={mapping.paidAmount} 
                  onChange={(e) => handleMappingChange('paidAmount', e.target.value)}
                  required
                >
                  <option value="">-- Select Column --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Incurred Amount *</label>
                <select 
                  value={mapping.incurredAmount} 
                  onChange={(e) => handleMappingChange('incurredAmount', e.target.value)}
                  required
                >
                  <option value="">-- Select Column --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Segment / LOB (Optional)</label>
                <select 
                  value={mapping.segment} 
                  onChange={(e) => handleMappingChange('segment', e.target.value)}
                >
                  <option value="">-- None (No Segments) --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Claim Status [Open/Closed] (Optional)</label>
                <select 
                  value={mapping.claimStatus} 
                  onChange={(e) => handleMappingChange('claimStatus', e.target.value)}
                >
                  <option value="">-- None (Assume Closed) --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Notification Date (Optional)</label>
                <select 
                  value={mapping.notificationDate || ''} 
                  onChange={(e) => handleMappingChange('notificationDate', e.target.value)}
                >
                  <option value="">-- None (No Notification Checks) --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>
              2. Valuation Parameters
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Valuation Date *</label>
                <input 
                  type="date" 
                  value={valuationDate} 
                  onChange={(e) => setValuationDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Triangle Granularity</label>
                <select 
                  value={granularity} 
                  onChange={(e) => setGranularity(e.target.value as any)}
                >
                  <option value="annual">Annual (AY / DY)</option>
                  <option value="quarterly">Quarterly (AQ / DQ)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>LOB Segment Filter</label>
                <select 
                  value={segmentFilter} 
                  onChange={(e) => setSegmentFilter(e.target.value)}
                  disabled={!mapping.segment}
                >
                  <option value="All">All Segments Combined</option>
                  {availableSegments.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Raw Data Preview */}
          <div className="card" style={{ marginBottom: '24px', overflowX: 'auto' }}>
            <h3 style={{ marginBottom: '12px' }}>Raw Data File Preview (First 5 rows)</h3>
            <table className="actuarial-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  {headers.map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {parsedData.slice(0, 5).map((row, idx) => (
                  <tr key={idx}>
                    {headers.map(h => (
                      <td key={h} style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {row[h] instanceof Date 
                          ? (row[h] as Date).toISOString().slice(0,10) 
                          : String(row[h] || '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: 'right' }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={!isMappingComplete()}
              style={{ fontSize: '1rem', padding: '12px 24px' }}
            >
              Parse & Run Validation <ArrowRight size={18} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
