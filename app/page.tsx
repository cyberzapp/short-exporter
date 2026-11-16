'use client';

import { useEffect, useRef, useState } from 'react';
import example from './example.json';
import PreviewPlayer from '@/components/PreviewPlayer';
import { copyTextToClipboard, formatLiveStatusMessage } from '@/lib/clipboard';
import { ensureShortExporterScripts } from '@/lib/scriptLoader';
import { createPublicShare, loadPublicShare, type ShareResult } from '@/lib/share';

export default function Home() {
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);
  const [shareStatusMsg, setShareStatusMsg] = useState('');
  const [shareError, setShareError] = useState('');
  const [copiedTarget, setCopiedTarget] = useState<'url' | 'prompt' | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let active = true;

    const handleCodeChanged = () => {
      setShareResult(null);
      setShareError('');
      setCopiedTarget(null);
      setShareStatusMsg('');
    };
    window.addEventListener('se-code-changed', handleCodeChanged);

    ensureShortExporterScripts()
      .then(async (se) => {
        if (!active) return;
        cleanup = se.mount({ mode: 'studio' });

        const params = new URLSearchParams(window.location.search);
        const shareId = params.get('share');
        const hash = window.location.hash;
        if (shareId || (hash && hash.includes('v='))) {
          try {
            const loaded = await loadPublicShare({ id: shareId, hash });
            if (!active) return;
            se.loadHtml(loaded.html, {
              len: loaded.len,
              size: loaded.size,
              title: loaded.title,
              autoplay: true,
            });
          } catch (err) {
            if (!active) return;
            const statusEl = document.getElementById('status');
            if (statusEl) {
              statusEl.className = 'err';
              statusEl.textContent = err instanceof Error ? err.message : 'Could not load shared animation.';
            }
          }
        }
      })
      .catch((err) => {
        const statusEl = document.getElementById('status');
        if (statusEl) {
          statusEl.className = 'err';
          statusEl.textContent = err instanceof Error ? err.message : 'Failed to initialize Short Exporter.';
        }
      });

    return () => {
      active = false;
      window.removeEventListener('se-code-changed', handleCodeChanged);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      if (cleanup) cleanup();
    };
  }, []);

  function showCopyFeedback(target: 'url' | 'prompt', message: string) {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    setCopiedTarget(target);
    setShareStatusMsg(formatLiveStatusMessage(message));
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedTarget(null);
      setShareStatusMsg('');
    }, 2200);
  }

  async function handleCreateShare() {
    setShareError('');
    try {
      const se = await ensureShortExporterScripts();
      const html = se.getHtml();
      const state = se.getState();
      setSharing(true);
      const res = await createPublicShare({
        html,
        len: state.len,
        size: state.size,
        title: state.title,
      });
      setShareResult(res);
      const copied = await copyTextToClipboard(res.url);
      showCopyFeedback(
        'url',
        copied
          ? 'Public share link created and copied to clipboard'
          : 'Public share link ready — use Copy link',
      );
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Could not create public share link.');
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyShareUrl() {
    if (!shareResult) return;
    const ok = await copyTextToClipboard(shareResult.url);
    showCopyFeedback('url', ok ? 'Public link copied' : 'Copy failed — select and copy manually');
  }

  async function handleCopyAiPrompt() {
    if (!shareResult) return;
    const prompt = `Please check and review this vertical HTML animation preview (includes playback controls, frame scrubber, fullscreen, and HTML source):\n${shareResult.url}`;
    const ok = await copyTextToClipboard(prompt);
    showCopyFeedback('prompt', ok ? 'AI review message copied' : 'Copy failed — select and copy manually');
  }

  return (
    <main>
      <div className="col-ctl">
        <h1>Short Exporter</h1>
        <p className="sub">Turn AI animation code into an MP4 or instant public preview link for YouTube Shorts, TikTok or Reels.</p>

        <label htmlFor="code">Paste the code the AI gave you</label>
        <textarea id="code" spellCheck={false} placeholder="<!DOCTYPE html> ... paste the whole HTML file here (auto-plays on paste)" />

        <div className="btns file-actions">
          <button id="pick" type="button">or choose your .html file</button>
          <input id="file" type="file" accept=".html,.htm,text/html" hidden />
          <button id="example" type="button" className="small-btn" title="Fills the box with a small test animation and starts playing">Load example</button>
          <button id="clear" type="button" className="small-btn" title="Empties the code box">Clear</button>
        </div>

        <div className="row">
          <div>
            <label htmlFor="len">Length (seconds)</label>
            <input id="len" type="number" min="1" max="120" defaultValue="20" />
          </div>
          <div>
            <label htmlFor="size">Size</label>
            <select id="size" defaultValue="1080x1920">
              <option value="1080x1920">1080 x 1920 (best)</option>
              <option value="720x1280">720 x 1280 (smaller file)</option>
            </select>
          </div>
        </div>

        <div className="steps">
          <b>1.</b> Paste your HTML code — preview <b>plays automatically</b>. <b>2.</b> Scrub, fullscreen, or click <b>Share public link</b> to send any AI a direct preview URL without exporting MP4. <b>3.</b> Click <b>Export MP4</b> when ready to download.
        </div>

        <div className="btns">
          <button id="prev" type="button" className="primary">Reload preview</button>
          <button id="share-btn" type="button" className="share-btn" onClick={handleCreateShare} disabled={sharing}>
            {sharing ? 'Creating link...' : 'Share public link'}
          </button>
          <button id="exp" type="button" className="primary">Export MP4</button>
          <button id="cancel" type="button" style={{ display: 'none' }}>Cancel</button>
        </div>

        {shareError && (
          <div className="share-error" role="alert">
            {shareError}
          </div>
        )}

        {shareResult && (
          <section id="share-box" className="share-box" aria-label="Public share link">
            <div className="share-box-head">
              <strong>{shareResult.mode === 'cloud' ? 'Public review link ready' : 'Compressed public link ready'}</strong>
              <span className="share-live" role="status">{shareStatusMsg}</span>
            </div>
            <div className="share-url-row">
              <label htmlFor="share-url" className="visually-hidden">Public preview URL</label>
              <input
                id="share-url"
                type="text"
                readOnly
                value={shareResult.url}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="small-btn"
                data-copied={copiedTarget === 'url' ? '' : undefined}
                onClick={handleCopyShareUrl}
              >
                {copiedTarget === 'url' ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <div className="share-actions">
              <button
                type="button"
                className="small-btn"
                data-copied={copiedTarget === 'prompt' ? '' : undefined}
                onClick={handleCopyAiPrompt}
              >
                {copiedTarget === 'prompt' ? 'Copied prompt + link' : 'Copy AI review prompt'}
              </button>
              <a
                className="small-link-btn"
                href={shareResult.localPath}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open preview
              </a>
            </div>
            {shareResult.warning && <p className="share-warning">{shareResult.warning}</p>}
          </section>
        )}

        <div className="fallback-action">
          <button id="rt" type="button" className="link" title="Only if the normal export does not work in your browser">
            Record the screen instead (fallback)
          </button>
        </div>

        <div id="status" role="status" aria-live="polite">
          Paste HTML code to auto-play preview, or drop an .html file on the box. Press Ctrl+Enter to reload.
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

        <p className="small privacy-note">
          Best in desktop Chrome and Edge. Previews and MP4 exports run locally in your browser; clicking Share public link stores an immutable snapshot for anyone with the link. Only use HTML you trust.
        </p>
      </div>

      <PreviewPlayer variant="studio" />

      <script
        type="application/json"
        id="example-data"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(example).replace(/</g, '\\u003c') }}
      />
    </main>
  );
}
