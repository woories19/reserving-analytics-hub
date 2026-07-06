/**
 * Actuarial Reserving Calculations Library
 */
import type { CleanedClaimRecord } from './validationMath';

export interface Triangle {
  originPeriods: string[];
  developmentPeriods: number[];
  values: number[][]; // [originPeriodIdx][developmentPeriodIdx]
  incrementalValues: number[][];
}

export interface LinkRatios {
  developmentPeriods: number[];
  ratios: number[][]; // [originPeriodIdx][developmentPeriodIdx - 1]
  volumeWeighted: number[];
  simpleAverage: number[];
  last3Years: number[];
  last5Years: number[];
}

export interface ReservingResult {
  originPeriod: string;
  cumulativeClaims: number;
  linkRatioSelected: number;
  cdfToUltimate: number;
  ultimateClaims: number;
  outstandingReserve: number;
}

export interface ActuarialAnalysis {
  paidTriangle: Triangle;
  incurredTriangle: Triangle;
  paidLinks: LinkRatios;
  incurredLinks: LinkRatios;
  originPeriods: string[];
  developmentPeriods: number[];
}

/**
 * Gets the year and quarter formatting for accident periods
 */
export function getPeriodKey(date: Date, granularity: 'annual' | 'quarterly'): string {
  const y = date.getFullYear();
  if (granularity === 'annual') {
    return String(y);
  } else {
    const q = Math.floor(date.getMonth() / 3) + 1;
    return `${y}-Q${q}`;
  }
}

/**
 * Helper to parse a period key back to chronological sorting value
 */
function getPeriodValue(key: string): number {
  if (key.includes('-Q')) {
    const [y, q] = key.split('-Q').map(Number);
    return y * 10 + q;
  }
  return Number(key);
}

/**
 * Constructs Incremental & Cumulative Paid and Incurred Triangles from cleaned records
 */
