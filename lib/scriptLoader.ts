export interface ShortExporterMountOptions {
  mode?: 'studio' | 'share';
  defaultHeight?: number;
  onShareData?: (data: { html: string; len: number; size: string }) => void;
}

export interface ShortExporterHandle {
  mount: (options?: ShortExporterMountOptions) => () => void;
  loadHtml: (html: string, opts?: { len?: number; size?: string; autoplay?: boolean; title?: string }) => void;
  preview: () => void;
  getHtml: () => string;
  getState: () => { html: string; len: number; size: string; title: string };
  getInfo: () => unknown;
  errors: () => Array<{ kind: string; msg: string; fatal?: boolean }>;
  lastBlob: Blob | null;
  stats: Record<string, unknown> | null;
}

declare global {
  interface Window {
    __SE?: ShortExporterHandle;
    __seScriptsPromise?: Promise<ShortExporterHandle>;
    __seSwRegistered?: boolean;
  }
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-se-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.dataset.seSrc = src;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export function ensureShortExporterScripts(): Promise<ShortExporterHandle> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Short Exporter only runs in a browser.'));
  }

  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production' && !window.__seSwRegistered) {
    window.__seSwRegistered = true;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  if (window.__SE && typeof window.__SE.mount === 'function') {
    return Promise.resolve(window.__SE);
  }

  if (!window.__seScriptsPromise) {
    window.__seScriptsPromise = loadScriptOnce('/muxer.js')
      .then(() => loadScriptOnce('/exporter.js'))
      .then(() => {
        if (!window.__SE || typeof window.__SE.mount !== 'function') {
          throw new Error('Preview engine failed to initialize.');
        }
        return window.__SE;
      })
      .catch((err) => {
        window.__seScriptsPromise = undefined;
        throw err;
      });
  }

  return window.__seScriptsPromise;
}
