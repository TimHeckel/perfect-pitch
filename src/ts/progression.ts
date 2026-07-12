import { CHORD_DEFINITIONS } from './data';
import { Profile } from './types';

export const LEVEL_WAIT_DAYS = 14;
export const LEVEL_WAIT_SECONDS = LEVEL_WAIT_DAYS * 24 * 60 * 60;

export function getNextChord(currentChord: string): string | null {
    const currentIndex = CHORD_DEFINITIONS.findIndex(({ name }) => name === currentChord);
    if (currentIndex < 0 || currentIndex >= CHORD_DEFINITIONS.length - 1) return null;
    return CHORD_DEFINITIONS[currentIndex + 1].name;
}

export function getLevelDay(levelStartedAt: number, now: number): number {
    const elapsedDays = Math.floor(Math.max(0, now - levelStartedAt) / (24 * 60 * 60));
    return Math.min(LEVEL_WAIT_DAYS, elapsedDays + 1);
}

export function canAdvanceProfile(profile: Profile, now: number): boolean {
    const stats = profile.stats;
    return getNextChord(profile.current_chord) !== null
        && stats.done
        && stats.identifications >= profile.target_number
        && stats.correct === stats.identifications
        && now - profile.level_started_at >= LEVEL_WAIT_SECONDS;
}
