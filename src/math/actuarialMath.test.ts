import { describe, it, expect } from 'vitest';
import { buildTriangles, calculateLinkRatios, estimateReserves, fitTailFactor } from './actuarialMath';
import type { CleanedClaimRecord } from './validationMath';

describe('Actuarial Reserving Calculations Tests', () => {
  // Mock data representing claims transactions
  const mockCleanedRecords: CleanedClaimRecord[] = [
    // Accident Year 2023 claims
    {
      rowIdx: 1,
      claimId: 'C1',
      accidentDate: new Date(2023, 5, 10),
      paymentDate: new Date(2023, 8, 12), // Dev Year 1 (2023)
      paidAmount: 5000,
      incurredAmount: 8000,
      segment: 'Default',
      isClosed: false,
      originalRow: {},
      outlierFlags: { isPaidOutlier: false, isIncurredOutlier: false, method: 'none' }
    },
    {
      rowIdx: 2,
      claimId: 'C1',
      accidentDate: new Date(2023, 5, 10),
      paymentDate: new Date(2024, 6, 15), // Dev Year 2 (2024)
      paidAmount: 3000, // incremental payment of 3000 (total = 8000)
      incurredAmount: 10000, // total incurred = 10000
      segment: 'Default',
      isClosed: false,
      originalRow: {},
      outlierFlags: { isPaidOutlier: false, isIncurredOutlier: false, method: 'none' }
    },
    // Accident Year 2024 claims
    {
      rowIdx: 3,
      claimId: 'C2',
      accidentDate: new Date(2024, 2, 20),
      paymentDate: new Date(2024, 10, 5), // Dev Year 1 (2024)
      paidAmount: 4000,
      incurredAmount: 6000,
      segment: 'Default',
      isClosed: true,
      originalRow: {},
      outlierFlags: { isPaidOutlier: false, isIncurredOutlier: false, method: 'none' }
    }
  ];

  it('should correctly build paid and incurred cumulative triangles', () => {
    const { paidTriangle, incurredTriangle } = buildTriangles(mockCleanedRecords, 'annual');
    
    expect(paidTriangle.originPeriods).toEqual(['2023', '2024']);
    expect(paidTriangle.developmentPeriods).toEqual([1, 2]);

    // Cumulative paid values
    // AY 2023 - Dev Year 1 cumulative = 5000
    // AY 2023 - Dev Year 2 cumulative = 5000 + 3000 = 8000
    expect(paidTriangle.values[0][0]).toBe(5000);
    expect(paidTriangle.values[0][1]).toBe(8000);
    
    // AY 2024 - Dev Year 1 cumulative = 4000
    expect(paidTriangle.values[1][0]).toBe(4000);

    // Cumulative incurred values
    // AY 2023 - Dev Year 1 cumulative incurred = 8000
    // AY 2023 - Dev Year 2 cumulative incurred = 10000
    expect(incurredTriangle.values[0][0]).toBe(8000);
    expect(incurredTriangle.values[0][1]).toBe(10000);
    
    // AY 2024 - Dev Year 1 cumulative incurred = 6000
    expect(incurredTriangle.values[1][0]).toBe(6000);
  });

  it('should correctly calculate age-to-age link ratios and averages', () => {
    // Manually setup a simple 3x3 paid cumulative triangle
    const mockPaidTriangle = {
      originPeriods: ['2022', '2023', '2024'],
      developmentPeriods: [1, 2, 3],
      values: [
        [1000, 1500, 1800], // AY 2022: Dev 1=1000, Dev 2=1500, Dev 3=1800
        [2000, 2600, NaN],  // AY 2023: Dev 1=2000, Dev 2=2600
        [3000, NaN, NaN]    // AY 2024: Dev 1=3000
      ],
      incrementalValues: [
        [1000, 500, 300],
        [2000, 600, 0],
        [3000, 0, 0]
      ]
    };

    const links = calculateLinkRatios(mockPaidTriangle);

    // Individual ratios
    // AY 2022 Dev 1->2 ratio = 1500 / 1000 = 1.5
    expect(links.ratios[0][0]).toBe(1.5);
    // AY 2022 Dev 2->3 ratio = 1800 / 1500 = 1.2
    expect(links.ratios[0][1]).toBe(1.2);
    // AY 2023 Dev 1->2 ratio = 2600 / 2000 = 1.3
    expect(links.ratios[1][0]).toBe(1.3);

    // Volume-Weighted average link ratios
    // Dev 1->2: (1500 + 2600) / (1000 + 2000) = 4100 / 3000 = 1.3667
    expect(links.volumeWeighted[0]).toBeCloseTo(1.3667, 4);
    // Dev 2->3: 1800 / 1500 = 1.2
    expect(links.volumeWeighted[1]).toBeCloseTo(1.2, 4);

    // Simple average link ratios
    // Dev 1->2: (1.5 + 1.3) / 2 = 1.4
    expect(links.simpleAverage[0]).toBe(1.4);
    // Dev 2->3: 1.2
    expect(links.simpleAverage[1]).toBe(1.2);
  });

  it('should correctly fit a tail factor from decaying link ratios', () => {
    // Decaying ratios: index 1=1.45, index 2=1.18, index 3=1.06, index 4=1.02
    const links = [1.45, 1.18, 1.06, 1.02];
    const { tailFactor, r2 } = fitTailFactor(links);
    
    // Decaying pattern should produce a tail factor slightly above 1.0000
    expect(tailFactor).toBeGreaterThanOrEqual(1.0);
    expect(r2).toBeGreaterThan(0.9); // high linear correlation on log scale
  });

  it('should correctly estimate ultimate claims and reserves (Chain-Ladder and BF)', () => {
    // 3x3 paid cumulative triangle
    const mockPaidTriangle = {
      originPeriods: ['2022', '2023', '2024'],
      developmentPeriods: [1, 2, 3],
      values: [
        [1000, 1500, 1800], // AY 2022
        [2000, 3000, NaN],  // AY 2023
        [3000, NaN, NaN]    // AY 2024
      ],
      incrementalValues: []
    };

    // Age-to-age factors: Dev 1->2: 1.5, Dev 2->3: 1.2
    // Tail factor: 1.0
    const selectedFactors = [1.5, 1.2];
    const tailFactor = 1.0;

    // EP and ELR for BF
    const earnedPremiums = {
      '2022': 2500,
      '2023': 4000,
      '2024': 6000
    };
    const expectedLossRatio = 0.6; // 60%

    const reserves = estimateReserves(
      mockPaidTriangle,
      selectedFactors,
      tailFactor,
      earnedPremiums,
      expectedLossRatio
    );

    // Cumulative development factors (CDFs)
    // CDF_3 (dev 3 to ult) = 1.0
    // CDF_2 (dev 2 to ult) = 1.2 * 1.0 = 1.2
    // CDF_1 (dev 1 to ult) = 1.5 * 1.2 * 1.0 = 1.8

    // --- Chain-Ladder Verification ---
    // AY 2022: latest cumulative = 1800, CDF = 1.0. CL Ultimate = 1800, CL Reserve = 0
    expect(reserves.chainLadder[0].ultimateClaims).toBe(1800);
    expect(reserves.chainLadder[0].outstandingReserve).toBe(0);

    // AY 2023: latest cumulative = 3000, CDF = 1.2. CL Ultimate = 3000 * 1.2 = 3600, CL Reserve = 600
    expect(reserves.chainLadder[1].ultimateClaims).toBe(3600);
    expect(reserves.chainLadder[1].outstandingReserve).toBe(600);

    // AY 2024: latest cumulative = 3000, CDF = 1.8. CL Ultimate = 3000 * 1.8 = 5400, CL Reserve = 2400
    expect(reserves.chainLadder[2].ultimateClaims).toBeCloseTo(5400, 2);
    expect(reserves.chainLadder[2].outstandingReserve).toBeCloseTo(2400, 2);

    // --- Bornhuetter-Ferguson Verification ---
    // BF Reserve = Prior expected losses * unpaid% = (EP * ELR) * (1 - 1/CDF)
    
    // AY 2022: EP=2500, Expected Loss = 1500, CDF=1.0, unpaid%=0. BF Reserve = 0. BF Ultimate = 1800
    expect(reserves.bf[0].outstandingReserve).toBe(0);
    expect(reserves.bf[0].ultimateClaims).toBe(1800);

    // AY 2023: EP=4000, Expected Loss = 2400, CDF=1.2, unpaid% = 1 - 1/1.2 = 0.1667
    // BF Reserve = 2400 * 0.1667 = 400. BF Ultimate = 3000 + 400 = 3400
    expect(reserves.bf[1].outstandingReserve).toBeCloseTo(400, 2);
    expect(reserves.bf[1].ultimateClaims).toBeCloseTo(3400, 2);

    // AY 2024: EP=6000, Expected Loss = 3600, CDF=1.8, unpaid% = 1 - 1/1.8 = 0.4444
    // BF Reserve = 3600 * 0.4444 = 1600. BF Ultimate = 3000 + 1600 = 4600
    expect(reserves.bf[2].outstandingReserve).toBeCloseTo(1600, 2);
    expect(reserves.bf[2].ultimateClaims).toBeCloseTo(4600, 2);
  });
});
