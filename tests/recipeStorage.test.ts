import { describe, expect, it } from 'vitest';
import { FilmType } from '../types';
import type { FilmSettings } from '../types';
import {
  deleteRecipe,
  loadRecipes,
  normalizeRecipe,
  saveRecipe,
  type RecipeStorage,
} from '../services/recipeStorage';

const settings: FilmSettings = {
  brandText: FilmType.KODAK_GOLD_200,
  customText: '',
  frameNumber: 1,
  frameNumberColor: '#44cc88',
  showDate: false,
  dateStr: '2026/07/12',
  borderColor: '#111111',
  holeColor: '#eeeeee',
  textColor: '#eab308',
  borderSize: 12,
  grainIntensity: 15,
  holeType: 'rounded',
  outputFormat: 'image/jpeg',
  outputQuality: 0.95,
  processingMode: 'preview',
  frameRenderMode: 'real135',
  scanOutputAspect: 'native',
  autoCropToFilmRatio: true,
  enableRealisticRebate: true,
  maxRollFrames: 36,
  useFilmOverlayTemplate: true,
  filmOverlayUrl: '/runtime-only.png',
};

function memoryStorage(initial?: string): RecipeStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

describe('recipe normalization', () => {
  it('returns no recipes for invalid JSON or unavailable storage', () => {
    expect(loadRecipes(memoryStorage('{invalid'))).toEqual([]);
    expect(loadRecipes(null)).toEqual([]);
  });

  it('trims and limits names while discarding unsupported settings fields', () => {
    const recipe = normalizeRecipe({
      id: 'recipe-1',
      name: `  ${'x'.repeat(50)}  `,
      settings: {
        borderSize: 999,
        outputFormat: 'invalid',
        filmOverlayUrl: '/must-not-persist.png',
        arbitrary: 'field',
      },
      updatedAt: 'invalid',
    });

    expect(recipe?.name).toBe('x'.repeat(40));
    expect(recipe?.settings).toEqual({ borderSize: 25 });
    expect(recipe?.updatedAt).toBe(0);
  });
});

describe('recipe storage', () => {
  it('overwrites a same-name recipe, preserves its id, and moves it first', () => {
    const storage = memoryStorage();
    const dependencies = { storage, createId: () => 'warm', now: () => 1 };
    saveRecipe('Warm', settings, dependencies);
    saveRecipe('Cool', { ...settings, grainIntensity: 2 }, {
      storage,
      createId: () => 'cool',
      now: () => 2,
    });
    const recipes = saveRecipe('  Warm  ', { ...settings, grainIntensity: 30 }, {
      storage,
      createId: () => 'unused',
      now: () => 3,
    });

    expect(recipes.map(recipe => recipe.name)).toEqual(['Warm', 'Cool']);
    expect(recipes[0]).toMatchObject({ id: 'warm', updatedAt: 3 });
    expect(recipes[0].settings.grainIntensity).toBe(30);
    expect(recipes[0].settings.frameNumberColor).toBe('#44cc88');
    expect(JSON.stringify(recipes[0])).not.toContain('runtime-only');
  });

  it('keeps only the 12 most recently saved recipes', () => {
    const storage = memoryStorage();
    for (let index = 0; index < 14; index += 1) {
      saveRecipe(`Recipe ${index}`, settings, {
        storage,
        createId: () => `id-${index}`,
        now: () => index,
      });
    }

    const recipes = loadRecipes(storage);
    expect(recipes).toHaveLength(12);
    expect(recipes[0].name).toBe('Recipe 13');
    expect(recipes.at(-1)?.name).toBe('Recipe 2');
  });

  it('deletes recipes by either id or name and tolerates write failures', () => {
    const storage = memoryStorage();
    saveRecipe('First', settings, { storage, createId: () => 'first-id', now: () => 1 });
    saveRecipe('Second', settings, { storage, createId: () => 'second-id', now: () => 2 });

    expect(deleteRecipe('first-id', storage).map(recipe => recipe.name)).toEqual(['Second']);
    expect(deleteRecipe('Second', storage)).toEqual([]);

    const failingStorage: RecipeStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveRecipe('Safe', settings, {
      storage: failingStorage,
      createId: () => 'safe',
      now: () => 1,
    })).not.toThrow();
  });
});
