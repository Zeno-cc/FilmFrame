
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FilmType, FilmSettings, ImageItem, FILM_PRESETS } from './types';
import { processImage } from './services/filmEngine';

declare const EXIF: any;

// --- Icons ---
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>;
const DownloadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const MaximizeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;

// Brand new Film Logo Icon replacing the generic CameraIcon
const FilmLogoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 3v18" />
    <path d="M3 7.5h4" />
    <path d="M3 12h4" />
    <path d="M3 16.5h4" />
    <path d="M17 3v18" />
    <path d="M17 7.5h4" />
    <path d="M17 12h4" />
    <path d="M17 16.5h4" />
  </svg>
);

const DEFAULT_SETTINGS: FilmSettings = {
  brandText: FilmType.KODAK_ULTRAMAX_400, // Default to Ultramax (GC 400)
  frameNumber: 1,
  showDate: true,
  dateStr: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
  borderColor: '#111111',
  holeColor: '#ffffff', // Default to white holes (imitating light)
  textColor: '#ffcc00', // Matches Ultramax gold
  borderSize: 12,
  grainIntensity: 15,
};

const App: React.FC = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [settings, setSettings] = useState<FilmSettings>(DEFAULT_SETTINGS);
  const [processing, setProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 当品牌改变时，自动同步品牌主色调
  useEffect(() => {
    const preset = FILM_PRESETS[settings.brandText];
    if (preset) {
      setSettings(prev => ({ ...prev, textColor: preset.brandColor }));
    }
  }, [settings.brandText]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newImages: ImageItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const previewUrl = URL.createObjectURL(file);
      
      // 提取 EXIF 日期
      let exifDate = '';
      try {
        await new Promise((resolve) => {
          EXIF.getData(file, function(this: any) {
            const date = EXIF.getTag(this, "DateTimeOriginal");
            if (date) {
              // 格式通常为 "YYYY:MM:DD HH:MM:SS" -> "YYYY/MM/DD"
              exifDate = date.split(' ')[0].replace(/:/g, '/');
            }
            resolve(null);
          });
        });
      } catch (e) {
        console.warn("EXIF extraction failed", e);
      }

      newImages.push({
        id: Math.random().toString(36).substr(2, 9),
        file,
        previewUrl,
        exifDate
      });
    }
    setImages(prev => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeImage = (id: string) => {
    setImages(prev => {
      const target = prev.find(img => img.id === id);
      if (target?.processedUrl) URL.revokeObjectURL(target.processedUrl);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(img => img.id !== id);
    });
  };

  const processAll = async () => {
    if (images.length === 0) return;
    setProcessing(true);
    
    const updatedImages = [...images];
    for (let i = 0; i < updatedImages.length; i++) {
      const item = updatedImages[i];
      try {
        const resultUrl = await processImage(
          item.previewUrl, 
          { ...settings, frameNumber: settings.frameNumber + i },
          item.exifDate
        );
        updatedImages[i] = { ...item, processedUrl: resultUrl };
      } catch (err) {
        console.error('Processing failed for image', i, err);
      }
    }
    setImages(updatedImages);
    setProcessing(false);
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `film_${filename}.png`;
    link.click();
  };

  const downloadAll = () => {
    images.forEach((img, idx) => {
      if (img.processedUrl) {
        downloadImage(img.processedUrl, `${idx}_${img.file.name.split('.')[0]}`);
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0a0a0a] text-gray-200">
      {/* Sidebar Settings */}
      <aside className="w-full md:w-80 bg-[#121212] border-r border-white/10 p-6 flex flex-col gap-6 overflow-y-auto max-h-screen">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
            <FilmLogoIcon />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">FilmFrame</h1>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Master Edition</p>
          </div>
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

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-xs text-gray-400 mb-1 block">起始编号</span>
                <input 
                  type="number"
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                  value={settings.frameNumber}
                  onChange={(e) => setSettings({...settings, frameNumber: parseInt(e.target.value) || 1})}
                />
              </label>
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
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
            视觉细节
          </div>

          <div className="space-y-4">
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

            <div className="space-y-3">
              <label className="block">
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>边框尺寸</span>
                  <span>{settings.borderSize}%</span>
                </div>
                <input type="range" min="5" max="25" step="1" value={settings.borderSize} onChange={e => setSettings({...settings, borderSize: parseInt(e.target.value)})} className="w-full accent-amber-500" />
              </label>
              <label className="block">
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>颗粒强度</span>
                  <span>{settings.grainIntensity}</span>
                </div>
                <input type="range" min="0" max="60" step="1" value={settings.grainIntensity} onChange={e => setSettings({...settings, grainIntensity: parseInt(e.target.value)})} className="w-full accent-amber-500" />
              </label>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={settings.showDate} 
                onChange={e => setSettings({...settings, showDate: e.target.checked})}
                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 bg-white/5"
              />
              <span className="text-sm text-gray-300">显示日期/EXIF 时间</span>
            </label>
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
                生成中...
              </>
            ) : '应用至全部图片'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto w-full flex flex-col gap-6">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">工作室</h2>
              <p className="text-sm text-gray-500">上传照片，自动添加复古齿孔边框。支持批量处理。</p>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              {images.length > 0 && (
                <button 
                  onClick={downloadAll}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <DownloadIcon /> 打包下载
                </button>
              )}
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 sm:flex-none px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-md text-sm transition-all flex items-center justify-center gap-2"
              >
                <PlusIcon /> 上传图片
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {images.map((img, index) => (
                <div key={img.id} className="group relative bg-[#181818] rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all">
                  <div className="aspect-[4/3] w-full relative bg-black/40 overflow-hidden">
                    <img 
                      src={img.processedUrl || img.previewUrl} 
                      alt="Preview" 
                      className={`w-full h-full object-contain transition-opacity duration-300 ${processing ? 'opacity-40' : 'opacity-100'}`}
                    />
                    
                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      {img.processedUrl && (
                        <>
                          <button 
                            onClick={() => setPreviewImage(img.processedUrl!)}
                            className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                            title="全屏预览"
                          >
                            <MaximizeIcon />
                          </button>
                          <button 
                            onClick={() => downloadImage(img.processedUrl!, img.file.name)}
                            className="p-3 bg-amber-500 hover:bg-amber-600 rounded-full text-black transition-colors"
                            title="下载"
                          >
                            <DownloadIcon />
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => removeImage(img.id)}
                        className="p-3 bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-500 transition-colors"
                        title="删除"
                      >
                        <TrashIcon />
                      </button>
                    </div>

                    {processing && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 flex items-center justify-between border-t border-white/5">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-gray-400 truncate max-w-[120px]">{img.file.name}</span>
                      <span className="text-[10px] text-gray-600 mono uppercase">
                        {img.exifDate ? `EXIF: ${img.exifDate}` : `NO EXIF DATA`}
                      </span>
                    </div>
                    {img.processedUrl ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-500 font-bold uppercase tracking-wider">Processed</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-500 font-bold uppercase tracking-wider">Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Fullscreen Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
          <button 
            onClick={() => setPreviewImage(null)}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <CloseIcon />
          </button>
          <img 
            src={previewImage} 
            className="max-w-full max-h-full object-contain shadow-2xl" 
            alt="Fullscreen preview" 
          />
        </div>
      )}
    </div>
  );
};

export default App;
