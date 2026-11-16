'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import PreviewPlayer from '@/components/PreviewPlayer';
import { copyTextToClipboard, formatLiveStatusMessage } from '@/lib/clipboard';
import { ensureShortExporterScripts } from '@/lib/scriptLoader';
import { loadPublicShare, type SharedAnimation } from '@/lib/share';

export default function SharePage() {
  const [shared, setShared] = useState<SharedAnimation | null>(null);
  const [loadError, setLoadError] = useState<string>('');
  const [editorHref, setEditorHref] = useState<string>('/');
  const [copyStatus, setCopyStatus] = useState<string>('');
  const [copiedWhich, setCopiedWhich] = useState<'link' | 'prompt' | 'code' | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let active = true;

    async function init() {
      const se = await ensureShortExporterScripts();
      if (!active) return;
      cleanup = se.mount({ mode: 'share' });

      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      const hash = window.location.hash;

      if (id) {
        setEditorHref(`/?share=${encodeURIComponent(id)}`);
      } else if (hash && hash.includes('v=')) {
        setEditorHref(`/${hash}`);
      }

      const data = await loadPublicShare({ id, hash });
      if (!active) return;
      setShared(data);
      document.title = `${data.title} | Short Exporter Preview`;
      se.loadHtml(data.html, {
        len: data.len,
        size: data.size,
        title: data.title,
        autoplay: true,
      });
    }

    init().catch((err) => {
      if (!active) return;
      setLoadError(err instanceof Error ? err.message : 'Unable to load this shared animation.');
    });

    return () => {
      active = false;
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      if (cleanup) cleanup();
    };
  }, []);

  function markCopied(which: 'link' | 'prompt' | 'code', message: string) {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    setCopiedWhich(which);
    setCopyStatus(formatLiveStatusMessage(message));
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedWhich(null);
      setCopyStatus('');
    }, 2200);
  }

  async function handleCopyUrl() {
    const ok = await copyTextToClipboard(window.location.href);
    markCopied('link', ok ? 'Share link copied' : 'Copy failed');
  }

  async function handleCopyPrompt() {
    const prompt = `Please review this vertical HTML animation preview:\n${window.location.href}`;
    const ok = await copyTextToClipboard(prompt);
    markCopied('prompt', ok ? 'AI review prompt copied' : 'Copy failed');
  }

  async function handleCopySource() {
    if (!shared) return;
    const ok = await copyTextToClipboard(shared.html);
    markCopied('code', ok ? 'HTML source copied' : 'Copy failed');
  }

  return (
    <main className="share-main">
      <header className="share-header">
        <div className="share-brand-row">
          <Link href="/" className="share-home-link">Short Exporter</Link>
          {shared && (
            <div className="share-meta" aria-label="Animation metadata">
              <span>{shared.len}s</span>
              <span>{shared.size.replace('x', ' × ')}</span>
            </div>
          )}
        </div>
        <h1>{shared ? shared.title : 'Shared Animation Preview'}</h1>
      </header>

      {loadError ? (
        <section className="share-error-panel" role="alert">
          <p>{loadError}</p>
          <Link href="/" className="small-link-btn">Open Short Exporter</Link>
        </section>
      ) : (
        <>
          <div className="share-stage">
            <PreviewPlayer
              variant="share"
              title={shared?.title || 'Shared animation preview'}
              emptyText="Loading shared animation..."
            />

            <div className="share-controls-card">
              <div className="btns share-top-actions">
                <button type="button" className="primary" onClick={handleCopyUrl}>
                  {copiedWhich === 'link' ? 'Copied link' : 'Copy public link'}
                </button>
                <button type="button" onClick={handleCopyPrompt}>
                  {copiedWhich === 'prompt' ? 'Copied AI prompt' : 'Copy AI prompt'}
                </button>
                <Link href={editorHref} className="small-link-btn">
                  Open in Editor
                </Link>
                <button id="exp" type="button" className="small-btn">Export MP4</button>
                <button id="cancel" type="button" style={{ display: 'none' }}>Cancel</button>
              </div>
              <span className="share-live" role="status">{copyStatus}</span>

              <div id="status" role="status" aria-live="polite">
                Loading shared animation preview...
              </div>
              <div id="note" />
              <div id="fix">
                <button id="copyfix" type="button" className="small-btn">Copy fix message for the AI</button>
                <textarea id="fixtext" readOnly />
              </div>
              <div id="bar" role="progressbar" aria-label="Export progress"><i /></div>
              <div id="result">
                <video id="resv" controls muted playsInline />
                <a className="dl" id="dl" download="my-short.mp4">Download my-short.mp4</a>
                <div id="hostnote" />
                <div id="teststats" />
              </div>

              {shared && (
                <details className="source-details">
                  <summary>View HTML source ({shared.html.length.toLocaleString()} chars)</summary>
                  <div className="source-toolbar">
                    <button type="button" className="small-btn" onClick={handleCopySource}>
                      {copiedWhich === 'code' ? 'Copied HTML' : 'Copy HTML'}
                    </button>
                  </div>
                  <figure className="source-figure">
                    <figcaption id="share-source-caption" className="small">Sandboxed animation source</figcaption>
                    <pre role="region" aria-labelledby="share-source-caption" tabIndex={0} className="source-pre">
                      <code>{shared.html}</code>
                    </pre>
                  </figure>
                </details>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
