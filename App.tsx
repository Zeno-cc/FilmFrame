
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FilmType, FilmSettings, ImageItem, FILM_PRESETS, HoleType, OutputFormat, OutputMode } from './types';
import { processImage, generateFilmStrip } from './services/filmWorkerClient';
import { createZipBlob } from './services/zip';
import { loadPreferences, savePreferences } from './services/settingsStorage';
import {
  getNextPreviewImageId,
  getPreviewImageIndex,
  getSinglePreviewSource,
  PreviewDirection,
} from './services/previewNavigation';
// Security Fix: Import EXIF from local dependency instead of external CDN
import EXIF from 'exif-js';

// --- Icons ---
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>;
const DownloadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const MaximizeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>;
const ChevronLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>;
const ChevronRightIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const GridIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;
const StripIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>;
const GripIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>;
const GithubIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>;
const CoffeeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4 4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>;
const AlertCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>;
const RetryIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M16 8h5V3"/></svg>;

const FilmLogoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <defs>
      <linearGradient id="film-gradient" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fbbf24" />
        <stop offset="1" stopColor="#b45309" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    {/* Outer Frame with Rounded Corners */}
    <rect x="2" y="2" width="28" height="28" rx="6" fill="url(#film-gradient)" className="drop-shadow-lg" />
    
    {/* Inner Cutout (The Frame) */}
    <rect x="8" y="8" width="16" height="16" rx="1" fill="#121212" />
    
    {/* Sprocket Holes Left */}
    <rect x="4.5" y="10" width="2" height="3" rx="0.5" fill="#121212" />
    <rect x="4.5" y="19" width="2" height="3" rx="0.5" fill="#121212" />
    
    {/* Sprocket Holes Right */}
    <rect x="25.5" y="10" width="2" height="3" rx="0.5" fill="#121212" />
    <rect x="25.5" y="19" width="2" height="3" rx="0.5" fill="#121212" />
    
    {/* Gloss/Highlight overlay for glass effect */}
    <path d="M2 8C2 4.68629 4.68629 2 8 2H24C27.3137 2 30 4.68629 30 8V14L2 10V8Z" fill="white" fillOpacity="0.1" />
  </svg>
);

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
  autoCropToFilmRatio: true,
  enableRealisticRebate: true,
  maxRollFrames: 36,
  useFilmOverlayTemplate: true,
  filmOverlayUrl: '/film-overlays/kodak-gold-200.png'
};

const LARGE_FILE_BYTES = 25 * 1024 * 1024;
const LARGE_IMAGE_EDGE = 8000;

type PreviewState =
  | { type: 'single'; imageId: string }
  | { type: 'strip' };

function revokeObjectUrl(url?: string | null) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function sanitizeFilename(filename: string): string {
  const baseName = filename.replace(/\.[^/.]+$/, '');
  return baseName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_') || 'image';
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '_');
}

