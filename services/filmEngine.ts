
import { FilmSettings, FILM_PRESETS } from '../types';

/**
 * 处理单张图片，根据不同胶片型号的 Preset 应用定制化视觉效果
 */
export const processImage = async (
  imageSource: string,
  settings: FilmSettings,
  dateOverride?: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK PORTRA 400'];
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return reject('Canvas context not found');

      const isPortrait = img.height > img.width;
      const baseDim = isPortrait ? img.height : img.width;
      const borderSize = Math.floor(baseDim * (settings.borderSize / 100));
      
      if (isPortrait) {
        canvas.width = img.width + borderSize * 2;
        canvas.height = img.height;
      } else {
        canvas.width = img.width;
        canvas.height = img.height + borderSize * 2;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 1. 绘制底色
      ctx.fillStyle = settings.borderColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. 绘制原图
      if (isPortrait) {
        ctx.drawImage(img, borderSize, 0, img.width, img.height);
      } else {
        ctx.drawImage(img, 0, borderSize, img.width, img.height);
      }

      // 3. 颗粒感
      if (settings.grainIntensity > 0) {
        ctx.save();
        const grainCount = Math.floor((canvas.width * canvas.height * 0.025));
        const safeGrainCount = Math.min(grainCount, 2500000); 
        for (let i = 0; i < safeGrainCount; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const opacity = Math.random() * (settings.grainIntensity / 255);
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.fillRect(x, y, 1, 1);
        }
        ctx.restore();
      }

      // 4. 定制化齿孔渲染
      const outerPadding = borderSize * 0.15; 
      const innerPadding = borderSize * 0.85; 
      const holeCenter = borderSize * 0.5;   
      
      // 根据 Preset 计算齿孔尺寸
      const holeW = isPortrait ? borderSize * preset.holeWidthRatio : canvas.width * preset.holeHeightRatio;
      const holeH = isPortrait ? canvas.height * preset.holeHeightRatio : borderSize * preset.holeWidthRatio;
      
      const drawSingleHole = (x: number, y: number, w: number, h: number) => {
        ctx.save();
        ctx.fillStyle = settings.holeColor;
        ctx.beginPath();
        // 应用 Preset 中的圆角
        ctx.roundRect(x, y, w, h, Math.min(w, h) * preset.holeRounding);
        ctx.fill();
        
        // 增加微弱光影增强立体感
        if (settings.holeColor.toLowerCase() === '#ffffff' || settings.holeColor.toLowerCase() === 'white') {
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        }
        ctx.lineWidth = Math.max(1, borderSize * 0.006);
        ctx.stroke();
        ctx.restore();
      };

      // 渲染齿孔：应用 Preset 中的间距比例
      const spacingRatio = preset.spacingRatio;
      if (isPortrait) {
        const spacing = canvas.height * spacingRatio;
        const startY = (canvas.height % spacing) / 2 + (spacing - holeH) / 2;
        for (let y = startY; y < canvas.height - holeH; y += spacing) {
          drawSingleHole(holeCenter - holeW / 2, y, holeW, holeH);
          drawSingleHole(canvas.width - holeCenter - holeW / 2, y, holeW, holeH);
        }
      } else {
        const spacing = canvas.width * spacingRatio;
        const startX = (canvas.width % spacing) / 2 + (spacing - holeW) / 2;
        for (let x = startX; x < canvas.width - holeW; x += spacing) {
          drawSingleHole(x, holeCenter - holeH / 2, holeW, holeH);
          drawSingleHole(x, canvas.height - holeCenter - holeH / 2, holeW, holeH);
        }
      }

      // 5. 定制化文字渲染
      ctx.fillStyle = settings.textColor;
      const fontSize = borderSize * 0.22; 
      // 应用 Preset 中的字体权重
      ctx.font = `${preset.fontWeight} ${Math.floor(fontSize)}px ${preset.fontFamily}`;
      
      const finalDateStr = dateOverride || settings.dateStr;

      if (isPortrait) {
        // 左轨
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.translate(outerPadding, canvas.height * 0.05);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(settings.brandText, 0, 0);
        ctx.restore();

        ctx.save();
        ctx.font = `normal ${Math.floor(fontSize * 0.6)}px ${preset.fontFamily}`;
        ctx.translate(innerPadding, canvas.height * 0.95);
        ctx.rotate(Math.PI / 2);
        ctx.fillText('SAFETY FILM 5063', -ctx.measureText('SAFETY FILM 5063').width, 0);
        ctx.restore();

        // 右轨
        ctx.save();
        ctx.translate(canvas.width - outerPadding, canvas.height * 0.05);
        ctx.rotate(Math.PI / 2);
        const frameStr = `▽ ${settings.frameNumber}A`;
        ctx.fillText(frameStr, 0, 0);
        ctx.restore();

        if (settings.showDate) {
          ctx.save();
          ctx.font = `normal ${Math.floor(fontSize * 0.75)}px ${preset.fontFamily}`;
          ctx.translate(canvas.width - innerPadding, canvas.height * 0.95);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(finalDateStr, -ctx.measureText(finalDateStr).width, 0);
          ctx.restore();
        }
      } else {
        ctx.textBaseline = 'middle';
        // 横版排版文字
        ctx.fillText(settings.brandText, canvas.width * 0.05, innerPadding);
        const frameStr = `▽ ${settings.frameNumber}A`;
        const frameWidth = ctx.measureText(frameStr).width;
        ctx.fillText(frameStr, canvas.width - frameWidth - canvas.width * 0.05, innerPadding);

        ctx.font = `normal ${Math.floor(fontSize * 0.7)}px ${preset.fontFamily}`;
        ctx.fillText('SAFETY FILM 5063', canvas.width * 0.05, canvas.height - outerPadding);

        if (settings.showDate) {
          const dateWidth = ctx.measureText(finalDateStr).width;
          ctx.fillText(finalDateStr, canvas.width - dateWidth - canvas.width * 0.05, canvas.height - outerPadding);
        }
      }

      // 6. 输出无损 PNG
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          resolve(url);
        } else {
          reject('Blob conversion failed');
        }
      }, 'image/png');
    };
    img.onerror = () => reject('Image load failed');
    img.src = imageSource;
  });
};
