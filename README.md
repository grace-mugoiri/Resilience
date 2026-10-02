# Resilience

An installable, offline-ready Progressive Web App built with React, TypeScript,
and Vite.

## Features

- Installable on supported phones and desktop computers
- In-app **Install App** button using the browser's native installation prompt
- Standalone app experience after installation
- Offline-ready application shell powered by a service worker
- Responsive interface with online and offline status
- Strict TypeScript and ESLint configuration

## Local development

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`).

## Connecting to the API

The **Talk to someone** counselor screens read the counselor directory from the Resilience API
(the `backend/` folder on the backend branch). By default the app calls `http://localhost:8000`.
To use another address, copy `.env.example` to `.env.local` and change `VITE_API_BASE`, then
restart `npm run dev`.

The API must allow this app's address in its `CORS_ORIGINS` setting. For local development that
is `http://localhost:5173`.

The app does not take the API's word for who is verified. Each organisation signs its list of
counselors and each counselor signs her own profile with Nostr keys, and the app checks both
signatures in the browser (`src/support/directory.ts`). If a list fails the check, its counselors
show as **Not verified**. Profile pictures are never loaded, because loading an image would give
the image's host the survivor's IP address.

## Private messages

Survivors and counselors message each other through the Nostr relays, not through the API. Messages
are encrypted on the phone (NIP-17) and only the two people in the conversation can read them.

Chat needs two things from the backend:

- `VITE_PLATFORM_PUBKEY` in `.env.local`, set to `PLATFORM_PUBKEY` from `backend/.env`. The app
  uses it to check the signature on `GET /v1/config`, which lists the relays.
- At least two relays in that signed configuration. The app refuses to start chat with fewer.

The survivor's key is locked with her PIN and only held in memory, so each chat screen asks for the
PIN after a page load. A counselor signs in at `/counselor/sign-in` with the 12 backup words of the
key her organisation verified. Conversations are saved on the phone encrypted to the account's own
key. A guest's conversation lasts only while the chat screen is open.

## Available commands

- `npm run dev` starts the development server.
- `npm run build` type-checks and creates a production build in `dist/`.
- `npm run lint` checks the code with ESLint.
- `npm test` runs the unit tests with Vitest.
- `npm run preview` serves the production build locally.

The service worker is generated during a production build. To test installation
and offline behavior locally, run:

```bash
npm run build
npm run preview
```

Open the local URL in Chrome or Edge. When the browser determines that the PWA
is installable, an **Install App** button appears in the hero section. Selecting
it opens the browser's native installation prompt. The button is hidden when the
app is already installed or when the current browser does not expose an install
prompt.

## Installing on a device

The production app must be hosted at an HTTPS address for installation and
service workers to work. `localhost` is permitted during development.

### Android

Open the deployed app in Chrome and use the **Install App** button. Alternatively,
open the browser menu and select **Install app**.

### iPhone and iPad

iOS browsers do not expose the native install prompt to the in-app button. Open
the app in Safari, select **Share**, select **Add to Home Screen**, enable
**Open as Web App**, and select **Add**.

### Desktop

Open the app in Chrome or Edge and use the **Install App** button. You can also
select the install icon in the address bar or use the browser's app menu.

After installation, Resilience appears in the device's app launcher or home
screen and opens in its own standalone window.
