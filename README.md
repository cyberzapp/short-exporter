# Short Exporter

A local-first Next.js and TypeScript PWA that turns HTML animations into vertical MP4 videos in desktop Chrome and Edge. Preview, frame-accurate WebCodecs export, a screen recording fallback, local draft saving, and offline app loading are included.

## Develop

```sh
npm ci
npm run dev
```

## Verify and deploy

```sh
npm run typecheck
npm run lint
npm run build
npx firebase-tools login
npm run deploy
```

Firebase Hosting serves the static Next.js export from `out/`. The app does not need a server or Firebase Admin credentials. The Firebase web config supplied for project `short-exporter` is client-side configuration, not an Admin credential; this app currently does not use Firebase products beyond Hosting, so it does not initialize Analytics or ship unused SDK code. The existing service-account JSON in the workspace is excluded by `.gitignore`; never commit it.

Animations run inside a sandboxed iframe. They may fetch external code or assets. Only paste HTML you trust. The export engine remains browser JavaScript from the original single-file implementation while the application shell, metadata, manifest, and build are Next.js and TypeScript.
