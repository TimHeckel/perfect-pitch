import { describe, expect, it } from 'vitest';
import { canAdvanceProfile, getLevelDay, getNextChord, LEVEL_WAIT_SECONDS } from '../../src/ts/progression';
import type { Profile } from '../../src/ts/types';

function profile(overrides: Partial<Profile> = {}): Profile {
    return {
        current_chord: 'yellow',
        level_started_at: 1_000,
        target_number: 10,
        stats: {
            current_chord: 'yellow', start_time: 1_000, updated_time: 1_000,
            correct: 10, identifications: 10, confusion_matrix: {},
            notes: { correct: 0, identifications: 0, confusion_matrix: {} }, done: true,
        },
        ...overrides,
    } as Profile;
}

describe('Eguchi progression', () => {
    it('follows the published fixed chord order', () => {
        expect(getNextChord('yellow')).toBe('blue');
        expect(getNextChord('brown')).toBe('gray');
        expect(getNextChord('skyblue')).toBeNull();
    });

    it('waits at least fourteen days', () => {
        const student = profile();
        expect(canAdvanceProfile(student, student.level_started_at + LEVEL_WAIT_SECONDS - 1)).toBe(false);
        expect(canAdvanceProfile(student, student.level_started_at + LEVEL_WAIT_SECONDS)).toBe(true);
    });

    it('requires a perfect completed trail', () => {
        const student = profile();
        student.stats.correct = 9;
        expect(canAdvanceProfile(student, student.level_started_at + LEVEL_WAIT_SECONDS)).toBe(false);
        student.stats.correct = 10;
        student.stats.done = false;
        expect(canAdvanceProfile(student, student.level_started_at + LEVEL_WAIT_SECONDS)).toBe(false);
    });

    it('reports the current day without running past the gate', () => {
        expect(getLevelDay(1_000, 1_000)).toBe(1);
        expect(getLevelDay(1_000, 1_000 + LEVEL_WAIT_SECONDS)).toBe(14);
    });
});
