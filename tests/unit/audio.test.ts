import { describe, expect, it } from 'vitest';
import {
    getAudioFiles, getCanonicalAudioFile, getCanonicalChordAudio,
} from '../../src/ts/audio';
import { CHORD_DEFINITIONS, INSTRUMENTS } from '../../src/ts/data';

describe('canonical chord audio', () => {
    it('binds every instrument and color bucket to matching assets', () => {
        for (const instrument of INSTRUMENTS) {
            const audioFiles = getAudioFiles(instrument.id);
            for (const definition of CHORD_DEFINITIONS) {
                const files = audioFiles.get(definition.name);
                expect(files, `${instrument.id}:${definition.name}`).toBeDefined();
                expect(files!.every(({ color }) => color === definition.name)).toBe(true);
            }
        }
    });

    it('always chooses the medium piano recording and the sole guitar recording', () => {
        for (const definition of CHORD_DEFINITIONS) {
            expect(getCanonicalAudioFile(getAudioFiles('piano_1').get(definition.name)!)?.filename)
                .toMatch(new RegExp(`_${definition.name}_medium\\.mp3$`));
            expect(getCanonicalAudioFile(getAudioFiles('guitar').get(definition.name)!)?.filename)
                .toMatch(new RegExp(`_${definition.name}\\.mp3$`));
        }
    });

    it('returns an asset whose immutable color matches every requested color', () => {
        for (const instrument of INSTRUMENTS) {
            for (const definition of CHORD_DEFINITIONS) {
                const audioFile = getCanonicalChordAudio(instrument.id, definition.name);
                expect(audioFile.color).toBe(definition.name);
                expect(audioFile.filename).toContain(`_${definition.name}`);
            }
        }
    });
});
