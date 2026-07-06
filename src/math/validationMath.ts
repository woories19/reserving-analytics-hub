/**
 * Data Cleaning & Validation Library for Actuarial Reserving App
 */

export interface RawRow {
  [key: string]: any;
}

export interface ColumnMapping {
  claimId: string;
  accidentDate: string;
  paymentDate: string;
  paidAmount: string;
  incurredAmount: string;
  segment?: string;
  claimCount?: string; // Optional closed/reported count mapping
  claimStatus?: string; // Optional open/closed mapping
  notificationDate?: string; // Optional notification date mapping
}

export interface ValidationIssue {
  rowIdx: number;
  claimId?: string;
  field: string;
  value: any;
  severity: 'warning' | 'error';
  type: 'missing' | 'date_sequence' | 'future_date' | 'outlier' | 'duplicate' | 'negative_amount' | 'large_loss';
  description: string;
}

export interface CleanedClaimRecord {
  rowIdx: number;
  claimId: string;
  accidentDate: Date;
  paymentDate: Date;
  paidAmount: number;
  incurredAmount: number;
  segment: string;
  isClosed: boolean;
  originalRow: RawRow;
  outlierFlags: {
    isPaidOutlier: boolean;
    isIncurredOutlier: boolean;
    method: 'iqr' | 'zscore' | 'none';
  };
}

export interface ValidationSummary {
  totalRows: number;
  cleanedCount: number;
  duplicateCount: number;
  issues: ValidationIssue[];
}

/**
 * Validates and cleans raw uploaded data rows based on selected mappings
 */
