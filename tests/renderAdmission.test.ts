import { describe, expect, it } from 'vitest';
import { FilmType, type FilmSettings } from '../types';
import {
  evaluateSingleImageRenderAdmission,
  getSingleImageCanvasSizes,
  getStripCanvasSize,
  settingsForImage,
} from '../services/renderAdmission';
import { createRuntimeRenderConfig } from '../services/runtimeConfig';

const settings: FilmSettings = {
  brandText: FilmType.KODAK_GOLD_200,
  customText: '',
  frameNumber: 35,
  showDate: false,
  dateStr: '2026/08/05',
  borderColor: '#111111',
  holeColor: '#eeeeee',
  textColor: '#eab308',
  borderSize: 12,
  grainIntensity: 15,
  holeType: 'square',
  outputFormat: 'image/jpeg',
  outputQuality: 0.95,
  processingMode: 'preview',
  frameRenderMode: 'real135',
  scanOutputAspect: 'native',
  maxRollFrames: 36,
  useFilmOverlayTemplate: true,
};

describe('pure render admission', () => {
  it('derives per-image frame numbers without mutating settings', () => {
    expect(settingsForImage(settings, 2).frameNumber).toBe(1);
    expect(settings.frameNumber).toBe(35);
  });

  it('mirrors real-135 and classic strip allocation dimensions', () => {
    expect(getStripCanvasSize(settings, 4)).toEqual({ width: 3_998, height: 1_038 });
    expect(getStripCanvasSize({ ...settings, frameRenderMode: 'classic' }, 6)).toEqual({
      width: 10_893,
      height: 1_600,
    });
  });

  it('includes the scanner canvas when 4:3 output is selected', () => {
    expect(getSingleImageCanvasSizes(
      { sourceWidth: 4_000, sourceHeight: 3_000 },
      { ...settings, scanOutputAspect: '4:3' },
    )).toHaveLength(2);
  });

  it('blocks a large classic output at 128 MiB and admits it at 700 MiB', () => {
    const image = { sourceWidth: 9_000, sourceHeight: 6_000 };
    const classic = { ...settings, frameRenderMode: 'classic' as const };

    expect(evaluateSingleImageRenderAdmission(
      image,
      classic,
      createRuntimeRenderConfig(128, null).renderBudgetLimits,
    )).toMatchObject({ ok: false, budget: { reason: 'max-pixels-exceeded' } });
    expect(evaluateSingleImageRenderAdmission(
      image,
      classic,
      createRuntimeRenderConfig(700, null).renderBudgetLimits,
    ).ok).toBe(true);
  });
});
