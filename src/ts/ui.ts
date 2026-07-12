import { Profile } from './types';
import { CHORDS_TONE } from './data';
import {
    STATE, getCurrentProfile, getCurrentTargetNumber, getSessionHistory,
    saveState, newProfile, GUEST_USER_ID, DEFAULT_TARGET_NUMBER,
    DEFAULT_SHOW_CHORD_MODE, DEFAULT_REVEAL_CHORD_MODE, DEFAULT_CHORD_DISPLAY_MODE,
    DEFAULT_SINGLE_NOTE_MODE, DEFAULT_SINGLE_NOTE_CORRECTNESS_MODE,
    DEFAULT_PERSIST_REACTION_FACE, DEFAULT_ENABLE_ONBOARDING_HINTS, DEFAULT_COLOR_SCHEME,
    DEFAULT_CHORD_SELECTION_MODE, DEFAULT_INSTRUMENT, TRAIL_LENGTH_PRESETS,
} from './state';
import {
    calculatePercentage, calculateNeutralLevel, getCatEmoji, normalizeStatsObject
} from './stats';
import { formatDatetime, getCurrentTimestamp, validInt } from './utils';

let _DOWNLOAD_ENABLED_CLICKS = 0;
let _DOWNLOAD_ENABLED_LAST_CLICK: number | null = null;
let _EASTER_EGG_CLICKS = 0;
let _EASTER_EGG_LAST_CLICK: number | null = null;
let _EASTER_EGG_ENABLED = false;

// Callbacks to break circular dependency with game.ts
let _getEmojiLock: () => boolean = () => false;
let _resetStatsFn: (done?: boolean) => void = () => {};
let _changeSelectorFn: (to?: string) => void = () => {};
let _changeInstrumentSelectorFn: (to?: string) => void = () => {};
let _onTrainerOpenFn: () => void = () => {};

export function registerGameCallbacks(
    getEmojiLock: () => boolean,
    resetStats: (done?: boolean) => void,
    changeSelector: (to?: string) => void,
    changeInstrumentSelector: (to?: string) => void,
    onTrainerOpen: () => void,
): void {
    _getEmojiLock = getEmojiLock;
    _resetStatsFn = resetStats;
    _changeSelectorFn = changeSelector;
    _changeInstrumentSelectorFn = changeInstrumentSelector;
    _onTrainerOpenFn = onTrainerOpen;
}

// --- Emoji ---

export function setCatEmoji(level: number): void {
    const emoji = getCatEmoji(level);
    const elem = document.getElementById('reaction-emoji');
    if (elem) elem.innerHTML = emoji;
}

const NEUTRAL_EMOJI_LEVEL = 2;

export function resetCatEmoji(): void {
    const stats = getCurrentProfile().stats;
    if (stats.identifications === 0) {
        setCatEmoji(NEUTRAL_EMOJI_LEVEL);
        return;
    }
    setCatEmoji(calculateNeutralLevel(calculatePercentage(stats.correct, stats.identifications)));
}

// --- Stats Display ---

function updateStatsContainer(containerElem: HTMLElement, correct: number, identifications: number): void {
    const correctElem = containerElem.querySelector('.stats-correct');
    const totalElem = containerElem.querySelector('.stats-total');
    const percElem = containerElem.querySelector('.stats-percent');

    if (correctElem) correctElem.innerHTML = String(correct);
    if (totalElem) totalElem.innerHTML = String(identifications);

    const percentage = calculatePercentage(correct, identifications);
    if (percElem) {
        percElem.innerHTML = identifications > 0 ? '(' + percentage.toFixed(0) + '%)' : '';
    }
}

