import {
    exportCloudData,
    replaceCloudData,
    resetToGuest,
    ensureOwnerProfile,
    GUEST_USER_ID,
} from './state';

interface User {
    id: string;
    email: string;
    displayName: string;
}

interface SyncResponse {
    user: User;
    state: {
        profiles: Record<string, import('./types').Profile>;
        current_profile: number | null;
        current_chord: string;
    };
    history: Record<string, Record<string, import('./types').SessionStats[]>>;
}

let currentUser: User | null = null;
let syncTimer: number | null = null;
let syncInFlight = false;
let syncAgain = false;

export async function initCloudSync(): Promise<void> {
    installAccountUi();
    window.addEventListener('perfect-pitch:state-changed', queueSync);

    try {
        const response = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
        if (!response.ok) {
            setAccountUi(null);
            return;
        }
        const data = await response.json() as { user: User };
        ensureOwnerProfile(data.user.displayName);
        currentUser = data.user;
        setAccountUi(currentUser);
        await pullOrSeedCloud();
    } catch {
        setAccountUi(null, 'Saved on this device');
    }
}

function installAccountUi(): void {
    const dialog = document.getElementById('account-dialog') as HTMLDialogElement | null;
    const accountButton = document.getElementById('account-button');
    const closeButton = document.getElementById('account-close');
    const authTabs = document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]');
    const form = document.getElementById('account-form') as HTMLFormElement | null;
    const logout = document.getElementById('account-logout');
    const googleButton = document.getElementById('google-auth-button');

    accountButton?.addEventListener('click', () => dialog?.showModal());
    closeButton?.addEventListener('click', () => dialog?.close());
    dialog?.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
    for (const tab of authTabs) {
        tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode === 'signup' ? 'signup' : 'login'));
    }
    form?.addEventListener('submit', submitAuthForm);
    logout?.addEventListener('click', logoutAccount);
    googleButton?.addEventListener('click', startGoogleAuth);
    void configureGoogleAuth();

    const authError = new URLSearchParams(window.location.search).get('authError');
    if (authError) {
        dialog?.showModal();
        showAuthError(authError);
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
}

function setAuthMode(mode: 'signup' | 'login'): void {
    const form = document.getElementById('account-form') as HTMLFormElement;
    const adultRow = document.getElementById('adult-confirmation');
    const adultNameRow = document.getElementById('adult-name-row');
    const adultNameInput = document.getElementById('account-name-input') as HTMLInputElement | null;
    const adultCheckbox = document.querySelector<HTMLInputElement>('#adult-confirmation input');
    const password = document.getElementById('account-password-input') as HTMLInputElement | null;
    const submit = document.getElementById('account-submit');
    const title = document.getElementById('account-dialog-title');
    form.dataset.mode = mode;
    adultRow?.classList.toggle('hidden', mode !== 'signup');
    adultNameRow?.classList.toggle('hidden', mode !== 'signup');
    if (adultCheckbox) adultCheckbox.required = mode === 'signup';
    if (adultNameInput) adultNameInput.required = mode === 'signup';
    if (password) password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    if (submit) submit.textContent = mode === 'signup' ? 'Create family account' : 'Sign in';
    if (title) title.textContent = mode === 'signup' ? 'Sign Up To Save Progress' : 'Sign In To Save Progress';
    for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]')) {
        tab.classList.toggle('active', tab.dataset.authMode === mode);
    }
    showAuthError('');
}

async function configureGoogleAuth(): Promise<void> {
    const button = document.getElementById('google-auth-button');
    const divider = document.getElementById('auth-divider');
    try {
        const response = await fetch('/api/auth/google/status', { headers: { Accept: 'application/json' } });
        const result = await response.json() as { configured?: boolean };
        const configured = response.ok && result.configured === true;
        button?.classList.toggle('hidden', !configured);
        divider?.classList.toggle('hidden', !configured);
    } catch {
        button?.classList.add('hidden');
        divider?.classList.add('hidden');
    }
}

function startGoogleAuth(): void {
    const form = document.getElementById('account-form') as HTMLFormElement;
    const mode = form.dataset.mode === 'login' ? 'login' : 'signup';
    window.location.assign(`/api/auth/google/start?intent=${mode}`);
}

