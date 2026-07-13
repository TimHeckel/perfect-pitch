import { AudioFileInfo, NoteAudioFileInfo } from './types';
import { AUDIO_FILE_LIST, INSTRUMENTS, NOTE_AUDIO_FILE_LIST, getNoteFilePrefix } from './data';
import { randomElem } from './utils';

let AUDIO_FILES: Map<string, Map<string, AudioFileInfo[]>> | null = null;

function getInstrumentIdForPath(path: string): string {
    return INSTRUMENTS.find(instrument => instrument.chordPath === path)?.id || INSTRUMENTS[0].id;
}

export function getAudioFiles(instrument: string): Map<string, AudioFileInfo[]> {
    if (AUDIO_FILES === null) {
        AUDIO_FILES = new Map();

        for (const file of AUDIO_FILE_LIST) {
            const path = file.split('/')[0];
            const instrumentId = getInstrumentIdForPath(path);
            const filename = file.split('/').pop()!;
            const [base] = filename.split('.');
            const parts = base.split('_');
            const chord = parts[0];
            const color = parts[1];
            const ext = filename.split('.').pop()!;

            const audioFile: AudioFileInfo = {
                filename: file,
                instrument: instrumentId,
                color,
                chord,
                ext,
                elem: null,
            };

            if (!AUDIO_FILES.has(instrumentId)) {
                AUDIO_FILES.set(instrumentId, new Map());
            }
            const instrumentFiles = AUDIO_FILES.get(instrumentId)!;
            if (!instrumentFiles.has(color)) {
                instrumentFiles.set(color, []);
            }
            instrumentFiles.get(color)!.push(audioFile);
        }
    }
    return AUDIO_FILES.get(instrument) || AUDIO_FILES.get(INSTRUMENTS[0].id)!;
}

export function audioFileElem(audioFile: AudioFileInfo, onEnded: () => void): HTMLAudioElement {
    if (audioFile.elem === null) {
        audioFile.elem = document.createElement('audio');
        audioFile.elem.classList.add('chord');
        audioFile.elem.controls = false;
        audioFile.elem.preload = 'auto';
        audioFile.elem.src = 'static/chords/' + audioFile.filename;
        audioFile.elem.onended = onEnded;
        audioFile.elem.setAttribute('aria-hidden', 'true');
        getAudioBank().appendChild(audioFile.elem);
        audioFile.elem.load();
    }
    return audioFile.elem;
}

function getAudioBank(): HTMLElement {
    let bank = document.getElementById('audio-bank');
    if (!bank) {
        bank = document.createElement('div');
        bank.id = 'audio-bank';
        bank.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bank);
    }
    return bank;
}

let _currentTrainerAudio: HTMLAudioElement | null = null;

export function stopChordFiles(): void {
    if (!_currentTrainerAudio) return;
    _currentTrainerAudio.pause();
    _currentTrainerAudio.currentTime = 0;
    _currentTrainerAudio = null;
}

export function playChordFiles(instrument: string, color: string, onEnded: () => void): void {
    const audioFiles = getAudioFiles(instrument);
    const files = audioFiles.get(color);
    if (files) {
        stopChordFiles();
        const audioFile = randomElem(files);
        const elem = audioFileElem(audioFile, onEnded);
        _currentTrainerAudio = elem;
        elem.play();
    }
}

export function preloadAudio(instrument: string, color: string, onEnded: () => void): void {
    const audioFiles = getAudioFiles(instrument).get(color);
    if (audioFiles) {
        for (const audioFile of audioFiles) {
            audioFileElem(audioFile, onEnded);
        }
    }
}

// --- Single note audio ---

let NOTE_AUDIO_FILES: Map<string, NoteAudioFileInfo[]> | null = null;

export function getNoteAudioFiles(): Map<string, NoteAudioFileInfo[]> {
    if (NOTE_AUDIO_FILES === null) {
        NOTE_AUDIO_FILES = new Map();

        for (const file of NOTE_AUDIO_FILE_LIST) {
            const filename = file.split('/').pop()!;
            const [base] = filename.split('.');
            const parts = base.split('_');
            const notePrefix = parts[0];
            const ext = filename.split('.').pop()!;

            const noteFile: NoteAudioFileInfo = {
                filename: file,
                notePrefix,
                ext,
                elem: null,
            };

            if (!NOTE_AUDIO_FILES.has(notePrefix)) {
                NOTE_AUDIO_FILES.set(notePrefix, []);
            }
            NOTE_AUDIO_FILES.get(notePrefix)!.push(noteFile);
        }
    }
    return NOTE_AUDIO_FILES;
}

export function noteAudioFileElem(noteFile: NoteAudioFileInfo, onEnded: () => void): HTMLAudioElement {
    if (noteFile.elem === null) {
        noteFile.elem = document.createElement('audio');
        noteFile.elem.classList.add('note');
        noteFile.elem.controls = false;
        noteFile.elem.preload = 'auto';
        noteFile.elem.src = 'static/notes/' + noteFile.filename;
        noteFile.elem.onended = onEnded;
        noteFile.elem.setAttribute('aria-hidden', 'true');
        getAudioBank().appendChild(noteFile.elem);
        noteFile.elem.load();
    }
    return noteFile.elem;
}

export function playNoteFile(note: string, onEnded: () => void): void {
    const prefix = getNoteFilePrefix(note);
    const noteFiles = getNoteAudioFiles().get(prefix);
    if (noteFiles) {
        const noteFile = randomElem(noteFiles);
        noteAudioFileElem(noteFile, onEnded).play();
    }
}
