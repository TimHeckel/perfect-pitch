import { CHORD_DEFINITIONS, CHORDS_TONE, FIRST_BLACK_INDEX } from './data';
import { AudioFileInfo } from './types';
import { randomElem, getCurrentTimestamp } from './utils';
import {
    STATE, getCurrentProfile, getCurrentTargetNumber,
    getCurrentSessionHistory, saveState, saveSessionHistory,
    newStats, isRecent
} from './state';
import { getCurrentCoefficients, updateStartTimeIfNeeded, updateStats, normalizeStatsObject } from './stats';
import {
    getCanonicalChordAudio, audioFileElem,
    playChordFiles, preloadAudio, stopChordFiles,
} from './audio';
import { populateFlags, updateStatsDisplay, resetCatEmoji, setCatEmoji, setChordDisplayMode, populateProfileUiElements } from './ui';
import { canAdvanceProfile, getMasteryStatus, getNextChord, MASTERY_TRAILS_REQUIRED } from './progression';

let _COLORS: string[] | null = null;
let _CHORDS_ON = false;
export let _CORRECT_COLOR: string | null = null;
let _SELECTED_ELEM: HTMLElement | null = null;
let _CORRECT_ELEM: HTMLElement | null = null;
interface CurrentAudio {
    element: HTMLAudioElement;
    duration: number;
    color: string;
    filename: string;
}

let _CURRENT_AUDIO: CurrentAudio | null = null;
let _AUDIO_PLAYED = false;
let _EMOJI_LOCK = false;
let _CURRENT_COEFFICIENTS: number[] | null = null;
let _TRAINER_PRELOADED = false;
let _PERSIST_REACTION_FACE_ENABLED = false;
let _LESSON_PRELOAD_TIMER: number | null = null;
let _AUTO_CONTINUE_TIMER: number | null = null;
let _AUTO_NEXT_TIMER: number | null = null;
let _QUESTION_STARTED_AT: number | null = null;
let _QUESTION_CLOCK_TIMER: number | null = null;
let _TRAIL_NUMBER = 1;
let _INTRODUCTION_COLOR: string | null = null;
const QUESTION_TIME_LIMIT_SECONDS = 10;
export function getTestDeterministicColor(): string | null {
    return (window as unknown as Record<string, unknown>).__bsharp_test_deterministic_color as string | null ?? null;
}

export function getSelectedColors(): string[] {
    const chordIdx = Object.keys(CHORDS_TONE).findIndex(x => x === STATE.current_chord);
    if (_COLORS === null) {
        _COLORS = Object.keys(CHORDS_TONE).slice(0, chordIdx + 1);
    }
    return _COLORS;
}

export function isBlackLevel(level?: number): boolean {
    if (level === undefined) {
        level = getSelectedColors().length;
    }
    return level > FIRST_BLACK_INDEX;
}

export function chordsOn(): boolean {
    return _CHORDS_ON;
}

function setPlayedAfter(delay: number): void {
    setTimeout(() => { _AUDIO_PLAYED = true; }, delay);
}

function onAudioEnded(): void {
    _AUDIO_PLAYED = true;
    setAudioStatus('Now choose the color');
}

