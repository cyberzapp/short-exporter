let lastLiveMessage = '';

export function legacyCopyText(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;inset-inline-start:-9999px;opacity:0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand when clipboard permission is unavailable
  }
  return legacyCopyText(text);
}

export function formatLiveStatusMessage(message: string): string {
  // VoiceOver skips identical consecutive live-region announcements; append a non-breaking space when repeating.
  const next = message === lastLiveMessage ? `${message}\u00A0` : message;
  lastLiveMessage = next;
  return next;
}