export function validateAndCleanData(
  rawData: RawRow[],
  mapping: ColumnMapping,
  valuationDate: string,
  segmentFilter: string = 'All',
  largeLossThreshold: number = 100000
): { cleaned: CleanedClaimRecord[]; summary: ValidationSummary } {
  const issues: ValidationIssue[] = [];
  const cleaned: CleanedClaimRecord[] = [];
  const valDate = new Date(valuationDate);
  const now = new Date();
  
  // Track duplicates (stringified exact row values mapped to their 1-indexed row number and claim ID)
  const seenRows = new Map<string, { rowIdx: number; claimId: string }>();
  let duplicateCount = 0;

  // 1. First Pass: Missing values, dates sanity, duplicates, mapping type checks
  const firstPassRecords: Array<{
    rowIdx: number;
    claimId: string;
    accidentDate: Date;
    paymentDate: Date;
    paidAmount: number;
    incurredAmount: number;
    segment: string;
    isClosed: boolean;
    originalRow: RawRow;
  }> = [];

  rawData.forEach((row, idx) => {
    if (row.__excluded === true) {
      return;
    }
    const claimIdStr = String(row[mapping.claimId] || '');
    // Generate row string for duplicate check (ignoring manual exclusion tags)
    const tempRow = { ...row };
    delete tempRow.__excluded;
    const rowStr = JSON.stringify(tempRow);
    
    if (seenRows.has(rowStr)) {
      duplicateCount++;
      const match = seenRows.get(rowStr)!;
      issues.push({
        rowIdx: idx + 1,
        claimId: claimIdStr,
        field: 'Row',
        value: 'Entire row',
        severity: 'warning',
        type: 'duplicate',
        description: `Duplicate claims transaction record: Identical to Row ${match.rowIdx} (Original Claim ID: ${match.claimId || '--'}).`,
      });
      return; // Skip processing duplicate rows
    }
    seenRows.set(rowStr, { rowIdx: idx + 1, claimId: claimIdStr });

    // Extract fields using mapping
    const rawClaimId = row[mapping.claimId];
    const rawAccidentDate = row[mapping.accidentDate];
    const rawPaymentDate = row[mapping.paymentDate];
    const rawPaid = row[mapping.paidAmount];
    const rawIncurred = row[mapping.incurredAmount];
    const rawSegment = mapping.segment ? String(row[mapping.segment] || 'Unsegmented') : 'Default';
    const rawNotificationDate = mapping.notificationDate ? row[mapping.notificationDate] : null;

    // Parse and handle claim status/counts
    let isClosed = true;
    if (mapping.claimStatus) {
      const statusValue = String(row[mapping.claimStatus] || '').toLowerCase();
      if (statusValue.includes('open') || statusValue === 'o' || statusValue === 'active') {
        isClosed = false;
      }
    }

    let hasFatalError = false;

    // Check missing critical fields
    if (rawClaimId === undefined || rawClaimId === null || String(rawClaimId).trim() === '') {
      issues.push({
        rowIdx: idx + 1,
        field: 'Claim ID',
        value: rawClaimId,
        severity: 'error',
        type: 'missing',
        description: 'Missing critical field: Claim ID.',
      });
      hasFatalError = true;
    }

    if (!rawAccidentDate) {
      issues.push({
        rowIdx: idx + 1,
        claimId: String(rawClaimId || ''),
        field: 'Accident Date',
        value: rawAccidentDate,
        severity: 'error',
        type: 'missing',
        description: 'Missing critical field: Accident Date.',
      });
      hasFatalError = true;
    }

    if (!rawPaymentDate) {
      issues.push({
        rowIdx: idx + 1,
        claimId: String(rawClaimId || ''),
        field: 'Payment/Transaction Date',
        value: rawPaymentDate,
        severity: 'error',
        type: 'missing',
        description: 'Missing critical field: Payment/Transaction Date.',
      });
      hasFatalError = true;
    }
    // Parse Amounts
    const paid = parseFloat(String(rawPaid).replace(/[^0-9.-]/g, '')) || 0;
    const incurred = parseFloat(String(rawIncurred).replace(/[^0-9.-]/g, '')) || 0;

    if (rawPaid === undefined || rawPaid === null || isNaN(paid)) {
      issues.push({
        rowIdx: idx + 1,
        claimId: claimIdStr,
        field: 'Paid Amount',
        value: rawPaid,
        severity: 'warning',
        type: 'missing',
        description: 'Paid Amount is missing or non-numeric. Defaulting to 0.',
      });
    }

    if (rawIncurred === undefined || rawIncurred === null || isNaN(incurred)) {
      issues.push({
        rowIdx: idx + 1,
        claimId: claimIdStr,
        field: 'Incurred Amount',
        value: rawIncurred,
        severity: 'warning',
        type: 'missing',
        description: 'Incurred Amount is missing or non-numeric. Defaulting to Paid Amount.',
      });
    }

    // Negative amounts check (often legitimate recoveries, but good to warning-flag for verification)
    if (paid < 0) {
      issues.push({
        rowIdx: idx + 1,
        claimId: claimIdStr,
        field: 'Paid Amount',
        value: paid,
        severity: 'warning',
        type: 'negative_amount',
        description: 'Negative payment detected. May represent recovery or salvage.',
      });
    }
    if (incurred < 0) {
      issues.push({
        rowIdx: idx + 1,
        claimId: claimIdStr,
        field: 'Incurred Amount',
        value: incurred,
        severity: 'warning',
        type: 'negative_amount',
        description: 'Negative incurred value detected.',
      });
    }

    // Large Loss Red Flag check
    if (paid >= largeLossThreshold || incurred >= largeLossThreshold) {
      const actualMax = Math.max(paid, incurred);
      issues.push({
        rowIdx: idx + 1,
        claimId: claimIdStr,
        field: paid >= largeLossThreshold ? 'Paid Amount' : 'Incurred Amount',
        value: actualMax,
        severity: 'warning',
        type: 'large_loss',
        description: `Large Loss Red Flag: Claim amount ($${actualMax.toLocaleString()}) exceeds judgment threshold ($${largeLossThreshold.toLocaleString()}).`,
      });
    }

    // Parse Dates
    const accDate = new Date(rawAccidentDate);
    const payDate = new Date(rawPaymentDate);
    
    let notifDate: Date | null = null;
    if (rawNotificationDate) {
      notifDate = new Date(rawNotificationDate);
      if (isNaN(notifDate.getTime())) {
        issues.push({
          rowIdx: idx + 1,
          claimId: claimIdStr,
          field: mapping.notificationDate || 'Notification Date',
          value: rawNotificationDate,
          severity: 'error',
          type: 'date_sequence',
          description: 'Notification Date format is invalid.',
        });
        hasFatalError = true;
      }
    }

    if (isNaN(accDate.getTime())) {
      issues.push({
        rowIdx: idx + 1,
        claimId: claimIdStr,
        field: 'Accident Date',
        value: rawAccidentDate,
        severity: 'error',
        type: 'date_sequence',
        description: 'Accident Date format is invalid.',
      });
      hasFatalError = true;
    }

    if (isNaN(payDate.getTime())) {
      issues.push({
        rowIdx: idx + 1,
        claimId: claimIdStr,
        field: 'Payment Date',
        value: rawPaymentDate,
        severity: 'error',
        type: 'date_sequence',
        description: 'Payment Date format is invalid.',
      });
      hasFatalError = true;
    }

    // Date chronological checks
    if (!hasFatalError) {
      if (payDate < accDate) {
        issues.push({
          rowIdx: idx + 1,
          claimId: claimIdStr,
          field: 'Payment Date',
          value: `Accident: ${accDate.toISOString().slice(0,10)}, Payment: ${payDate.toISOString().slice(0,10)}`,
          severity: 'error',
          type: 'date_sequence',
          description: 'Payment Date is prior to Accident Date.',
        });
        hasFatalError = true;
      }

      if (notifDate) {
        if (notifDate < accDate) {
          issues.push({
            rowIdx: idx + 1,
            claimId: claimIdStr,
            field: mapping.notificationDate || 'Notification Date',
            value: `Accident: ${accDate.toISOString().slice(0,10)}, Notification: ${notifDate.toISOString().slice(0,10)}`,
            severity: 'error',
            type: 'date_sequence',
            description: 'Notification Date is prior to Accident Date.',
          });
          hasFatalError = true;
        }

        if (payDate < notifDate) {
          issues.push({
            rowIdx: idx + 1,
            claimId: claimIdStr,
            field: 'Payment Date',
            value: `Notification: ${notifDate.toISOString().slice(0,10)}, Payment: ${payDate.toISOString().slice(0,10)}`,
            severity: 'error',
            type: 'date_sequence',
            description: 'Payment Date is prior to Notification Date.',
          });
          hasFatalError = true;
        }
      }

      if (accDate > valDate) {
        issues.push({
          rowIdx: idx + 1,
          claimId: claimIdStr,
          field: 'Accident Date',
          value: accDate.toISOString().slice(0,10),
          severity: 'warning',
          type: 'future_date',
          description: `Accident Date is in the future relative to the Valuation Date (${valuationDate}). Row will be filtered out.`,
        });
        hasFatalError = true; // Exclude since it is post valuation date
      }

      if (payDate > valDate) {
        issues.push({
          rowIdx: idx + 1,
          claimId: claimIdStr,
          field: 'Payment Date',
          value: payDate.toISOString().slice(0,10),
          severity: 'warning',
          type: 'future_date',
          description: `Transaction occurred after Valuation Date (${valuationDate}). This row will be excluded from the reserving period.`,
        });
        hasFatalError = true; // Exclude transactions post-valuation
      }

      if (accDate > now || payDate > now) {
        issues.push({
          rowIdx: idx + 1,
          claimId: claimIdStr,
          field: 'Dates',
          value: `Accident: ${accDate.toISOString().slice(0,10)}, Payment: ${payDate.toISOString().slice(0,10)}`,
          severity: 'warning',
          type: 'future_date',
          description: 'Transaction date is in the future relative to today.',
        });
      }
    }

    // Segment filter check
    if (segmentFilter !== 'All' && rawSegment !== segmentFilter) {
      return; // Skip records not matching the current LOB filter
    }

    if (!hasFatalError) {
      firstPassRecords.push({
        rowIdx: idx + 1,
        claimId: claimIdStr,
        accidentDate: accDate,
        paymentDate: payDate,
        paidAmount: paid,
        incurredAmount: Math.max(incurred, paid), // Incurred must be at least Paid
        segment: rawSegment,
        isClosed,
        originalRow: row,
      });
    }
  });

  // 2. Outlier Detection on firstPassRecords
  // We use Tukey's Fences (IQR) as the primary method, and log-normal Z-scores as secondary flags.
  const paidAmounts = firstPassRecords.map(r => r.paidAmount).filter(amt => amt > 0).sort((a, b) => a - b);
  const incurredAmounts = firstPassRecords.map(r => r.incurredAmount).filter(amt => amt > 0).sort((a, b) => a - b);

  // Compute IQR elements
  const getIQRStats = (sortedAmts: number[]) => {
    if (sortedAmts.length === 0) return { q1: 0, q3: 0, iqr: 0, upperFence: Infinity };
    const q1Idx = Math.floor(sortedAmts.length * 0.25);
    const q3Idx = Math.floor(sortedAmts.length * 0.75);
    const q1 = sortedAmts[q1Idx];
    const q3 = sortedAmts[q3Idx];
    const iqr = q3 - q1;
    const upperFence = q3 + 3.0 * iqr; // Extreme outliers
    return { q1, q3, iqr, upperFence };
  };

  const paidIQR = getIQRStats(paidAmounts);
  const incurredIQR = getIQRStats(incurredAmounts);

  // Compute Log-Normal Z-score parameters
  const getLogNormalStats = (sortedAmts: number[]) => {
    if (sortedAmts.length < 3) return { meanLog: 0, stdDevLog: 1 };
    const logs = sortedAmts.map(amt => Math.log(amt));
    const meanLog = logs.reduce((a, b) => a + b, 0) / logs.length;
    const varLog = logs.reduce((sum, val) => sum + Math.pow(val - meanLog, 2), 0) / (logs.length - 1);
    const stdDevLog = Math.sqrt(varLog);
    return { meanLog, stdDevLog };
  };

  const paidLogStats = getLogNormalStats(paidAmounts);
  const incurredLogStats = getLogNormalStats(incurredAmounts);

  // Final assembly with outlier flagging
  firstPassRecords.forEach(rec => {
    let isPaidOutlier = false;
    let isIncurredOutlier = false;
    let method: 'iqr' | 'zscore' | 'none' = 'none';

    // Check IQR Tukey fence
    if (rec.paidAmount > paidIQR.upperFence) {
      isPaidOutlier = true;
      method = 'iqr';
    }
    if (rec.incurredAmount > incurredIQR.upperFence) {
      isIncurredOutlier = true;
      method = 'iqr';
    }

    // Check secondary log Z-score
    if (rec.paidAmount > 0 && !isPaidOutlier && paidLogStats.stdDevLog > 0) {
      const z = (Math.log(rec.paidAmount) - paidLogStats.meanLog) / paidLogStats.stdDevLog;
      if (z > 3.0) {
        isPaidOutlier = true;
        method = 'zscore';
      }
    }
    if (rec.incurredAmount > 0 && !isIncurredOutlier && incurredLogStats.stdDevLog > 0) {
      const z = (Math.log(rec.incurredAmount) - incurredLogStats.meanLog) / incurredLogStats.stdDevLog;
      if (z > 3.0) {
        isIncurredOutlier = true;
        method = 'zscore';
      }
    }

    if (isPaidOutlier || isIncurredOutlier) {
      const field = isPaidOutlier && isIncurredOutlier ? 'Paid & Incurred' : isPaidOutlier ? 'Paid' : 'Incurred';
      const valStr = `Paid: $${rec.paidAmount.toLocaleString()}, Incurred: $${rec.incurredAmount.toLocaleString()}`;
      issues.push({
        rowIdx: rec.rowIdx,
        claimId: rec.claimId,
        field,
        value: valStr,
        severity: 'warning',
        type: 'outlier',
        description: `Outlier claim size detected (Method: ${method.toUpperCase()}). Threshold exceeded.`,
      });
    }

    cleaned.push({
      ...rec,
      outlierFlags: {
        isPaidOutlier,
        isIncurredOutlier,
        method,
      },
    });
  });

  return {
    cleaned,
    summary: {
      totalRows: rawData.length,
      cleanedCount: cleaned.length,
      duplicateCount,
      issues: issues.sort((a, b) => a.rowIdx - b.rowIdx),
    },
  };
}

/**
 * Computes a SHA-256 hash of a text block to represent the immutable state of a run.
 * Uses the native Web Crypto API.
 */
export async function calculateRunHash(
  cleanedRecords: CleanedClaimRecord[],
  assumptions: {
    valuationDate: string;
    granularity: 'annual' | 'quarterly';
    segmentFilter: string;
    expectedLossRatio: number;
    earnedPremiums: Record<string, number>;
    tailFactor: number;
    linkRatioSelections: Record<string, string>;
  }
): Promise<string> {
  const content = JSON.stringify({
    recordCount: cleanedRecords.length,
    claimIdChecksum: cleanedRecords.reduce((acc, r) => acc + parseInt(r.claimId.replace(/\D/g, '') || '0'), 0),
    paidChecksum: cleanedRecords.reduce((acc, r) => acc + r.paidAmount, 0),
    incurredChecksum: cleanedRecords.reduce((acc, r) => acc + r.incurredAmount, 0),
    assumptions,
  });

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (err) {
    // Fail-safe simple hashing if crypto.subtle is unavailable (e.g. non-secure local debug)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    return `ERR-HASH-${Math.abs(hash).toString(16)}`;
  }
}
