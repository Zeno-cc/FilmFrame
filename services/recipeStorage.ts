import type { FilmSettings } from '../types';
import { normalizeSettingsPatch } from './settingsStorage';

const STORAGE_KEY = 'filmFrame.recipes.v1';
const MAX_RECIPES = 12;
const MAX_NAME_LENGTH = 40;

export interface FilmRecipe {
  id: string;
  name: string;
  settings: Partial<FilmSettings>;
  updatedAt: number;
}

export interface RecipeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RecipeStorageDependencies {
  storage: RecipeStorage | null;
  createId: () => string;
  now: () => number;
}

function defaultStorage(): RecipeStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const defaultDependencies: RecipeStorageDependencies = {
  storage: null,
  createId: () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  },
  now: () => Date.now(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeRecipeName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : '';
}

export function normalizeRecipe(value: unknown): FilmRecipe | null {
  if (!isRecord(value)) return null;

  const name = normalizeRecipeName(value.name);
  if (!name || typeof value.id !== 'string' || !value.id) return null;

  return {
    id: value.id,
    name,
    settings: normalizeSettingsPatch(value.settings),
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : 0,
  };
}

export function loadRecipes(storage: RecipeStorage | null = defaultStorage()): FilmRecipe[] {
  if (!storage) return [];

  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];

    const recipes: FilmRecipe[] = [];
    const seenNames = new Set<string>();
    for (const value of parsed) {
      const recipe = normalizeRecipe(value);
      if (!recipe || seenNames.has(recipe.name)) continue;
      recipes.push(recipe);
      seenNames.add(recipe.name);
      if (recipes.length === MAX_RECIPES) break;
    }
    return recipes;
  } catch {
    return [];
  }
}

function persistRecipes(storage: RecipeStorage | null, recipes: readonly FilmRecipe[]): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(recipes.slice(0, MAX_RECIPES)));
  } catch {
    // Storage may be unavailable in privacy mode or over quota.
  }
}

export function saveRecipe(
  nameInput: string,
  settings: FilmSettings,
  overrides: Partial<RecipeStorageDependencies> = {}
): FilmRecipe[] {
  const deps: RecipeStorageDependencies = {
    ...defaultDependencies,
    ...overrides,
    storage: overrides.storage === undefined ? defaultStorage() : overrides.storage,
  };
  const name = normalizeRecipeName(nameInput);
  if (!name) return loadRecipes(deps.storage);

  const recipes = loadRecipes(deps.storage);
  const existing = recipes.find(recipe => recipe.name === name);
  const saved: FilmRecipe = {
    id: existing?.id ?? deps.createId(),
    name,
    settings: normalizeSettingsPatch(settings),
    updatedAt: deps.now(),
  };
  const next = [saved, ...recipes.filter(recipe => recipe.name !== name)].slice(0, MAX_RECIPES);
  persistRecipes(deps.storage, next);
  return next;
}

export function deleteRecipe(
  idOrName: string,
  storage: RecipeStorage | null = defaultStorage()
): FilmRecipe[] {
  const next = loadRecipes(storage).filter(
    recipe => recipe.id !== idOrName && recipe.name !== idOrName
  );
  persistRecipes(storage, next);
  return next;
}