export function updateStatsDisplay(): void {
    const containerElem = document.getElementById('stats-container');
    if (!containerElem) return;

    const stats = getCurrentProfile().stats;
    normalizeStatsObject(stats);

    const correct = stats.correct;
    const identifications = stats.identifications;
    const target = getCurrentTargetNumber();
    const statsDisplayElem = document.getElementById('chord-stats-display');
    if (statsDisplayElem) {
        const progressElem = statsDisplayElem.querySelector('.stats-correct');
        const targetElem = statsDisplayElem.querySelector('.stats-total');
        const accuracyElem = statsDisplayElem.querySelector('.stats-percent');
        if (progressElem) progressElem.textContent = String(Math.min(identifications, target));
        if (targetElem) targetElem.textContent = String(target);
        if (accuracyElem) {
            const percentage = calculatePercentage(correct, identifications);
            accuracyElem.textContent = identifications > 0
                ? `${correct} correct · ${percentage.toFixed(0)}%`
                : 'Ready for a short trail';
        }
    }

    const meter = document.getElementById('trail-meter');
    const meterFill = document.getElementById('trail-meter-fill');
    if (meter) {
        meter.setAttribute('aria-valuemax', String(target));
        meter.setAttribute('aria-valuenow', String(Math.min(identifications, target)));
    }
    if (meterFill) {
        meterFill.style.width = `${Math.min(100, (identifications / target) * 100)}%`;
    }

    if (identifications >= target) {
        containerElem.classList.add('done');
    } else {
        containerElem.classList.remove('done');
    }

    const playButton = document.getElementById('play-button');
    playButton?.classList.toggle('deactivated', identifications >= target);
    if (identifications >= target) playButton?.classList.remove('ready-action');

    const checkpointLabel = document.getElementById('checkpoint-label');
    if (checkpointLabel && identifications >= target) checkpointLabel.textContent = 'Trail complete';

    if (correct === identifications) {
        containerElem.classList.add('perfect');
    } else {
        containerElem.classList.remove('perfect');
    }

    // Note stats (hidden for now since single note trainer is disabled)
    const noteStatsElem = document.getElementById('sn-stats-display');
    if (noteStatsElem) {
        const notesCorrect = stats.notes.correct;
        const noteIdentifications = stats.notes.identifications;
        updateStatsContainer(noteStatsElem, notesCorrect, noteIdentifications);
        if (noteIdentifications) {
            noteStatsElem.classList.add('visible');
        } else {
            noteStatsElem.classList.remove('visible');
        }
    }

    if (!_getEmojiLock()) {
        resetCatEmoji();
    }
}

// --- Flag Population ---

export function populateFlags(
    getSelectedColors: () => string[],
    chordsOn: () => boolean
): void {
    const colors = getSelectedColors();
    const baseElem = document.getElementById('flag-holder');
    if (!baseElem) return;

    for (const wrapperElem of baseElem.querySelectorAll('.flag-wrapper') as NodeListOf<HTMLElement>) {
        if (colors.includes(wrapperElem.dataset.color!)) {
            wrapperElem.classList.add('visible');
        } else {
            wrapperElem.classList.remove('visible');
        }
    }

    if (colors.length > 9) {
        baseElem.classList.add('flags-compact');
    } else {
        baseElem.classList.remove('flags-compact');
    }

    if (colors.length < 4) {
        baseElem.classList.add('flags-expanded');
    } else {
        baseElem.classList.remove('flags-expanded');
    }

    if (chordsOn() && getCurrentProfile().reveal_chord_mode === 'always') {
        baseElem.classList.add('chord-notes');
    } else {
        baseElem.classList.remove('chord-notes');
    }
}

// --- Chord Display Mode ---

export function setChordDisplayMode(chordMode: string): void {
    let useShapes = true;
    let useLetters = true;
    if (chordMode === 'shapes_only') {
        useLetters = false;
    } else if (chordMode === 'letters_only') {
        useShapes = false;
    }

    const noteHolders = [
        document.getElementById('flag-holder'),
        document.getElementById('single-note-selector-container'),
    ];

    for (const holderElem of noteHolders) {
        if (!holderElem) continue;
        if (useShapes) {
            holderElem.classList.add('use-shapes');
        } else {
            holderElem.classList.remove('use-shapes');
        }
        if (useLetters) {
            holderElem.classList.add('use-letters');
        } else {
            holderElem.classList.remove('use-letters');
        }
    }
}

// --- Panel Toggle System ---

let _CURRENT_PANEL: HTMLElement | null = null;

const PANEL_TRIGGER_MAP: Record<string, string> = {
    'i-infobox': 'i-infobox-trigger',
    'trainer-infobox': 'trainer-infobox-trigger',
    'stats-history-container': 'stats-history-trigger',
    'profile-info-container': 'profile-infobox-trigger',
};

