import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { DEFAULT_SCAN_BACKGROUND_COLOR, FILM_PRESETS, FilmType, type FilmSettings, type OutputMode } from '../../types';
import { getFrameNumberColor } from '../../services/filmFrameNumber';
import type { FilmRecipe } from '../../services/recipeStorage';
import { supportsReal135Template } from '../../services/filmOverlay';
import { ResetIcon } from '../app/FilmFrameAppIcons';
import { EyedropperIcon, SettingsIcon, TrashIcon } from '../icons/FilmFrameIcons';
import { IconButton } from '../ui';
import { RecipeSummaryCard } from './RecipeSummaryCard';

export type RecipeInspectorSection = 'all' | 'film' | 'output' | 'recipes';

export interface RecipeInspectorProps {
  settings: FilmSettings;
  onSettingsChange: (settings: FilmSettings) => void;
  outputMode: OutputMode;
  recipes: readonly FilmRecipe[];
  selectedRecipeId: string;
  recipeName: string;
  onRecipeNameChange: (name: string) => void;
  onSaveRecipe: () => void;
  onApplyRecipe: (recipeId: string) => void;
  onDeleteRecipe: (recipeId: string) => void;
  imageCount: number;
  pendingCount: number;
  processedCount?: number;
  primaryActionLabel: string;
  primaryActionDisabled?: boolean;
  primaryActionTone?: 'primary' | 'stop' | 'neutral';
  onPrimaryAction: () => void;
  onReprocessAll?: () => void;
  onReset: () => void;
  processing?: boolean;
  exporting?: boolean;
  selectedRecipeName?: string;
  section?: RecipeInspectorSection;
  showHeader?: boolean;
  showSummary?: boolean;
  showFooter?: boolean;
  id?: string;
  className?: string;
}

const inputClass = 'min-h-11 w-full rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-panel-soft)] px-3 text-sm text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-45';
const labelClass = 'mb-1.5 block text-xs font-medium text-[var(--ff-paper-muted)]';
const segmentClass = 'min-h-11 rounded-[3px] px-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-45';

type EyeDropperResult = { sRGBHex: string };
type EyeDropperConstructor = new () => { open: () => Promise<EyeDropperResult> };

function segmentState(selected: boolean): string {
  return selected
    ? 'bg-[var(--ff-amber)] text-[var(--ff-ink)]'
    : 'text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)]';
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-4 border-b border-[var(--ff-line-soft)] pb-2 text-xs font-semibold text-[var(--ff-paper-muted)]">
      {children}
    </h3>
  );
}

