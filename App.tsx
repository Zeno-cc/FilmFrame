
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_SCAN_BACKGROUND_COLOR, FilmType, FilmSettings, ImageItem, FILM_PRESETS, HoleType, OutputFormat, OutputMode } from './types';
import {
  cancelFilmRendering,
  disposeFilmWorkerClient,
  processImage,
  generateFilmStrip,
} from './services/filmWorkerClient';
import { createZipBlob } from './services/zip';
import {
  evaluateExportReadiness,
  type ExportReadyEntry,
} from './services/exportReadiness';
import { loadPreferences, mergeSettings, savePreferences } from './services/settingsStorage';
import { buildPreviewDownload } from './services/previewDownload';
import { prepareUploadedImages } from './services/uploadFiles';
import { acceptImageRenderResult } from './services/imageBatch';
import {
  deriveImageWorkflowStatus,
  getPrimaryAction,
  isImageTaskContextCurrent,
  isImageRemovalAllowed,
  moveItem,
} from './services/workflowState';
import {
  createArtifactFilename,
  createImageRenderKey,
  createOrderedStripKey,
  type RenderArtifact,
} from './services/renderResult';
import {
  getNextPreviewImageId,
  getPreviewImageIndex,
  PreviewDirection,
} from './services/previewNavigation';
import { DEFAULT_RENDER_TRANSFORM, normalizeRenderTransform } from './services/renderTransform';
import { deleteRecipe, loadRecipes, saveRecipe } from './services/recipeStorage';
import { shareArtifact } from './services/shareArtifact';
import { createPreviewRenderController } from './services/previewRenderController';
import {
  getReal135OverlayUrl,
  KODAK_GOLD_APERTURE_ASPECT,
  supportsReal135Template,
} from './services/filmOverlay';
import {
  evaluateBatchAdmission,
} from './services/batchAdmission';
import {
  evaluateSingleImageRenderAdmission,
  formatAdmissionFeedback,
  formatSingleImageAdmissionFeedback,
  frameNumberForIndex,
  getStripCanvasSize,
  settingsForImage,
} from './services/renderAdmission';
import {
  DEFAULT_RUNTIME_RENDER_CONFIG,
  loadRuntimeRenderConfig,
  type RuntimeConfigState,
} from './services/runtimeConfig';
import {
  getIncludedImageCount,
  getIncludedImages,
  getIncludedStripImages,
  isImageIncluded,
  setAllImagesIncluded,
  toggleImageIncluded,
} from './services/batchCuration';
import CropEditor from './components/CropEditor';
import { AppHeader } from './components/app/AppHeader';
import { AppShell } from './components/app/AppShell';
import {
  ContactSheet,
  EmptyDarkroom,
  FilmStripWorkspace,
  Workspace,
  WorkspaceToolbar,
  type FilmStripStageState,
} from './components/workspace';
import { RecipeInspector, type RecipeInspectorProps } from './components/settings/RecipeInspector';
import { MobileSettingsSheet } from './components/settings/MobileSettingsSheet';
import { MobileActionBar } from './components/mobile/MobileActionBar';
import { PreviewDialog } from './components/preview/PreviewDialog';
import { NoticeToast as DarkroomNoticeToast } from './components/feedback/NoticeToast';
import { ErrorDialog } from './components/feedback/ErrorDialog';
import { SupportDialog } from './components/feedback/SupportDialog';
import { DeleteAllPhotosDialog } from './components/feedback/DeleteAllPhotosDialog';
import { IncompleteExportDialog } from './components/feedback/IncompleteExportDialog';
// Security Fix: Import EXIF from local dependency instead of external CDN
import EXIF from 'exif-js';

const DEFAULT_SETTINGS: FilmSettings = {
  brandText: FilmType.KODAK_GOLD_200,
  customText: '', // Default empty
  frameNumber: 1,
  showDate: false,
  dateStr: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
  borderColor: '#090807',
  holeColor: '#f2efe6',
  textColor: '#eab308',
  borderSize: 12,
  grainIntensity: 15,
  holeType: 'square',
  outputFormat: 'image/jpeg', // Default to JPG for WeChat
  outputQuality: 0.95,
  processingMode: 'preview',
  frameRenderMode: 'real135',
  scanOutputAspect: 'native',
  scanBackgroundColor: DEFAULT_SCAN_BACKGROUND_COLOR,
  autoCropToFilmRatio: true,
  enableRealisticRebate: true,
  maxRollFrames: 36,
  useFilmOverlayTemplate: true,
  filmOverlayUrl: '/film-overlays/kodak-gold-200.png'
};

type PreviewState =
  | { type: 'single'; imageId: string }
  | { type: 'strip' };

type Notice = {
  tone: 'info' | 'warning' | 'success';
  message: string;
};

type PreviewRenderRequest = {
  item: ImageItem;
  index: number;
  settings: FilmSettings;
};

type BatchProcessOutcome = 'completed' | 'failed' | 'cancelled' | 'blocked' | 'noop';
type SingleExportEntry = ExportReadyEntry<ImageItem, RenderArtifact>;

function revokeObjectUrl(url?: string | null) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '_');
}

function getCurrentImageArtifact(
  item: ImageItem,
  index: number,
  settings: FilmSettings,
): RenderArtifact | null {
  if (!item.processedUrl || !item.processedMime || !item.processedSettingsKey) {
    return null;
  }

  const imageSettings = settingsForImage(settings, index);
  const settingsKey = createImageRenderKey(imageSettings, item.exifDate, item.transform);
  if (item.processedMime !== settings.outputFormat || item.processedSettingsKey !== settingsKey) {
    return null;
  }

  return {
    url: item.processedUrl,
    mime: item.processedMime,
    settingsKey: item.processedSettingsKey,
    byteSize: item.processedByteSize,
  };
}

function getSingleExportReadiness(images: readonly ImageItem[], settings: FilmSettings) {
  return evaluateExportReadiness(images.map((item, index) => ({
    item,
    index,
    included: isImageIncluded(item),
    artifact: getCurrentImageArtifact(item, index, settings),
  })));
}

function readImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to read image dimensions'));
    img.src = src;
  });
}