function setActiveTrigger(panelElem: HTMLElement | null): void {
    // Clear all active states
    const homeButton = document.getElementById('home-button');
    if (homeButton) homeButton.classList.remove('active');
    for (const triggerId of Object.values(PANEL_TRIGGER_MAP)) {
        const triggerElem = document.getElementById(triggerId);
        if (triggerElem) triggerElem.parentElement?.classList.remove('active');
    }

    if (panelElem === null) {
        // Home is active
        if (homeButton) homeButton.classList.add('active');
    } else {
        const triggerId = PANEL_TRIGGER_MAP[panelElem.id];
        if (triggerId) {
            const triggerElem = document.getElementById(triggerId);
            if (triggerElem) triggerElem.parentElement?.classList.add('active');
        }
    }
}

function setPanelOpen(open: boolean): void {
    const container = document.querySelector('.cim-container');
    if (!container) return;
    if (open) {
        container.classList.add('panel-open');
    } else {
        container.classList.remove('panel-open');
    }
}

function collapseMobileNavigation(): void {
    if (!window.matchMedia('(max-width: 780px)').matches) return;
    document.getElementById('menu-container')?.classList.remove('visible');
}

function clearFirstVisitHomeCue(): void {
    const homeButton = document.getElementById('home-button');
    homeButton?.classList.remove('first-visit-home-cue');
    homeButton?.querySelector('a')?.setAttribute('title', 'Practice trail');
}

function togglePanel(panelElem: HTMLElement): void {
    if (panelElem.id !== 'i-infobox') clearFirstVisitHomeCue();
    if (_CURRENT_PANEL === panelElem) {
        // Close current panel
        panelElem.classList.remove('visible');
        _CURRENT_PANEL = null;
        setPanelOpen(false);
        setActiveTrigger(null);
    } else {
        // Close any open panel first
        if (_CURRENT_PANEL !== null) {
            _CURRENT_PANEL.classList.remove('visible');
        }
        panelElem.classList.add('visible');
        _CURRENT_PANEL = panelElem;
        setPanelOpen(true);
        setActiveTrigger(panelElem);
    }
}

export function closePanel(): void {
    if (_CURRENT_PANEL !== null) {
        _CURRENT_PANEL.classList.remove('visible');
        _CURRENT_PANEL = null;
        setPanelOpen(false);
    }
    clearFirstVisitHomeCue();
    collapseMobileNavigation();
    setActiveTrigger(null);
}

export function initActiveState(): void {
    setActiveTrigger(null);
}

export function toggleExpansionBar(): void {
    const menu = document.getElementById('menu-container');
    if (menu) menu.classList.toggle('visible');
}

export function toggleInfoboxVisibility(): void {
    togglePanel(document.getElementById('i-infobox')!);
}

const INFO_SEEN_KEY = 'pitchtrail_info_seen_v1';

export function showFirstVisitInfo(): void {
    if (localStorage.getItem(INFO_SEEN_KEY)) return;
    localStorage.setItem(INFO_SEEN_KEY, 'true');
    const infoPanel = document.getElementById('i-infobox')!;
    const homeButton = document.getElementById('home-button');
    homeButton?.classList.add('first-visit-home-cue');
    homeButton?.querySelector('a')?.setAttribute('title', 'Start practicing');
    const video = document.getElementById('pitch-trail-intro');
    video?.addEventListener('ended', () => {
        if (_CURRENT_PANEL === infoPanel) closePanel();
    }, { once: true });
    togglePanel(infoPanel);
}

export function toggleStatsHistoryVisibility(): void {
    populateStatsHistoryModal();
    togglePanel(document.getElementById('stats-history-container')!);
}

export function toggleProfilePanel(): void {
    const panel = document.getElementById('profile-info-container')!;
    if (panel.classList.contains('visible') && _CURRENT_PANEL === panel) {
        closePanel();
    } else {
        populateProfileSwitcher();
        populateProfileSettings();
        togglePanel(panel);
    }
}

export function toggleTrainerVisibility(): void {
    const panel = document.getElementById('trainer-infobox')!;
    togglePanel(panel);
    // Preload audio when opening trainer
    if (_CURRENT_PANEL === panel) {
        _onTrainerOpenFn();
    }
}

declare global {
    interface Window {
        BSharpAndroid?: { setTheme(isDark: boolean): void };
    }
}