function frameNumberForIndex(settings: FilmSettings, index: number): number {
  return ((settings.frameNumber + index - 1) % (settings.maxRollFrames ?? 36)) + 1;
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
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [outputMode, setOutputMode] = useState<OutputMode>(() => initialPreferences.outputMode);
  const [stripResult, setStripResult] = useState<string | null>(null);
  const [showDonate, setShowDonate] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<ImageItem[]>([]);
  const stripResultRef = useRef<string | null>(null);
  const isReal135Mode = (settings.frameRenderMode ?? 'real135') === 'real135';

  // Drag and drop refs
  const dragItem = useRef<number | null>(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    stripResultRef.current = stripResult;
  }, [stripResult]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach(img => {
        revokeObjectUrl(img.previewUrl);
        revokeObjectUrl(img.processedUrl);
      });
      revokeObjectUrl(stripResultRef.current);
    };
  }, []);

  useEffect(() => {
    savePreferences(settings, outputMode);
  }, [settings, outputMode]);

  const navigatePreview = useCallback((direction: PreviewDirection) => {
    setPreview(current => {
      if (current?.type !== 'single') return current;

      const nextImageId = getNextPreviewImageId(imagesRef.current, current.imageId, direction);
      return nextImageId ? { type: 'single', imageId: nextImageId } : null;
    });
  }, []);

  useEffect(() => {
    if (!preview) return;

    if (preview.type === 'strip') {
      if (!stripResult) setPreview(null);
      return;
    }

    if (images.length === 0) {
      setPreview(null);
      return;
    }

    if (getPreviewImageIndex(images, preview.imageId) === -1) {
      setPreview({ type: 'single', imageId: images[0].id });
    }
  }, [images, preview, stripResult]);

  useEffect(() => {
    if (!preview) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreview(null);
        return;
      }

      if (preview.type !== 'single') return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigatePreview('previous');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigatePreview('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigatePreview, preview]);

  useEffect(() => {
    const preset = FILM_PRESETS[settings.brandText];
    if (preset) {
      const recommendedHoleType: HoleType = preset.holeRounding > 0.4 ? 'rounded' : 'square';
      setSettings(prev => ({ 
        ...prev, 
        textColor: preset.brandColor,
        holeType: recommendedHoleType
      }));
    }
  }, [settings.brandText]);

  // 清除 Strip 结果当图片变化时
  useEffect(() => {
    setStripResult(prev => {
      revokeObjectUrl(prev);
      stripResultRef.current = null;
      return null;
    });
  }, [images]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newImages: ImageItem[] = [];
    const uploadErrors: string[] = [];
    const uploadWarnings: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file type
      if (!file.type.startsWith('image/')) {
        uploadErrors.push(`"${file.name}" 不是有效的图片文件`);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      try {
        const { width, height } = await readImageSize(previewUrl);
        const sizeMb = file.size / 1024 / 1024;
        if (file.size > LARGE_FILE_BYTES || Math.max(width, height) > LARGE_IMAGE_EDGE) {
          uploadWarnings.push(`"${file.name}" 较大（${width}×${height}, ${sizeMb.toFixed(1)}MB），处理时可能较慢或占用较多内存`);
        }
      } catch (e) {
        console.warn("Image dimension check failed", e);
      }
      
      let exifDate = '';
      try {
        // 使用 Promise.race 防止 EXIF 读取卡死
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
          new Promise((resolve) => setTimeout(resolve, 1000)) // 1秒超时，防止读取大文件元数据卡死
        ]);
      } catch (e) {
        console.warn("EXIF extraction failed or timed out", e);
        // 不报错，只是没有日期
      }

      newImages.push({
        id: Math.random().toString(36).substr(2, 9),
        file,
        previewUrl,
        exifDate
      });
    }

    if (uploadErrors.length > 0 || uploadWarnings.length > 0) {
      const messages = [];
      if (uploadErrors.length > 0) messages.push(`无法添加以下文件：\n${uploadErrors.join('\n')}`);
      if (uploadWarnings.length > 0) messages.push(`大图提示：\n${uploadWarnings.join('\n')}`);
      setErrorMsg(messages.join('\n\n'));
    }

    setImages(prev => {
      const nextImages = [...prev, ...newImages];
      imagesRef.current = nextImages;
      return nextImages;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeImage = (id: string) => {
    const targetIndex = images.findIndex(img => img.id === id);
    const target = targetIndex >= 0 ? images[targetIndex] : undefined;
    revokeObjectUrl(target?.processedUrl);
    revokeObjectUrl(target?.previewUrl);

    const nextImages = images.filter(img => img.id !== id);
    imagesRef.current = nextImages;
    setImages(nextImages);

    if (preview?.type === 'single' && preview.imageId === id) {
      const nextPreviewImage = nextImages[Math.min(targetIndex, nextImages.length - 1)];
      setPreview(nextPreviewImage ? { type: 'single', imageId: nextPreviewImage.id } : null);
    }
  };

  const processAll = async () => {
    if (images.length === 0) return;
    setProcessing(true);
    setErrorMsg(null);
    setProcessingMessage(outputMode === 'strip' ? '正在拼合胶片长条...' : `正在处理 1/${images.length}`);

    try {
      if (outputMode === 'strip') {
        setProcessingMessage(`正在拼合 ${images.length} 张照片...`);
        const url = await generateFilmStrip(images, settings);
        setStripResult(prev => {
          revokeObjectUrl(prev);
          stripResultRef.current = url;
          return url;
        });
      } else {
        const updatedImages = [...images];
        const failedFiles: string[] = [];
        const processedUrlsToRevoke: string[] = [];
        for (let i = 0; i < updatedImages.length; i++) {
          const item = updatedImages[i];
          setProcessingMessage(`正在处理 ${i + 1}/${updatedImages.length}`);
          try {
            const resultUrl = await processImage(
              item.file,
              {
                ...settings,
                frameNumber: frameNumberForIndex(settings, i),
              },
              item.exifDate,
              item.previewUrl
            );
            if (item.processedUrl) {
              processedUrlsToRevoke.push(item.processedUrl);
            }
            updatedImages[i] = { ...item, processedUrl: resultUrl, processingError: undefined };
          } catch (err) {
            console.error('Processing failed for image', i, err);
            failedFiles.push(item.file.name);
            updatedImages[i] = { ...item, processingError: '处理失败，请重试' };
          }
        }
        imagesRef.current = updatedImages;
        setImages(updatedImages);
        processedUrlsToRevoke.forEach(revokeObjectUrl);
        if (failedFiles.length > 0) {
          setErrorMsg(`以下文件处理失败，其他图片已保留处理结果：\n${failedFiles.map(name => `"${name}"`).join('\n')}`);
        }
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('处理过程中发生错误，可能是图片文件损坏或内存不足。');
    } finally {
      setProcessing(false);
      setProcessingMessage('');
    }
  };

  const retryImage = async (id: string) => {
    if (processing) return;

    const currentImages = imagesRef.current;
    const index = currentImages.findIndex(img => img.id === id);
    const item = currentImages[index];
    if (!item) return;

    setProcessing(true);
    setErrorMsg(null);
    setProcessingMessage(`正在重试 ${item.file.name}`);
    setImages(prev => {
      const nextImages = prev.map(img =>
        img.id === id ? { ...img, processingError: undefined } : img
      );
      imagesRef.current = nextImages;
      return nextImages;
    });

    try {
      const resultUrl = await processImage(
        item.file,
        {
          ...settings,
          frameNumber: frameNumberForIndex(settings, index),
        },
        item.exifDate,
        item.previewUrl
      );

      let oldProcessedUrl: string | undefined;
      setImages(prev => {
        const nextImages = prev.map(img => {
          if (img.id !== id) return img;
          oldProcessedUrl = img.processedUrl;
          return { ...img, processedUrl: resultUrl, processingError: undefined };
        });
        imagesRef.current = nextImages;
        return nextImages;
      });
      revokeObjectUrl(oldProcessedUrl);
    } catch (err) {
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
      setProcessing(false);
      setProcessingMessage('');
    }
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    // 根据输出格式决定后缀
    const ext = settings.outputFormat === 'image/jpeg' ? 'jpg' : 'png';
    const safeBaseName = sanitizeFilename(filename);
    
    link.download = `${safeBaseName}.${ext}`;
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

  const downloadAll = async () => {
    const ext = settings.outputFormat === 'image/jpeg' ? 'jpg' : 'png';
    if (outputMode === 'strip') {
      if (stripResult) downloadImage(stripResult, `film_strip_${Date.now()}.${ext}`);
    } else {
      const processedImages = images.filter((img): img is ImageItem & { processedUrl: string } => Boolean(img.processedUrl));
      if (processedImages.length === 0) {
        setErrorMsg('暂无可下载的成片，请先点击“处理全部单张”。');
        return;
      }

      try {
        const zipFiles = await Promise.all(processedImages.map(async (img, idx) => {
          const response = await fetch(img.processedUrl);
          if (!response.ok) throw new Error(`Failed to read generated image ${idx + 1}`);

          return {
            name: `${String(idx + 1).padStart(2, '0')}_${sanitizeFilename(img.file.name)}.${ext}`,
            blob: await response.blob(),
          };
        }));

        const zipBlob = await createZipBlob(zipFiles);
        downloadBlob(zipBlob, `filmframe_${timestampForFilename()}.zip`);
      } catch (error) {
        console.error('Failed to create ZIP archive', error);
        setErrorMsg('打包下载失败，请重新处理图片后再试。');
      }
    }
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    dragItem.current = index;
    // Set effect
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
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

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary for onDrop/onDragEnter to work smoothly
  };

  const processedCount = images.filter(img => img.processedUrl).length;
  const hasAnyResult = outputMode === 'single' ? processedCount > 0 : Boolean(stripResult);
  const previewImageIndex =
    preview?.type === 'single' ? getPreviewImageIndex(images, preview.imageId) : -1;
  const previewImageItem = previewImageIndex >= 0 ? images[previewImageIndex] : null;
  const previewImageSource =
    preview?.type === 'single' && previewImageItem
      ? getSinglePreviewSource(previewImageItem)
      : preview?.type === 'strip'
        ? stripResult
        : null;
  const previewTitle =
    preview?.type === 'single' && previewImageItem
      ? previewImageItem.file.name
      : preview?.type === 'strip'
        ? 'Film Strip'
        : '';
  const processButtonLabel =
    images.length === 0
      ? '先添加图片'
      : outputMode === 'strip'
        ? (stripResult ? '重新生成胶片长条' : '生成胶片长条')
        : processedCount > 0
          ? `重新处理全部单张 (${images.length})`
          : `处理全部单张 (${images.length})`;
  const downloadButtonLabel =
    outputMode === 'strip'
      ? '下载长条大图'
      : `打包下载 ZIP${processedCount > 0 ? ` (${processedCount})` : ''}`;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0a0a0a] text-gray-200">
      {/* Sidebar Settings */}
      <aside className="w-full md:w-80 bg-[#121212] border-r border-white/10 p-6 flex flex-col gap-6 overflow-y-auto max-h-screen z-10">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 transition-transform hover:scale-105">
            <FilmLogoIcon />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">FilmFrame</h1>
            <p className="text-[10px] text-amber-500 font-medium tracking-[0.2em] mt-1 uppercase opacity-90">Digital Darkroom</p>
          </div>
        </div>

        {/* Community Buttons */}
        <div className="space-y-2">
          {/* GitHub Star Button */}
          <a 
            href="https://github.com/Zeno-cc/FilmFrame" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg group transition-all"
          >
            <div className="flex items-center gap-2">
              <GithubIcon />
              <span className="text-xs font-medium text-gray-300 group-hover:text-white">Star on GitHub</span>
            </div>
            <div className="text-amber-500 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </div>
          </a>

          {/* Donate / Tea Button */}
          <button 
            onClick={() => setShowDonate(true)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gradient-to-r from-pink-500/10 to-rose-500/10 border border-pink-500/10 hover:border-pink-500/30 rounded-lg group transition-all"
          >
            <div className="flex items-center gap-2">
              <div className="text-pink-400 group-hover:text-pink-300 transition-colors">
                <CoffeeIcon />
              </div>
              <span className="text-xs font-medium text-pink-200/80 group-hover:text-pink-100 transition-colors">请作者喝一杯奶茶</span>
            </div>
            <div className="text-pink-500/60 group-hover:text-pink-500 group-hover:scale-110 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="bg-white/5 p-1 rounded-lg flex border border-white/10">
          <button 
            onClick={() => setOutputMode('single')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all ${outputMode === 'single' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <GridIcon /> 单张卡片
          </button>
          <button 
            onClick={() => setOutputMode('strip')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all ${outputMode === 'strip' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <StripIcon /> 连底长条
          </button>
        </div>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <SettingsIcon /> 胶片配置
          </div>
          
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-gray-400 mb-1 block">胶片型号</span>
              <select 
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                value={settings.brandText}
                onChange={(e) => setSettings({...settings, brandText: e.target.value as FilmType})}
              >
                {Object.values(FilmType).map(type => (
                  <option key={type} value={type} className="bg-[#121212]">{type}</option>
                ))}
              </select>
            </label>

            {!isReal135Mode && (
              <label className="block">
                <span className="text-xs text-gray-400 mb-1 block">自定义文字 (可选, 覆盖胶片型号)</span>
                <input 
                  type="text"
                  placeholder="例如: SHOT BY ZENO"
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500 placeholder-gray-600"
                  value={settings.customText}
                  onChange={(e) => setSettings({...settings, customText: e.target.value})}
                />
              </label>
            )}

            <div className={isReal135Mode ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
              <label>
                <span className="text-xs text-gray-400 mb-1 block">起始编号</span>
                <input 
                  type="number"
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                  value={settings.frameNumber}
                  onChange={(e) => setSettings({...settings, frameNumber: parseInt(e.target.value) || 1})}
                />
              </label>
              {!isReal135Mode && (
                <label>
                  <span className="text-xs text-gray-400 mb-1 block">默认日期</span>
                  <input 
                    type="text"
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm mono focus:outline-none focus:border-amber-500"
                    value={settings.dateStr}
                    onChange={(e) => setSettings({...settings, dateStr: e.target.value})}
                    placeholder="YYYY/MM/DD"
                  />
                </label>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
            视觉与输出
          </div>

          <div className="space-y-4">
             <div className="space-y-2">
                <span className="text-xs text-gray-400">边框模式</span>
                <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-md border border-white/10">
                   <button
                     onClick={() => setSettings({...settings, frameRenderMode: 'real135'})}
                     className={`text-xs py-1.5 rounded transition-all ${(settings.frameRenderMode ?? 'real135') === 'real135' ? 'bg-amber-500 text-black font-bold shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                   >
                     真实135
                   </button>
                   <button
                     onClick={() => setSettings({...settings, frameRenderMode: 'classic'})}
                     className={`text-xs py-1.5 rounded transition-all ${settings.frameRenderMode === 'classic' ? 'bg-amber-500 text-black font-bold shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                   >
                     经典边框
                   </button>
                </div>
             </div>

             {isReal135Mode && outputMode === 'single' && (
             <div className="space-y-2">
                <span className="text-xs text-gray-400">扫描输出</span>
                <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-md border border-white/10">
                   <button
                     onClick={() => setSettings({...settings, scanOutputAspect: '4:3'})}
                     className={`text-xs py-1.5 rounded transition-all ${(settings.scanOutputAspect ?? '4:3') === '4:3' ? 'bg-gray-700 text-white font-bold' : 'text-gray-500 hover:text-gray-300'}`}
                   >
                     4:3扫描
                   </button>
                   <button
                     onClick={() => setSettings({...settings, scanOutputAspect: 'native'})}
                     className={`text-xs py-1.5 rounded transition-all ${settings.scanOutputAspect === 'native' ? 'bg-gray-700 text-white font-bold' : 'text-gray-500 hover:text-gray-300'}`}
                   >
                     原始底片
                   </button>
                </div>
             </div>
             )}

             {isReal135Mode && (
             <div className="space-y-2">
                <span className="text-xs text-gray-400">处理模式</span>
                <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-md border border-white/10">
                   <button
                     onClick={() => setSettings({...settings, processingMode: 'preview'})}
                     className={`text-xs py-1.5 rounded transition-all ${(settings.processingMode ?? 'preview') === 'preview' ? 'bg-gray-700 text-white font-bold' : 'text-gray-500 hover:text-gray-300'}`}
                   >
                     快速预览
                   </button>
                   <button
                     onClick={() => setSettings({...settings, processingMode: 'high'})}
                     className={`text-xs py-1.5 rounded transition-all ${settings.processingMode === 'high' ? 'bg-gray-700 text-white font-bold' : 'text-gray-500 hover:text-gray-300'}`}
                   >
                     高清导出
                   </button>
                </div>
             </div>
             )}

             {/* 新增：输出格式控制 */}
             <div className="space-y-2">
                <span className="text-xs text-gray-400">输出格式</span>
                <div className="flex bg-white/5 p-1 rounded-md border border-white/10">
                   <button
                     onClick={() => setSettings({...settings, outputFormat: 'image/jpeg'})}
                     className={`flex-1 text-xs py-1.5 rounded transition-all ${settings.outputFormat === 'image/jpeg' ? 'bg-gray-700 text-white font-bold' : 'text-gray-500'}`}
                   >
                     JPG (推荐)
                   </button>
                   <button
                     onClick={() => setSettings({...settings, outputFormat: 'image/png'})}
                     className={`flex-1 text-xs py-1.5 rounded transition-all ${settings.outputFormat === 'image/png' ? 'bg-gray-700 text-white font-bold' : 'text-gray-500'}`}
                   >
                     PNG (无损)
                   </button>
                </div>
             </div>
             
             {settings.outputFormat === 'image/jpeg' && (
                <label className="block">
                  <div className="flex justify-between text-xs text-gray-400 mb-2">
                    <span>JPG 质量</span>
                    <span>{Math.round(settings.outputQuality * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="1" step="0.05" 
                    value={settings.outputQuality} 
                    onChange={e => setSettings({...settings, outputQuality: parseFloat(e.target.value)})} 
                    className="w-full accent-amber-500" 
                  />
                </label>
             )}


            {!isReal135Mode && (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-gray-400">齿孔形状</span>
                  <div className="grid grid-cols-2 bg-white/5 p-1 rounded-md border border-white/10">
                    <button
                      onClick={() => setSettings({...settings, holeType: 'square'})}
                      className={`text-xs py-1.5 rounded transition-all ${
                        settings.holeType === 'square' 
                        ? 'bg-amber-500 text-black font-bold shadow-sm' 
                        : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      方孔
                    </button>
                    <button
                      onClick={() => setSettings({...settings, holeType: 'rounded'})}
                      className={`text-xs py-1.5 rounded transition-all ${
                        settings.holeType === 'rounded' 
                        ? 'bg-amber-500 text-black font-bold shadow-sm' 
                        : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      圆角
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-500 text-center">边框色</span>
                    <input type="color" value={settings.borderColor} onChange={e => setSettings({...settings, borderColor: e.target.value})} className="w-full h-8 bg-transparent cursor-pointer rounded overflow-hidden" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-500 text-center">齿孔色</span>
                    <input type="color" value={settings.holeColor} onChange={e => setSettings({...settings, holeColor: e.target.value})} className="w-full h-8 bg-transparent cursor-pointer rounded overflow-hidden" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-500 text-center">文字色</span>
                    <input type="color" value={settings.textColor} onChange={e => setSettings({...settings, textColor: e.target.value})} className="w-full h-8 bg-transparent cursor-pointer rounded overflow-hidden" />
                  </label>
                </div>
              </>
            )}

            <div className="space-y-3">
              {!isReal135Mode && (
                <label className="block">
                  <div className="flex justify-between text-xs text-gray-400 mb-2">
                    <span>边框尺寸</span>
                    <span>{settings.borderSize}%</span>
                  </div>
                  <input type="range" min="5" max="25" step="1" value={settings.borderSize} onChange={e => setSettings({...settings, borderSize: parseInt(e.target.value)})} className="w-full accent-amber-500" />
                </label>
              )}
              <label className="block">
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>颗粒强度</span>
                  <span>{settings.grainIntensity}</span>
                </div>
                <input type="range" min="0" max="60" step="1" value={settings.grainIntensity} onChange={e => setSettings({...settings, grainIntensity: parseInt(e.target.value)})} className="w-full accent-amber-500" />
              </label>
            </div>

            {!isReal135Mode && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.showDate} 
                  onChange={e => setSettings({...settings, showDate: e.target.checked})}
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 bg-white/5"
                />
                <span className="text-sm text-gray-300">显示日期/EXIF 时间</span>
              </label>
            )}
          </div>
        </section>

        <div className="mt-auto pt-6 border-t border-white/5">
          <button 
            onClick={processAll}
            disabled={images.length === 0 || processing}
            className={`w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              processing 
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                : 'bg-amber-500 hover:bg-amber-600 text-black shadow-lg shadow-amber-500/20 active:scale-95'
            }`}
          >
            {processing ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                {processingMessage || '生成中...'}
              </>
            ) : processButtonLabel}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto w-full flex flex-col gap-6">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">工作室</h2>
              <p className="text-sm text-gray-500">
                {outputMode === 'strip' 
                  ? '将多张照片拼接为连续的胶片印样 (Contact Sheet)。长按拖拽可调整叙事顺序。' 
                  : '批量为每张照片添加独立的胶片边框。长按拖拽可调整处理顺序。'}
              </p>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              {(images.length > 0 && hasAnyResult) && (
                <button 
                  onClick={downloadAll}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <DownloadIcon /> {downloadButtonLabel}
                </button>
              )}
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 sm:flex-none px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-md text-sm transition-all flex items-center justify-center gap-2"
              >
                <PlusIcon /> 添加图片
              </button>
            </div>
          </header>

          <input 
            type="file" 
            ref={fileInputRef} 
            multiple 
            accept="image/*" 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          
          {images.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 min-h-[400px] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/[0.02] transition-all"
            >
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-gray-500">
                <PlusIcon />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-gray-300">点击或拖拽上传图片</p>
                <p className="text-sm text-gray-500">支持 JPG, PNG, WebP (建议保留 EXIF 信息)</p>
              </div>
            </div>
          ) : (
            <>
              {outputMode === 'single' ? (
                // GRID VIEW
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {images.map((img, index) => (
                    <div 
                      key={img.id} 
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnter={(e) => handleDragEnter(e, index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      className="group relative bg-[#181818] rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all cursor-move active:cursor-grabbing hover:shadow-xl hover:shadow-black/50"
                    >
                      <div className="aspect-[4/3] w-full relative bg-black/40 overflow-hidden">
	                        <img 
	                          src={img.processedUrl || img.previewUrl} 
	                          alt="Preview" 
	                          className={`w-full h-full object-contain transition-opacity duration-300 pointer-events-none ${processing ? 'opacity-40' : 'opacity-100'}`}
	                        />
	                        {img.processingError && (
	                          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] font-medium shadow-lg shadow-black/20">
	                            <AlertCircleIcon />
	                            <span>{img.processedUrl ? '重试失败，保留旧图' : '处理失败'}</span>
	                          </div>
	                        )}
	                        <div className="absolute top-2 right-2 text-white/50 bg-black/50 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
	                          <GripIcon />
	                        </div>
	                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
	                          {img.processingError && (
	                            <button
	                              onClick={() => retryImage(img.id)}
	                              disabled={processing}
	                              title="重试此张"
	                              className="p-3 bg-red-500/20 hover:bg-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-red-200 transition-colors"
	                            >
	                              <RetryIcon />
	                            </button>
	                          )}
                          <button onClick={() => setPreview({ type: 'single', imageId: img.id })} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                            <MaximizeIcon />
                          </button>
	                          {img.processedUrl && (
                              <button onClick={() => downloadImage(img.processedUrl!, img.file.name)} className="p-3 bg-amber-500 hover:bg-amber-600 rounded-full text-black transition-colors">
                                <DownloadIcon />
                              </button>
                          )}
                          <button onClick={() => removeImage(img.id)} className="p-3 bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-500 transition-colors">
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
	                      <div className="p-3 flex items-center justify-between border-t border-white/5">
	                        <span className={`text-xs font-medium truncate max-w-[120px] ${img.processingError ? 'text-red-300' : 'text-gray-400'}`}>{img.file.name}</span>
	                        <span className="text-[10px] text-gray-600 mono uppercase">{img.exifDate ? img.exifDate : `NO EXIF`}</span>
	                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // STRIP VIEW
                <div className="w-full flex flex-col gap-4">
                  <div className="w-full bg-[#181818] rounded-xl border border-white/5 p-4 overflow-x-auto min-h-[300px] flex items-center justify-center relative">
                    {processing ? (
                       <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xs text-gray-500">{processingMessage || '正在拼合胶片长条...'}</span>
                       </div>
                    ) : stripResult ? (
                      <div className="relative group">
                        <img src={stripResult} alt="Film Strip" className="max-h-[600px] shadow-2xl" />
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => setPreview({ type: 'strip' })} className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70"><MaximizeIcon /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500">
                        <StripIcon />
                        <p className="mt-2 text-sm">点击左侧“生成胶片长条”按钮开始制作</p>
                        <p className="text-xs opacity-50 mt-1">将按顺序拼接 {images.length} 张图片</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Mini List to reorder or delete before strip gen */}
                  <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-1">
                    {images.map((img, idx) => (
                      <div 
                        key={img.id} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragEnter={(e) => handleDragEnter(e, idx)}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver}
                        className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-white/5 border border-white/10 group cursor-move hover:scale-105 transition-transform active:scale-95 shadow-md"
                      >
                        <img src={img.previewUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <button onClick={() => removeImage(img.id)} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon /></button>
                        <span className="absolute bottom-1 left-1 text-[10px] bg-black/50 px-1 rounded text-white">{idx+1}</span>
                        <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity text-white drop-shadow-md">
                           <GripIcon />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Fullscreen Preview Modal */}
      {preview && previewImageSource && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
          <button 
            onClick={() => setPreview(null)}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            aria-label="关闭预览"
          >
            <CloseIcon />
          </button>
          <div className="absolute top-6 left-6 right-20 flex items-center gap-3 min-w-0 pointer-events-none">
            <div className="min-w-0 rounded-full bg-black/45 border border-white/10 px-4 py-2 text-white shadow-xl">
              <div className="max-w-[52vw] truncate text-sm font-medium">{previewTitle}</div>
              {preview.type === 'single' && previewImageIndex >= 0 && (
                <div className="mt-0.5 text-[11px] text-white/55 mono">
                  {previewImageIndex + 1} / {images.length}
                </div>
              )}
            </div>
          </div>
          {preview.type === 'single' && images.length > 1 && (
            <>
              <button
                onClick={() => navigatePreview('previous')}
                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-3 md:p-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white shadow-2xl transition-colors"
                aria-label="上一张"
              >
                <ChevronLeftIcon />
              </button>
              <button
                onClick={() => navigatePreview('next')}
                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-3 md:p-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white shadow-2xl transition-colors"
                aria-label="下一张"
              >
                <ChevronRightIcon />
              </button>
            </>
          )}
          <img 
            src={previewImageSource} 
            className="max-w-full max-h-full object-contain shadow-2xl" 
            alt={previewTitle || 'Fullscreen preview'} 
          />
        </div>
      )}

      {/* Error Modal */}
      {errorMsg && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#181818] border border-red-500/20 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
            <button 
                onClick={() => setErrorMsg(null)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
                <CloseIcon />
            </button>
            <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                    <AlertCircleIcon />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white mb-2">出错了</h3>
                    <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed">
                        {errorMsg}
                    </p>
                </div>
                <button 
                    onClick={() => setErrorMsg(null)}
                    className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
                >
                    我知道了
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Donate Modal */}
      {showDonate && (
        <div 
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowDonate(false)}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative transform transition-all scale-100"
            onClick={e => e.stopPropagation()}
          >
             <button 
                onClick={() => setShowDonate(false)}
                className="absolute top-3 right-3 p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
              >
                <CloseIcon />
              </button>
             
             <div className="text-center mb-4">
                <div className="w-12 h-12 bg-pink-50 rounded-full flex items-center justify-center mx-auto text-pink-500 mb-2">
                   <CoffeeIcon />
                </div>
                <h3 className="text-lg font-bold text-gray-800">请作者喝一杯奶茶</h3>
                <p className="text-xs text-gray-500 mt-1">感谢您对 FilmFrame 的支持！❤️</p>
             </div>

             <div className="bg-gray-50 p-2 rounded-xl border border-gray-100 flex items-center justify-center overflow-hidden min-h-[250px]">
                <img 
                  src="/alipay.jpg" 
                  alt="Donation QR Code" 
                  className="w-full h-auto rounded-lg object-contain max-h-[400px]" 
                />
             </div>
             
             <p className="text-center text-[10px] text-gray-400 mt-4">
                推荐使用支付宝扫码
             </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
