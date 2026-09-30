# Resilience

An installable, offline-ready Progressive Web App built with React, TypeScript,
and Vite.

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
and offline behavior locally, run `npm run build` followed by `npm run preview`.