async function submitAuthForm(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const mode = form.dataset.mode === 'login' ? 'login' : 'signup';
    const submit = document.getElementById('account-submit') as HTMLButtonElement;
    const data = new FormData(form);
    showAuthError('');
    submit.disabled = true;
    submit.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';

    try {
        const response = await fetch(`/api/auth/${mode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: data.get('email'),
                password: data.get('password'),
                adultName: data.get('adultName'),
                isAdult: data.get('isAdult') === 'on',
            }),
        });
        const result = await response.json() as { user?: User; error?: string };
        if (!response.ok || !result.user) throw new Error(result.error ?? 'Unable to continue.');
        ensureOwnerProfile(result.user.displayName);
        currentUser = result.user;
        setAccountUi(currentUser, 'Syncing…');
        if (mode === 'signup') await flushSync();
        else await pullOrSeedCloud();
        (document.getElementById('account-dialog') as HTMLDialogElement).close();
        window.location.reload();
    } catch (error) {
        showAuthError(error instanceof Error ? error.message : 'Unable to continue.');
        submit.disabled = false;
        submit.textContent = mode === 'signup' ? 'Create family account' : 'Sign in';
    }
}

async function logoutAccount(): Promise<void> {
    const button = document.getElementById('account-logout') as HTMLButtonElement;
    button.disabled = true;
    try {
        await flushSync();
        await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
        currentUser = null;
        resetToGuest();
        window.location.reload();
    }
}

async function pullOrSeedCloud(): Promise<void> {
    const response = await fetch('/api/sync', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const remote = await response.json() as SyncResponse;
    // A profile may be added while the first cloud read is in flight. In that
    // case the fresh local edit is authoritative; never replace it with the
    // slightly older response that just arrived.
    if (syncTimer !== null || syncInFlight) {
        await flushSync();
        return;
    }
    const hasRemoteProfiles = Object.keys(remote.state.profiles).length > 0;
    const local = exportCloudData();
    const localOwner = Object.values(local.state.profiles).find((profile) => profile.role === 'owner');
    const hasLocalProfiles = Object.values(local.state.profiles).some((profile) => profile.id !== GUEST_USER_ID);

    if (hasRemoteProfiles) {
        const remoteHasOwner = Object.values(remote.state.profiles).some((profile) => profile.role === 'owner');
        if (!remoteHasOwner && localOwner) {
            let ownerToMerge = localOwner;
            if (remote.state.profiles[String(ownerToMerge.id)]) {
                const nextId = Math.max(
                    GUEST_USER_ID,
                    ...Object.values(remote.state.profiles).map((profile) => profile.id),
                ) + 1;
                ownerToMerge = { ...localOwner, id: nextId };
            }
            remote.state.profiles[String(ownerToMerge.id)] = ownerToMerge;
            remote.history[String(ownerToMerge.id)] = local.history[String(localOwner.id)] ?? {};
        }
        replaceCloudData({
            profiles: remote.state.profiles,
            current_profile: remote.state.current_profile ?? undefined,
            current_chord: remote.state.current_chord,
        }, remote.history);
        if (!remoteHasOwner) await flushSync();
        setAccountUi(currentUser, 'Progress synced');
    } else if (hasLocalProfiles) {
        await flushSync();
    } else {
        setAccountUi(currentUser, 'Ready to sync');
    }
}

function queueSync(): void {
    if (!currentUser) return;
    setAccountUi(currentUser, 'Saving…');
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => void flushSync(), 650);
}

async function flushSync(): Promise<void> {
    if (!currentUser) return;
    if (syncInFlight) {
        syncAgain = true;
        return;
    }
    syncInFlight = true;
    syncTimer = null;

    try {
        const response = await fetch('/api/sync', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(exportCloudData()),
        });
        if (!response.ok) {
            const result = await response.json() as { error?: string };
            throw new Error(result.error ?? 'Sync failed');
        }
        setAccountUi(currentUser, 'Progress synced');
    } catch {
        setAccountUi(currentUser, 'Saved here · sync paused');
    } finally {
        syncInFlight = false;
        if (syncAgain) {
            syncAgain = false;
            void flushSync();
        }
    }
}

function setAccountUi(user: User | null, status?: string): void {
    const accountButton = document.getElementById('account-button');
    const signedOut = document.getElementById('account-signed-out');
    const signedIn = document.getElementById('account-signed-in');
    const email = document.getElementById('account-email');
    const displayName = document.getElementById('account-display-name');
    const sync = document.getElementById('sync-status');
    if (accountButton) {
        const longLabel = accountButton.querySelector('.account-long');
        const shortLabel = accountButton.querySelector('.account-short');
        const accessibleLabel = user ? 'Family' : 'Save progress';
        if (longLabel && shortLabel) {
            longLabel.textContent = accessibleLabel;
            shortLabel.textContent = user ? 'Family' : 'Save';
        } else {
            accountButton.textContent = accessibleLabel;
        }
        accountButton.setAttribute('aria-label', accessibleLabel);
    }
    signedOut?.classList.toggle('hidden', Boolean(user));
    signedIn?.classList.toggle('hidden', !user);
    if (email) email.textContent = user?.email ?? '';
    if (displayName) displayName.textContent = user?.displayName ?? '';
    if (sync) sync.textContent = status ?? (user ? 'Progress synced' : 'Guest mode');
}

function showAuthError(message: string): void {
    const error = document.getElementById('account-error');
    if (!error) return;
    error.textContent = message;
    error.classList.toggle('visible', Boolean(message));
}
