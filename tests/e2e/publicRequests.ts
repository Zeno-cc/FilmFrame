import { expect, type Request } from '@playwright/test';

/**
 * The empty darkroom rotates public-domain documentary photographs fetched from
 * Wikimedia Commons, so the app does make one documented category of
 * third-party request. Every other request must stay on the application origin:
 * user photos are never uploaded, converted or measured anywhere else.
 *
 * The exemption is deliberately narrow — fixed HTTPS hosts, no cookies and no
 * referrer — so an assertion like `expect(external).toEqual([])` keeps catching
 * accidental telemetry, CDN or font traffic.
 */
const PUBLIC_GALLERY_HOSTS = new Set([
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
]);

export function isDocumentedPublicGalleryRequest(request: Request): boolean {
  let url: URL;
  try {
    url = new URL(request.url());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || !PUBLIC_GALLERY_HOSTS.has(url.hostname)) return false;
  const headers = request.headers();
  expect(headers['cookie']).toBeUndefined();
  expect(headers['referer']).toBeUndefined();
  return true;
}
