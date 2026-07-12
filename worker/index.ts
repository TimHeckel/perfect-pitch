interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

interface AccountRow {
  id: string;
  email: string;
  displayName: string | null;
  password_hash: string;
  password_salt: string;
}

interface SessionAccount {
  id: string;
  email: string;
  displayName: string;
}

interface ProfilePayload {
  id: number;
  name: string;
  icon: string;
  [key: string]: unknown;
}

interface SyncPayload {
  state?: {
    profiles?: Record<string, ProfilePayload>;
    current_profile?: number;
    current_chord?: string;
  };
  history?: Record<string, unknown>;
}

const SESSION_COOKIE = 'pp_session';
const GOOGLE_OAUTH_COOKIE = 'pp_google_oauth';
const SESSION_SECONDS = 60 * 60 * 24 * 30;
// Cloudflare Workers' WebCrypto PBKDF2 implementation caps iterations at 100,000.
const PASSWORD_ITERATIONS = 100_000;
const MAX_CHILDREN = 12;
const MAX_SYNC_BYTES = 1_000_000;
const encoder = new TextEncoder();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return withSecurityHeaders(await handleApi(request, env, url));
      } catch (error) {
        console.error('Unhandled API error', error);
        return withSecurityHeaders(json({ error: 'Something went wrong. Please try again.' }, 500));
      }
    }

    const response = await env.ASSETS.fetch(request);
    return withSecurityHeaders(response);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!['GET', 'HEAD'].includes(request.method) && !isSameOrigin(request, url)) {
    return json({ error: 'Invalid request origin.' }, 403);
  }

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true });
  }
  if (url.pathname === '/api/auth/signup' && request.method === 'POST') {
    return signup(request, env);
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    return login(request, env);
  }
  if (url.pathname === '/api/auth/google/status' && request.method === 'GET') {
    return json({ configured: googleAuthConfigured(env) });
  }
  if (url.pathname === '/api/auth/google/start' && request.method === 'GET') {
    return startGoogleAuth(env, url);
  }
  if (url.pathname === '/api/auth/google/callback' && request.method === 'GET') {
    return finishGoogleAuth(request, env, url);
  }
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    return logout(request, env);
  }
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const account = await requireAccount(request, env);
    return account instanceof Response ? account : json({ user: account });
  }
  if (url.pathname === '/api/sync' && request.method === 'GET') {
    const account = await requireAccount(request, env);
    return account instanceof Response ? account : getSync(env, account);
  }
  if (url.pathname === '/api/sync' && request.method === 'PUT') {
    const account = await requireAccount(request, env);
    return account instanceof Response ? account : putSync(request, env, account);
  }

  return json({ error: 'Not found.' }, 404);
}

async function signup(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string; adultName?: string; isAdult?: boolean }>(request);
  if (body instanceof Response) return body;

  const email = normalizeEmail(body.email);
  const displayName = normalizeDisplayName(body.adultName, email);
  const password = body.password ?? '';
  const error = validateCredentials(email, password);
  if (error) return json({ error }, 400);
  if (!displayName) return json({ error: 'Enter your name.' }, 400);
  if (body.isAdult !== true) return json({ error: 'An adult must create and manage the family account.' }, 400);

  const rateKey = `signup:${clientIp(request)}:${email}`;
  if (!(await allowAuthAttempt(env.DB, rateKey, 5))) {
    return json({ error: 'Too many attempts. Please wait a few minutes.' }, 429);
  }

  const existing = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first();
  if (existing) return json({ error: 'An account with that email already exists.' }, 409);

  const salt = randomHex(16);
  const passwordHash = await derivePassword(password, salt);
  const id = crypto.randomUUID();
  const now = unixTime();

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO accounts (id, email, display_name, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, email, displayName, passwordHash, salt, now, now),
    env.DB.prepare(
      'INSERT INTO household_settings (account_id, current_profile_id, current_chord, updated_at) VALUES (?, NULL, ?, ?)',
    ).bind(id, 'yellow', now),
  ]);

  return createSession(env.DB, { id, email, displayName }, 201);
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request);
  if (body instanceof Response) return body;

  const email = normalizeEmail(body.email);
  const password = body.password ?? '';
  const rateKey = `login:${clientIp(request)}:${email}`;
  if (!(await allowAuthAttempt(env.DB, rateKey, 8))) {
    return json({ error: 'Too many attempts. Please wait a few minutes.' }, 429);
  }

  const account = await env.DB.prepare(
    'SELECT id, email, display_name AS displayName, password_hash, password_salt FROM accounts WHERE email = ?',
  ).bind(email).first<AccountRow>();

  const suppliedHash = account
    ? await derivePassword(password, account.password_salt)
    : await derivePassword(password || 'invalid-password', '00000000000000000000000000000000');

  if (!account || !constantTimeEqual(suppliedHash, account.password_hash)) {
    return json({ error: 'Email or password is incorrect.' }, 401);
  }

  return createSession(env.DB, {
    id: account.id,
    email: account.email,
    displayName: account.displayName || displayNameFromEmail(account.email),
  });
}

function googleAuthConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

async function startGoogleAuth(env: Env, url: URL): Promise<Response> {
  if (!googleAuthConfigured(env)) return json({ error: 'Google sign-in is not configured yet.' }, 503);

  const intent = url.searchParams.get('intent') === 'login' ? 'login' : 'signup';
  // Choosing the family-account Google flow is the signup confirmation;
  // the separate checkbox remains specific to email/password signup.
  const adult = intent === 'signup';

  const state = randomHex(24);
  const verifier = randomBase64Url(48);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = new URL('/api/auth/google/callback', url.origin).toString();
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
  authorization.searchParams.set('redirect_uri', redirectUri);
  authorization.searchParams.set('response_type', 'code');
  authorization.searchParams.set('scope', 'openid email profile');
  authorization.searchParams.set('state', state);
  authorization.searchParams.set('code_challenge', challenge);
  authorization.searchParams.set('code_challenge_method', 'S256');
  authorization.searchParams.set('prompt', 'select_account');

  const oauthValue = [state, intent, adult ? '1' : '0', verifier].join('.');
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorization.toString(),
      'Set-Cookie': googleOAuthCookie(oauthValue),
      'Cache-Control': 'no-store',
    },
  });
}

async function finishGoogleAuth(request: Request, env: Env, url: URL): Promise<Response> {
  if (!googleAuthConfigured(env)) return redirectAuthError(url, 'Google sign-in is not configured yet.');
  if (url.searchParams.get('error')) return redirectAuthError(url, 'Google sign-in was cancelled.');

  const cookie = getCookie(request, GOOGLE_OAUTH_COOKIE);
  const [expectedState, intent, adultFlag, verifier] = cookie?.split('.') ?? [];
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!cookie || !state || !code || state !== expectedState || !verifier) {
    return redirectAuthError(url, 'Google sign-in expired. Please try again.');
  }

  const redirectUri = new URL('/api/auth/google/callback', url.origin).toString();
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) return redirectAuthError(url, 'Google sign-in could not be completed. Please try again.');
  const tokens = await tokenResponse.json<{ access_token?: string }>();
  if (!tokens.access_token) return redirectAuthError(url, 'Google sign-in could not be completed. Please try again.');

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) return redirectAuthError(url, 'Google profile verification failed. Please try again.');
  const profile = await profileResponse.json<{
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
  }>();
  const email = normalizeEmail(profile.email);
  if (!profile.sub || !profile.email_verified || !email) {
    return redirectAuthError(url, 'Google must provide a verified email address.');
  }

  const account = await findOrCreateGoogleAccount(
    env.DB,
    profile.sub,
    email,
    normalizeDisplayName(profile.name || profile.given_name, email),
    intent === 'signup',
    adultFlag === '1',
  );
  if (account instanceof Response) return account;

  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', await createSessionCookie(env.DB, account));
  headers.append('Set-Cookie', expiredGoogleOAuthCookie());
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 302, headers });
}

