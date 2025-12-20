
import { FilmSettings, FILM_PRESETS, ImageItem } from '../types';

/**
 * 绘制圆角矩形 polyfill
 */
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
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
 * 内部辅助：加载图片对象
 */
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image`));
    img.src = src;
  });
};

/**
 * 内部辅助：绘制单个齿孔（带3D效果）
 */
const drawHole = (
  ctx: CanvasRenderingContext2D, 
  settings: FilmSettings, 
  x: number, 
  y: number, 
  w: number, 
  h: number, 
  borderSize: number
) => {
  const roundingRatio = settings.holeType === 'rounded' ? 0.5 : 0.15;
  const radius = Math.min(w, h) * roundingRatio;

  // A. 基础孔填充
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = settings.holeColor;
  ctx.fill();

  // B. 3D 深度感 (Inner Shadow + Highlight)
  ctx.clip();

  const strokeWidth = Math.max(2, borderSize * 0.15); 
  const pathOffset = strokeWidth / 2;
  const blurSize = Math.max(2, borderSize * 0.05);
  const shadowDist = Math.max(1, borderSize * 0.02);

  const traceOuterShape = () => {
    ctx.beginPath();
    drawRoundedRect(
      ctx,
      x - pathOffset,
      y - pathOffset,
      w + pathOffset * 2,
      h + pathOffset * 2,
      radius + pathOffset
    );
  };

  // 1. 内阴影 (Top-Left)
  traceOuterShape();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = strokeWidth;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = blurSize;
  ctx.shadowOffsetX = shadowDist;
  ctx.shadowOffsetY = shadowDist;
  ctx.stroke();

  // 2. 内高光 (Bottom-Right)
  traceOuterShape();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = strokeWidth;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
  ctx.shadowBlur = blurSize;
  ctx.shadowOffsetX = -shadowDist;
  ctx.shadowOffsetY = -shadowDist;
  ctx.stroke();

  ctx.restore();
};

/**
 * 内部辅助：绘制颗粒
 */
const drawGrain = (ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number) => {
  if (intensity <= 0) return;
  ctx.save();
  const grainCount = Math.floor((width * height * 0.025));
  const safeGrainCount = Math.min(grainCount, 3000000); 
  for (let i = 0; i < safeGrainCount; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const opacity = Math.random() * (intensity / 255);
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
};


/**
 * 模式 A: 处理单张图片 (保持不变)
 */
export const processImage = async (
  imageSource: string,
  settings: FilmSettings,
  dateOverride?: string
): Promise<string> => {
  const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK PORTRA 400'];
  if (!preset) throw new Error("Invalid Preset");

  const img = await loadImage(imageSource);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not found');

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

  // 底色
  ctx.fillStyle = settings.borderColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 图像
  if (isPortrait) {
    ctx.drawImage(img, borderSize, 0, img.width, img.height);
  } else {
    ctx.drawImage(img, 0, borderSize, img.width, img.height);
  }

  // 颗粒
  drawGrain(ctx, canvas.width, canvas.height, settings.grainIntensity);

  // 计算参数
  const holeRatio = preset.holeWidthRatio;
  const marginRatio = (1 - holeRatio) / 2; 
  const outerCenterRatio = marginRatio / 2;
  const innerCenterRatio = 1 - (marginRatio / 2);
  
  const holeW = isPortrait ? borderSize * holeRatio : canvas.width * preset.holeHeightRatio;
  const holeH = isPortrait ? canvas.height * preset.holeHeightRatio : borderSize * holeRatio;
  const holeCenter = borderSize * 0.5;

  // 绘制齿孔
  const spacingRatio = preset.spacingRatio;
  if (isPortrait) {
    const spacing = canvas.height * spacingRatio;
    const startY = (canvas.height % spacing) / 2 + (spacing - holeH) / 2;
    for (let y = startY; y < canvas.height - holeH; y += spacing) {
      drawHole(ctx, settings, holeCenter - holeW / 2, y, holeW, holeH, borderSize);
      drawHole(ctx, settings, canvas.width - holeCenter - holeW / 2, y, holeW, holeH, borderSize);
    }
  } else {
    const spacing = canvas.width * spacingRatio;
    const startX = (canvas.width % spacing) / 2 + (spacing - holeW) / 2;
    for (let x = startX; x < canvas.width - holeW; x += spacing) {
      drawHole(ctx, settings, x, holeCenter - holeH / 2, holeW, holeH, borderSize);
      drawHole(ctx, settings, x, canvas.height - holeCenter - holeH / 2, holeW, holeH, borderSize);
    }
  }

  // 文字
  ctx.fillStyle = settings.textColor;
  const isGC400 = settings.brandText.includes('GC 400');
  const maxFontSizeRatio = marginRatio * 0.85; 
  let fontSizeRatio = isGC400 ? 0.25 : 0.22;
  if (fontSizeRatio > maxFontSizeRatio) fontSizeRatio = maxFontSizeRatio;
  
  const fontSize = borderSize * fontSizeRatio;
  ctx.font = `${preset.fontWeight} ${Math.floor(fontSize)}px ${preset.fontFamily}`;
  ctx.textBaseline = 'middle';
  
  const finalDateStr = dateOverride || settings.dateStr;
  const brandText = settings.brandText;

  if (isPortrait) {
      ctx.save();
      ctx.translate(borderSize * outerCenterRatio, canvas.height * 0.05);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(brandText, 0, 0);
      ctx.restore();
      
      if (!isGC400) {
          ctx.save();
          ctx.font = `normal ${Math.floor(fontSize * 0.55)}px ${preset.fontFamily}`;
          ctx.translate(borderSize * innerCenterRatio, canvas.height * 0.95);
          ctx.rotate(Math.PI / 2);
          ctx.fillText('SAFETY FILM', -ctx.measureText('SAFETY FILM').width, 0);
          ctx.restore();
      }
      
      ctx.save();
      ctx.translate(canvas.width - borderSize * outerCenterRatio, canvas.height * 0.05);
      ctx.rotate(Math.PI / 2);
      if (isGC400) {
           ctx.fillText(`${settings.frameNumber}A`, 0, 0);
      } else {
           ctx.fillText(`${settings.frameNumber}`, 0, 0);
           ctx.font = `normal ${Math.floor(fontSize * 0.8)}px ${preset.fontFamily}`;
           ctx.fillText(`${settings.frameNumber}A`, fontSize * 2.5, 0);
      }
      ctx.restore();
      
      if (settings.showDate) {
        ctx.save();
        ctx.font = `normal ${Math.floor(fontSize * 0.75)}px ${preset.fontFamily}`;
        ctx.translate(canvas.width - borderSize * innerCenterRatio, canvas.height * 0.95);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(finalDateStr, -ctx.measureText(finalDateStr).width, 0);
        ctx.restore();
      }
  } else {
      ctx.fillText(brandText, canvas.width * 0.05, borderSize * outerCenterRatio);
      if (isGC400) {
          const frameStr = `${settings.frameNumber}A`;
          ctx.fillText(frameStr, canvas.width - ctx.measureText(frameStr).width - canvas.width * 0.05, borderSize * outerCenterRatio);
      } else {
          const frameStr = `${settings.frameNumber}`;
          ctx.fillText(frameStr, canvas.width - ctx.measureText(frameStr).width - canvas.width * 0.05, borderSize * outerCenterRatio);
      }
      if (!isGC400) {
           ctx.font = `normal ${Math.floor(fontSize * 0.7)}px ${preset.fontFamily}`;
           ctx.fillText('SAFETY FILM', canvas.width * 0.05, (canvas.height - borderSize) + borderSize * outerCenterRatio);
      }
      if (settings.showDate) {
        ctx.font = `normal ${Math.floor(fontSize * 0.75)}px ${preset.fontFamily}`;
        ctx.fillText(finalDateStr, canvas.width - ctx.measureText(finalDateStr).width - canvas.width * 0.05, (canvas.height - borderSize) + borderSize * innerCenterRatio);
      }
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(URL.createObjectURL(blob!)), 'image/png');
  });
};

/**
 * 模式 B: 生成胶片长条 (Film Strip) - 物理仿真版 + 多行折行支持
 */
export const generateFilmStrip = async (
  images: ImageItem[],
  settings: FilmSettings
): Promise<string> => {
  if (images.length === 0) return '';
  
  const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK PORTRA 400'];
  
  // === 1. 物理几何常量 ===
  const MAX_PER_ROW = 6; // 每行最多 6 张
  const STRIP_HEIGHT_PX = 1600; 
  const ROW_GAP = 120; // 行与行之间的间距
  
  const BORDER_RATIO = 0.16; // 16% 边框 (上下各 256px)
  const borderSize = Math.floor(STRIP_HEIGHT_PX * BORDER_RATIO); 
  const imageAreaHeight = STRIP_HEIGHT_PX - (borderSize * 2);

  // 底片框 (Frame) 的标准尺寸 3:2
  const FRAME_WIDTH = imageAreaHeight * 1.5; 
  const FRAME_GAP = FRAME_WIDTH * 0.055;

  // === 2. 计算画布总尺寸 ===
  const totalImages = images.length;
  const numRows = Math.ceil(totalImages / MAX_PER_ROW);
  // 计算第一行（也是最宽的一行）有多少张图，以此确定总宽度
  const colsInMaxRow = Math.min(totalImages, MAX_PER_ROW);
  
  const START_GAP = FRAME_WIDTH * 0.2;
  const END_GAP = FRAME_WIDTH * 0.2;
  
  // 按照最宽行的标准计算 Total Width，这样所有行宽度一致，显得整齐
  const totalWidth = START_GAP + (FRAME_WIDTH * colsInMaxRow) + (FRAME_GAP * (Math.max(0, colsInMaxRow - 1))) + END_GAP;
  const totalHeight = (numRows * STRIP_HEIGHT_PX) + ((numRows - 1) * ROW_GAP);

  const loadedImages = await Promise.all(images.map(item => loadImage(item.previewUrl)));

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d', { alpha: true }); // alpha true 允许行间距透明
  if (!ctx) throw new Error("Canvas init failed");

  // === 3. 逐行绘制 ===
  for (let row = 0; row < numRows; row++) {
    const rowOffsetY = row * (STRIP_HEIGHT_PX + ROW_GAP);
    const rowImages = loadedImages.slice(row * MAX_PER_ROW, (row + 1) * MAX_PER_ROW);
    const rowImageItems = images.slice(row * MAX_PER_ROW, (row + 1) * MAX_PER_ROW);
    const startGlobalIdx = row * MAX_PER_ROW;

    // 3.1 绘制这一行的黑色底片背景 (占满整行宽度，保持整齐)
    ctx.fillStyle = settings.borderColor;
    ctx.fillRect(0, rowOffsetY, totalWidth, STRIP_HEIGHT_PX);

    // 3.2 绘制图像
    rowImages.forEach((img, idx) => {
      const frameX = START_GAP + idx * (FRAME_WIDTH + FRAME_GAP);
      const frameY = rowOffsetY + borderSize; // 加上行的 Y 偏移
      const isPortrait = img.height > img.width;

      ctx.save();
      ctx.beginPath();
      ctx.rect(frameX, frameY, FRAME_WIDTH, imageAreaHeight);
      ctx.clip();

      if (isPortrait) {
        const centerX = frameX + FRAME_WIDTH / 2;
        const centerY = frameY + imageAreaHeight / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(-Math.PI / 2);
        
        const scale = Math.max(FRAME_WIDTH / img.height, imageAreaHeight / img.width);
        ctx.drawImage(img, -img.width * scale / 2, -img.height * scale / 2, img.width * scale, img.height * scale);
      } else {
        const scale = Math.max(FRAME_WIDTH / img.width, imageAreaHeight / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        ctx.drawImage(img, frameX + (FRAME_WIDTH - drawW) / 2, frameY + (imageAreaHeight - drawH) / 2, drawW, drawH);
      }
      ctx.restore();
    });

    // 3.3 绘制齿孔
    // 参数配置 (与之前保持一致：大孔、近距)
    const holeH = borderSize * 0.60; 
    const holeW = holeH * 0.74; 
    const holePaddingFromImage = borderSize * 0.04; 
    
    // 注意：Y 坐标需要加上 rowOffsetY
    const holeYTopLocal = borderSize - holeH - holePaddingFromImage;
    const holeYBottomLocal = (STRIP_HEIGHT_PX - borderSize) + holePaddingFromImage;
    
    const holeYTop = rowOffsetY + holeYTopLocal;
    const holeYBottom = rowOffsetY + holeYBottomLocal;

    const HOLES_PER_FRAME = 6;
    const pitch = (FRAME_WIDTH + FRAME_GAP) / HOLES_PER_FRAME; 
    const holeStartX = START_GAP - (pitch * 0.5);
    const numHoles = Math.ceil((totalWidth - holeStartX) / pitch) + 1;

    for (let i = 0; i < numHoles; i++) {
      const x = holeStartX + i * pitch;
      if (x > -holeW && x < totalWidth) {
        drawHole(ctx, settings, x, holeYTop, holeW, holeH, borderSize);
        drawHole(ctx, settings, x, holeYBottom, holeW, holeH, borderSize);
      }
    }

    // 3.4 绘制文字
    // 文字 Y 坐标也需要加上 rowOffsetY
    const textYTop = rowOffsetY + (holeYTopLocal / 2);
    const textYBottom = rowOffsetY + (holeYBottomLocal + holeH) + (STRIP_HEIGHT_PX - (holeYBottomLocal + holeH)) / 2;

    const isGC400 = settings.brandText.includes('GC 400');
    const baseFontSize = borderSize * 0.22; 
    
    ctx.font = `${preset.fontWeight} ${Math.floor(baseFontSize)}px ${preset.fontFamily}`;
    ctx.fillStyle = settings.textColor;
    ctx.textBaseline = 'middle';

    rowImageItems.forEach((item, idx) => {
      const frameX = START_GAP + idx * (FRAME_WIDTH + FRAME_GAP);
      const globalIdx = startGlobalIdx + idx;
      const frameNum = settings.frameNumber + globalIdx;
      const dateStr = item.exifDate || settings.dateStr;
      const brandText = settings.brandText;

      const paddingX = FRAME_WIDTH * 0.02;

      // 1. 品牌名
      ctx.textAlign = 'left';
      ctx.fillText(brandText, frameX + paddingX, textYTop);

      // 2. 帧编号
      ctx.textAlign = 'right';
      const frameLabel = isGC400 ? `${frameNum}A` : `${frameNum}A`;
      ctx.fillText(frameLabel, frameX + FRAME_WIDTH - paddingX, textYTop);

      // 3. 日期
      if (settings.showDate) {
        ctx.save();
        ctx.font = `normal ${Math.floor(baseFontSize * 0.8)}px ${preset.fontFamily}`;
        ctx.textAlign = 'right';
        ctx.fillText(dateStr, frameX + FRAME_WIDTH - paddingX, textYBottom);
        ctx.restore();
      }

      // 4. Safety Film
      if (!isGC400) {
        ctx.save();
        ctx.font = `normal ${Math.floor(baseFontSize * 0.8)}px ${preset.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.fillText("SAFETY FILM", frameX + paddingX, textYBottom);
        ctx.restore();
      }
    });
  }

  // === 4. 全局颗粒 (一次性覆盖全图) ===
  drawGrain(ctx, totalWidth, totalHeight, settings.grainIntensity);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(URL.createObjectURL(blob!)), 'image/png');
  });
};