const App: React.FC = () => {
  const [initialPreferences] = useState(() => loadPreferences(DEFAULT_SETTINGS, 'single'));
  const [images, setImages] = useState<ImageItem[]>([]);
  const [settings, setSettings] = useState<FilmSettings>(() => initialPreferences.settings);
  const [processing, setProcessing] = useState(false);
  const [activeBatchMode, setActiveBatchMode] = useState<OutputMode | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [outputMode, setOutputMode] = useState<OutputMode>(() => initialPreferences.outputMode);
  const [stripResult, setStripResult] = useState<RenderArtifact | null>(null);
  const [showDonate, setShowDonate] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [queuedImageIds, setQueuedImageIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recipes, setRecipes] = useState(() => loadRecipes());
  const [recipeName, setRecipeName] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [previewSourceMode, setPreviewSourceMode] = useState<'before' | 'after'>('after');
  const [editorPreviewUrl, setEditorPreviewUrl] = useState<string | null>(null);
  const [previewRendering, setPreviewRendering] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [deleteAllPhotosOpen, setDeleteAllPhotosOpen] = useState(false);
  const [incompleteExportOpen, setIncompleteExportOpen] = useState(false);
  const [runtimeConfigState, setRuntimeConfigState] = useState<RuntimeConfigState>({
    status: 'loading',
    config: DEFAULT_RUNTIME_RENDER_CONFIG,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cropTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreCropFocusRef = useRef(false);
  const imagesRef = useRef<ImageItem[]>([]);
  const settingsRef = useRef<FilmSettings>(settings);
  const stripResultRef = useRef<RenderArtifact | null>(null);
  const renderGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const hasReal135Template = supportsReal135Template(settings.brandText);
  const isReal135Mode = hasReal135Template && (settings.frameRenderMode ?? 'real135') === 'real135';
  const renderConfigReady = runtimeConfigState.status !== 'loading';
  const renderBudgetLimits = runtimeConfigState.config.renderBudgetLimits;

  // Drag and drop refs
  const dragItem = useRef<number | null>(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    stripResultRef.current = stripResult;
  }, [stripResult]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      renderGenerationRef.current += 1;
      disposeFilmWorkerClient();
      imagesRef.current.forEach(img => {
        revokeObjectUrl(img.previewUrl);
        revokeObjectUrl(img.processedUrl);
      });
      revokeObjectUrl(stripResultRef.current?.url);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const loadRuntimeConfig = async () => {
      const result = await loadRuntimeRenderConfig({ signal: controller.signal });
      if (!active || controller.signal.aborted) return;

      setRuntimeConfigState(result);
      if (result.status === 'fallback') {
        setNotice(current => current ?? {
          tone: 'warning',
          message: '运行配置暂时无法读取，当前按 700 MiB 的 Canvas 安全上限继续使用。刷新页面可重试。',
        });
      }

      // Read with the current session before refresh rotates its opaque token.
      void fetch('/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-FilmFrame-CSRF': '1' },
        signal: controller.signal,
      }).catch(() => undefined);
    };

    void loadRuntimeConfig();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    savePreferences(settings, outputMode);
  }, [settings, outputMode]);

  useEffect(() => {
    const desktopLayout = window.matchMedia('(min-width: 1180px)');
    const closeDrawerOnDesktop = () => {
      if (desktopLayout.matches) setSettingsOpen(false);
    };
    closeDrawerOnDesktop();
    desktopLayout.addEventListener('change', closeDrawerOnDesktop);
    return () => desktopLayout.removeEventListener('change', closeDrawerOnDesktop);
  }, []);

  const navigatePreview = useCallback((direction: PreviewDirection) => {
    setPreview(current => {
      if (current?.type !== 'single') return current;

      const nextImageId = getNextPreviewImageId(imagesRef.current, current.imageId, direction);
      return nextImageId ? { type: 'single', imageId: nextImageId } : null;
    });
  }, []);

  const closeCropEditor = useCallback(() => {
    restoreCropFocusRef.current = true;
    setIsCropping(false);
  }, []);

  useEffect(() => {
    if (isCropping || !restoreCropFocusRef.current) return;
    restoreCropFocusRef.current = false;
    window.requestAnimationFrame(() => cropTriggerRef.current?.focus({ preventScroll: true }));
  }, [isCropping]);

  useEffect(() => {
    if (!preview) return;

    if (preview.type === 'strip') {
      const currentKey = createOrderedStripKey(settings, getIncludedStripImages(images));
      if (
        !stripResult
        || stripResult.settingsKey !== currentKey
        || stripResult.mime !== settings.outputFormat
      ) {
        setPreview(null);
      }
      return;
    }

    if (images.length === 0) {
      setPreview(null);
      return;
    }

    if (getPreviewImageIndex(images, preview.imageId) === -1) {
      setPreview({ type: 'single', imageId: images[0].id });
    }
  }, [images, preview, settings, stripResult]);

  useEffect(() => {
    const preset = FILM_PRESETS[settings.brandText];
    if (preset) {
      const recommendedHoleType: HoleType = preset.holeRounding > 0.4 ? 'rounded' : 'square';
      setSettings(prev => ({ 
        ...prev, 
        textColor: preset.brandColor,
        holeType: recommendedHoleType,
        frameRenderMode: hasReal135Template ? prev.frameRenderMode : 'classic',
        filmOverlayUrl: getReal135OverlayUrl(settings.brandText) ?? prev.filmOverlayUrl,
      }));
    }
  }, [settings.brandText]);

  const readExifDate = useCallback(async (file: File): Promise<string> => {
    let exifDate = '';
    await Promise.race([
      new Promise((resolve) => {
        EXIF.getData(file as any, function(this: any) {
          const date = EXIF.getTag(this, "DateTimeOriginal");
          if (date) {
            exifDate = date.split(' ')[0].replace(/:/g, '/');
          }
          resolve(null);
        });
      }),
      new Promise((resolve) => setTimeout(resolve, 1000))
    ]);
    return exifDate;
  }, []);

  const addFiles = useCallback(async (files: Iterable<File>) => {
    const { images: newImages, errors: uploadErrors, warnings: uploadWarnings } = await prepareUploadedImages(files, {
      createId: () => Math.random().toString(36).substr(2, 9),
      createObjectUrl: file => URL.createObjectURL(file),
      revokeObjectUrl,
      readImageSize,
      readExifDate,
    });
    const nextImages = [...imagesRef.current, ...newImages];
    const admission = newImages.length > 0
      ? evaluateBatchAdmission({
        operation: 'process',
        includedImages: getIncludedImages(nextImages),
        totalImageCount: nextImages.length,
      })
      : null;

    if (uploadErrors.length > 0) {
      setErrorMsg(`无法添加以下文件：\n${uploadErrors.join('\n')}`);
    }
    if (uploadWarnings.length > 0 || (admission && admission.status !== 'ok')) {
      const messages = [
        uploadWarnings.length > 0 ? `大图提示：${uploadWarnings.join('；')}` : '',
        admission && admission.status !== 'ok'
          ? formatAdmissionFeedback(admission, '批次处理')
          : '',
      ].filter(Boolean);
      setNotice({ tone: 'warning', message: messages.join('\n') });
    } else if (newImages.length > 0) {
      setNotice({ tone: 'success', message: `已添加 ${newImages.length} 张照片，照片仅在本机处理。` });
    }

    imagesRef.current = nextImages;
    setImages(nextImages);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [readExifDate]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    await addFiles(Array.from(files));
  }, [addFiles]);

  const removeImage = (id: string) => {
    if (!isImageRemovalAllowed(processing, outputMode, exporting)) return;
    const currentImages = imagesRef.current;
    const targetIndex = currentImages.findIndex(img => img.id === id);
    const target = targetIndex >= 0 ? currentImages[targetIndex] : undefined;
    revokeObjectUrl(target?.processedUrl);
    revokeObjectUrl(target?.previewUrl);

    const nextImages = currentImages.filter(img => img.id !== id);
    imagesRef.current = nextImages;
    setImages(nextImages);

    if (nextImages.length === 0) {
      setStripResult(prev => {
        revokeObjectUrl(prev?.url);
        stripResultRef.current = null;
        return null;
      });
    }

    if (preview?.type === 'single' && preview.imageId === id) {
      const nextPreviewImage = nextImages[Math.min(targetIndex, nextImages.length - 1)];
      setPreview(nextPreviewImage ? { type: 'single', imageId: nextPreviewImage.id } : null);
    }
  };

  const openDeleteAllPhotos = () => {
    if (processing || exporting || imagesRef.current.length === 0) return;
    setDeleteAllPhotosOpen(true);
  };

  const confirmDeleteAllPhotos = () => {
    if (processing || exporting || imagesRef.current.length === 0) {
      setDeleteAllPhotosOpen(false);
      return;
    }

    renderGenerationRef.current += 1;
    imagesRef.current.forEach(item => {
      revokeObjectUrl(item.previewUrl);
      revokeObjectUrl(item.processedUrl);
    });
    revokeObjectUrl(stripResultRef.current?.url);

    imagesRef.current = [];
    stripResultRef.current = null;
    dragItem.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setImages([]);
    setStripResult(null);
    setPreview(null);
    setIsCropping(false);
    setEditorPreviewUrl(null);
    setPreviewRendering(false);
    setActiveBatchMode(null);
    setProcessingMessage('');
    setActiveImageId(null);
    setQueuedImageIds([]);
    setErrorMsg(null);
    setNotice(null);
    setIsDraggingUpload(false);
    setDeleteAllPhotosOpen(false);
    setIncompleteExportOpen(false);

    window.requestAnimationFrame(() => {
      document.getElementById('workspace-add-photos')?.focus({ preventScroll: true });
    });
  };

  const processAll = async (force = false): Promise<BatchProcessOutcome> => {
    if (processing || exporting) return 'noop';
    if (!renderConfigReady) {
      setNotice({ tone: 'info', message: '正在读取运行配置，请稍后再开始冲洗。' });
      return 'blocked';
    }

    const sourceImages = [...imagesRef.current];
    const batchSettings = settings;
    const batchMode = outputMode;
    if (sourceImages.length === 0) return 'noop';

    const includedEntries = sourceImages
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => isImageIncluded(item));
    if (includedEntries.length === 0) {
      setNotice({ tone: 'info', message: '请先选择至少一张照片，再开始冲洗。' });
      return 'blocked';
    }

    const batchEntries = includedEntries
      .filter(({ item, index }) => {
        if (batchMode === 'strip' || force) return true;
        const imageSettings = settingsForImage(batchSettings, index);
        return deriveImageWorkflowStatus(item, {
          expectedMime: batchSettings.outputFormat,
          expectedSettingsKey: createImageRenderKey(imageSettings, item.exifDate, item.transform),
        }).kind !== 'complete';
      });
    const batchImages = batchEntries.map(entry => entry.item);
    if (batchImages.length === 0) {
      setNotice({ tone: 'info', message: '当前成片均为最新，无需重新冲洗。' });
      return 'completed';
    }

    if (batchMode === 'single') {
      for (const { item, index } of batchEntries) {
        const canvasAdmission = evaluateSingleImageRenderAdmission(
          item,
          settingsForImage(batchSettings, index),
          renderBudgetLimits,
        );
        if (!canvasAdmission.ok) {
          setErrorMsg(formatSingleImageAdmissionFeedback(canvasAdmission, '开始冲洗'));
          return 'blocked';
        }
      }
    }

    const admission = batchMode === 'strip'
      ? evaluateBatchAdmission({
        operation: 'strip',
        includedImages: batchImages,
        totalImageCount: sourceImages.length,
        stripCanvas: getStripCanvasSize(batchSettings, batchImages.length),
        canvasLimits: renderBudgetLimits,
      })
      : evaluateBatchAdmission({
        operation: 'process',
        includedImages: batchImages,
        totalImageCount: sourceImages.length,
      });
    if (admission.status === 'blocked') {
      setErrorMsg(formatAdmissionFeedback(
        admission,
        batchMode === 'strip' ? '生成胶片长条' : '开始冲洗',
      ));
      return 'blocked';
    }

    const generation = ++renderGenerationRef.current;
    setProcessing(true);
    setActiveBatchMode(batchMode);
    setErrorMsg(null);
    setNotice(admission.status === 'warning'
      ? { tone: 'warning', message: formatAdmissionFeedback(admission, batchMode === 'strip' ? '生成胶片长条' : '开始冲洗') }
      : null);
    setQueuedImageIds(batchMode === 'single' ? batchImages.map(item => item.id) : []);
    setProcessingMessage(batchMode === 'strip' ? '正在拼合胶片长条...' : `正在处理 1/${batchImages.length}`);

    try {
      if (batchMode === 'strip') {
        const stripImages = getIncludedStripImages(sourceImages);
        const settingsKey = createOrderedStripKey(batchSettings, stripImages);
        setProcessingMessage(`正在拼合 ${batchImages.length} 张照片...`);
        const result = await generateFilmStrip(
          stripImages,
          batchSettings,
          renderBudgetLimits,
        );
        const currentKey = createOrderedStripKey(
          settingsRef.current,
          getIncludedStripImages(imagesRef.current),
        );

        if (!mountedRef.current || generation !== renderGenerationRef.current || currentKey !== settingsKey) {
          revokeObjectUrl(result.url);
          return 'cancelled';
        }

        const artifact: RenderArtifact = {
          url: result.url,
          mime: batchSettings.outputFormat,
          settingsKey,
          byteSize: result.byteSize,
        };
        setStripResult(prev => {
          revokeObjectUrl(prev?.url);
          stripResultRef.current = artifact;
          return artifact;
        });
      } else {
        const failedFiles: string[] = [];
        let completedCount = 0;
        for (let i = 0; i < batchEntries.length; i++) {
          if (generation !== renderGenerationRef.current) break;
          const { item, index } = batchEntries[i];
          if (!imagesRef.current.some(current => current.id === item.id)) continue;
          const imageSettings = settingsForImage(batchSettings, index);
          const settingsKey = createImageRenderKey(imageSettings, item.exifDate, item.transform);
          setActiveImageId(item.id);
          setQueuedImageIds(batchEntries.slice(i + 1).map(entry => entry.item.id));
          setProcessingMessage(`正在处理 ${i + 1}/${batchImages.length}`);
          try {
            const result = await processImage(
              item.file,
              imageSettings,
              item.exifDate,
              item.previewUrl,
              item.transform,
              renderBudgetLimits,
            );

            const currentIndex = imagesRef.current.findIndex(current => current.id === item.id);
            const currentItem = imagesRef.current[currentIndex];
            const currentSettingsKey = currentItem && currentIndex >= 0
              ? createImageRenderKey(
                  settingsForImage(settingsRef.current, currentIndex),
                  currentItem.exifDate,
                  currentItem.transform,
                )
              : null;
            if (currentSettingsKey !== settingsKey) {
              revokeObjectUrl(result.url);
              continue;
            }

            const merged = acceptImageRenderResult(
              imagesRef.current,
              item.id,
              {
                processedUrl: result.url,
                processedMime: batchSettings.outputFormat,
                processedSettingsKey: settingsKey,
                processedByteSize: result.byteSize,
                processingError: undefined,
              },
              { result: generation, current: renderGenerationRef.current },
            );

            if (!mountedRef.current || !merged.accepted) {
              revokeObjectUrl(result.url);
              continue;
            }

            imagesRef.current = merged.items;
            setImages(merged.items);
            revokeObjectUrl(merged.replacedUrl);
            completedCount += 1;
          } catch (err) {
            const taskStillCurrent = isImageTaskContextCurrent({
              mounted: mountedRef.current,
              resultGeneration: generation,
              currentGeneration: renderGenerationRef.current,
              itemExists: imagesRef.current.some(current => current.id === item.id),
            });
            if (!taskStillCurrent) {
              if (!mountedRef.current || generation !== renderGenerationRef.current) break;
              continue;
            }
            console.error('Processing failed for image', i, err);
            failedFiles.push(item.file.name);
            if (generation === renderGenerationRef.current) {
              const nextImages = imagesRef.current.map(current =>
                current.id === item.id
                  ? { ...current, processingError: '处理失败，请重试' }
                  : current
              );
              imagesRef.current = nextImages;
              setImages(nextImages);
            }
          }
        }
        if (!mountedRef.current || generation !== renderGenerationRef.current) {
          return 'cancelled';
        }
        if (mountedRef.current && generation === renderGenerationRef.current) {
          if (failedFiles.length > 0) {
            setErrorMsg(`以下文件处理失败，其他图片已保留处理结果：\n${failedFiles.map(name => `"${name}"`).join('\n')}`);
          }
          setNotice({
            tone: failedFiles.length > 0 ? 'warning' : 'success',
            message: failedFiles.length > 0
              ? `这一卷已完成 ${completedCount} 张，${failedFiles.length} 张需要处理。`
              : `这一卷冲洗完成，共 ${completedCount} 张成片。`,
          });
        }
        return failedFiles.length > 0 ? 'failed' : 'completed';
      }
      return 'completed';
    } catch (e) {
      if (!mountedRef.current || generation !== renderGenerationRef.current) return 'cancelled';
      console.error(e);
      setErrorMsg('处理过程中发生错误，可能是图片文件损坏或内存不足。');
      return 'failed';
    } finally {
      if (mountedRef.current && generation === renderGenerationRef.current) {
        setProcessing(false);
        setActiveBatchMode(null);
        setProcessingMessage('');
        setActiveImageId(null);
        setQueuedImageIds([]);
      }
    }
  };

  const stopProcessing = () => {
    if (!processing) return;
    renderGenerationRef.current += 1;
    cancelFilmRendering();
    setProcessing(false);
    setActiveBatchMode(null);
    setProcessingMessage('');
    setActiveImageId(null);
    setQueuedImageIds([]);
    setNotice({ tone: 'info', message: '已停止后续冲洗，已完成的成片仍会保留。' });
  };

  const retryImage = async (id: string) => {
    if (processing || exporting) return;
    if (!renderConfigReady) {
      setNotice({ tone: 'info', message: '正在读取运行配置，请稍后再重新冲洗。' });
      return;
    }

    const currentImages = imagesRef.current;
    const index = currentImages.findIndex(img => img.id === id);
    const item = currentImages[index];
    if (!item) return;
    if (!isImageIncluded(item)) {
      setNotice({ tone: 'info', message: '这张照片未入选，请先加入本次冲洗。' });
      return;
    }

    const retrySettings = settingsForImage(settings, index);
    const canvasAdmission = evaluateSingleImageRenderAdmission(
      item,
      retrySettings,
      renderBudgetLimits,
    );
    if (!canvasAdmission.ok) {
      setErrorMsg(formatSingleImageAdmissionFeedback(canvasAdmission, '重新冲洗此张照片'));
      return;
    }

    const admission = evaluateBatchAdmission({
      operation: 'process',
      includedImages: [item],
      totalImageCount: currentImages.length,
    });
    if (admission.status === 'blocked') {
      setErrorMsg(formatAdmissionFeedback(admission, '重新冲洗此张照片'));
      return;
    }

    const generation = ++renderGenerationRef.current;
    const settingsKey = createImageRenderKey(retrySettings, item.exifDate, item.transform);

    setProcessing(true);
    setActiveBatchMode('single');
    setErrorMsg(null);
    if (admission.status === 'warning') {
      setNotice({ tone: 'warning', message: formatAdmissionFeedback(admission, '重新冲洗此张照片') });
    }
    setActiveImageId(id);
    setProcessingMessage(`正在重试 ${item.file.name}`);
    setImages(prev => {
      const nextImages = prev.map(img =>
        img.id === id ? { ...img, processingError: undefined } : img
      );
      imagesRef.current = nextImages;
      return nextImages;
    });

    try {
      const result = await processImage(
        item.file,
        retrySettings,
        item.exifDate,
        item.previewUrl,
        item.transform,
        renderBudgetLimits,
      );

      const currentIndex = imagesRef.current.findIndex(current => current.id === id);
      const currentItem = imagesRef.current[currentIndex];
      const currentSettingsKey = currentItem && currentIndex >= 0
        ? createImageRenderKey(
            settingsForImage(settingsRef.current, currentIndex),
            currentItem.exifDate,
            currentItem.transform,
          )
        : null;
      if (currentSettingsKey !== settingsKey) {
        revokeObjectUrl(result.url);
        return;
      }

      const merged = acceptImageRenderResult(
        imagesRef.current,
        id,
        {
          processedUrl: result.url,
          processedMime: settings.outputFormat,
          processedSettingsKey: settingsKey,
          processedByteSize: result.byteSize,
          processingError: undefined,
        },
        { result: generation, current: renderGenerationRef.current },
      );

      if (!mountedRef.current || !merged.accepted) {
        revokeObjectUrl(result.url);
        return;
      }

      imagesRef.current = merged.items;
      setImages(merged.items);
      revokeObjectUrl(merged.replacedUrl);
    } catch (err) {
      if (!isImageTaskContextCurrent({
        mounted: mountedRef.current,
        resultGeneration: generation,
        currentGeneration: renderGenerationRef.current,
        itemExists: imagesRef.current.some(current => current.id === id),
      })) return;
      console.error('Retry failed for image', id, err);
      setImages(prev => {
        const nextImages = prev.map(img =>
          img.id === id ? { ...img, processingError: '重试失败，已保留上次结果' } : img
        );
        imagesRef.current = nextImages;
        return nextImages;
      });
      setErrorMsg(`"${item.file.name}" 重试失败，可能是图片文件损坏或内存不足。`);
    } finally {
      if (mountedRef.current && generation === renderGenerationRef.current) {
        setProcessing(false);
        setActiveBatchMode(null);
        setProcessingMessage('');
        setActiveImageId(null);
      }
    }
  };

  const downloadImage = (artifact: RenderArtifact, filename: string) => {
    const link = document.createElement('a');
    link.href = artifact.url;
    link.download = createArtifactFilename(filename, artifact.mime);
    link.click();
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportSingleEntries = async (
    readyEntries: readonly SingleExportEntry[],
    totalImageCount: number,
  ) => {
    if (readyEntries.length === 0) {
      setErrorMsg('暂无可下载的成片，请先完成冲洗。');
      return;
    }
    if (readyEntries.some(({ artifact }) => artifact.byteSize === undefined)) {
      setErrorMsg('部分成片缺少容量信息，请重新冲洗这些照片后再打包。');
      return;
    }

    const initialZipAdmission = evaluateBatchAdmission({
      operation: 'zip',
      includedImages: readyEntries.map(({ item }) => item),
      totalImageCount,
      zipInputBytes: readyEntries.reduce((total, { artifact }) => total + artifact.byteSize!, 0),
    });
    if (initialZipAdmission.status === 'blocked') {
      setErrorMsg(formatAdmissionFeedback(initialZipAdmission, '打包下载'));
      return;
    }
    if (initialZipAdmission.status === 'warning') {
      setNotice({ tone: 'warning', message: formatAdmissionFeedback(initialZipAdmission, '打包下载') });
    }

    try {
      setExporting(true);
      setExportMessage(`正在打包 0/${readyEntries.length}`);
      const zipFiles = [];
      for (let idx = 0; idx < readyEntries.length; idx++) {
        setExportMessage(`正在打包 ${idx + 1}/${readyEntries.length}`);
        const { item, artifact, index } = readyEntries[idx];
        const response = await fetch(artifact.url);
        if (!response.ok) throw new Error(`Failed to read generated image ${idx + 1}`);
        const blob = await response.blob();
        zipFiles.push({
          name: `${String(index + 1).padStart(2, '0')}_${createArtifactFilename(item.file.name, artifact.mime)}`,
          blob,
        });
      }

      const zipBlob = await createZipBlob(zipFiles);
      downloadBlob(zipBlob, `filmframe_${timestampForFilename()}.zip`);
    } catch (error) {
      console.error('Failed to create ZIP archive', error);
      setErrorMsg('打包下载失败，请重新处理图片后再试。');
    } finally {
      setExporting(false);
      setExportMessage('');
    }
  };

  const downloadAll = async () => {
    if (exporting || processing) return;
    const currentImages = imagesRef.current;
    const currentSettings = settingsRef.current;
    if (getIncludedImageCount(currentImages) === 0) {
      setNotice({ tone: 'info', message: '请先选择至少一张照片，再导出成片。' });
      return;
    }

    if (outputMode === 'strip') {
      const currentKey = createOrderedStripKey(currentSettings, getIncludedStripImages(currentImages));
      const currentStrip = stripResultRef.current;
      if (currentStrip?.settingsKey === currentKey && currentStrip.mime === currentSettings.outputFormat) {
        downloadImage(currentStrip, `film_strip_${Date.now()}`);
      }
    } else {
      const readiness = getSingleExportReadiness(currentImages, currentSettings);
      if (readiness.status === 'incomplete') {
        setIncompleteExportOpen(true);
        return;
      }
      await exportSingleEntries(readiness.readyEntries, currentImages.length);
    }
  };

  const processRemainingAndExport = async () => {
    setIncompleteExportOpen(false);
    const outcome = await processAll();
    if (outcome !== 'completed') return;

    const currentImages = imagesRef.current;
    const readiness = getSingleExportReadiness(currentImages, settingsRef.current);
    if (readiness.status !== 'complete') return;
    await exportSingleEntries(readiness.readyEntries, currentImages.length);
  };

  const exportCurrentResults = async () => {
    setIncompleteExportOpen(false);
    const currentImages = imagesRef.current;
    const readiness = getSingleExportReadiness(currentImages, settingsRef.current);
    if (readiness.readyCount === 0) return;
    await exportSingleEntries(readiness.readyEntries, currentImages.length);
  };

  const moveImage = (id: string, direction: 'up' | 'down') => {
    if (processing || exporting) return;
    const nextImages = moveItem(imagesRef.current, id, direction);
    if (nextImages === imagesRef.current) return;
    imagesRef.current = [...nextImages];
    setImages([...nextImages]);
  };

  const toggleImageSelection = (id: string) => {
    if (processing || exporting) return;
    const currentImages = imagesRef.current;
    const nextImages = toggleImageIncluded(currentImages, id);
    if (nextImages === currentImages) return;
    imagesRef.current = nextImages;
    setImages(nextImages);
  };

  const setAllImageSelections = (included: boolean) => {
    if (processing || exporting) return;
    const currentImages = imagesRef.current;
    const nextImages = setAllImagesIncluded(currentImages, included);
    if (nextImages === currentImages) return;
    imagesRef.current = nextImages;
    setImages(nextImages);
  };

  const updateImageTransform = (id: string, patch: Partial<NonNullable<ImageItem['transform']>>) => {
    const nextImages = imagesRef.current.map(item =>
      item.id === id
        ? { ...item, transform: normalizeRenderTransform({ ...normalizeRenderTransform(item.transform), ...patch }) }
        : item
    );
    imagesRef.current = nextImages;
    setImages(nextImages);
  };

  const toggleMobileSettings = (trigger?: HTMLButtonElement) => {
    if (trigger) settingsTriggerRef.current = trigger;
    setSettingsOpen(open => !open);
  };

  const closeMobileSettings = () => {
    setSettingsOpen(false);
    window.requestAnimationFrame(() => settingsTriggerRef.current?.focus({ preventScroll: true }));
  };

  const openSupportFromSettings = () => {
    setSettingsOpen(false);
    window.requestAnimationFrame(() => setShowDonate(true));
  };

  const saveCurrentRecipe = () => {
    const next = saveRecipe(recipeName, settings);
    setRecipes(next);
    if (recipeName.trim()) {
      setNotice({ tone: 'success', message: `配方“${recipeName.trim().slice(0, 40)}”已保存在本机。` });
      setRecipeName('');
    }
  };

  const applyRecipe = (recipeId: string) => {
    const recipe = recipes.find(item => item.id === recipeId);
    if (!recipe) return;
    setSelectedRecipeId(recipeId);
    setSettings(current => mergeSettings(current, recipe.settings));
    setNotice({ tone: 'info', message: `已应用配方“${recipe.name}”，现有成片需要重新冲洗。` });
  };

  const removeRecipe = (recipeId: string) => {
    setRecipes(deleteRecipe(recipeId));
    if (selectedRecipeId === recipeId) setSelectedRecipeId('');
  };

  const shareCurrentPreview = async () => {
    if (!previewImageItem || !previewImageArtifact) return;
    try {
      const response = await fetch(previewImageArtifact.url);
      if (!response.ok) throw new Error('Unable to read generated image');
      const blob = await response.blob();
      const file = new File(
        [blob],
        createArtifactFilename(previewImageItem.file.name, previewImageArtifact.mime),
        { type: previewImageArtifact.mime },
      );
      const result = await shareArtifact(file, {
        title: 'FilmFrame 成片',
        text: '由 FilmFrame 在本机冲洗完成',
      });
      if (result.status === 'shared') setNotice({ tone: 'success', message: '成片已交给系统分享。' });
      else if (result.status === 'unsupported') setNotice({ tone: 'info', message: '当前浏览器不支持文件分享，请使用下载。' });
      else if (result.status === 'failed') setNotice({ tone: 'warning', message: '分享失败，成片仍可下载。' });
    } catch {
      setNotice({ tone: 'warning', message: '分享失败，成片仍可下载。' });
    }
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent<HTMLElement>, index: number) => {
    if (processing || exporting) return;
    dragItem.current = index;
    // Set effect
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (e: React.DragEvent<HTMLElement>, index: number) => {
     if (processing || exporting) return;
     if (dragItem.current === null) return;
     if (dragItem.current === index) return;

     const newImages = [...images];
     const draggedImage = newImages[dragItem.current];
     newImages.splice(dragItem.current, 1);
     newImages.splice(index, 0, draggedImage);
     
     dragItem.current = index;
     imagesRef.current = newImages;
     setImages(newImages);
  };

  const handleDragEnd = () => {
    dragItem.current = null;
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (processing || exporting) return;
    e.preventDefault(); // Necessary for onDrop/onDragEnter to work smoothly
  };

  const hasUploadFiles = (event: React.DragEvent<HTMLElement>) => {
    return Array.from(event.dataTransfer.types).includes('Files');
  };

  const handleUploadDragEnter = (event: React.DragEvent<HTMLElement>) => {
    if (!hasUploadFiles(event)) return;
    event.preventDefault();
    if (processing || exporting) {
      setIsDraggingUpload(false);
      return;
    }
    setIsDraggingUpload(true);
  };

  const handleUploadDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!hasUploadFiles(event)) return;
    event.preventDefault();
    if (processing || exporting) {
      event.dataTransfer.dropEffect = 'none';
      setIsDraggingUpload(false);
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
    setIsDraggingUpload(true);
  };

  const handleUploadDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingUpload(false);
  };

  const handleUploadDrop = async (event: React.DragEvent<HTMLElement>) => {
    if (!hasUploadFiles(event)) return;
    event.preventDefault();
    setIsDraggingUpload(false);
    if (processing || exporting) return;
    await addFiles(Array.from(event.dataTransfer.files));
  };

  const currentImageArtifacts = new Map(
    images.flatMap((img, index) => {
      const artifact = getCurrentImageArtifact(img, index, settings);
      return artifact ? [[img.id, artifact] as const] : [];
    }),
  );
  const includedImages = getIncludedImages(images);
  const includedCount = getIncludedImageCount(images);
  const currentStripKey = createOrderedStripKey(settings, getIncludedStripImages(images));
  const currentStripResult =
    stripResult?.settingsKey === currentStripKey && stripResult.mime === settings.outputFormat
      ? stripResult
      : null;
  const includedProcessedCount = includedImages.reduce(
    (count, image) => count + Number(currentImageArtifacts.has(image.id)),
    0,
  );
  const singleExportReadiness = getSingleExportReadiness(images, settings);
  const imageWorkflowStatuses = new Map(
    images.map((img, index) => {
      const imageSettings = settingsForImage(settings, index);
      return [
        img.id,
        deriveImageWorkflowStatus(img, {
          expectedMime: settings.outputFormat,
          expectedSettingsKey: createImageRenderKey(imageSettings, img.exifDate, img.transform),
          activeImageId,
          queuedImageIds,
        }),
      ] as const;
    }),
  );
  const includedPendingCount = includedImages
    .map(image => imageWorkflowStatuses.get(image.id)!)
    .filter(status => status.kind === 'unprocessed' || status.kind === 'stale' || status.kind === 'failed')
    .length;
  const hasExportAction = outputMode === 'single' ? includedCount > 0 : Boolean(currentStripResult);
  const previewImageIndex =
    preview?.type === 'single' ? getPreviewImageIndex(images, preview.imageId) : -1;
  const previewImageItem = previewImageIndex >= 0 ? images[previewImageIndex] : null;
  const previewImageArtifact = previewImageItem
    ? currentImageArtifacts.get(previewImageItem.id) ?? null
    : null;
  const previewImageSource =
    preview?.type === 'single' && previewImageItem
      ? previewImageArtifact?.url ?? previewImageItem.previewUrl
      : preview?.type === 'strip'
        ? currentStripResult?.url ?? null
        : null;
  const previewTitle =
    preview?.type === 'single' && previewImageItem
      ? previewImageItem.file.name
      : preview?.type === 'strip'
        ? 'Film Strip'
        : '';
  const previewDownload = preview
    ? buildPreviewDownload(
        preview,
        previewImageItem?.file.name ?? null,
        previewImageArtifact,
        currentStripResult,
      )
    : null;
  const previewTransform = normalizeRenderTransform(previewImageItem?.transform ?? DEFAULT_RENDER_TRANSFORM);
  useEffect(() => {
    setIsCropping(false);
  }, [preview?.type, previewImageItem?.id]);
  useEffect(() => {
    setEditorPreviewUrl(null);
    if (preview?.type !== 'single' || !previewImageItem || previewImageIndex < 0) {
      setPreviewRendering(false);
      return;
    }
    if (!renderConfigReady) {
      setPreviewRendering(false);
      return;
    }

    const previewSettings = {
      ...settingsForImage(settings, previewImageIndex),
      processingMode: 'preview' as const,
    };
    const canvasAdmission = evaluateSingleImageRenderAdmission(
      previewImageItem,
      previewSettings,
      renderBudgetLimits,
    );
    if (!canvasAdmission.ok) {
      setPreviewRendering(false);
      setNotice({
        tone: 'warning',
        message: formatSingleImageAdmissionFeedback(canvasAdmission, '生成即时预览'),
      });
      return;
    }

    setPreviewRendering(true);
    const controller = createPreviewRenderController<PreviewRenderRequest>({
      render: async request => (await processImage(
        request.item.file,
        { ...settingsForImage(request.settings, request.index), processingMode: 'preview' },
        request.item.exifDate,
        request.item.previewUrl,
        request.item.transform,
        renderBudgetLimits,
      )).url,
      onResult: url => {
        setEditorPreviewUrl(url);
        setPreviewRendering(false);
      },
      onError: () => {
        setPreviewRendering(false);
        setNotice({ tone: 'warning', message: '即时预览生成失败，原图和已有成片仍然可用。' });
      },
      revokeObjectURL: revokeObjectUrl,
    });
    controller.schedule({ item: previewImageItem, index: previewImageIndex, settings });
    return () => {
      controller.dispose();
      setEditorPreviewUrl(null);
    };
  }, [
    preview?.type,
    previewImageItem,
    previewImageIndex,
    renderBudgetLimits,
    renderConfigReady,
    settings,
  ]);

  const effectivePreviewSource =
    preview?.type === 'single' && previewImageItem
      ? previewSourceMode === 'before'
        ? previewImageItem.previewUrl
        : editorPreviewUrl ?? previewImageArtifact?.url ?? previewImageItem.previewUrl
      : previewImageSource;
  const processButtonLabel =
    images.length === 0
      ? '先添加图片'
      : includedCount === 0
        ? '请先选择至少一张照片'
      : !renderConfigReady
        ? '正在读取运行配置'
      : outputMode === 'strip'
        ? (currentStripResult ? '重新生成胶片长条' : '生成胶片长条')
        : includedPendingCount > 0
          ? `冲洗待更新照片 (${includedPendingCount})`
          : '全部成片均为最新';
  const downloadButtonLabel =
    outputMode === 'strip'
      ? '下载长条大图'
      : singleExportReadiness.status === 'complete'
        ? `打包下载 ZIP (${singleExportReadiness.readyCount})`
        : `完成冲洗并导出 ZIP (${singleExportReadiness.readyCount}/${singleExportReadiness.totalCount})`;
  const primaryActionState = exporting
    ? 'exporting'
    : processing
      ? 'processing'
      : images.length === 0
        ? 'empty'
        : includedCount === 0
          ? 'idle'
        : outputMode === 'single'
          ? includedPendingCount > 0 ? 'idle' : 'ready'
          : currentStripResult ? 'ready' : 'idle';
  const basePrimaryAction = getPrimaryAction(primaryActionState);
  const primaryAction = {
    ...basePrimaryAction,
    disabled: basePrimaryAction.disabled
      || (!renderConfigReady && basePrimaryAction.command === 'process')
      || (!processing && !exporting && images.length > 0 && includedCount === 0),
  };
  const imageRemovalAllowed = isImageRemovalAllowed(
    processing,
    activeBatchMode ?? outputMode,
    exporting,
  );
  const runPrimaryAction = () => {
    switch (primaryAction.command) {
      case 'add':
        fileInputRef.current?.click();
        break;
      case 'process':
        void processAll();
        break;
      case 'stop':
        stopProcessing();
        break;
      case 'download':
        void downloadAll();
        break;
    }
  };

  const resetToDefaults = () => {
    if (processing || exporting) return;
    setSettings({ ...DEFAULT_SETTINGS });
    setOutputMode('single');
    setSelectedRecipeId('');
    setNotice({ tone: 'info', message: '已恢复默认设置，照片和本地配方仍然保留。' });
  };

  const dismissNotice = useCallback(() => setNotice(null), []);

  const selectedRecipeName = recipes.find(recipe => recipe.id === selectedRecipeId)?.name;
  const runInspectorPrimaryAction = () => {
    if (processing) {
      stopProcessing();
    } else if (images.length === 0) {
      fileInputRef.current?.click();
    } else {
      void processAll();
    }
  };
  const inspectorProps: RecipeInspectorProps = {
    settings,
    onSettingsChange: setSettings,
    outputMode,
    recipes,
    selectedRecipeId,
    recipeName,
    onRecipeNameChange: setRecipeName,
    onSaveRecipe: saveCurrentRecipe,
    onApplyRecipe: applyRecipe,
    onDeleteRecipe: removeRecipe,
    imageCount: includedCount,
    pendingCount: includedPendingCount,
    processedCount: includedProcessedCount,
    primaryActionLabel: processing ? '停止后续' : processButtonLabel,
    primaryActionDisabled: exporting || (!processing && images.length > 0 && (
      !renderConfigReady
      || includedCount === 0
      || (outputMode === 'single' && includedPendingCount === 0)
    )),
    primaryActionTone: processing
      ? 'stop'
      : images.length > 0 && (includedCount === 0 || (includedPendingCount === 0 && outputMode === 'single'))
        ? 'neutral'
        : 'primary',
    onPrimaryAction: runInspectorPrimaryAction,
    onReprocessAll: () => void processAll(true),
    onReset: resetToDefaults,
    processing,
    exporting,
    selectedRecipeName,
  };
  const mobilePrimaryAction = {
    ...primaryAction,
    label: primaryAction.command === 'process'
      ? processButtonLabel
      : primaryAction.command === 'download'
        ? downloadButtonLabel
        : primaryAction.command === 'none' && exportMessage
          ? exportMessage
          : primaryAction.label,
  };
  const contactSheetItems = images.map((item, index) => ({
    item,
    index,
    frameNumber: frameNumberForIndex(settings, index),
    status: imageWorkflowStatuses.get(item.id)!,
    artifact: currentImageArtifacts.get(item.id) ?? null,
    active: activeImageId === item.id,
  }));
  const stripStage: FilmStripStageState = processing && activeBatchMode === 'strip'
    ? { kind: 'processing', message: processingMessage }
    : currentStripResult
      ? { kind: 'current', artifact: currentStripResult }
      : stripResult
        ? { kind: 'stale', artifact: stripResult, message: '选片、顺序或配方已变化，请重新生成。' }
        : { kind: 'empty', message: includedCount === 0 ? '请先选择至少一张照片' : `按当前顺序合成 ${includedCount} 张入选照片` };
  const workspaceSummary = images.length === 0
    ? 'NEW ROLL · LOCAL ONLY'
    : `入选 ${includedCount} / ${images.length} · ${includedProcessedCount} 已出片 · ${includedPendingCount} 待冲洗`;
  const stripStatusLabel = currentStripResult ? '已生成' : stripResult ? '需重生成' : `${includedCount} 张入选`;
  const previewAfterSource = previewImageItem
    ? editorPreviewUrl ?? previewImageArtifact?.url ?? previewImageItem.previewUrl
    : previewImageSource;

  return (
    <>
      <a
        href="#workspace"
        className="fixed left-3 top-3 z-[120] -translate-y-24 rounded-[4px] bg-[var(--ff-paper)] px-3 py-2 text-sm font-medium text-[var(--ff-ink)] focus:translate-y-0"
      >
        跳到工作区
      </a>
      <input
        ref={fileInputRef}
        type="file"
        aria-label="选择照片"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileUpload}
        className="sr-only"
        tabIndex={-1}
      />

      <AppShell
        header={(
          <AppHeader
            imageCount={images.length}
            processedCount={includedProcessedCount}
            outputMode={outputMode}
            hasDownloadableResult={hasExportAction}
            processing={processing}
            exporting={exporting}
            busyLabel={processing ? processingMessage : exporting ? exportMessage : undefined}
            settingsOpen={settingsOpen}
            onAddPhotos={() => fileInputRef.current?.click()}
            onExport={() => void downloadAll()}
            onOpenSettings={toggleMobileSettings}
            onReset={resetToDefaults}
            onOpenSupport={() => setShowDonate(true)}
            onOpenPrivacy={() => setNotice({ tone: 'info', message: '照片只在当前设备处理，不会上传；刷新或关闭页面后不会保留。' })}
            githubHref="https://github.com/Zeno-cc/FilmFrame"
          />
        )}
        workspace={(
          <Workspace
            toolbar={(
              <WorkspaceToolbar
                outputMode={outputMode}
                imageCount={images.length}
                includedCount={includedCount}
                processedCount={includedProcessedCount}
                stripStatusLabel={stripStatusLabel}
                statusSummary={workspaceSummary}
                controlsDisabled={processing || exporting}
                canExport={hasExportAction}
                exportLabel={exporting ? exportMessage || '正在导出' : downloadButtonLabel}
                onOutputModeChange={mode => {
                  if (!processing && !exporting) setOutputMode(mode);
                }}
                onAddPhotos={() => fileInputRef.current?.click()}
                onExport={() => void downloadAll()}
                onSelectAll={() => setAllImageSelections(true)}
                onClearSelection={() => setAllImageSelections(false)}
                onDeleteAll={openDeleteAllPhotos}
              />
            )}
            isDragActive={isDraggingUpload}
            onDragEnter={handleUploadDragEnter}
            onDragOver={handleUploadDragOver}
            onDragLeave={handleUploadDragLeave}
            onDrop={handleUploadDrop}
          >
            {images.length === 0 ? (
              <EmptyDarkroom
                uploadDisabled={processing || exporting}
                onChoosePhotos={() => fileInputRef.current?.click()}
              />
            ) : outputMode === 'single' ? (
              <div
                id="workspace-panel-single"
                role="tabpanel"
                aria-labelledby="workspace-tab-single"
              >
                <ContactSheet
                  items={contactSheetItems}
                  removalAllowed={imageRemovalAllowed}
                  actionsDisabled={exporting}
                  reorderDisabled={processing || exporting}
                  selectionDisabled={processing || exporting}
                  draggable={!processing && !exporting}
                  onOpen={id => setPreview({ type: 'single', imageId: id })}
                  onRetry={id => void retryImage(id)}
                  onToggleIncluded={toggleImageSelection}
                  onDownload={downloadImage}
                  onRemove={removeImage}
                  onMove={moveImage}
                  onDragStart={handleDragStart}
                  onDragEnter={handleDragEnter}
                  onDragOver={event => handleDragOver(event)}
                  onDragEnd={() => handleDragEnd()}
                />
              </div>
            ) : (
              <div
                id="workspace-panel-strip"
                role="tabpanel"
                aria-labelledby="workspace-tab-strip"
              >
                <FilmStripWorkspace
                  stage={stripStage}
                  sequenceItems={images.map((item, index) => ({
                    item,
                    sequenceNumber: index + 1,
                    selected: preview?.type === 'single' && preview.imageId === item.id,
                  }))}
                  includedCount={includedCount}
                  removalAllowed={imageRemovalAllowed}
                  actionsDisabled={processing || exporting}
                  selectionDisabled={processing || exporting}
                  draggable={!processing && !exporting}
                  generateLabel={processButtonLabel}
                  onGenerate={() => void processAll()}
                  onPreview={currentStripResult ? () => setPreview({ type: 'strip' }) : undefined}
                  onDownload={downloadImage}
                  downloadFilename="film_strip"
                  onSelectSequenceItem={id => setPreview({ type: 'single', imageId: id })}
                  onToggleSequenceItem={toggleImageSelection}
                  onRemove={removeImage}
                  onMove={moveImage}
                  onDragStart={handleDragStart}
                  onDragEnter={handleDragEnter}
                  onDragOver={event => handleDragOver(event)}
                  onDragEnd={() => handleDragEnd()}
                />
              </div>
            )}
          </Workspace>
        )}
        inspector={(
          <RecipeInspector
            {...inspectorProps}
            className="hidden min-[1180px]:sticky min-[1180px]:top-16 min-[1180px]:flex min-[1180px]:h-[calc(100dvh-4rem)]"
          />
        )}
        mobileActionBar={(
          <MobileActionBar
            primaryAction={mobilePrimaryAction}
            onPrimaryAction={runPrimaryAction}
            onOpenSettings={toggleMobileSettings}
            settingsOpen={settingsOpen}
            processing={processing}
            exporting={exporting}
            hidden={settingsOpen}
          />
        )}
        overlays={(
          <>
            <MobileSettingsSheet
              open={settingsOpen}
              onClose={closeMobileSettings}
              inspectorProps={inspectorProps}
              moreMenuProps={{
                onReset: resetToDefaults,
                onOpenSupport: openSupportFromSettings,
                onOpenPrivacy: () => setNotice({ tone: 'info', message: '照片只在当前设备处理，不会上传；刷新或关闭页面后不会保留。' }),
                githubHref: 'https://github.com/Zeno-cc/FilmFrame',
                resetDisabled: processing || exporting,
              }}
            />

            <PreviewDialog
              open={Boolean(preview && previewImageSource && !errorMsg && !showDonate)}
              mode={preview?.type ?? 'single'}
              title={previewTitle}
              source={previewImageSource}
              beforeSource={previewImageItem?.previewUrl}
              afterSource={previewAfterSource}
              sourceMode={previewSourceMode}
              onSourceModeChange={setPreviewSourceMode}
              index={previewImageIndex >= 0 ? previewImageIndex : undefined}
              total={preview?.type === 'single' ? images.length : undefined}
              onClose={() => {
                if (isCropping) closeCropEditor();
                else setPreview(null);
              }}
              onPrevious={() => navigatePreview('previous')}
              onNext={() => navigatePreview('next')}
              canNavigate={preview?.type === 'single' && images.length > 1}
              downloadHref={previewDownload?.href}
              downloadName={previewDownload?.download}
              onShare={previewImageArtifact ? () => void shareCurrentPreview() : undefined}
              canShare={Boolean(previewImageArtifact)}
              onCrop={previewImageItem && !processing && !exporting ? () => setIsCropping(true) : undefined}
              cropTriggerRef={cropTriggerRef}
              onRotate={previewImageItem && !processing && !exporting
                ? () => updateImageTransform(previewImageItem.id, {
                    quarterTurns: ((previewTransform.quarterTurns + 1) % 4) as 0 | 1 | 2 | 3,
                  })
                : undefined}
              onApply={previewImageItem && renderConfigReady && !processing && !exporting
                ? () => void retryImage(previewImageItem.id)
                : undefined}
              isCropping={isCropping}
              previewRendering={previewRendering}
              cropContent={previewImageItem ? (
                <CropEditor
                  sourceUrl={previewImageItem.previewUrl}
                  initialTransform={previewImageItem.transform}
                  landscapeFrameAspect={isReal135Mode
                    ? (settings.useFilmOverlayTemplate === false ? 3 / 2 : KODAK_GOLD_APERTURE_ASPECT)
                    : undefined}
                  onCancel={closeCropEditor}
                  onCommit={transform => {
                    if (processing || exporting) return;
                    updateImageTransform(previewImageItem.id, transform);
                    setPreviewSourceMode('after');
                    closeCropEditor();
                    setNotice({ tone: 'info', message: '构图已更新，可继续冲洗此张照片。' });
                  }}
                />
              ) : undefined}
            />

            {notice && (
              <DarkroomNoticeToast
                key={notice.tone + ':' + notice.message}
                tone={notice.tone}
                message={notice.message}
                onDismiss={dismissNotice}
              />
            )}
            <ErrorDialog
              open={Boolean(errorMsg)}
              message={errorMsg ?? ''}
              onClose={() => setErrorMsg(null)}
            />
            <SupportDialog
              open={showDonate}
              onClose={() => setShowDonate(false)}
            />
            <DeleteAllPhotosDialog
              open={deleteAllPhotosOpen}
              photoCount={images.length}
              onCancel={() => setDeleteAllPhotosOpen(false)}
              onConfirm={confirmDeleteAllPhotos}
            />
            <IncompleteExportDialog
              open={incompleteExportOpen}
              readyCount={singleExportReadiness.readyCount}
              totalCount={singleExportReadiness.totalCount}
              onCancel={() => setIncompleteExportOpen(false)}
              onProcessAndExport={() => void processRemainingAndExport()}
              onExportReady={() => void exportCurrentResults()}
            />
          </>
        )}
      />
    </>
  );
};

export default App;