export function buildTriangles(
  records: CleanedClaimRecord[],
  granularity: 'annual' | 'quarterly'
): { paidTriangle: Triangle; incurredTriangle: Triangle } {
  // Find distinct origin periods
  const originMap = new Set<string>();
  records.forEach(r => originMap.add(getPeriodKey(r.accidentDate, granularity)));
  
  const originPeriods = Array.from(originMap).sort((a, b) => getPeriodValue(a) - getPeriodValue(b));

  if (originPeriods.length === 0) {
    return {
      paidTriangle: { originPeriods: [], developmentPeriods: [], values: [], incrementalValues: [] },
      incurredTriangle: { originPeriods: [], developmentPeriods: [], values: [], incrementalValues: [] },
    };
  }

  const developmentPeriods: number[] = [];
  for (let i = 1; i <= originPeriods.length; i++) {
    developmentPeriods.push(i);
  }

  const n = originPeriods.length;
  
  // Initialize matrix [n][n]
  const paidValues = Array(n).fill(0).map(() => Array(n).fill(0));
  const paidIncremental = Array(n).fill(0).map(() => Array(n).fill(0));
  
  const incurredValues = Array(n).fill(0).map(() => Array(n).fill(0));
  const incurredIncremental = Array(n).fill(0).map(() => Array(n).fill(0));

  // 1. Group records by claim and origin period, and find amounts at each development step
  // Note: For a proper triangle, we find cumulative paid and case reserves for each claim at each development milestone
  // Let's group transactions by Claim ID and Origin Period
  const claimMap: Record<string, { origin: string; transactions: CleanedClaimRecord[] }> = {};
  
  records.forEach(r => {
    if (!claimMap[r.claimId]) {
      claimMap[r.claimId] = { origin: getPeriodKey(r.accidentDate, granularity), transactions: [] };
    }
    claimMap[r.claimId].transactions.push(r);
  });

  // For each claim, construct its development profile
  Object.entries(claimMap).forEach(([, data]) => {
    const originIdx = originPeriods.indexOf(data.origin);
    if (originIdx === -1) return;

    // Sort claim transactions chronologically
    const txs = data.transactions.sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());

    // Evaluate for each development step j (0 to n-originIdx-1)
    // The claim development step represents the claim's state at the end of that development period
    for (let j = 0; j < n - originIdx; j++) {
      // Find the last transaction for this claim that occurred during or before this development period
      // Let's define the end-date of development period j
      let devPeriodEndDate: Date;
      
      if (granularity === 'annual') {
        const originYear = Number(data.origin);
        // End of development year j (e.g. j=0 -> Dec 31 of originYear)
        devPeriodEndDate = new Date(originYear + j, 11, 31, 23, 59, 59, 999);
      } else {
        const [originYear, originQ] = data.origin.split('-Q').map(Number);
        // End of development quarter j
        // q is 1, 2, 3, 4
        const totalQuarters = (originQ - 1) + j;
        const targetYear = originYear + Math.floor(totalQuarters / 4);
        const targetQ = (totalQuarters % 4) + 1;
        const targetMonth = targetQ * 3 - 1; // 2, 5, 8, 11 (March, June, Sept, Dec)
        devPeriodEndDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999); // last day of that month
      }

      // Find latest transaction before or on this milestone
      const relevantTxs = txs.filter(t => t.paymentDate <= devPeriodEndDate);
      if (relevantTxs.length > 0) {
        // In transaction files, payments are incremental, incurred (or case reserves) are cumulative
        // Cumulative paid = sum of paid amounts up to this point
        const cumPaid = relevantTxs.reduce((sum, t) => sum + t.paidAmount, 0);
        // Incurred is cumulative, so take the latest transaction's incurred amount
        const latestTx = relevantTxs[relevantTxs.length - 1];
        const cumIncurred = Math.max(latestTx.incurredAmount, cumPaid); // Incurred must be >= Paid

        paidValues[originIdx][j] = (paidValues[originIdx][j] || 0) + cumPaid;
        incurredValues[originIdx][j] = (incurredValues[originIdx][j] || 0) + cumIncurred;
      }
    }
  });

  // 2. Adjust for empty values (carry forward cumulative values to fill upper-right triangular elements)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      if (j > 0 && paidValues[i][j] === 0) {
        paidValues[i][j] = paidValues[i][j - 1];
      }
      if (j > 0 && incurredValues[i][j] === 0) {
        incurredValues[i][j] = incurredValues[i][j - 1];
      }
    }
  }

  // 3. Compute incremental values from cumulative values
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      paidIncremental[i][j] = j === 0 ? paidValues[i][j] : paidValues[i][j] - paidValues[i][j - 1];
      incurredIncremental[i][j] = j === 0 ? incurredValues[i][j] : incurredValues[i][j] - incurredValues[i][j - 1];
    }
  }

  return {
    paidTriangle: {
      originPeriods,
      developmentPeriods,
      values: paidValues,
      incrementalValues: paidIncremental,
    },
    incurredTriangle: {
      originPeriods,
      developmentPeriods,
      values: incurredValues,
      incrementalValues: incurredIncremental,
    },
  };
}

/**
 * Calculates Age-to-Age (link) ratios and averages
 */
export function calculateLinkRatios(triangle: Triangle): LinkRatios {
  const n = triangle.originPeriods.length;
  
  if (n <= 1) {
    return {
      developmentPeriods: [],
      ratios: [],
      volumeWeighted: [],
      simpleAverage: [],
      last3Years: [],
      last5Years: [],
    };
  }

  const devPeriods = triangle.developmentPeriods;
  
  // Matrix for ratios: size [n][n-1]
  const ratios = Array(n).fill(0).map(() => Array(n - 1).fill(NaN));
  
  const volumeWeighted = Array(n - 1).fill(0);
  const simpleAverage = Array(n - 1).fill(0);
  const last3Years = Array(n - 1).fill(0);
  const last5Years = Array(n - 1).fill(0);

  // Compute link ratios for each cell
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      const prior = triangle.values[i][j];
      const current = triangle.values[i][j + 1];
      if (prior > 0) {
        ratios[i][j] = current / prior;
      }
    }
  }

  // Compute averages for each development step j
  for (let j = 0; j < n - 1; j++) {
    let sumPrior = 0;
    let sumCurrent = 0;
    let validCount = 0;
    let sumRatios = 0;
    
    const validRatios: number[] = [];

    for (let i = 0; i < n - j - 1; i++) {
      const ratio = ratios[i][j];
      if (!isNaN(ratio) && isFinite(ratio)) {
        sumPrior += triangle.values[i][j];
        sumCurrent += triangle.values[i][j + 1];
        sumRatios += ratio;
        validCount++;
        validRatios.push(ratio);
      }
    }

    // Volume weighted average
    volumeWeighted[j] = sumPrior > 0 ? sumCurrent / sumPrior : 1.0;
    
    // Simple average
    simpleAverage[j] = validCount > 0 ? sumRatios / validCount : 1.0;

    // Last 3 years simple average
    const recent3 = validRatios.slice(-3);
    last3Years[j] = recent3.length > 0 ? recent3.reduce((a, b) => a + b, 0) / recent3.length : simpleAverage[j];

    // Last 5 years simple average
    const recent5 = validRatios.slice(-5);
    last5Years[j] = recent5.length > 0 ? recent5.reduce((a, b) => a + b, 0) / recent5.length : simpleAverage[j];
  }

  return {
    developmentPeriods: devPeriods.slice(0, -1),
    ratios,
    volumeWeighted,
    simpleAverage,
    last3Years,
    last5Years,
  };
}

