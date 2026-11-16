# Short Exporter

A local-first Next.js and TypeScript PWA that turns HTML animations into vertical MP4 videos in desktop Chrome and Edge. Preview, frame-accurate WebCodecs export, a screen recording fallback, local draft saving, and offline app loading are included.

## Develop

```sh
npm ci
npm run dev
```

## Verify

```sh
npm run typecheck
npm run lint
npm run build
```

Animations run inside a sandboxed iframe. They may fetch external code or assets. Only paste HTML you trust. The export engine remains browser JavaScript from the original single-file implementation while the application shell, metadata, manifest, and build are Next.js and TypeScript.
