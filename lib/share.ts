import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';

export type ShareSize = '1080x1920' | '720x1280';

export interface SharedAnimation {
  v: 1;
  html: string;
  len: number;
  size: ShareSize;
  title: string;
}

export interface ShareResult {
  url: string;
  localPath: string;
  mode: 'cloud' | 'url';
  shareId?: string;
  warning?: string;
}

const PUBLIC_ORIGIN = 'https://short-exporter.web.app';
const MAX_CLOUD_HTML_BYTES = 880_000;
const MAX_DECOMPRESSED_BYTES = 2_500_000;
const SHARE_ID_RE = /^[A-Za-z0-9_-]{10,32}$/;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function normalizeShareSize(value: string | null | undefined): ShareSize {
  return value === '720x1280' ? '720x1280' : '1080x1920';
}

export function normalizeShareLen(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 20;
  return Math.min(120, Math.max(1, Math.round(n * 10) / 10));
}

export function extractHtmlTitle(html: string): string {
  try {
    if (typeof DOMParser !== 'undefined') {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const t = parsed.title?.replace(/\s+/g, ' ').trim();
      if (t) return t.slice(0, 160);
    }
  } catch {
    // Fallback below
  }
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (m) {
    const clean = m[1].replace(/\s+/g, ' ').trim();
    if (clean) return clean.slice(0, 160);
  }
  return 'Shared animation';
}

export function generateShareId(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += ID_ALPHABET[bytes[i] & 63];
  }
  return id;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function readStreamCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Shared animation exceeds maximum allowed size.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function encodeCompressedPayload(payload: SharedAnimation): Promise<string> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    await writer.write(jsonBytes);
    await writer.close();
    const compressed = await readStreamCapped(cs.readable, MAX_DECOMPRESSED_BYTES);
    return 'z' + bytesToBase64Url(compressed);
  }
  return 'u' + bytesToBase64Url(jsonBytes);
}

export async function decodeCompressedPayload(token: string): Promise<SharedAnimation> {
  if (!token || token.length < 2) {
    throw new Error('Invalid share link payload.');
  }
  const mode = token[0];
  const rawBytes = base64UrlToBytes(token.slice(1));
  let jsonBytes: Uint8Array;
  if (mode === 'z') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot decompress inline share links.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const copy = new Uint8Array(rawBytes.byteLength);
    copy.set(rawBytes);
    await writer.write(copy);
    await writer.close();
    jsonBytes = await readStreamCapped(ds.readable, MAX_DECOMPRESSED_BYTES);
  } else if (mode === 'u') {
    jsonBytes = rawBytes;
  } else {
    throw new Error('Unsupported share link format.');
  }
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes));
  return validateSharedPayload(parsed);
}

function validateSharedPayload(raw: unknown): SharedAnimation {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Shared animation data is invalid.');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.html !== 'string' || !obj.html.trim() || !obj.html.includes('<')) {
    throw new Error('Shared HTML animation is missing or invalid.');
  }
  return {
    v: 1,
    html: obj.html,
    len: normalizeShareLen(obj.len),
    size: normalizeShareSize(typeof obj.size === 'string' ? obj.size : undefined),
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim().slice(0, 160) : extractHtmlTitle(obj.html),
  };
}

function getShareOrigin(): { publicOrigin: string; isLocal: boolean } {
  if (typeof window === 'undefined') {
    return { publicOrigin: PUBLIC_ORIGIN, isLocal: false };
  }
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  return {
    publicOrigin: isLocal ? PUBLIC_ORIGIN : window.location.origin,
    isLocal,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function createPublicShare(input: {
  html: string;
  len: number;
  size: string;
  title?: string;
}): Promise<ShareResult> {
  const html = input.html;
  const len = normalizeShareLen(input.len);
  const size = normalizeShareSize(input.size);
  const title = (input.title?.trim() || extractHtmlTitle(html)).slice(0, 160);
  const byteLength = new TextEncoder().encode(html).byteLength;
  const { publicOrigin } = getShareOrigin();

  let cloudError: string | null = null;
  const db = getDb();

  if (db && byteLength <= MAX_CLOUD_HTML_BYTES) {
    const id = generateShareId(16);
    try {
      await withTimeout(
        setDoc(doc(db, 'shares', id), {
          v: 1,
          html,
          len,
          size,
          title,
          createdAt: serverTimestamp(),
        }),
        8000,
        'Cloud share request timed out.',
      );
      const localPath = `/share?id=${encodeURIComponent(id)}`;
      return {
        url: `${publicOrigin}${localPath}`,
        localPath,
        mode: 'cloud',
        shareId: id,
      };
    } catch (err) {
      cloudError = err instanceof Error ? err.message : String(err);
    }
  } else if (byteLength > MAX_CLOUD_HTML_BYTES) {
    cloudError = 'Animation is larger than 880 KB for cloud short links.';
  }

  const token = await encodeCompressedPayload({ v: 1, html, len, size, title });
  const localPath = `/share#v=${token}`;
  const url = `${publicOrigin}${localPath}`;
  const warning =
    url.length > 16000
      ? 'Created a long compressed URL fallback because cloud sharing was unavailable; some chat apps truncate very long URLs.'
      : cloudError
        ? 'Cloud short link was unavailable, so a self-contained compressed share link was created instead.'
        : undefined;

  return {
    url,
    localPath,
    mode: 'url',
    warning,
  };
}

export async function loadPublicShare(params: { id?: string | null; hash?: string | null }): Promise<SharedAnimation> {
  const id = params.id?.trim() || '';
  if (id) {
    if (!SHARE_ID_RE.test(id)) {
      throw new Error('This share link ID is malformed.');
    }
    const db = getDb();
    if (!db) {
      throw new Error('Cloud share service is not available in this environment.');
    }
    const snap = await withTimeout(getDoc(doc(db, 'shares', id)), 10000, 'Timed out loading shared animation.');
    if (!snap.exists()) {
      throw new Error('This shared animation link was not found.');
    }
    return validateSharedPayload(snap.data());
  }

  const hash = params.hash || '';
  if (hash.startsWith('#')) {
    const hashParams = new URLSearchParams(hash.slice(1));
    const token = hashParams.get('v');
    if (token) {
      return decodeCompressedPayload(token);
    }
  }

  throw new Error('No animation ID or share payload found in this link.');
}
