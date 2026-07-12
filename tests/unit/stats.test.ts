import { describe, it, expect } from 'vitest';
import { calculatePercentage, calculateNeutralLevel, mergeMatrices, calculateCoefficients } from '../../src/ts/stats';

describe('calculatePercentage', () => {
    it('returns 0 when no identifications', () => {
        expect(calculatePercentage(0, 0)).toBe(0);
    });

    it('computes correct percentage', () => {
        expect(calculatePercentage(3, 4)).toBe(75);
        expect(calculatePercentage(1, 2)).toBe(50);
    });
});

describe('calculateNeutralLevel', () => {
    it('clamps to 0 at or below 50%', () => {
        expect(calculateNeutralLevel(50)).toBe(0);
        expect(calculateNeutralLevel(30)).toBe(0);
    });

    it('clamps to 4 at high percentages', () => {
        expect(calculateNeutralLevel(100)).toBe(4);
        expect(calculateNeutralLevel(95)).toBe(4);
    });

    it('maps intermediate percentages to levels', () => {
        expect(calculateNeutralLevel(60)).toBe(1);
        expect(calculateNeutralLevel(70)).toBe(2);
        expect(calculateNeutralLevel(80)).toBe(3);
    });
});

describe('mergeMatrices', () => {
    it('sums values across multiple confusion matrices', () => {
        const cm1: Record<string, Record<string, number>> = {
            red: { red: 5, yellow: 1 },
            yellow: { yellow: 3 },
        };
        const cm2: Record<string, Record<string, number>> = {
            red: { red: 2, yellow: 2 },
            blue: { blue: 4 },
        };

        const merged = mergeMatrices([cm1, cm2], 3);
        expect(merged.red.red).toBe(7);
        expect(merged.red.yellow).toBe(3);
        expect(merged.blue.blue).toBe(4);
    });

    it('returns zero matrix when given no confusion matrices', () => {
        const merged = mergeMatrices([], 3);
        expect(merged.red.red).toBe(0);
        expect(merged.red.yellow).toBe(0);
    });

    it('ignores chords beyond numChords', () => {
        const cm: Record<string, Record<string, number>> = {
            black: { black: 10 },
        };
        const merged = mergeMatrices([cm], 3);
        expect(merged.black).toBeUndefined();
    });
});

// Helper: build a zero confusion matrix for a list of chord names
function zeroMatrix(chords: string[]): Record<string, Record<string, number>> {
    const m: Record<string, Record<string, number>> = {};
    for (const c of chords) {
        m[c] = {};
        for (const d of chords) m[c][d] = 0;
    }
    return m;
}

describe('calculateCoefficients', () => {
    // Perfect player at level 5: gets all 25 identifications correct for each chord.
    // All chords are equally easy → uniform 20% each.
    it('perfect player at level 5 → uniform 20% each', () => {
        const chords = ['red', 'yellow', 'blue', 'black', 'green'];
        const m = zeroMatrix(chords);
        for (const c of chords) m[c][c] = 25;

        const coeffs = calculateCoefficients(m);
        // red: 20%, yellow: 20%, blue: 20%, black: 20%, green: 20%
        for (const c of coeffs) {
            expect(c).toBeCloseTo(0.20, 2);
        }
    });

    // Level 5, but blue is confused with red 60% of the time (12 out of 20).
    // Blue gets boosted to ~32%, red gets a smaller boost to ~18% (mistaken-for weight),
    // others stay at ~17%.
    it('level 5, blue confused with red 60% → blue 32%, red 18%, others 17%', () => {
        const chords = ['red', 'yellow', 'blue', 'black', 'green'];
        const m = zeroMatrix(chords);
        m['red']['red'] = 20;
        m['yellow']['yellow'] = 20;
        m['blue']['blue'] = 8;
        m['blue']['red'] = 12;    // blue played, player said red
        m['black']['black'] = 20;
        m['green']['green'] = 20;

        const coeffs = calculateCoefficients(m);
        // red: 17.9%, yellow: 16.7%, blue: 32.1%, black: 16.7%, green: 16.7%
        expect(coeffs[0]).toBeCloseTo(0.179, 2);  // red (boosted as mistaken-for target)
        expect(coeffs[1]).toBeCloseTo(0.167, 2);  // yellow
        expect(coeffs[2]).toBeCloseTo(0.321, 2);  // blue (struggling chord)
        expect(coeffs[3]).toBeCloseTo(0.167, 2);  // black
        expect(coeffs[4]).toBeCloseTo(0.167, 2);  // green
    });

    // Player just added a 4th chord (black) and has no data on it yet.
    // Black is below the threshold (< 5 identifications) → gets default weight 1/4 = 25%.
    // Other chords are all perfect, so they split the remaining 75% equally.
    it('4th chord just added with no data → all 25% (default for new chord)', () => {
        const chords = ['red', 'yellow', 'blue', 'black'];
        const m = zeroMatrix(chords);
        m['red']['red'] = 20;
        m['yellow']['yellow'] = 20;
        m['blue']['blue'] = 20;
        // black: all zeros — below threshold

        const coeffs = calculateCoefficients(m);
        // red: 25%, yellow: 25%, blue: 25%, black: 25%
        for (const c of coeffs) {
            expect(c).toBeCloseTo(0.25, 2);
        }
    });

    // Level 9 (all 9 white chords). Pink is confused with red, brown with yellow,
    // each getting wrong 75% of the time. The 7 easy chords hit the floor (~9.3%),
    // and pink/brown each get ~17.5%.
    it('level 9, struggling with pink and brown → those get 17.5%, easy chords at floor 9.3%', () => {
        const chords = ['red', 'yellow', 'blue', 'black', 'green', 'orange', 'purple', 'pink', 'brown'];
        const m = zeroMatrix(chords);
        m['red']['red'] = 20;
        m['yellow']['yellow'] = 20;
        m['blue']['blue'] = 20;
        m['black']['black'] = 20;
        m['green']['green'] = 20;
        m['orange']['orange'] = 20;
        m['purple']['purple'] = 20;
        m['pink']['pink'] = 5;
        m['pink']['red'] = 15;     // pink played, player said red
        m['brown']['brown'] = 5;
        m['brown']['yellow'] = 15;  // brown played, player said yellow

        const coeffs = calculateCoefficients(m);
        // Easy chords (red through purple): ~9.3% each (floor = 1/(1.2*9))
        for (let i = 0; i < 7; i++) {
            expect(coeffs[i]).toBeCloseTo(0.093, 2);
        }
        // Struggling chords: ~17.5% each
        expect(coeffs[7]).toBeCloseTo(0.175, 2);  // pink
        expect(coeffs[8]).toBeCloseTo(0.175, 2);  // brown
    });

    // 2 chords, red confused with yellow 40% of the time (8 out of 20).
    // Red gets heavily boosted to ~58%, yellow gets ~42%.
    it('2 chords, red confused with yellow 40% → red 58%, yellow 42%', () => {
        const chords = ['red', 'yellow'];
        const m = zeroMatrix(chords);
        m['red']['red'] = 12;
        m['red']['yellow'] = 8;   // red played, player said yellow
        m['yellow']['yellow'] = 20;

        const coeffs = calculateCoefficients(m);
        // red: 58.3%, yellow: 41.7%
        expect(coeffs[0]).toBeCloseTo(0.583, 2);  // red (struggling)
        expect(coeffs[1]).toBeCloseTo(0.417, 2);  // yellow (mistaken-for target)
    });
});
