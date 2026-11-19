import type { FilmSettings } from '../../types';
import { supportsSpectralStock } from './stockRegistry';

type SpectralStripSettings = Pick<
  FilmSettings,
  'imagingMode' | 'brandText' | 'frameRenderMode' | 'edgeRenderMode' | 'useFilmOverlayTemplate'
>;

/**
 * True when a strip render actually executes spectral development for these
 * settings. Physical 135 owns its own spectral path; template edges reuse the
 * same per-aperture spectral pipeline as single frames, so both are supported.
 */
export function spectralStripSupported(settings: SpectralStripSettings): boolean {
  if (settings.imagingMode !== 'spectral') return false;
  if (settings.edgeRenderMode === 'physical135') return true;
  return supportsSpectralStock(settings.brandText)
    && (settings.frameRenderMode ?? 'real135') === 'real135'
    && settings.useFilmOverlayTemplate !== false;
}

/**
 * Reject only combinations that cannot execute spectral development, with the
 * concrete reason and a usable alternative. The standard UI template strip
 * passes; legacy configs (no spectral stock, non-135 render mode, template path
 * disabled) still fail loudly instead of silently degrading to legacy color.
 */
export function assertSpectralStripSupported(settings: SpectralStripSettings): void {
  if (settings.imagingMode !== 'spectral') return;
  if (settings.edgeRenderMode === 'physical135') return;
  if (settings.useFilmOverlayTemplate === false) {
    throw new Error('Spectral template strips need the 135 overlay template path, which is currently disabled; re-enable template edges or use physical edges.');
  }
  if (!supportsSpectralStock(settings.brandText)) {
    throw new Error(`Spectral template strips need a stock with a spectral resource; ${settings.brandText} has none.`);
  }
  if ((settings.frameRenderMode ?? 'real135') !== 'real135') {
    throw new Error('Spectral template strips need the real-135 render mode.');
  }
  if (spectralStripSupported(settings)) return;
  throw new Error('Spectral template strip needs a supported stock and the 135 template path.');
}
