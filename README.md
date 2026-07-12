# Perfect Pitch

A free, family-friendly web app for practicing chord identification with young children. Perfect Pitch uses the Eguchi color-chord method: a child hears a chord, chooses its color, and gradually adds new chords as accuracy improves.

The app works immediately in guest mode. An adult can also create one family account, add separate child profiles, and sync each child’s settings and practice history across devices.

## What is included

- The complete 14-chord BSharp progression with piano and guitar samples
- Short practice sessions, immediate feedback, and first-session guidance
- Random or adaptive chord selection that revisits harder chords more often
- Separate nicknamed child profiles with per-child settings and history
- Optional adult account with cross-device progress sync
- No child email, exact age, advertising, analytics, or paid feature gate
- Responsive layouts for phones, tablets, and desktop browsers

## Architecture

Perfect Pitch deploys as one Cloudflare Worker:

```text
Browser
  ├─ static HTML, CSS, JavaScript, and audio ── Cloudflare Static Assets
  └─ /api/auth + /api/sync ─────────────────── Worker ── D1 (SQLite)
```

Cloudflare is a good fit for the free public version because static asset requests are free and unlimited. The Workers Free plan currently includes 100,000 dynamic requests per day, and D1 includes 5 million rows read per day, 100,000 rows written per day, and 5 GB total storage. If the project ever outgrows that, the API is deliberately small and the schema is ordinary SQL.

Adult passwords are PBKDF2-hashed with a unique salt. Login sessions use random, hashed, expiring tokens in `HttpOnly`, `Secure`, `SameSite=Strict` cookies. Mutating API requests require a same-origin browser request. The app rate-limits account attempts and never stores passwords or session tokens in plaintext.

## Local development

Requirements: Node.js 22+, npm, and Chromium for Playwright.

```bash
npm install
npm run build
npm run db:migrate:local
npm run dev
```

Then open `http://localhost:8787`.

Useful checks:

```bash
npm run check       # app and Worker TypeScript
npm test            # unit tests
npm run test:ui     # trainer browser suite
npm run test:cloud  # adult signup and child sync flows
```

## Deploy to Cloudflare

Authenticate Wrangler, create the free D1 database, and copy the returned database ID into `wrangler.jsonc`:

```bash
npx wrangler login
npx wrangler d1 create perfect-pitch
```

Apply the production migration and deploy:

```bash
npm run db:migrate:remote
npm run deploy
```

Wrangler prints the public `workers.dev` address. A custom domain can be added later without changing the application.

## Data model

- `accounts`: adult email and password verifier
- `sessions`: hashed 30-day login tokens
- `children`: one row per child profile with profile settings and history
- `household_settings`: current profile and chord level
- `auth_attempts`: short-lived login/signup rate-limit records

An account supports up to 12 child profiles. Child profiles ask only for a nickname and avatar icon.

## Method and attribution

Perfect Pitch is adapted from [BSharp](https://github.com/paytonjjones/bsharp) by Payton Jones, which is based on [CIM Trainer](https://github.com/pganssle/cim) by Paul Ganssle. The original method is described in research on Eguchi’s chord-identification method.

The source and bundled media are distributed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). This is educational practice software, not a medical or developmental guarantee.