export function applyColorScheme(scheme: string): void {
    document.body.classList.remove('colorscheme-dark');
    document.body.classList.add('colorscheme-light');
    window.BSharpAndroid?.setTheme(false);
}

// --- Profile UI ---

export function populateProfileUiElements(): void {
    const profile = getCurrentProfile();
    const profileIconElem = document.getElementById('profile-icon') as HTMLElement;
    if (!profileIconElem) return;

    if (profileIconElem.dataset.userIcon !== undefined) {
        profileIconElem.classList.remove(profileIconElem.dataset.userIcon);
    }

    const userIcon = profile.icon;
    profileIconElem.classList.add(userIcon);
    profileIconElem.dataset.userIcon = userIcon;

    const profileNameSpan = document.getElementById('profile-text');
    if (profileNameSpan) profileNameSpan.textContent = profile.name;
}

function populateProfileSwitcher(): void {
    if (STATE === null) return;
    const container = document.getElementById('profile-switcher');
    if (!container) return;
    container.innerHTML = '';

    const currentId = getCurrentProfile().id;

    const allProfiles = Object.values(STATE.profiles);
    const me = allProfiles.find((profile) => profile.role === 'owner')
        ?? STATE.profiles[GUEST_USER_ID];
    const profiles = me
        ? [me, ...allProfiles.filter((profile) => profile.id !== me.id)]
        : allProfiles;

    for (const profile of profiles) {
        const btn = document.createElement('button');
        btn.classList.add('switcher-item', 'switcher-profile');
        if (profile.id === currentId) btn.classList.add('active');
        btn.type = 'button';

        const icon = document.createElement('i');
        icon.classList.add('fa', 'fa-solid', profile.icon);
        btn.appendChild(icon);

        const label = document.createElement('span');
        label.classList.add('switcher-label');
        const isMe = profile.role === 'owner' || profile.id === GUEST_USER_ID;
        label.textContent = isMe ? 'Me' : profile.name;
        btn.appendChild(label);
        const tooltip = isMe ? `Edit my trail (${profile.name})` : `Switch to ${profile.name}`;
        btn.dataset.tooltip = tooltip;
        btn.title = tooltip;
        btn.setAttribute('aria-label', tooltip);

        btn.addEventListener('click', () => {
            setCurrentProfile(profile);
            populateProfileSwitcher();
            populateProfileSettings();
        });
        container.appendChild(btn);
    }

    // Add "+" button
    const addBtn = document.createElement('button');
    addBtn.classList.add('switcher-item', 'switcher-add');
    addBtn.type = 'button';
    const addIcon = document.createElement('i');
    addIcon.classList.add('fa', 'fa-solid', 'fa-plus');
    addBtn.appendChild(addIcon);
    const addLabel = document.createElement('span');
    addLabel.classList.add('switcher-label');
    addLabel.textContent = 'Add child';
    addBtn.appendChild(addLabel);
    addBtn.dataset.tooltip = 'Create a separate trail for another child';
    addBtn.title = 'Create a separate trail for another child';
    addBtn.setAttribute('aria-label', 'Add child profile');
    addBtn.addEventListener('click', () => {
        openProfileAdder();
    });
    container.appendChild(addBtn);
}

// --- Profile Settings ---

function getCheckedIconSelectorSettingElem(): HTMLInputElement | null {
    const container = document.getElementById('profile-info-container');
    if (!container) return null;
    for (const elem of container.querySelectorAll("input[name='profile_icon_selector']") as NodeListOf<HTMLInputElement>) {
        if (elem.checked) return elem;
    }
    return null;
}

function isProfileNameTaken(profileName: string): boolean {
    for (const profile of Object.values(STATE.profiles)) {
        if (profile.name.toLowerCase() === profileName.toLowerCase()) return true;
    }
    return false;
}

function validTargetNumber(value: string): boolean {
    return validInt(value)
        && TRAIL_LENGTH_PRESETS.includes(parseInt(value) as typeof TRAIL_LENGTH_PRESETS[number]);
}

