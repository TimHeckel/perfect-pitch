import { getSessionHistory, getCurrentProfile } from './state';

let _isFirstIdentification = false;

function checkIsFirstSession(): boolean {
    const history = getSessionHistory();
    const profileHistory = history[String(getCurrentProfile().id)];
    if (!profileHistory) return true;
    for (const sessions of Object.values(profileHistory)) {
        for (const session of sessions) {
            if (session.identifications > 0) return false;
        }
    }
    return true;
}

const STEP_CONFIG: Record<string, { text: string; arrow: boolean }> = {
    play: { text: 'Click the play button to hear the sound', arrow: true },
    guess: { text: 'Guess the color', arrow: false },
    goNext: { text: '', arrow: false },
};

function showOverlay(step: string, textOverride?: string): void {
    if (!getCurrentProfile().enable_onboarding_hints) return;
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    const config = STEP_CONFIG[step];
    if (!config) return;

    overlay.dataset.step = step;
    overlay.innerHTML = '';

    if (config.arrow) {
        const arrow = document.createElement('div');
        arrow.className = 'onboarding-arrow';
        arrow.textContent = '\u2191';
        overlay.appendChild(arrow);
    }

    const text = document.createElement('span');
    text.className = 'onboarding-text';
    text.textContent = textOverride ?? config.text;
    overlay.appendChild(text);

    overlay.classList.add('visible');
}

function hideOverlay(): void {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
}

export function initOnboarding(): void {
    _isFirstIdentification = checkIsFirstSession();
    showOverlay('play');
}

export function resetOnboarding(): void {
    _isFirstIdentification = checkIsFirstSession();
    if (!getCurrentProfile().enable_onboarding_hints) {
        hideOverlay();
    }
}

export function showOnboardingPlayPrompt(): void {
    showOverlay('play');
}

export function dismissOnboardingStep(step: string): void {
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay?.dataset.step === step) {
        hideOverlay();
    }
}

export function showOnboardingGuessPrompt(): void {
    if (_isFirstIdentification) {
        showOverlay('guess');
    }
}

export function showOnboardingGoNextPrompt(isCorrect: boolean): void {
    hideOverlay();
    if (_isFirstIdentification) {
        const text = isCorrect
            ? 'Great job! Click the arrow to continue'
            : 'Click the arrow to try again';
        showOverlay('goNext', text);
        _isFirstIdentification = false;
    }
}