/**
 * Fits an exponential decay curve to link ratios to extrapolate tail factor
 * Model: (f_j - 1) = a * b^j => ln(f_j - 1) = ln(a) + j * ln(b)
 */
export function fitTailFactor(linkFactors: number[]): { tailFactor: number; r2: number } {
  // We need points (x_j, y_j) where:
  // x_j = development period index (1, 2, 3...)
  // y_j = ln(f_j - 1). We filter for f_j > 1.0001
  const dataPoints: Array<{ x: number; y: number }> = [];

  linkFactors.forEach((f, idx) => {
    if (f > 1.0001) {
      dataPoints.push({
        x: idx + 1,
        y: Math.log(f - 1.0),
      });
    }
  });

  if (dataPoints.length < 2) {
    return { tailFactor: 1.0, r2: 0 };
  }

  // Linear Regression y = A + B * x
  const N = dataPoints.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;

  dataPoints.forEach(p => {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
    sumYY += p.y * p.y;
  });

  const denom = N * sumXX - sumX * sumX;
  if (denom === 0) return { tailFactor: 1.0, r2: 0 };

  const B = (N * sumXY - sumX * sumY) / denom;
  const A = (sumY - B * sumX) / N;

  const a = Math.exp(A);
  const b = Math.exp(B);

  // R-squared
  const meanY = sumY / N;
  let ssTot = 0;
  let ssRes = 0;
  dataPoints.forEach(p => {
    const predY = A + B * p.x;
    ssTot += Math.pow(p.y - meanY, 2);
    ssRes += Math.pow(p.y - predY, 2);
  });
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // If b >= 1, the curve does not decay (diverges). We fail-safe to 1.0
  if (b >= 1.0) {
    return { tailFactor: 1.0, r2 };
  }

  // Sum link factors to infinity starting from the last index n
  // Product of (1 + a * b^t) for t = N to 200
  let tailProduct = 1.0;
  const lastIndex = linkFactors.length + 1; // start after last observed factor

  for (let t = lastIndex; t <= lastIndex + 200; t++) {
    const factor = 1.0 + a * Math.pow(b, t);
    tailProduct *= factor;
  }

  return {
    tailFactor: parseFloat(tailProduct.toFixed(4)),
    r2,
  };
}

/**
 * Executes Chain-Ladder and Bornhuetter-Ferguson reserving calculations
 */