function getProfileSettings(): {
    name: string; icon: string | null; id: number | null;
    target_number: string; show_chord_mode: string; reveal_chord_mode: string;
    chord_display_mode: string; single_note_mode: string;
    single_note_correctness_mode: string; persist_reaction_face: boolean;
    enable_onboarding_hints: boolean; color_scheme: string;
    chord_selection_mode: string;
} {
    const profileContainer = document.getElementById('profile-info-container')!;
    const profileNameElem = document.getElementById('profile_name_setting') as HTMLInputElement;
    const profileName = profileNameElem.value;

    let profileIcon: string | null = null;
    const checkedIconElem = getCheckedIconSelectorSettingElem();
    if (checkedIconElem !== null) {
        profileIcon = checkedIconElem.value;
    }

    const id = JSON.parse(profileContainer.dataset.id || 'null');

    const showChordMode = DEFAULT_SHOW_CHORD_MODE;
    const revealChordMode = DEFAULT_REVEAL_CHORD_MODE;
    const chordDisplayMode = DEFAULT_CHORD_DISPLAY_MODE;
    const singleNoteModeElem = document.getElementById('single-note-trainer-mode-selector') as HTMLSelectElement | null;
    const singleNoteMode = singleNoteModeElem ? singleNoteModeElem.value : DEFAULT_SINGLE_NOTE_MODE;
    const singleNoteCorrectnessModeElem = document.getElementById('single-note-trainer-correctness-mode-selector') as HTMLSelectElement | null;
    const singleNoteCorrectnessMode = singleNoteCorrectnessModeElem ? singleNoteCorrectnessModeElem.value : DEFAULT_SINGLE_NOTE_CORRECTNESS_MODE;
    const targetNumber = document.querySelector<HTMLInputElement>('input[name="target_number_setting"]:checked')?.value
        ?? String(DEFAULT_TARGET_NUMBER);
    const persistReactionFace = DEFAULT_PERSIST_REACTION_FACE;
    const enableOnboardingHints = false;
    const colorScheme = DEFAULT_COLOR_SCHEME;
    const chordSelectionMode = DEFAULT_CHORD_SELECTION_MODE;

    return {
        name: profileName,
        icon: profileIcon,
        id,
        target_number: targetNumber,
        show_chord_mode: showChordMode,
        reveal_chord_mode: revealChordMode,
        chord_display_mode: chordDisplayMode,
        single_note_mode: singleNoteMode,
        single_note_correctness_mode: singleNoteCorrectnessMode,
        persist_reaction_face: persistReactionFace,
        enable_onboarding_hints: enableOnboardingHints,
        color_scheme: colorScheme,
        chord_selection_mode: chordSelectionMode,
    };
}

function clearProfileDialog(): void {
    const profileDialog = document.getElementById('profile-info-container');
    if (!profileDialog) return;

    const checkedIconElem = getCheckedIconSelectorSettingElem();
    if (checkedIconElem !== null) checkedIconElem.checked = false;

    for (const elem of profileDialog.querySelectorAll("input[type='text']") as NodeListOf<HTMLInputElement>) {
        elem.value = '';
    }

    for (const elem of profileDialog.querySelectorAll('button.button') as NodeListOf<HTMLElement>) {
        elem.classList.remove('visible');
    }

    const singleNoteMode = document.getElementById('single-note-trainer-mode-selector') as HTMLSelectElement;
    if (singleNoteMode) singleNoteMode.value = DEFAULT_SINGLE_NOTE_MODE;

    const singleNoteCorrectnessMode = document.getElementById('single-note-trainer-correctness-mode-selector') as HTMLSelectElement;
    if (singleNoteCorrectnessMode) singleNoteCorrectnessMode.value = DEFAULT_SINGLE_NOTE_CORRECTNESS_MODE;

    const defaultLength = document.getElementById(`trail-length-${DEFAULT_TARGET_NUMBER}`) as HTMLInputElement | null;
    if (defaultLength) defaultLength.checked = true;

    profileDialog.dataset.id = 'null';
}

