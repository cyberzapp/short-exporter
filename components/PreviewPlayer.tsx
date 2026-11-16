'use client';

import type { CSSProperties } from 'react';

interface PreviewPlayerProps {
  variant?: 'studio' | 'share';
  title?: string;
  emptyText?: string;
}

export default function PreviewPlayer({
  variant = 'studio',
  title = 'Animation preview',
  emptyText = 'Paste HTML code or drop a file to start playing.',
}: PreviewPlayerProps) {
  const focusGroupAttr = { focusgroup: 'toolbar wrap' } as Record<string, string>;

  return (
    <section className={variant === 'share' ? 'col-prev col-prev-share' : 'col-prev'} aria-label="Animation preview">
      <div
        id="preview-shell"
        className={variant === 'share' ? 'preview-shell share-mode' : 'preview-shell'}
        data-active="false"
        data-playing="false"
        data-fullscreen="false"
      >
        <div className="fs-topbar">
          <span className="fs-title" id="fs-title">{title}</span>
          <button type="button" id="ctl-fs-close" className="small-btn fs-exit-btn">
            Exit fullscreen
          </button>
        </div>

        <div id="phone">
          <iframe id="frame" sandbox="allow-scripts" title={title} />
          <div id="preview-placeholder" className="preview-placeholder">
            <p id="preview-placeholder-text">{emptyText}</p>
          </div>
        </div>

        <div id="player-bar" className="player-bar">
          <div className="scrubber-row">
            <label htmlFor="seek" className="visually-hidden">Preview timeline</label>
            <input
              id="seek"
              className="player-seek"
              type="range"
              min="0"
              max="20"
              step="0.033"
              defaultValue="0"
              disabled
              aria-valuetext="0.0 seconds of 20.0 seconds"
              style={
                {
                  '--attr-min': '0',
                  '--attr-max': '20',
                  '--control-value': '0',
                } as CSSProperties
              }
            />
            <span id="time-readout" className="time-readout">0:00.0 / 0:20.0</span>
          </div>

          <div
            id="player-toolbar"
            className="player-toolbar"
            role="toolbar"
            aria-label="Preview player controls"
            aria-controls="frame"
            {...focusGroupAttr}
          >
            <div role="group" aria-label="Playback" className="toolbar-group">
              <button
                type="button"
                id="ctl-play"
                className="ctl-btn ctl-play"
                aria-label="Play"
                title="Play / Pause (Space)"
                aria-disabled="true"
              >
                <svg className="icon-play" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                  <polygon points="7,5 19,12 7,19" fill="currentColor" />
                </svg>
                <svg className="icon-pause" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                  <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                  <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                </svg>
              </button>

              <button
                type="button"
                id="ctl-restart"
                className="ctl-btn"
                aria-label="Restart preview"
                title="Restart (R)"
                aria-disabled="true"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>

              <button
                type="button"
                id="ctl-prev-frame"
                className="ctl-btn"
                aria-label="Previous frame"
                title="Previous frame (Left Arrow)"
                aria-disabled="true"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                  <rect x="5" y="6" width="2.2" height="12" rx="0.5" fill="currentColor" />
                  <polygon points="18,6 9,12 18,18" fill="currentColor" />
                </svg>
              </button>

              <button
                type="button"
                id="ctl-next-frame"
                className="ctl-btn"
                aria-label="Next frame"
                title="Next frame (Right Arrow)"
                aria-disabled="true"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                  <polygon points="6,6 15,12 6,18" fill="currentColor" />
                  <rect x="16.8" y="6" width="2.2" height="12" rx="0.5" fill="currentColor" />
                </svg>
              </button>
            </div>

            <span role="separator" aria-orientation="vertical" className="toolbar-sep" aria-hidden="true" />

            <div role="group" aria-label="Options and view" className="toolbar-group">
              <button
                type="button"
                id="ctl-loop"
                className="ctl-btn"
                aria-pressed="true"
                aria-label="Loop playback"
                title="Loop playback (L)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 2l4 4-4 4" />
                  <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="M7 22l-4-4 4-4" />
                  <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
              </button>

              <button
                type="button"
                id="ctl-speed"
                className="ctl-btn ctl-speed"
                aria-label="1x speed"
                title="Cycle playback speed"
              >
                <span id="ctl-speed-label">1x</span>
              </button>

              <button
                type="button"
                id="ctl-fs"
                className="ctl-btn"
                aria-pressed="false"
                aria-label="Fullscreen preview"
                title="Fullscreen (F)"
              >
                <svg className="icon-fs-enter" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
                <svg className="icon-fs-exit" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