export function RecipeInspector({
  settings,
  onSettingsChange,
  outputMode,
  recipes,
  selectedRecipeId,
  recipeName,
  onRecipeNameChange,
  onSaveRecipe,
  onApplyRecipe,
  onDeleteRecipe,
  imageCount,
  pendingCount,
  processedCount = 0,
  primaryActionLabel,
  primaryActionDisabled = false,
  primaryActionTone = 'primary',
  onPrimaryAction,
  onReprocessAll,
  onReset,
  processing = false,
  exporting = false,
  selectedRecipeName,
  section = 'all',
  showHeader = true,
  showSummary = true,
  showFooter = true,
  id = 'recipe-inspector',
  className = '',
}: RecipeInspectorProps) {
  const [isPickingScanBackground, setIsPickingScanBackground] = useState(false);
  const disabled = processing || exporting;
  const supportsReal135 = supportsReal135Template(settings.brandText);
  const isReal135 = supportsReal135 && (settings.frameRenderMode ?? 'real135') === 'real135';
  const effectiveFrameNumberColor = getFrameNumberColor(
    settings,
    settings.textColor || FILM_PRESETS[settings.brandText]?.brandColor || '#d99a16',
  );
  const showFilm = section === 'all' || section === 'film';
  const showOutput = section === 'all' || section === 'output';
  const showRecipes = section === 'all' || section === 'recipes';

  const update = (patch: Partial<FilmSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  };

  const pickScanBackgroundColor = async () => {
    const EyeDropper = (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
    if (!EyeDropper || isPickingScanBackground) return;

    setIsPickingScanBackground(true);
    try {
      const { sRGBHex } = await new EyeDropper().open();
      update({ scanBackgroundColor: sRGBHex.toLowerCase() });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.warn('Unable to pick a scan background color.', error);
      }
    } finally {
      setIsPickingScanBackground(false);
    }
  };

  const updateNumber = (
    event: ChangeEvent<HTMLInputElement>,
    key: 'frameNumber' | 'borderSize' | 'grainIntensity',
  ) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;

    const bounds = key === 'frameNumber'
      ? [1, settings.maxRollFrames ?? 36]
      : key === 'borderSize'
        ? [5, 25]
        : [0, 60];
    const normalized = Math.min(bounds[1], Math.max(bounds[0], Math.trunc(value)));
    update({ [key]: normalized });
  };

  const handleRecipeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && recipeName.trim()) {
      event.preventDefault();
      onSaveRecipe();
    }
  };

  const footerSummary = outputMode === 'strip'
    ? `${imageCount} 张 · ${settings.outputFormat === 'image/png' ? 'PNG' : 'JPG'} · 长条输出`
    : `${pendingCount} 张待冲洗 · ${processedCount} 张已出片 · ${settings.outputFormat === 'image/png' ? 'PNG' : 'JPG'}`;
  const primaryTone = primaryActionTone === 'stop'
    ? 'border border-[var(--ff-safelight)] bg-[var(--ff-safelight-soft)] text-[var(--ff-paper)]'
    : primaryActionTone === 'neutral'
      ? 'border border-[var(--ff-line-strong)] bg-[var(--ff-panel-soft)] text-[var(--ff-paper)]'
      : 'bg-[var(--ff-amber)] text-[var(--ff-ink)] hover:bg-[var(--ff-amber-hover)]';

  return (
    <aside
      id={id}
      aria-label="暗房配方"
      className={`ff-recipe-inspector flex min-h-0 flex-col border-l border-[var(--ff-line-soft)] bg-[var(--ff-panel)] ${className}`}
    >
      {showHeader && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ff-line-soft)] px-5 py-4">
          <div className="flex items-center gap-2">
            <SettingsIcon className="text-[var(--ff-amber)]" />
            <div>
              <h2 className="text-base font-semibold text-[var(--ff-paper)]">暗房配方</h2>
              <div className="text-[10px] text-[var(--ff-paper-dim)]" aria-hidden="true">DARKROOM RECIPE</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="inline-flex min-h-11 items-center gap-2 rounded-[4px] px-2.5 text-xs text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:opacity-40"
          >
            <ResetIcon size={16} />
            重置
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5">
        {showSummary && section === 'all' && (
          <RecipeSummaryCard
            settings={settings}
            outputMode={outputMode}
            recipeName={selectedRecipeName}
            pendingCount={pendingCount}
          />
        )}

        {showFilm && (
          <section aria-labelledby={`${id}-film-heading`}>
            <div id={`${id}-film-heading`}><SectionHeading>胶片与片边</SectionHeading></div>
            <div className="space-y-4">
              <label className="block">
                <span className={labelClass}>胶片型号</span>
                <select
                  value={settings.brandText}
                  onChange={event => update({ brandText: event.target.value as FilmType })}
                  disabled={disabled}
                  className={inputClass}
                >
                  {Object.values(FilmType).map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>

              {supportsReal135 && (
                <fieldset disabled={disabled}>
                  <legend className={labelClass}>片边模式</legend>
                  <div className="grid grid-cols-2 gap-1 rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-bg)] p-1">
                    <button
                      type="button"
                      aria-pressed={isReal135}
                      onClick={() => update({ frameRenderMode: 'real135' })}
                      className={`${segmentClass} ${segmentState(isReal135)}`}
                    >
                      真实 135
                    </button>
                    <button
                      type="button"
                      aria-pressed={!isReal135}
                      onClick={() => update({ frameRenderMode: 'classic' })}
                      className={`${segmentClass} ${segmentState(!isReal135)}`}
                    >
                      经典片边
                    </button>
                  </div>
                </fieldset>
              )}

              {!isReal135 && (
                <label className="block">
                  <span className={labelClass}>片边文字</span>
                  <input
                    type="text"
                    maxLength={80}
                    value={settings.customText}
                    placeholder="例如 SHOT BY ZENO"
                    onChange={event => update({ customText: event.target.value })}
                    disabled={disabled}
                    className={inputClass}
                  />
                </label>
              )}

              <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                <label className="block min-w-0">
                  <span className={labelClass}>起始帧号</span>
                  <input
                    type="number"
                    min={1}
                    max={settings.maxRollFrames ?? 36}
                    value={settings.frameNumber}
                    onChange={event => updateNumber(event, 'frameNumber')}
                    disabled={disabled}
                    className={inputClass}
                  />
                </label>
                <label className="block min-w-0 text-center">
                  <span className={labelClass}>帧号颜色</span>
                  <input
                    type="color"
                    aria-label="帧号颜色"
                    value={effectiveFrameNumberColor}
                    onChange={event => update({ frameNumberColor: event.target.value })}
                    disabled={disabled}
                    className="h-11 w-full cursor-pointer rounded-[4px] border border-[var(--ff-line)] bg-transparent p-1 disabled:opacity-45"
                  />
                  <span className="mt-1 block truncate font-mono text-[10px] text-[var(--ff-paper-dim)]">
                    {effectiveFrameNumberColor}
                  </span>
                </label>
              </div>

              {isReal135 && (
                <div>
                  <span className={labelClass}>齿孔颜色</span>
                  <div className="flex min-h-11 items-center gap-2">
                    <input
                      type="color"
                      aria-label="齿孔颜色"
                      value={settings.real135SprocketColor ?? '#000000'}
                      onChange={event => update({ real135SprocketColor: event.target.value })}
                      disabled={disabled}
                      className="h-11 w-14 shrink-0 cursor-pointer rounded-[4px] border border-[var(--ff-line)] bg-transparent p-1 disabled:opacity-45"
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--ff-paper-muted)]">
                      {settings.real135SprocketColor ?? '跟随原片'}
                    </span>
                    {settings.real135SprocketColor && (
                      <IconButton
                        icon={<ResetIcon size={17} />}
                        label="恢复原片齿孔颜色"
                        onClick={() => update({ real135SprocketColor: undefined })}
                        disabled={disabled}
                      />
                    )}
                  </div>
                </div>
              )}

              {!isReal135 && (
                <>
                  <label className="block">
                    <span className={labelClass}>默认日期</span>
                    <input
                      type="text"
                      value={settings.dateStr}
                      placeholder="YYYY/MM/DD"
                      onChange={event => update({ dateStr: event.target.value })}
                      disabled={disabled}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--ff-paper-muted)]">
                    <input
                      type="checkbox"
                      checked={settings.showDate}
                      onChange={event => update({ showDate: event.target.checked })}
                      disabled={disabled}
                      className="h-4 w-4 accent-[var(--ff-amber)]"
                    />
                    显示 EXIF 日期或默认日期
                  </label>
                  <fieldset disabled={disabled}>
                    <legend className={labelClass}>齿孔形状</legend>
                    <div className="grid grid-cols-2 gap-1 rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-bg)] p-1">
                      {(['square', 'rounded'] as const).map(holeType => (
                        <button
                          key={holeType}
                          type="button"
                          aria-pressed={settings.holeType === holeType}
                          onClick={() => update({ holeType })}
                          className={`${segmentClass} ${segmentState(settings.holeType === holeType)}`}
                        >
                          {holeType === 'square' ? '方孔' : '圆角孔'}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['borderColor', '边框色'],
                      ['holeColor', '齿孔色'],
                      ['textColor', '文字色'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="block text-center">
                        <span className="mb-1.5 block text-xs text-[var(--ff-paper-dim)]">{label}</span>
                        <input
                          type="color"
                          value={settings[key]}
                          onChange={event => update({ [key]: event.target.value })}
                          disabled={disabled}
                          className="h-11 w-full cursor-pointer rounded-[4px] border border-[var(--ff-line)] bg-transparent p-1 disabled:opacity-45"
                        />
                        <span className="mt-1 block truncate font-mono text-[10px] text-[var(--ff-paper-dim)]">{settings[key]}</span>
                      </label>
                    ))}
                  </div>
                  <label className="block">
                    <span className={`${labelClass} flex justify-between`}><span>边框尺寸</span><span className="font-mono">{settings.borderSize}%</span></span>
                    <input
                      type="range"
                      min={5}
                      max={25}
                      step={1}
                      value={settings.borderSize}
                      aria-label="边框尺寸"
                      onChange={event => updateNumber(event, 'borderSize')}
                      disabled={disabled}
                      className="min-h-11 w-full accent-[var(--ff-amber)]"
                    />
                  </label>
                </>
              )}

              <label className="block">
                <span className={`${labelClass} flex justify-between`}><span>颗粒强度</span><span className="font-mono">{settings.grainIntensity}</span></span>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={1}
                  value={settings.grainIntensity}
                  aria-label="颗粒强度"
                  onChange={event => updateNumber(event, 'grainIntensity')}
                  disabled={disabled}
                  className="min-h-11 w-full accent-[var(--ff-amber)]"
                />
              </label>
            </div>
          </section>
        )}

        {showOutput && (
          <section aria-labelledby={`${id}-output-heading`}>
            <div id={`${id}-output-heading`}><SectionHeading>输出</SectionHeading></div>
            <div className="space-y-4">
              {isReal135 && outputMode === 'single' && (
                <fieldset disabled={disabled}>
                  <legend className={labelClass}>扫描输出</legend>
                  <div className="grid grid-cols-2 gap-1 rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-bg)] p-1">
                    {(['4:3', 'native'] as const).map(scanOutputAspect => (
                      <button
                        key={scanOutputAspect}
                        type="button"
                        aria-pressed={(settings.scanOutputAspect ?? '4:3') === scanOutputAspect}
                        onClick={() => update({ scanOutputAspect })}
                        className={`${segmentClass} ${segmentState((settings.scanOutputAspect ?? '4:3') === scanOutputAspect)}`}
                      >
                        {scanOutputAspect === '4:3' ? '保留扫描背景' : '仅保留底片'}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {isReal135 && outputMode === 'single' && (settings.scanOutputAspect ?? '4:3') === '4:3' && (
                <div className="block">
                  <span className={labelClass}>扫描背景色</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      aria-label="扫描背景色"
                      value={settings.scanBackgroundColor ?? DEFAULT_SCAN_BACKGROUND_COLOR}
                      onChange={event => update({ scanBackgroundColor: event.target.value })}
                      disabled={disabled}
                      className="h-11 w-14 shrink-0 cursor-pointer rounded-[4px] border border-[var(--ff-line)] bg-transparent p-1 disabled:opacity-45"
                    />
                    {'EyeDropper' in window && (
                      <IconButton
                        icon={<EyedropperIcon size={18} />}
                        label="从屏幕取色"
                        onClick={() => void pickScanBackgroundColor()}
                        disabled={disabled || isPickingScanBackground}
                      />
                    )}
                    <span className="font-mono text-xs text-[var(--ff-paper-muted)]">
                      {settings.scanBackgroundColor ?? DEFAULT_SCAN_BACKGROUND_COLOR}
                    </span>
                  </div>
                </div>
              )}

              {isReal135 && (
                <fieldset disabled={disabled}>
                  <legend className={labelClass}>处理模式</legend>
                  <div className="grid grid-cols-2 gap-1 rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-bg)] p-1">
                    {(['preview', 'high'] as const).map(processingMode => (
                      <button
                        key={processingMode}
                        type="button"
                        aria-pressed={(settings.processingMode ?? 'preview') === processingMode}
                        onClick={() => update({ processingMode })}
                        className={`${segmentClass} ${segmentState((settings.processingMode ?? 'preview') === processingMode)}`}
                      >
                        {processingMode === 'preview' ? '快速预览' : '高清出片'}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset disabled={disabled}>
                <legend className={labelClass}>输出格式</legend>
                <div className="grid grid-cols-2 gap-1 rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-bg)] p-1">
                  <button
                    type="button"
                    aria-pressed={settings.outputFormat === 'image/jpeg'}
                    onClick={() => update({ outputFormat: 'image/jpeg' })}
                    className={`${segmentClass} ${segmentState(settings.outputFormat === 'image/jpeg')}`}
                  >
                    JPG
                  </button>
                  <button
                    type="button"
                    aria-pressed={settings.outputFormat === 'image/png'}
                    onClick={() => update({ outputFormat: 'image/png' })}
                    className={`${segmentClass} ${segmentState(settings.outputFormat === 'image/png')}`}
                  >
                    PNG
                  </button>
                </div>
              </fieldset>

              {settings.outputFormat === 'image/jpeg' && (
                <label className="block">
                  <span className={`${labelClass} flex justify-between`}><span>JPG 质量</span><span className="font-mono">{Math.round(settings.outputQuality * 100)}%</span></span>
                  <input
                    type="range"
                    min={0.5}
                    max={1}
                    step={0.05}
                    value={settings.outputQuality}
                    aria-label="JPG 质量"
                    onChange={event => update({ outputQuality: Number(event.target.value) })}
                    disabled={disabled}
                    className="min-h-11 w-full accent-[var(--ff-amber)]"
                  />
                </label>
              )}

              <div className="rounded-[4px] border border-[var(--ff-line-soft)] bg-[var(--ff-bg)] px-3 py-2 text-xs leading-5 text-[var(--ff-paper-dim)]">
                当前配方色标：
                <span className="ml-1 font-mono text-[var(--ff-paper-muted)]">{FILM_PRESETS[settings.brandText]?.brandColor}</span>
              </div>
            </div>
          </section>
        )}

        {showRecipes && (
          <section aria-labelledby={`${id}-recipes-heading`}>
            <div id={`${id}-recipes-heading`}><SectionHeading>我的暗房配方</SectionHeading></div>
            <div className="space-y-3">
              {recipes.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    aria-label="选择本地配方"
                    value={selectedRecipeId}
                    onChange={event => onApplyRecipe(event.target.value)}
                    disabled={disabled}
                    className={`${inputClass} min-w-0 flex-1`}
                  >
                    <option value="">选择配方</option>
                    {recipes.map(recipe => (
                      <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="删除所选配方"
                    title="删除所选配方"
                    disabled={!selectedRecipeId || disabled}
                    onClick={() => selectedRecipeId && onDeleteRecipe(selectedRecipeId)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[4px] border border-[var(--ff-line)] text-[var(--ff-danger)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:opacity-30"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ) : (
                <p className="text-xs leading-5 text-[var(--ff-paper-dim)]">还没有本地配方。保存后只会写入浏览器偏好，不会保存照片。</p>
              )}
              <div className="flex gap-2">
                <input
                  value={recipeName}
                  maxLength={40}
                  onChange={event => onRecipeNameChange(event.target.value)}
                  onKeyDown={handleRecipeKeyDown}
                  placeholder="为当前设置命名"
                  aria-label="配方名称"
                  disabled={disabled}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={onSaveRecipe}
                  disabled={!recipeName.trim() || disabled}
                  className="min-h-11 rounded-[4px] border border-[var(--ff-line-strong)] px-3 text-xs font-medium text-[var(--ff-paper)] hover:bg-[var(--ff-panel-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:opacity-30"
                >
                  保存
                </button>
              </div>
              <p className="text-[11px] leading-5 text-[var(--ff-paper-dim)]">最多 12 条，名称最多 40 个字符；同名保存会覆盖旧配方。</p>
            </div>
          </section>
        )}
      </div>

      {showFooter && (
        <div className="shrink-0 border-t border-[var(--ff-line)] bg-[var(--ff-panel-raised)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
          <div className="mb-3 truncate font-mono text-[11px] text-[var(--ff-paper-dim)]">{footerSummary}</div>
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled}
            className={`min-h-11 w-full rounded-[4px] px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-40 ${primaryTone}`}
          >
            {primaryActionLabel}
          </button>
          {onReprocessAll && outputMode === 'single' && processedCount > 0 && !processing && (
            <button
              type="button"
              onClick={onReprocessAll}
              disabled={exporting}
              className="mt-2 min-h-11 w-full rounded-[4px] text-xs text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:opacity-40"
            >
              重新冲洗全部
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

export default RecipeInspector;