function populateProfileSettings(): void {
    const profile = getCurrentProfile();
    const isMe = profile.id === GUEST_USER_ID || profile.role === 'owner';
    clearProfileDialog();

    const profileDialog = document.getElementById('profile-info-container')!;
    for (const elem of profileDialog.querySelectorAll('button.settings-button') as NodeListOf<HTMLElement>) {
        elem.classList.add('visible');
    }

    const profileNameElem = document.getElementById('profile_name_setting') as HTMLInputElement;
    profileNameElem.value = profile.name;
    const title = document.getElementById('profile-panel-title');
    const help = document.getElementById('profile-panel-help');
    const nameLabel = document.getElementById('profile-name-label');
    const trailHelp = document.getElementById('trail-length-help');
    if (title) title.textContent = isMe ? 'My trail' : `${profile.name}’s trail`;
    if (help) help.textContent = isMe
        ? 'This is Me. My progress and settings stay separate from every child.'
        : `Editing ${profile.name}. Switching profiles changes whose progress is recorded.`;
    if (nameLabel) nameLabel.textContent = isMe ? 'My name' : 'Child’s name';
    if (trailHelp) trailHelp.textContent = `Saved only for ${isMe ? 'me' : profile.name}. Difficulty still adapts automatically.`;

    for (const elem of profileDialog.querySelectorAll("input[name='profile_icon_selector']") as NodeListOf<HTMLInputElement>) {
        if (elem.value === profile.icon) {
            elem.checked = true;
            break;
        }
    }

    const target = [5, 10, 15].includes(profile.target_number) ? profile.target_number : DEFAULT_TARGET_NUMBER;
    const targetOption = document.getElementById(`trail-length-${target}`) as HTMLInputElement | null;
    if (targetOption) targetOption.checked = true;
    const singleNoteModeElem = document.getElementById('single-note-trainer-mode-selector') as HTMLSelectElement | null;
    if (singleNoteModeElem) singleNoteModeElem.value = profile.single_note_mode;
    const singleNoteCorrectnessModeElem = document.getElementById('single-note-trainer-correctness-mode-selector') as HTMLSelectElement | null;
    if (singleNoteCorrectnessModeElem) singleNoteCorrectnessModeElem.value = profile.single_note_correctness_mode;
    profileDialog.dataset.id = String(profile.id);

    const deleteButtonElem = document.getElementById('delete-profile-button') as HTMLButtonElement;
    deleteButtonElem.classList.toggle('owner-locked', isMe);
    if (profile.id === GUEST_USER_ID) {
        profileNameElem.disabled = true;
        deleteButtonElem.disabled = true;
    } else if (profile.role === 'owner') {
        profileNameElem.disabled = false;
        deleteButtonElem.disabled = true;
    } else {
        profileNameElem.disabled = false;
        deleteButtonElem.disabled = false;
    }
}

export function openProfileAdder(): void {
    // Open the profile settings panel in add mode
    const panel = document.getElementById('profile-info-container')!;
    if (_CURRENT_PANEL !== panel) {
        if (_CURRENT_PANEL !== null) {
            _CURRENT_PANEL.classList.remove('visible');
        }
        panel.classList.add('visible');
        _CURRENT_PANEL = panel;
        setPanelOpen(true);
        setActiveTrigger(panel);
    }
    clearProfileDialog();
    const title = document.getElementById('profile-panel-title');
    const help = document.getElementById('profile-panel-help');
    const nameLabel = document.getElementById('profile-name-label');
    const trailHelp = document.getElementById('trail-length-help');
    if (title) title.textContent = 'Add a child';
    if (help) help.textContent = 'Create a separate listening trail so progress never gets mixed together.';
    if (nameLabel) nameLabel.textContent = 'Child’s name';
    if (trailHelp) trailHelp.textContent = 'Saved only for this child. Difficulty still adapts automatically.';
    // Highlight "+" as active in switcher
    const switcher = document.getElementById('profile-switcher');
    if (switcher) {
        for (const item of switcher.querySelectorAll('.switcher-profile') as NodeListOf<HTMLElement>) {
            item.classList.remove('active');
        }
        const addBtn = switcher.querySelector('.switcher-add');
        if (addBtn) addBtn.classList.add('active');
    }

    const profileContainer = document.getElementById('profile-info-container')!;
    for (const elem of profileContainer.querySelectorAll('button.add-button') as NodeListOf<HTMLElement>) {
        elem.classList.add('visible');
    }

    (document.getElementById('profile_name_setting') as HTMLInputElement).disabled = false;
    const defaultLength = document.getElementById(`trail-length-${DEFAULT_TARGET_NUMBER}`) as HTMLInputElement | null;
    if (defaultLength) defaultLength.checked = true;
    // Pre-select the first icon
    const firstIcon = profileContainer.querySelector("input[name='profile_icon_selector']") as HTMLInputElement | null;
    if (firstIcon) firstIcon.checked = true;
}

