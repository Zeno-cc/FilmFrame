import type { FilmSettings } from '../../types';

export function assertSpectralStripSupported(settings: Pick<FilmSettings, 'imagingMode' | 'edgeRenderMode'>): void {
  if (settings.imagingMode === 'spectral' && settings.edgeRenderMode !== 'physical135') {
    throw new Error('Spectral film processing currently supports real-135 single frames only; strip rendering is not yet available.');
  }
}