function setAudioStatus(message: string, isError = false): void {
    const status = document.getElementById('audio-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
}

function renderQuestionClock(): void {
    const elapsed = _QUESTION_STARTED_AT === null
        ? 0
        : Math.min(
            QUESTION_TIME_LIMIT_SECONDS,
            Math.max(0, Math.floor((Date.now() - _QUESTION_STARTED_AT) / 1000)),
        );
    const minutes = Math.floor(elapsed / 60);
    const seconds = String(elapsed % 60).padStart(2, '0');
    const elapsedElem = document.getElementById('practice-elapsed');
    if (elapsedElem) elapsedElem.textContent = `${minutes}:${seconds}`;

    const checkpoint = document.getElementById('checkpoint-label');
    if (checkpoint && !getCurrentProfile().stats.done) checkpoint.textContent = `Trail ${_TRAIL_NUMBER}`;

    if (elapsed >= QUESTION_TIME_LIMIT_SECONDS && _QUESTION_CLOCK_TIMER !== null) {
        window.clearInterval(_QUESTION_CLOCK_TIMER);
        _QUESTION_CLOCK_TIMER = null;
    }
}

function startQuestionClock(): void {
    if (_QUESTION_STARTED_AT !== null) return;
    _QUESTION_STARTED_AT = Date.now();
    renderQuestionClock();
    _QUESTION_CLOCK_TIMER = window.setInterval(renderQuestionClock, 250);
}

function stopQuestionClock(): void {
    if (_QUESTION_CLOCK_TIMER !== null) window.clearInterval(_QUESTION_CLOCK_TIMER);
    _QUESTION_CLOCK_TIMER = null;
    renderQuestionClock();
}

function resetQuestionClock(): void {
    if (_QUESTION_CLOCK_TIMER !== null) window.clearInterval(_QUESTION_CLOCK_TIMER);
    _QUESTION_CLOCK_TIMER = null;
    _QUESTION_STARTED_AT = null;
    renderQuestionClock();
}

function cancelLessonPreload(): void {
    if (_LESSON_PRELOAD_TIMER !== null) {
        window.clearTimeout(_LESSON_PRELOAD_TIMER);
        _LESSON_PRELOAD_TIMER = null;
    }
}

function warmLessonAudio(): void {
    if (_LESSON_PRELOAD_TIMER !== null) return;
    _LESSON_PRELOAD_TIMER = window.setTimeout(() => {
        for (const color of getSelectedColors()) {
            preloadAudio(getCurrentProfile().current_instrument, color, onAudioEnded);
        }
        _LESSON_PRELOAD_TIMER = null;
    }, 1000);
}

export function stopCurrentAudio(): void {
    if (_CURRENT_AUDIO) {
        const chord = _CURRENT_AUDIO.element;
        chord.pause();
        chord.currentTime = 0;
    }
    stopChordFiles();
}


function _getWeights(): number[] | undefined {
    if (getCurrentProfile().chord_selection_mode !== 'adaptive') {
        return undefined;
    }
    if (_CURRENT_COEFFICIENTS !== null) {
        return _CURRENT_COEFFICIENTS;
    }
    _CURRENT_COEFFICIENTS = getCurrentCoefficients();
    return _CURRENT_COEFFICIENTS;
}

export function selectNewColor(): void {
    const weights = _getWeights();
    _CORRECT_COLOR = getTestDeterministicColor() ?? randomElem(getSelectedColors(), weights);
    if (_SELECTED_ELEM !== null) {
        _SELECTED_ELEM.classList.remove('flag-correct');
        _SELECTED_ELEM.classList.remove('flag-incorrect');
        _SELECTED_ELEM.classList.remove('flag-selected');
        _SELECTED_ELEM = null;
    }
    if (_CORRECT_ELEM !== null) {
        _CORRECT_ELEM.classList.remove('flag-correct');
        _CORRECT_ELEM.classList.remove('flag-incorrect');
        _CORRECT_ELEM = null;
    }
}

export function populateAudio(): void {
    resetQuestionClock();
    selectNewColor();
    stopCurrentAudio();

    const newAudioFile = getCanonicalChordAudio(
        getCurrentProfile().current_instrument,
        _CORRECT_COLOR!,
    );
    _CURRENT_AUDIO = null;
    // Bind correctness to the validated asset that will actually play. This
    // keeps the marked answer and the heard sound atomic across every route.
    _CORRECT_COLOR = newAudioFile.color;
    const afElem = audioFileElem(newAudioFile, onAudioEnded);
    _CURRENT_AUDIO = {
        element: afElem,
        duration: afElem.duration,
        color: newAudioFile.color,
        filename: newAudioFile.filename,
    };

    const playButton = document.getElementById('play-button');
    if (playButton) {
        if (_CURRENT_AUDIO) {
            playButton.dataset.audioColor = _CURRENT_AUDIO.color;
            playButton.dataset.audioFile = _CURRENT_AUDIO.filename;
        } else {
            delete playButton.dataset.audioColor;
            delete playButton.dataset.audioFile;
        }
        playButton.classList.remove('deactivated');
        playButton.classList.add('ready-action');
    }
    _AUDIO_PLAYED = false;
    setAudioStatus('Ready to play');
    renderQuestionClock();
}

export function playAudio(): void {
    const playButton = document.getElementById('play-button');
    if (playButton && playButton.classList.contains('deactivated')) return;
    if (!_CURRENT_AUDIO) return;
    if (showPendingColorIntroduction()) return;

    startQuestionClock();
    playButton?.classList.remove('ready-action');
    const { element: chord, duration } = _CURRENT_AUDIO;
    stopCurrentAudio();
    const safeDuration = isNaN(duration) ? 0.8 : duration;
    setPlayedAfter(safeDuration * 0.8);
    setAudioStatus('Loading sound…');
    const playResult = chord.play();
    if (playResult) {
        void playResult.then(() => {
            setAudioStatus('Playing chord');
            warmLessonAudio();
        }).catch((error: unknown) => {
            console.warn('Audio playback was blocked', error);
            setAudioStatus('Sound was blocked — check volume and tap play again', true);
        });
    } else {
        setAudioStatus('Playing chord');
        warmLessonAudio();
    }
}

export function selectFlagWrapper(wrapperElem: HTMLElement): void {
    if (_SELECTED_ELEM !== null) return;
    if (!_AUDIO_PLAYED) {
        const playButton = document.getElementById('play-button');
        if (playButton?.classList.contains('ready-action')) {
            const dialog = document.getElementById('play-first-dialog') as HTMLDialogElement | null;
            if (dialog && !dialog.open) dialog.showModal();
        }
        return;
    }
    if (getCurrentProfile().stats.identifications >= getCurrentTargetNumber()) return;

    const chosenColor = wrapperElem.dataset.color;
    const correctColor = _CURRENT_AUDIO?.color ?? _CORRECT_COLOR;
    const elem = wrapperElem.querySelector(':scope > .flag') as HTMLElement | null;
    if (!chosenColor || !correctColor || !elem) return;
    stopQuestionClock();

    const flagHolder = document.getElementById('flag-holder')!;

    _EMOJI_LOCK = true;
    updateStartTimeIfNeeded();
    updateStats(correctColor, chosenColor);
    _CURRENT_COEFFICIENTS = null;
    updateStatsDisplay();
    const reachedTarget = getCurrentProfile().stats.identifications >= getCurrentTargetNumber();

    const isCorrect = chosenColor === correctColor;
    elem.classList.add('flag-selected');
    if (isCorrect) {
        elem.classList.add('flag-correct');
        setCatEmoji(6);
    } else {
        elem.classList.add('flag-incorrect');
        _CORRECT_ELEM = flagHolder.querySelector(`div[data-color="${correctColor}"]>div.flag`)!;
        if (_CORRECT_ELEM) _CORRECT_ELEM.classList.add('flag-correct');
        setCatEmoji(5);
    }
    _SELECTED_ELEM = elem;
    if (reachedTarget) {
        getCurrentProfile().stats.done = true;
        saveSessionHistory();
        saveState();
        setAudioStatus('Trail complete');
        _AUTO_CONTINUE_TIMER = window.setTimeout(() => {
            _AUTO_CONTINUE_TIMER = null;
            _TRAIL_NUMBER += 1;
            resetStats(true, true);
            playAudio();
        }, 1400);
    }

    if (getCurrentProfile().persist_reaction_face &&
        getCurrentProfile().stats.identifications < getCurrentTargetNumber()) {
        _PERSIST_REACTION_FACE_ENABLED = true;
    } else {
        setTimeout(() => {
            _EMOJI_LOCK = false;
            resetCatEmoji();
        }, 1500);
    }

    if (_CHORDS_ON && getCurrentProfile().reveal_chord_mode === 'after_guess') {
        const theoryElem = isCorrect ? elem : _CORRECT_ELEM;
        theoryElem?.classList.add('theory-reveal');
    }

    // Single note trainer disabled for now
    const nextButton = document.getElementById('next-chord');
    if (nextButton) {
        nextButton.classList.toggle('deactivated', reachedTarget);
        nextButton.classList.toggle('ready-action', !reachedTarget && !isCorrect);
    }
    if (isCorrect && !reachedTarget) {
        _AUTO_NEXT_TIMER = window.setTimeout(() => {
            _AUTO_NEXT_TIMER = null;
            nextAudio();
        }, 950);
    }
}

export function playFirstAudio(): void {
    const dialog = document.getElementById('play-first-dialog') as HTMLDialogElement | null;
    dialog?.close();
    playAudio();
}

export function nextAudio(): void {
    if (_AUTO_NEXT_TIMER !== null) {
        window.clearTimeout(_AUTO_NEXT_TIMER);
        _AUTO_NEXT_TIMER = null;
    }
    const nextButton = document.getElementById('next-chord');
    if (!nextButton || nextButton.classList.contains('deactivated')) return;

    nextButton.classList.remove('ready-action');

    if (_CHORDS_ON && getCurrentProfile().reveal_chord_mode === 'after_guess') {
        for (const flag of document.querySelectorAll('#flag-holder .theory-reveal')) {
            flag.classList.remove('theory-reveal');
        }
    }

    populateAudio();
    playAudio();
    nextButton.classList.add('deactivated');
}

export function resetStats(done = true, continuePractice = false): void {
    if (_AUTO_NEXT_TIMER !== null) {
        window.clearTimeout(_AUTO_NEXT_TIMER);
        _AUTO_NEXT_TIMER = null;
    }
    if (_AUTO_CONTINUE_TIMER !== null) {
        window.clearTimeout(_AUTO_CONTINUE_TIMER);
        _AUTO_CONTINUE_TIMER = null;
    }
    resetQuestionClock();
    if (!continuePractice) _TRAIL_NUMBER = 1;
    const profile = getCurrentProfile();
    profile.stats.done = done;
    if (!done || profile.stats.identifications > 0) {
        saveSessionHistory();
    }
    const now = getCurrentTimestamp();
    const activeColors = getSelectedColors();
    if (done && canAdvanceProfile(profile, getCurrentSessionHistory(), activeColors)) {
        const nextChord = getNextChord(profile.current_chord);
        if (nextChord) {
            profile.current_chord = nextChord;
            profile.level_started_at = now;
            STATE.current_chord = nextChord;
            _COLORS = null;
            _CHORDS_ON = (profile.show_chord_mode === 'always'
                || (isBlackLevel() && profile.show_chord_mode === 'black_only'));
        }
    }
    if (_PERSIST_REACTION_FACE_ENABLED && done) {
        resetCatEmoji();
        _PERSIST_REACTION_FACE_ENABLED = false;
        _EMOJI_LOCK = false;
    }
    profile.stats = newStats();
    _CURRENT_COEFFICIENTS = null;
    saveState();
    updateStatsDisplay();
    renderLevel();
    populateFlags(getSelectedColors, chordsOn);
    populateAudio();
}

function retrieveSavedStats(): void {
    const currentHistory = getCurrentSessionHistory();
    if (currentHistory !== undefined && currentHistory.length > 0) {
        const lastSession = currentHistory[currentHistory.length - 1];
        if (!lastSession.done) {
            getCurrentProfile().stats = currentHistory.pop()!;
            if (!isRecent(lastSession.updated_time)) {
                resetStats(true);
            }
        }
    }
    updateStatsDisplay();
}

export function changeSelector(to?: string): void {
    const currentProfile = getCurrentProfile();
    const requestedChord = to ?? currentProfile.current_chord;
    if (!(requestedChord in CHORDS_TONE)) return;

    if (STATE.current_chord !== requestedChord) {
        resetStats(false);
        STATE.current_chord = requestedChord;
        currentProfile.current_chord = requestedChord;
        currentProfile.stats.current_chord = currentProfile.current_chord;
        retrieveSavedStats();
    }

    _COLORS = null;
    _CHORDS_ON = (currentProfile.show_chord_mode === 'always'
        || (isBlackLevel() && currentProfile.show_chord_mode === 'black_only'));

    populateFlags(getSelectedColors, chordsOn);
    renderLevel();
    populateAudio();
    saveState();

    // Prioritize the selected question at startup. The remaining samples warm
    // after playback begins so piano files do not compete for bandwidth.
    cancelLessonPreload();
}

function renderLevel(): void {
    const trailName = document.getElementById('trail-level-name');
    const trailDetail = document.getElementById('trail-level-detail');
    const colorCount = getSelectedColors().length;
    if (trailName) {
        trailName.textContent = `${colorCount}-color trail`;
    }
    if (trailDetail) {
        const profile = getCurrentProfile();
        const isFinalLevel = getNextChord(profile.current_chord) === null;
        if (isFinalLevel) {
            trailDetail.textContent = 'Open-ended practice · adaptive mix';
        } else {
            const mastery = getMasteryStatus(profile, getCurrentSessionHistory(), getSelectedColors());
            const accuracy = Math.round(mastery.accuracy * 100);
            if (mastery.completedTrails < MASTERY_TRAILS_REQUIRED) {
                trailDetail.textContent = `${mastery.completedTrails} of ${MASTERY_TRAILS_REQUIRED} mastery trails · adaptive mix`;
            } else if (!mastery.allColorsMastered) {
                trailDetail.textContent = `Strengthening weak colors · ${accuracy}% recent`;
            } else {
                trailDetail.textContent = `Building mastery · ${accuracy}% recent`;
            }
        }
    }
}

function showPendingColorIntroduction(): boolean {
    const profile = getCurrentProfile();
    const pendingColors = getSelectedColors().filter(
        (color) => !profile.introduced_chords.includes(color),
    );
    const pendingColor = pendingColors[0];
    if (!pendingColor) return false;

    _INTRODUCTION_COLOR = pendingColor;
    const definition = CHORD_DEFINITIONS.find(({ name }) => name === pendingColor);
    const display = definition?.display ?? pendingColor;
    const dialog = document.getElementById('color-introduction-dialog') as HTMLDialogElement | null;
    const title = document.getElementById('color-introduction-title');
    const marker = document.getElementById('color-introduction-marker');
    const hearButton = document.getElementById('hear-new-color');
    const startButton = document.getElementById('start-new-color-trail') as HTMLButtonElement | null;
    const status = document.getElementById('color-introduction-status');

    if (title) title.textContent = `Meet ${display.toLowerCase()}`;
    if (marker) marker.className = `color-introduction-marker ${pendingColor}`;
    hearButton?.setAttribute('aria-label', `Hear the ${display.toLowerCase()} trail sound`);
    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = pendingColors.length > 1 ? 'Next color' : 'Start trail';
    }
    if (status) status.textContent = 'Tap the color to hear its sound.';
    if (dialog && !dialog.open) dialog.showModal();
    return true;
}

