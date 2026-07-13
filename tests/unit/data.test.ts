import { describe, it, expect } from 'vitest';
import {
    CHORD_DEFINITIONS, CHORDS_TONE, FIRST_BLACK_INDEX,
    AUDIO_FILE_LIST, INSTRUMENTS, getNoteFilePrefix, computeAllNotes
} from '../../src/ts/data';
import { readChordDefinitions } from '../../sample-source/audio/chord-definitions';

describe('chord data integrity', () => {
    it('locks the permanent color-to-sound contract', () => {
        expect(CHORD_DEFINITIONS).toEqual([
            { name: 'red', display: 'Red', chord: 'C', notes: ['C4', 'E4', 'G4'] },
            { name: 'yellow', display: 'Yellow', chord: 'F/C', notes: ['C4', 'F4', 'A4'] },
            { name: 'blue', display: 'Blue', chord: 'G/B', notes: ['B3', 'D4', 'G4'] },
            { name: 'black', display: 'Black', chord: 'F/A', notes: ['A3', 'C4', 'F4'] },
            { name: 'green', display: 'Green', chord: 'G/D', notes: ['D4', 'G4', 'B4'] },
            { name: 'orange', display: 'Orange', chord: 'C/E', notes: ['E4', 'G4', 'C5'] },
            { name: 'purple', display: 'Purple', chord: 'F', notes: ['F4', 'A4', 'C5'] },
            { name: 'pink', display: 'Pink', chord: 'G', notes: ['G4', 'B4', 'D5'] },
            { name: 'brown', display: 'Brown', chord: 'C/G', notes: ['G4', 'C5', 'E5'] },
            { name: 'gray', display: 'Gray', chord: 'A', notes: ['A3', 'C#4', 'E4'] },
            { name: 'tan', display: 'Tan', chord: 'D', notes: ['D4', 'F#4', 'A4'] },
            { name: 'lightgreen', display: 'Light Green', chord: 'E', notes: ['E4', 'G#4', 'B4'] },
            { name: 'lightpurple', display: 'Light Purple', chord: 'Bb', notes: ['Bb3', 'D4', 'F4'] },
            { name: 'skyblue', display: 'Sky Blue', chord: 'Eb', notes: ['Eb4', 'G4', 'Bb4'] },
        ]);
    });

    it('keeps the color-to-sound contract immutable at runtime', () => {
        expect(Object.isFrozen(CHORD_DEFINITIONS)).toBe(true);
        expect(Object.isFrozen(CHORD_DEFINITIONS[1])).toBe(true);
        expect(Object.isFrozen(CHORD_DEFINITIONS[1].notes)).toBe(true);
        expect(Object.isFrozen(CHORDS_TONE)).toBe(true);
    });

    it('keeps the audio build pipeline on the same canonical contract', () => {
        expect(readChordDefinitions('src/ts/data.ts')).toEqual(CHORD_DEFINITIONS);
    });

    it('has 14 chord definitions', () => {
        expect(CHORD_DEFINITIONS).toHaveLength(14);
    });

    it('CHORDS_TONE has one entry per chord definition', () => {
        expect(Object.keys(CHORDS_TONE)).toHaveLength(CHORD_DEFINITIONS.length);
    });

    it('every chord has exactly 3 notes', () => {
        for (const chord of CHORD_DEFINITIONS) {
            expect(chord.notes).toHaveLength(3);
        }
    });

    it('FIRST_BLACK_INDEX splits white and black chords correctly', () => {
        expect(CHORD_DEFINITIONS[FIRST_BLACK_INDEX].name).toBe('gray');
        expect(CHORD_DEFINITIONS[FIRST_BLACK_INDEX - 1].name).toBe('brown');
    });
});

describe('audio file data integrity', () => {
    it('defines the available chord instruments in display order', () => {
        expect(INSTRUMENTS).toEqual([
            { id: 'piano_1', display: 'Piano', chordPath: 'piano' },
            { id: 'guitar', display: 'Guitar', chordPath: 'guitar' },
        ]);
    });

    it('has piano and guitar files for each chord', () => {
        for (const chord of CHORD_DEFINITIONS) {
            const pianoMatches = AUDIO_FILE_LIST.filter(f => f.startsWith('piano/') && f.includes(`_${chord.name}_`));
            const guitarMatches = AUDIO_FILE_LIST.filter(f => f.startsWith('guitar/') && f.includes(`_${chord.name}.`));
            expect(pianoMatches).toHaveLength(3);
            expect(guitarMatches).toHaveLength(1);
        }
    });

    it('uses the same yellow and blue note assignments for piano and guitar', () => {
        expect(AUDIO_FILE_LIST.filter((file) => file.includes('_yellow'))).toEqual([
            'piano/cfa_yellow_long.mp3',
            'piano/cfa_yellow_medium.mp3',
            'piano/cfa_yellow_short.mp3',
            'guitar/c4f4a4_yellow.mp3',
        ]);
        expect(AUDIO_FILE_LIST.filter((file) => file.includes('_blue'))).toEqual([
            'piano/hdg_blue_long.mp3',
            'piano/hdg_blue_medium.mp3',
            'piano/hdg_blue_short.mp3',
            'guitar/h3d4g4_blue.mp3',
        ]);
    });

    it('every chord name appears in exactly 4 audio files', () => {
        for (const chord of CHORD_DEFINITIONS) {
            const matches = AUDIO_FILE_LIST.filter(f => f.includes(`_${chord.name}_`) || f.includes(`_${chord.name}.`));
            expect(matches).toHaveLength(4);
        }
    });
});

describe('getNoteFilePrefix', () => {
    it('maps notes using German notation conventions', () => {
        expect(getNoteFilePrefix('Bb3')).toBe('as3');
        expect(getNoteFilePrefix('C#4')).toBe('cs4');
        expect(getNoteFilePrefix('B3')).toBe('h3');
    });
});

describe('computeAllNotes', () => {
    it('generates correct CSS classes for sharps', () => {
        const notes = computeAllNotes();
        const cSharp = notes.find(n => n.noteBase === 'C#4');
        expect(cSharp).toBeDefined();
        expect(cSharp!.noteClass).toBe('note-C-sharp');
        expect(cSharp!.display).toContain('\u266F');
    });

    it('generates correct CSS classes for flats', () => {
        const notes = computeAllNotes();
        const bFlat = notes.find(n => n.noteBase === 'Bb3');
        expect(bFlat).toBeDefined();
        expect(bFlat!.noteClass).toBe('note-B-flat');
        expect(bFlat!.display).toContain('\u266D');
    });
});
