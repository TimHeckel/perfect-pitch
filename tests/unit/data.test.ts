import { describe, it, expect } from 'vitest';
import {
    CHORD_DEFINITIONS, CHORDS_TONE, FIRST_BLACK_INDEX,
    AUDIO_FILE_LIST, INSTRUMENTS, getNoteFilePrefix, computeAllNotes
} from '../../src/ts/data';

describe('chord data integrity', () => {
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
            { id: 'guitar-strummed', display: 'Guitar (Strummed)', chordPath: 'guitar-strummed' },
        ]);
    });

    it('has piano, guitar, and strummed guitar files for each chord', () => {
        for (const chord of CHORD_DEFINITIONS) {
            const pianoMatches = AUDIO_FILE_LIST.filter(f => f.startsWith('piano/') && f.includes(`_${chord.name}_`));
            const guitarMatches = AUDIO_FILE_LIST.filter(f => f.startsWith('guitar/') && f.includes(`_${chord.name}.`));
            const strummedMatches = AUDIO_FILE_LIST.filter(f => f.startsWith('guitar-strummed/') && f.includes(`_${chord.name}.`));

            expect(pianoMatches).toHaveLength(3);
            expect(guitarMatches).toHaveLength(1);
            expect(strummedMatches).toHaveLength(1);
        }
    });

    it('every chord name appears in exactly 3 audio files', () => {
        for (const chord of CHORD_DEFINITIONS) {
            const matches = AUDIO_FILE_LIST.filter(f => f.includes(`_${chord.name}_`) || f.includes(`_${chord.name}.`));
            expect(matches).toHaveLength(5);
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