async function findOrCreateGoogleAccount(
  db: D1Database,
  googleSub: string,
  email: string,
  displayName: string,
  allowCreate: boolean,
  adultConfirmed: boolean,
): Promise<SessionAccount | Response> {
  const byGoogle = await db.prepare(
    'SELECT id, email, display_name AS displayName FROM accounts WHERE google_sub = ?',
  ).bind(googleSub).first<SessionAccount>();
  if (byGoogle) {
    if (displayName && byGoogle.displayName !== displayName) {
      await db.prepare('UPDATE accounts SET display_name = ?, updated_at = ? WHERE id = ?')
        .bind(displayName, unixTime(), byGoogle.id).run();
    }
    return { ...byGoogle, displayName: displayName || byGoogle.displayName || displayNameFromEmail(byGoogle.email) };
  }

  const byEmail = await db.prepare(
    'SELECT id, email, display_name AS displayName, google_sub FROM accounts WHERE email = ?',
  ).bind(email).first<SessionAccount & { google_sub: string | null }>();
  if (byEmail) {
    if (byEmail.google_sub && byEmail.google_sub !== googleSub) {
      return authRedirectResponse('That email is already connected to another Google account.');
    }
    await db.prepare('UPDATE accounts SET google_sub = ?, display_name = ?, updated_at = ? WHERE id = ?')
      .bind(googleSub, displayName || byEmail.displayName || displayNameFromEmail(email), unixTime(), byEmail.id).run();
    return { id: byEmail.id, email: byEmail.email, displayName: displayName || byEmail.displayName || displayNameFromEmail(email) };
  }

  if (!allowCreate) return authRedirectResponse('No saved account was found. Choose Create account first.');
  if (!adultConfirmed) return authRedirectResponse('An adult must create and manage the family account.');

  const id = crypto.randomUUID();
  const now = unixTime();
  await db.batch([
    db.prepare(
      'INSERT INTO accounts (id, email, display_name, password_hash, password_salt, google_sub, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, email, displayName, randomHex(32), randomHex(16), googleSub, now, now),
    db.prepare(
      'INSERT INTO household_settings (account_id, current_profile_id, current_chord, updated_at) VALUES (?, NULL, ?, ?)',
    ).bind(id, 'yellow', now),
  ]);
  return { id, email, displayName };
}

function authRedirectResponse(message: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/?authError=${encodeURIComponent(message)}`,
      'Set-Cookie': expiredGoogleOAuthCookie(),
      'Cache-Control': 'no-store',
    },
  });
}

function redirectAuthError(url: URL, message: string): Response {
  const target = new URL('/', url.origin);
  target.searchParams.set('authError', message);
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Set-Cookie': expiredGoogleOAuthCookie(),
      'Cache-Control': 'no-store',
    },
  });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie() });
}

async function getSync(env: Env, account: SessionAccount): Promise<Response> {
  const [childrenResult, settings] = await Promise.all([
    env.DB.prepare(
      'SELECT local_profile_id, profile_json, history_json FROM children WHERE account_id = ? ORDER BY updated_at, local_profile_id',
    ).bind(account.id).all<{ local_profile_id: number; profile_json: string; history_json: string }>(),
    env.DB.prepare(
      'SELECT current_profile_id, current_chord FROM household_settings WHERE account_id = ?',
    ).bind(account.id).first<{ current_profile_id: number | null; current_chord: string }>(),
  ]);

  const profiles: Record<string, ProfilePayload> = {};
  const history: Record<string, unknown> = {};
  for (const child of childrenResult.results) {
    profiles[String(child.local_profile_id)] = JSON.parse(child.profile_json) as ProfilePayload;
    history[String(child.local_profile_id)] = JSON.parse(child.history_json) as unknown;
  }

  return json({
    user: account,
    state: {
      profiles,
      current_profile: settings?.current_profile_id ?? null,
      current_chord: settings?.current_chord ?? 'yellow',
    },
    history,
  });
}

async function putSync(request: Request, env: Env, account: SessionAccount): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_SYNC_BYTES) return json({ error: 'Progress data is too large to sync.' }, 413);

  let body: SyncPayload;
  try {
    body = JSON.parse(raw) as SyncPayload;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const profiles = Object.values(body.state?.profiles ?? {}).filter((profile) => profile.id !== 100);
  const owners = profiles.filter((profile) => profile.role === 'owner');
  const children = profiles.filter((profile) => profile.role !== 'owner');
  if (owners.length > 1) return json({ error: 'A family can have only one Me profile.' }, 400);
  if (children.length > MAX_CHILDREN) {
    return json({ error: `A family can have up to ${MAX_CHILDREN} child profiles.` }, 400);
  }

  const now = unixTime();
  const statements: D1PreparedStatement[] = [];
  const incomingIds = new Set<number>();

  for (const profile of profiles) {
    if (!Number.isInteger(profile.id) || profile.id < 101) return json({ error: 'Invalid child profile.' }, 400);
    const name = typeof profile.name === 'string' ? profile.name.trim() : '';
    if (!name || name.length > 32) return json({ error: 'Child nicknames must be 1–32 characters.' }, 400);

    const icon = typeof profile.icon === 'string' ? profile.icon.slice(0, 40) : 'fa-user';
    const history = body.history?.[String(profile.id)] ?? {};
    incomingIds.add(profile.id);
    statements.push(env.DB.prepare(`
      INSERT INTO children (id, account_id, local_profile_id, name, icon, profile_json, history_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, local_profile_id) DO UPDATE SET
        name = excluded.name,
        icon = excluded.icon,
        profile_json = excluded.profile_json,
        history_json = excluded.history_json,
        updated_at = excluded.updated_at
    `).bind(
      crypto.randomUUID(), account.id, profile.id, name, icon,
      JSON.stringify({ ...profile, name, icon }), JSON.stringify(history), now,
    ));
  }

  const existing = await env.DB.prepare(
    'SELECT local_profile_id FROM children WHERE account_id = ?',
  ).bind(account.id).all<{ local_profile_id: number }>();
  for (const row of existing.results) {
    if (!incomingIds.has(row.local_profile_id)) {
      statements.push(env.DB.prepare(
        'DELETE FROM children WHERE account_id = ? AND local_profile_id = ?',
      ).bind(account.id, row.local_profile_id));
    }
  }

  const requestedCurrent = body.state?.current_profile;
  const currentProfile = requestedCurrent && incomingIds.has(requestedCurrent) ? requestedCurrent : null;
  const currentChord = typeof body.state?.current_chord === 'string'
    ? body.state.current_chord.slice(0, 24)
    : 'yellow';
  statements.push(env.DB.prepare(`
    INSERT INTO household_settings (account_id, current_profile_id, current_chord, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      current_profile_id = excluded.current_profile_id,
      current_chord = excluded.current_chord,
      updated_at = excluded.updated_at
  `).bind(account.id, currentProfile, currentChord, now));

  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true, updatedAt: now });
}

async function createSession(db: D1Database, account: SessionAccount, status = 200): Promise<Response> {
  return json({ user: account }, status, { 'Set-Cookie': await createSessionCookie(db, account) });
}

async function createSessionCookie(db: D1Database, account: SessionAccount): Promise<string> {
  const token = randomHex(32);
  const now = unixTime();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    db.prepare(
      'INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    ).bind(await sha256(token), account.id, now + SESSION_SECONDS, now),
  ]);
  return sessionCookie(token);
}

async function requireAccount(request: Request, env: Env): Promise<SessionAccount | Response> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return json({ error: 'Sign in to sync progress.' }, 401);

  const account = await env.DB.prepare(`
    SELECT accounts.id, accounts.email, accounts.display_name AS displayName
    FROM sessions
    JOIN accounts ON accounts.id = sessions.account_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(await sha256(token), unixTime()).first<SessionAccount>();

  if (!account) return json({ error: 'Your session has expired. Please sign in again.' }, 401);
  account.displayName ||= displayNameFromEmail(account.email);
  return account;
}

function normalizeDisplayName(value: unknown, email: string): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
  return name || displayNameFromEmail(email);
}

function displayNameFromEmail(email: string): string {
  return email.split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
    .slice(0, 40) || 'Me';
}

async function allowAuthAttempt(db: D1Database, key: string, limit: number): Promise<boolean> {
  const cutoff = unixTime() - 15 * 60;
  const count = await db.prepare(
    'SELECT COUNT(*) AS count FROM auth_attempts WHERE key = ? AND attempted_at > ?',
  ).bind(key, cutoff).first<{ count: number }>();
  if ((count?.count ?? 0) >= limit) return false;
  await db.batch([
    db.prepare('INSERT INTO auth_attempts (key, attempted_at) VALUES (?, ?)').bind(key, unixTime()),
    db.prepare('DELETE FROM auth_attempts WHERE attempted_at <= ?').bind(cutoff),
  ]);
  return true;
}

async function derivePassword(password: string, saltHex: string): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: hexBytes(saltHex),
    iterations: PASSWORD_ITERATIONS,
    hash: 'SHA-256',
  }, material, 256);
  return bytesHex(new Uint8Array(bits));
}

async function sha256(value: string): Promise<string> {
  return bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return 'Enter a valid email address.';
  if (password.length < 10) return 'Use at least 10 characters for the password.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return null;
}

async function readJson<T>(request: Request): Promise<T | Response> {
  try {
    return await request.json<T>();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin');
  return !origin || origin === url.origin;
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'local';
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesHex(bytes);
}

function randomBase64Url(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesBase64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesBase64Url(new Uint8Array(digest));
}

function bytesBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function googleOAuthCookie(value: string): string {
  return `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(value)}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

function expiredGoogleOAuthCookie(): string {
  return `${GOOGLE_OAUTH_COOKIE}=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, {
    status,
    headers: responseHeaders,
  });
}

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  secured.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  secured.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "media-src 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  return secured;
}
