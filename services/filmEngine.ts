
import { FilmSettings, FILM_PRESETS } from '../types';

/**
 * 绘制圆角矩形 polyfill - 修复部分浏览器齿孔不渲染或颜色不生效的问题
 */
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    // 兼容性回退方案
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
  ctx.closePath();
}

/**
 * 处理单张图片，根据不同胶片型号的 Preset 应用定制化视觉效果
 */
export const processImage = async (
  imageSource: string,
  settings: FilmSettings,
  dateOverride?: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 确保有默认预设
    const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK PORTRA 400'];
    if (!preset) {
        console.error("Missing preset for", settings.brandText);
        return reject("Invalid Film Preset"); 
    }

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

      // 4. 计算安全区域 (Geometry Calculations)
      // 根据 Preset 计算齿孔占据的比例，从而得出两侧文字的安全区域中心点
      const holeRatio = preset.holeWidthRatio; // e.g. 0.38
      // 边缘空白宽度比例 = (1 - 齿孔比例) / 2
      const marginRatio = (1 - holeRatio) / 2; 
      
      // Outer Zone Center: 靠近胶片边缘的空白区域中心
      const outerCenterRatio = marginRatio / 2;
      // Inner Zone Center: 靠近图像的空白区域中心
      const innerCenterRatio = 1 - (marginRatio / 2);
      
      const holeW = isPortrait ? borderSize * holeRatio : canvas.width * preset.holeHeightRatio;
      const holeH = isPortrait ? canvas.height * preset.holeHeightRatio : borderSize * holeRatio;
      const holeCenter = borderSize * 0.5;

      // 5. 绘制齿孔 (Draw Holes)
      const drawSingleHole = (x: number, y: number, w: number, h: number) => {
        ctx.save();
        ctx.fillStyle = settings.holeColor;
        drawRoundedRect(ctx, x, y, w, h, Math.min(w, h) * preset.holeRounding);
        ctx.fill();
        
        // 微弱光影
        if (settings.holeColor.toLowerCase() === '#ffffff' || settings.holeColor.toLowerCase() === 'white') {
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        }
        ctx.lineWidth = Math.max(1, borderSize * 0.006);
        ctx.stroke();
        ctx.restore();
      };

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

      // 6. 绘制文字 (Draw Text - Strictly Centered)
      ctx.fillStyle = settings.textColor;
      
      // 动态计算字体大小：确保字体高度不超过安全区域宽度的 85%，防止重叠
      const isGC400 = settings.brandText.includes('GC 400');
      const maxFontSizeRatio = marginRatio * 0.85; 
      let fontSizeRatio = isGC400 ? 0.25 : 0.22;
      
      if (fontSizeRatio > maxFontSizeRatio) {
          fontSizeRatio = maxFontSizeRatio;
      }
      
      const fontSize = borderSize * fontSizeRatio;
      ctx.font = `${preset.fontWeight} ${Math.floor(fontSize)}px ${preset.fontFamily}`;
      ctx.textBaseline = 'middle'; // 垂直居中，便于对齐到计算出的中心线
      
      const finalDateStr = dateOverride || settings.dateStr;
      const brandText = settings.brandText;

      if (isPortrait) {
        // --- 竖版布局 (Portrait) ---
        
        // 左轨：品牌名 (放在 Outer Zone，靠近边缘)
        ctx.save();
        ctx.translate(borderSize * outerCenterRatio, canvas.height * 0.05);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(brandText, 0, 0);
        ctx.restore();

        // 左轨：Safety Film (放在 Inner Zone，靠近图像)
        // GC 400 通常比较简洁，或者可以隐藏 Safety Film
        if (!isGC400) {
            ctx.save();
            ctx.font = `normal ${Math.floor(fontSize * 0.55)}px ${preset.fontFamily}`;
            ctx.translate(borderSize * innerCenterRatio, canvas.height * 0.95);
            ctx.rotate(Math.PI / 2);
            ctx.fillText('SAFETY FILM', -ctx.measureText('SAFETY FILM').width, 0);
            ctx.restore();
        }

        // 右轨：帧编号 (放在 Outer Zone，靠近边缘)
        ctx.save();
        // 右侧 Outer Center = CanvasWidth - borderSize * outerCenterRatio
        ctx.translate(canvas.width - borderSize * outerCenterRatio, canvas.height * 0.05);
        ctx.rotate(Math.PI / 2);
        
        if (isGC400) {
             const frameStr = `${settings.frameNumber}A`;
             ctx.fillText(frameStr, 0, 0);
        } else {
             const frameStr = `${settings.frameNumber}`;
             ctx.fillText(frameStr, 0, 0);
             ctx.font = `normal ${Math.floor(fontSize * 0.8)}px ${preset.fontFamily}`;
             ctx.fillText(`${settings.frameNumber}A`, fontSize * 2.5, 0);
        }
        ctx.restore();

        // 右轨：日期 (放在 Inner Zone，靠近图像)
        if (settings.showDate) {
          ctx.save();
          ctx.font = `normal ${Math.floor(fontSize * 0.75)}px ${preset.fontFamily}`;
          ctx.translate(canvas.width - borderSize * innerCenterRatio, canvas.height * 0.95);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(finalDateStr, -ctx.measureText(finalDateStr).width, 0);
          ctx.restore();
        }

      } else {
        // --- 横版布局 (Landscape) ---
        
        // 上轨：品牌名 (放在 Outer Zone，靠近顶部边缘)
        ctx.fillText(brandText, canvas.width * 0.05, borderSize * outerCenterRatio);
        
        // 上轨：帧编号 (放在 Outer Zone，靠近顶部边缘，右对齐)
        if (isGC400) {
            const frameStr = `${settings.frameNumber}A`;
            const frameWidth = ctx.measureText(frameStr).width;
            ctx.fillText(frameStr, canvas.width - frameWidth - canvas.width * 0.05, borderSize * outerCenterRatio);
        } else {
            const frameStr = `${settings.frameNumber}`;
            const frameWidth = ctx.measureText(frameStr).width;
            ctx.fillText(frameStr, canvas.width - frameWidth - canvas.width * 0.05, borderSize * outerCenterRatio);
        }

        // 下轨：Safety Film (放在 Inner Zone，靠近图像底部)
        // 底部边框范围是 [H-BS, H]。Inner Zone 是 [H-BS, H-0.7BS] (约)。
        // 几何计算：BottomInnerY = (H - BS) + (borderSize * outerCenterRatio) -- 因为 outerCenterRatio 是较小的值 (0.15)，所以加上它等于靠近内部边界
        if (!isGC400) {
             ctx.font = `normal ${Math.floor(fontSize * 0.7)}px ${preset.fontFamily}`;
             ctx.fillText('SAFETY FILM', canvas.width * 0.05, (canvas.height - borderSize) + borderSize * outerCenterRatio);
        }

        // 下轨：日期 (放在 Outer Zone，靠近底部边缘)
        // 几何计算：BottomOuterY = (H - BS) + (borderSize * innerCenterRatio) -- 因为 innerCenterRatio 是较大的值 (0.85)，所以加上它等于靠近外部边缘
        if (settings.showDate) {
          ctx.font = `normal ${Math.floor(fontSize * 0.75)}px ${preset.fontFamily}`;
          const dateWidth = ctx.measureText(finalDateStr).width;
          ctx.fillText(finalDateStr, canvas.width - dateWidth - canvas.width * 0.05, (canvas.height - borderSize) + borderSize * innerCenterRatio);
        }
      }

      // 7. 输出无损 PNG
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