export function hearIntroducedColor(): void {
    if (!_INTRODUCTION_COLOR) return;
    playChord(_INTRODUCTION_COLOR);
    const marker = document.getElementById('color-introduction-marker');
    marker?.classList.remove('flag-bounce');
    if (marker) void marker.offsetWidth;
    marker?.classList.add('flag-bounce', 'heard');
    const startButton = document.getElementById('start-new-color-trail') as HTMLButtonElement | null;
    if (startButton) startButton.disabled = false;
    const status = document.getElementById('color-introduction-status');
    if (status) status.textContent = 'That sound now joins the trail.';
}

export function completeColorIntroduction(): void {
    if (!_INTRODUCTION_COLOR) return;
    const profile = getCurrentProfile();
    if (!profile.introduced_chords.includes(_INTRODUCTION_COLOR)) {
        profile.introduced_chords.push(_INTRODUCTION_COLOR);
        saveState();
    }
    _INTRODUCTION_COLOR = null;
    if (showPendingColorIntroduction()) return;
    (document.getElementById('color-introduction-dialog') as HTMLDialogElement | null)?.close();
    playAudio();
}

export function changeInstrumentSelector(to?: string): void {
    const currentProfile = getCurrentProfile();
    const requestedInstrument = to ?? currentProfile.current_instrument;
    const instrument = requestedInstrument === 'guitar' ? 'guitar' : 'piano_1';

    for (const button of document.querySelectorAll<HTMLButtonElement>('.sound-choice')) {
        const isActive = button.dataset.instrument === instrument;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    }

    if (currentProfile.current_instrument !== instrument) {
        cancelLessonPreload();
        stopCurrentAudio();
        currentProfile.current_instrument = instrument;
        populateAudio();
        saveState();
    }
}

export function onTrainerOpen(): void {
    if (!_TRAINER_PRELOADED) {
        const currentInstrument = getCurrentProfile().current_instrument;
        for (const color of Object.keys(CHORDS_TONE)) {
            preloadAudio(currentInstrument, color, onAudioEnded);
        }
        _TRAINER_PRELOADED = true;
    }
}

export function playChord(color: string): void {
    playChordFiles(getCurrentProfile().current_instrument, color, onAudioEnded);
}

export function getEmojiLock(): boolean {
    return _EMOJI_LOCK;
}