export function estimateReserves(
  triangle: Triangle,
  selectedFactors: number[], // Size [n-1]
  tailFactor: number,
  earnedPremiums: Record<string, number>, // AY -> Premium
  expectedLossRatio: number // parameter (e.g. 0.65 for LOB)
): {
  chainLadder: ReservingResult[];
  bf: ReservingResult[];
  summary: {
    totalPaidToDate: number;
    clTotalUltimate: number;
    clTotalReserve: number;
    bfTotalUltimate: number;
    bfTotalReserve: number;
  };
} {
  const n = triangle.originPeriods.length;
  const clResults: ReservingResult[] = [];
  const bfResults: ReservingResult[] = [];

  // Calculate Cumulative Development Factors (CDFs)
  // CDF_k = product of link factors from k to n-1 * tailFactor
  const cdfs = Array(n).fill(1.0);
  for (let k = 0; k < n; k++) {
    let cdf = tailFactor;
    for (let j = k; j < n - 1; j++) {
      cdf *= selectedFactors[j];
    }
    cdfs[k] = cdf;
  }

  let totalPaidToDate = 0;
  let clTotalUltimate = 0;
  let clTotalReserve = 0;
  let bfTotalUltimate = 0;
  let bfTotalReserve = 0;

  for (let i = 0; i < n; i++) {
    const ay = triangle.originPeriods[i];
    // Cumulative claims observed as of valuation (last valid diagonal item for origin i is index n - i - 1)
    const latestObservedIdx = n - i - 1;
    const observedClaims = triangle.values[i][latestObservedIdx] || 0;
    const cdf = cdfs[latestObservedIdx];

    // Chain-Ladder Calculation
    const clUltimate = observedClaims * cdf;
    const clReserve = clUltimate - observedClaims;

    clResults.push({
      originPeriod: ay,
      cumulativeClaims: observedClaims,
      linkRatioSelected: selectedFactors[latestObservedIdx] || 1.0,
      cdfToUltimate: cdf,
      ultimateClaims: clUltimate,
      outstandingReserve: clReserve,
    });

    // BF Reserving Calculation
    // Expected Loss = Earned Premium * ELR
    const premium = earnedPremiums[ay] || 0;
    const expectedLoss = premium * expectedLossRatio;
    
    // Unpaid percentage p = 1 - (1 / CDF)
    const percentUnpaid = cdf > 0 ? 1.0 - 1.0 / cdf : 0.0;
    const bfReserve = expectedLoss * percentUnpaid;
    const bfUltimate = observedClaims + bfReserve;

    bfResults.push({
      originPeriod: ay,
      cumulativeClaims: observedClaims,
      linkRatioSelected: selectedFactors[latestObservedIdx] || 1.0,
      cdfToUltimate: cdf,
      ultimateClaims: bfUltimate,
      outstandingReserve: bfReserve,
    });

    totalPaidToDate += observedClaims;
    clTotalUltimate += clUltimate;
    clTotalReserve += clReserve;
    bfTotalUltimate += bfUltimate;
    bfTotalReserve += bfReserve;
  }

  return {
    chainLadder: clResults,
    bf: bfResults,
    summary: {
      totalPaidToDate,
      clTotalUltimate,
      clTotalReserve,
      bfTotalUltimate,
      bfTotalReserve,
    },
  };
}

/**
 * Validates the stability of the triangle and link ratios
 */
export function checkDiagnostics(
  triangle: Triangle,
  linkRatios: LinkRatios,
  selectedFactors: number[]
): {
  erraticFactors: number[]; // columns with CV > threshold
  thinCells: Array<{ row: number; col: number }>; // cells with low values
  nonConvergingTail: boolean;
} {
  const n = triangle.originPeriods.length;
  const erraticFactors: number[] = [];
  const thinCells: Array<{ row: number; col: number }> = [];

  // 1. Check for erratic development columns (Coefficient of Variation of link ratios)
  for (let j = 0; j < n - 1; j++) {
    const colRatios: number[] = [];
    for (let i = 0; i < n - j - 1; i++) {
      const val = linkRatios.ratios[i][j];
      if (!isNaN(val) && isFinite(val)) colRatios.push(val);
    }

    if (colRatios.length > 2) {
      const mean = colRatios.reduce((a, b) => a + b, 0) / colRatios.length;
      const variance = colRatios.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (colRatios.length - 1);
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
      
      if (cv > 0.08) { // standard CV threshold of 8% represents volatility in link ratios
        erraticFactors.push(j + 1);
      }
    }
  }

  // 2. Check for thin cells (e.g. cumulative amounts < 5000 or negative incremental changes)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      const cumVal = triangle.values[i][j];
      const incVal = triangle.incrementalValues[i][j];
      
      if (cumVal > 0 && cumVal < 5000) {
        thinCells.push({ row: i, col: j });
      }
      if (incVal < 0) {
        // Negative incremental values represent potential subrogation/refunds, which cause triangle instability
        thinCells.push({ row: i, col: j });
      }
    }
  }

  // 3. Tail convergence check: if the last selected link factor is still significant (> 1.02)
  const lastSelectedFactor = selectedFactors[selectedFactors.length - 1] || 1.0;
  const nonConvergingTail = lastSelectedFactor > 1.015; // > 1.5% development at tail end

  return {
    erraticFactors,
    thinCells,
    nonConvergingTail,
  };
}