export function closeProfileAdder(): void {
    closePanel();
    clearProfileDialog();
}

export function addProfile(): void {
    const newProfileValues = getProfileSettings();
    const nameTaken = isProfileNameTaken(newProfileValues.name);
    const targetNumValid = validTargetNumber(newProfileValues.target_number);

    if (newProfileValues.icon === null || newProfileValues.name === '') {
        alert('Must specify a profile name and icon.');
    } else if (nameTaken) {
        alert('A profile with the name ' + newProfileValues.name + ' already exists.');
    } else if (!targetNumValid) {
        alert('Choose 5, 10, or 15 questions per trail.');
    } else {
        const profile = newProfile(
            newProfileValues.name,
            newProfileValues.icon,
            undefined,
            parseInt(newProfileValues.target_number),
            newProfileValues.show_chord_mode,
            newProfileValues.reveal_chord_mode,
            newProfileValues.chord_display_mode,
            newProfileValues.single_note_mode,
            newProfileValues.single_note_correctness_mode,
            newProfileValues.persist_reaction_face,
            newProfileValues.enable_onboarding_hints,
            newProfileValues.color_scheme,
            newProfileValues.chord_selection_mode,
        );
        STATE.profiles[profile.id] = profile;
        saveState();
        closeProfileAdder();
        setCurrentProfile(profile);
    }
}

export function submitProfileChanges(): void {
    const profileValues = getProfileSettings();
    const currentProfile = STATE.profiles[profileValues.id!];

    if (currentProfile.name !== profileValues.name && isProfileNameTaken(profileValues.name)) {
        alert('The name ' + profileValues.name + ' is taken, please choose another one.');
        return;
    }
    if (profileValues.icon === null) {
        alert('Must specify an icon!');
        return;
    }
    if (!validTargetNumber(profileValues.target_number)) {
        alert('Choose 5, 10, or 15 questions per trail.');
        return;
    }

    currentProfile.name = profileValues.name;
    currentProfile.icon = profileValues.icon;
    currentProfile.target_number = parseInt(profileValues.target_number);
    currentProfile.show_chord_mode = profileValues.show_chord_mode;
    currentProfile.reveal_chord_mode = profileValues.reveal_chord_mode;
    currentProfile.chord_display_mode = profileValues.chord_display_mode;
    currentProfile.single_note_mode = profileValues.single_note_mode;
    currentProfile.single_note_correctness_mode = profileValues.single_note_correctness_mode;
    currentProfile.persist_reaction_face = profileValues.persist_reaction_face;
    currentProfile.enable_onboarding_hints = profileValues.enable_onboarding_hints;
    currentProfile.color_scheme = profileValues.color_scheme;
    currentProfile.chord_selection_mode = profileValues.chord_selection_mode;

    saveState();

    if (profileValues.id === getCurrentProfile().id) {
        setCurrentProfile(getCurrentProfile());
    }
    populateProfileUiElements();
    closeProfileAdder();
}

export function deleteProfile(): void {
    const profileContainer = document.getElementById('profile-info-container')!;
    const profileId = JSON.parse(profileContainer.dataset.id || 'null');

    if (profileId === GUEST_USER_ID) {
        alert('Deleting the guest user is not allowed.');
        return;
    }

    if (confirm('Are you sure you want to delete the profile ' + STATE.profiles[profileId].name + '?')) {
        STATE.current_profile = GUEST_USER_ID;
        setCurrentProfile(STATE.profiles[GUEST_USER_ID]);
        delete STATE.profiles[profileId];
    }

    saveState();
    closeProfileAdder();
}

export function setCurrentProfile(profile: Profile): void {
    if (profile.id !== getCurrentProfile().id) {
        _resetStatsFn(false);
        STATE.current_profile = profile.id;
    }

    if (profile.current_chord === undefined) {
        profile.current_chord = Object.keys(CHORDS_TONE)[1];
    }
    if (profile.current_instrument === undefined) {
        profile.current_instrument = DEFAULT_INSTRUMENT;
    }

    normalizeStatsObject(profile.stats);
    populateProfileUiElements();
    setChordDisplayMode(profile.chord_display_mode);
    applyColorScheme(profile.color_scheme);
    _changeInstrumentSelectorFn(profile.current_instrument);
    _changeSelectorFn(profile.current_chord);
    saveState();
}

