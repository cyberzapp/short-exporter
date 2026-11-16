'use client';

import { useEffect } from 'react';
import example from './example.json';

declare global {
  interface Window { __shortExporterLoaded?: boolean }
}

export default function Home() {
  useEffect(() => {
    if (window.__shortExporterLoaded) return;
    window.__shortExporterLoaded = true;
    const muxer = document.createElement('script');
    muxer.src = '/muxer.js';
    muxer.onload = () => {
      const exporter = document.createElement('script');
      exporter.src = '/exporter.js';
      document.body.appendChild(exporter);
    };
    document.body.appendChild(muxer);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return <main>
    <div className="col-ctl">
      <h1>Short Exporter</h1>
      <p className="sub">Turn AI animation code into an MP4 for YouTube Shorts, TikTok or Reels.</p>
      <label htmlFor="code">Paste the code the AI gave you</label>
      <textarea id="code" spellCheck={false} placeholder="<!DOCTYPE html> ... paste the whole HTML file here" />
      <div className="btns file-actions">
        <button id="pick" type="button">or choose your .html file</button>
        <input id="file" type="file" accept=".html,.htm,text/html" hidden />
        <button id="example" type="button" className="small-btn" title="Fills the box with a small test animation">Load example</button>
        <button id="clear" type="button" className="small-btn" title="Empties the code box">Clear</button>
      </div>
      <div className="row">
        <div><label htmlFor="len">Length (seconds)</label><input id="len" type="number" min="1" max="120" defaultValue="20" /></div>
        <div><label htmlFor="size">Size</label><select id="size" defaultValue="1080x1920"><option value="1080x1920">1080 x 1920 (best)</option><option value="720x1280">720 x 1280 (smaller file)</option></select></div>
      </div>
      <div className="steps"><b>1.</b> Click <b>Preview</b> to check it plays. <b>2.</b> Click <b>Export MP4</b>. The page builds your video one picture at a time, so it comes out sharp and smooth. A 20 second video can take a few minutes on older computers. You can switch tabs while it works, but keep this page open.</div>
      <div className="btns">
        <button id="prev" type="button" className="primary">Preview</button>
        <button id="exp" type="button" className="primary">Export MP4</button>
        <button id="cancel" type="button" style={{display:'none'}}>Cancel</button>
      </div>
      <div className="fallback-action"><button id="rt" type="button" className="link" title="Only if the normal export does not work in your browser">Record the screen instead (fallback)</button></div>
      <div id="status" role="status" aria-live="polite">Paste your code, then click Preview. You can also drop an .html file on the box, or press Ctrl+Enter to preview.</div>
      <div id="note" />
      <div id="fix"><button id="copyfix" type="button" className="small-btn">Copy fix message for the AI</button><textarea id="fixtext" readOnly /></div>
      <div id="bar" role="progressbar" aria-label="Export progress"><i /></div>
      <div id="result"><video id="resv" controls muted playsInline /><a className="dl" id="dl" download="my-short.mp4">Download my-short.mp4</a><div id="hostnote" /><div id="teststats" /></div>
      <p className="small privacy-note">Best in desktop Chrome and Edge. Your code and video stay in your browser. Animations may load libraries from other websites. Only use HTML you trust.</p>
    </div>
    <div className="col-prev"><div id="phone"><iframe id="frame" sandbox="allow-scripts" title="Animation preview" /></div></div>
    <script type="application/json" id="example-data" dangerouslySetInnerHTML={{__html:JSON.stringify(example).replace(/</g,'\\u003c')}} />
  </main>;
}
