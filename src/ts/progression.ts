import { CHORD_DEFINITIONS } from './data';
import { Profile, SessionStats } from './types';

export const MASTERY_TRAILS_REQUIRED = 3;
export const MASTERY_HISTORY_TRAILS = 8;
export const MASTERY_OVERALL_ACCURACY = 0.9;
export const MASTERY_TRAIL_ACCURACY = 0.8;
export const MASTERY_COLOR_ACCURACY = 0.8;
export const MASTERY_MIN_COLOR_ATTEMPTS = 3;

export interface MasteryStatus {
    ready: boolean;
    completedTrails: number;
    consistentTrails: number;
    identifications: number;
    minimumIdentifications: number;
    accuracy: number;
    allColorsMastered: boolean;
}

export function getNextChord(currentChord: string): string | null {
    const currentIndex = CHORD_DEFINITIONS.findIndex(({ name }) => name === currentChord);
    if (currentIndex < 0 || currentIndex >= CHORD_DEFINITIONS.length - 1) return null;
    return CHORD_DEFINITIONS[currentIndex + 1].name;
}

function sessionAccuracy(session: SessionStats): number {
    return session.identifications > 0 ? session.correct / session.identifications : 0;
}

export function getMasteryStatus(
    profile: Profile,
    sessionHistory: SessionStats[],
    activeColors: string[],
): MasteryStatus {
    const completed = sessionHistory
        .filter((session) => session.done && session.identifications > 0)
        .slice(-MASTERY_HISTORY_TRAILS);
    const recentForConsistency = completed.slice(-MASTERY_TRAILS_REQUIRED);
    const identifications = completed.reduce((total, session) => total + session.identifications, 0);
    const correct = completed.reduce((total, session) => total + session.correct, 0);
    const accuracy = identifications > 0 ? correct / identifications : 0;
    const minimumIdentifications = Math.max(
        profile.target_number * MASTERY_TRAILS_REQUIRED,
        activeColors.length * MASTERY_MIN_COLOR_ATTEMPTS,
    );

    const colorTallies = Object.fromEntries(
        activeColors.map((color) => [color, { attempts: 0, correct: 0 }]),
    ) as Record<string, { attempts: number; correct: number }>;

    for (const session of completed) {
        for (const color of activeColors) {
            const row = session.confusion_matrix[color] ?? {};
            colorTallies[color].attempts += Object.values(row).reduce((sum, count) => sum + count, 0);
            colorTallies[color].correct += row[color] ?? 0;
        }
    }

    const allColorsMastered = activeColors.every((color) => {
        const tally = colorTallies[color];
        return tally.attempts >= MASTERY_MIN_COLOR_ATTEMPTS
            && tally.correct / tally.attempts >= MASTERY_COLOR_ACCURACY;
    });
    const consistentTrails = recentForConsistency.filter(
        (session) => sessionAccuracy(session) >= MASTERY_TRAIL_ACCURACY,
    ).length;
    const hasConsistentTrails = recentForConsistency.length === MASTERY_TRAILS_REQUIRED
        && consistentTrails === MASTERY_TRAILS_REQUIRED;

    return {
        ready: getNextChord(profile.current_chord) !== null
            && completed.length >= MASTERY_TRAILS_REQUIRED
            && identifications >= minimumIdentifications
            && accuracy >= MASTERY_OVERALL_ACCURACY
            && hasConsistentTrails
            && allColorsMastered,
        completedTrails: completed.length,
        consistentTrails,
        identifications,
        minimumIdentifications,
        accuracy,
        allColorsMastered,
    };
}

export function canAdvanceProfile(
    profile: Profile,
    sessionHistory: SessionStats[],
    activeColors: string[],
): boolean {
    return getMasteryStatus(profile, sessionHistory, activeColors).ready;
}