// --- Stats History Modal ---

function clearStatsHistoryModal(): void {
    const modal = document.getElementById('stats-history-container');
    if (!modal) return;
    while (modal.firstChild) {
        modal.removeChild(modal.lastChild!);
    }
}

function appendEmptyStatsMessage(container: HTMLElement): void {
    const msg = document.createElement('div');
    msg.classList.add('stats-history-empty');
    msg.textContent = 'No sessions recorded yet.';
    container.appendChild(msg);
}

function populateStatsHistoryModal(): void {
    clearStatsHistoryModal();
    const statsContainer = document.getElementById('stats-history-container')!;
    const history = getSessionHistory();
    const profileHistory = history[String(STATE.current_profile)];
    if (!profileHistory) {
        appendEmptyStatsMessage(statsContainer);
        return;
    }

    const array = Object.values(profileHistory).flat();
    array.sort((a, b) => b.updated_time - a.updated_time);

    let hasEntries = false;
    for (const session of array) {
        const correct = session.correct;
        const identifications = session.identifications;
        if (identifications === 0) continue;
        hasEntries = true;

        const percentage = calculatePercentage(correct, identifications);
        const emoji = getCatEmoji(calculateNeutralLevel(percentage));
        const date = new Date(session.start_time * 1000);

        const div = document.createElement('div');
        div.classList.add('stats-history-item');

        const color = document.createElement('div');
        color.classList.add(session.current_chord, 'stats-color');
        div.appendChild(color);

        const dateElem = document.createElement('div');
        dateElem.classList.add('stats-date');
        dateElem.innerText = formatDatetime(date, false);
        div.appendChild(dateElem);

        const stats = document.createElement('div');
        stats.classList.add('session-stats');
        stats.innerText = correct + ' / ' + identifications + ' (' + percentage.toFixed(0) + '%) ' + emoji;
        div.appendChild(stats);

        statsContainer.appendChild(div);
    }

    if (!hasEntries) {
        appendEmptyStatsMessage(statsContainer);
    }
}

// --- Download / Easter Egg ---

export function enableDownload(): void {
    if (_DOWNLOAD_ENABLED_CLICKS === -1) return;

    let timeSinceLastClick = 0;
    if (_DOWNLOAD_ENABLED_LAST_CLICK !== null) {
        timeSinceLastClick = getCurrentTimestamp() - _DOWNLOAD_ENABLED_LAST_CLICK;
    }

    if (timeSinceLastClick > 1.5) _DOWNLOAD_ENABLED_CLICKS = 0;
    if (_DOWNLOAD_ENABLED_CLICKS < 5) {
        _DOWNLOAD_ENABLED_CLICKS++;
        _DOWNLOAD_ENABLED_LAST_CLICK = getCurrentTimestamp();
        return;
    }

    _DOWNLOAD_ENABLED_CLICKS = -1;
    const elem = document.getElementById('download-link');
    if (elem) elem.classList.add('visible');
}

export function triggerEasterEgg(): void {
    if (_EASTER_EGG_ENABLED) return;

    let timeSinceLastClick = 0;
    if (_EASTER_EGG_LAST_CLICK !== null) {
        timeSinceLastClick = getCurrentTimestamp() - _EASTER_EGG_LAST_CLICK;
    }

    if (timeSinceLastClick > 1.5) _EASTER_EGG_CLICKS = 0;
    if (_EASTER_EGG_CLICKS < 5) {
        _EASTER_EGG_CLICKS++;
        _EASTER_EGG_LAST_CLICK = getCurrentTimestamp();
        return;
    }

    _EASTER_EGG_ENABLED = true;
}

export function downloadState(): void {
    const stateJson = JSON.stringify({
        state: STATE,
        history: getSessionHistory()
    }, null, 2);
    const data = new Blob([stateJson]);

    const downloadElem = document.createElement('a');
    downloadElem.href = URL.createObjectURL(data);
    downloadElem.download = 'bsharp_state_' + Math.round(getCurrentTimestamp()) + '.json';
    downloadElem.click();
    downloadElem.remove();
}
