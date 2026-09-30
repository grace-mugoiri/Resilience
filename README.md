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

## Available commands

- `npm run dev` starts the development server.
- `npm run build` type-checks and creates a production build in `dist/`.
- `npm run lint` checks the code with ESLint.
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
