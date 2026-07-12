import { describe, expect, it } from 'vitest';
import {
    canAdvanceProfile,
    getMasteryStatus,
    getNextChord,
    MASTERY_TRAILS_REQUIRED,
} from '../../src/ts/progression';
import type { Profile, SessionStats } from '../../src/ts/types';

function profile(overrides: Partial<Profile> = {}): Profile {
    return {
        current_chord: 'yellow',
        level_started_at: 1_000,
        target_number: 10,
        introduced_chords: ['red', 'yellow'],
        stats: session(10, 10),
        ...overrides,
    } as Profile;
}

function session(
    correct = 10,
    identifications = 10,
    confusionMatrix: Record<string, Record<string, number>> = {
        red: { red: 5 },
        yellow: { yellow: 5 },
    },
): SessionStats {
    return {
        current_chord: 'yellow',
        start_time: 1_000,
        updated_time: 1_000,
        correct,
        identifications,
        confusion_matrix: confusionMatrix,
        notes: { correct: 0, identifications: 0, confusion_matrix: {} },
        done: true,
    };
}

describe('adaptive progression', () => {
    it('follows the published fixed chord order', () => {
        expect(getNextChord('yellow')).toBe('blue');
        expect(getNextChord('brown')).toBe('gray');
        expect(getNextChord('skyblue')).toBeNull();
    });

    it('adds a color after three consistently mastered trails without a calendar gate', () => {
        const student = profile();
        const history = Array.from({ length: MASTERY_TRAILS_REQUIRED }, () => session());
        expect(canAdvanceProfile(student, history, ['red', 'yellow'])).toBe(true);
    });

    it('does not promote from a lucky trail or weak aggregate performance', () => {
        const student = profile();
        expect(canAdvanceProfile(student, [session()], ['red', 'yellow'])).toBe(false);
        expect(canAdvanceProfile(student, [session(8), session(9), session(9)], ['red', 'yellow'])).toBe(false);
    });

    it('requires mastery and coverage for every active color', () => {
        const student = profile();
        const weakYellow = session(9, 10, {
            red: { red: 8 },
            yellow: { yellow: 1, red: 1 },
        });
        const status = getMasteryStatus(
            student,
            [weakYellow, weakYellow, weakYellow],
            ['red', 'yellow'],
        );
        expect(status.accuracy).toBe(0.9);
        expect(status.allColorsMastered).toBe(false);
        expect(status.ready).toBe(false);
    });

    it('uses a rolling horizon so old mistakes do not permanently block growth', () => {
        const student = profile();
        const oldWeakTrail = session(5, 10, {
            red: { red: 3, yellow: 2 },
            yellow: { yellow: 2, red: 3 },
        });
        const recovered = [oldWeakTrail, ...Array.from({ length: 8 }, () => session())];
        expect(getMasteryStatus(student, recovered, ['red', 'yellow']).ready).toBe(true);
    });

    it('keeps the final route open-ended', () => {
        const student = profile({ current_chord: 'skyblue' });
        const history = Array.from({ length: 8 }, () => session());
        expect(canAdvanceProfile(student, history, ['red', 'yellow'])).toBe(false);
    });
});
