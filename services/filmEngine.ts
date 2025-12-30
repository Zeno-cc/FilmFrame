
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
    img.onload = () => {
        // Security Fix: Check image dimensions to prevent denial of service via massive images
        // Limit to 15000px (approx 225 megapixels), which is generous for photography but prevents zip-bomb style attacks
        if (img.width > 15000 || img.height > 15000) {
            reject(new Error("Image dimensions too large (max 15000px)"));
            return;
        }
        resolve(img);
    };
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

// 缓存噪点 Canvas，避免重复创建
let cachedNoiseCanvas: HTMLCanvasElement | null = null;

/**
 * 创建高斯噪点纹理 (256x256 小图)
 * 相比于在主画布上逐像素操作，先生成小块纹理再平铺 (Pattern) 性能提升巨大。
 * 优化：使用 Box-Muller 变换生成真实的高斯分布(正态分布)噪点，而非简单的 Uniform Noise。
 */
const getNoisePatternCanvas = (): HTMLCanvasElement => {
  if (cachedNoiseCanvas) return cachedNoiseCanvas;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Box-Muller 变换生成正态分布
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    
    // 标准正态分布 N(0, 1)
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    
    // 调整到 0-255 范围，中心点为 128 (Overlay 混合模式的中性点)
    // 30 是标准差，决定了噪点的对比度
    let val = 128 + z * 30;
    val = Math.max(0, Math.min(255, val));

    data[i] = val;     // R
    data[i+1] = val;   // G
    data[i+2] = val;   // B
    data[i+3] = 255;   // Alpha
  }
  
  ctx.putImageData(imageData, 0, 0);
  cachedNoiseCanvas = canvas;
  return canvas;
};

/**
 * 内部辅助：绘制颗粒 (性能优化版)
 * 使用 globalCompositeOperation = 'overlay' 配合 Pattern 填充
 */
const drawGrain = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, intensity: number) => {
  if (intensity <= 0) return;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  
  // 1. 限制绘制区域
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  // 2. 准备噪点纹理
  const noiseCanvas = getNoisePatternCanvas();
  const pattern = ctx.createPattern(noiseCanvas, 'repeat');

  if (pattern) {
    // 3. 设置混合模式
    // 'overlay' 模式会根据底色叠加噪点，亮部更亮，暗部更暗，非常适合模拟胶片颗粒
    // 同时也比逐像素计算快得多
    ctx.globalCompositeOperation = 'overlay';
    
    // 4. 通过透明度控制强度
    // 强度系数映射，让用户感知的 0-60 范围比较线性
    ctx.globalAlpha = Math.min(1.0, (intensity / 100) * 2.0);
    
    ctx.fillStyle = pattern;
    
    // 随机偏移纹理原点，避免多张图的噪点模式完全一致
    const offsetX = Math.random() * 256;
    const offsetY = Math.random() * 256;
    ctx.translate(offsetX, offsetY);
    
    // 绘制覆盖整个区域的矩形 (反向偏移回来以覆盖左上角)
    ctx.fillRect(-offsetX, -offsetY, width + offsetX, height + offsetY); 
  }

  ctx.restore();
};


/**
 * 模式 A: 处理单张图片
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

  // 1. 底色 (边框)
  ctx.fillStyle = settings.borderColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. 绘制图像
  let imgX = 0, imgY = 0, imgW = img.width, imgH = img.height;
  if (isPortrait) {
    imgX = borderSize;
    imgY = 0;
  } else {
    imgX = 0;
    imgY = borderSize;
  }
  ctx.drawImage(img, imgX, imgY, imgW, imgH);

  // 3. 施加颗粒 (使用优化后的叠加算法)
  drawGrain(ctx, imgX, imgY, imgW, imgH, settings.grainIntensity);

  // === 齿孔计算 ===
  const TARGET_HOLE_COUNT = 8;
  const holePerp = borderSize * 0.60; 
  const holePara = holePerp * 0.74;

  let holeW, holeH; 
  let startPos, step;

  if (isPortrait) {
    // 竖图
    holeW = holePerp; 
    holeH = holePara; 
    
    const totalLen = canvas.height;
    const pitch = totalLen / TARGET_HOLE_COUNT;
    step = pitch;
    const totalSpan = (TARGET_HOLE_COUNT - 1) * pitch + holeH;
    startPos = (totalLen - totalSpan) / 2;

    for (let i = 0; i < TARGET_HOLE_COUNT; i++) {
      const y = startPos + i * step;
      drawHole(ctx, settings, (borderSize - holeW) / 2, y, holeW, holeH, borderSize);
      drawHole(ctx, settings, canvas.width - (borderSize + holeW) / 2, y, holeW, holeH, borderSize);
    }
  } else {
    // 横图
    holeH = holePerp; 
    holeW = holePara; 

    const totalLen = canvas.width;
    const pitch = totalLen / TARGET_HOLE_COUNT;
    step = pitch;
    const totalSpan = (TARGET_HOLE_COUNT - 1) * pitch + holeW;
    startPos = (totalLen - totalSpan) / 2;

    for (let i = 0; i < TARGET_HOLE_COUNT; i++) {
      const x = startPos + i * step;
      drawHole(ctx, settings, x, (borderSize - holeH) / 2, holeW, holeH, borderSize);
      drawHole(ctx, settings, x, canvas.height - (borderSize + holeH) / 2, holeW, holeH, borderSize);
    }
  }

  // === 文字处理 ===
  ctx.fillStyle = settings.textColor;
  const isGC400 = settings.brandText.includes('GC 400');
  
  const marginRatio = (1 - 0.60) / 2; 
  const outerCenterRatio = marginRatio / 2; 
  const innerCenterRatio = 1 - (marginRatio / 2); 

  const maxFontSizeRatio = marginRatio * 0.9; 
  let fontSizeRatio = isGC400 ? 0.25 : 0.22;
  if (fontSizeRatio > maxFontSizeRatio) fontSizeRatio = maxFontSizeRatio;
  
  const fontSize = borderSize * fontSizeRatio;
  ctx.font = `${preset.fontWeight} ${Math.floor(fontSize)}px ${preset.fontFamily}`;
  ctx.textBaseline = 'middle';
  
  const finalDateStr = dateOverride || settings.dateStr;
  
  const brandText = settings.customText.trim() !== '' ? settings.customText : settings.brandText;

  if (isPortrait) {
      // 竖图文字
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
      // 横图文字
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
    canvas.toBlob(
        (blob) => resolve(URL.createObjectURL(blob!)), 
        settings.outputFormat, 
        settings.outputQuality
    );
  });
};

/**
 * 模式 B: 生成胶片长条 (Film Strip)
 */
export const generateFilmStrip = async (
  images: ImageItem[],
  settings: FilmSettings
): Promise<string> => {
  if (images.length === 0) return '';
  
  const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK PORTRA 400'];
  
  // === 1. 物理几何常量 ===
  const MAX_PER_ROW = 6; 
  const STRIP_HEIGHT_PX = 1600; 
  const ROW_GAP = 120; 
  
  const BORDER_RATIO = 0.16;
  const borderSize = Math.floor(STRIP_HEIGHT_PX * BORDER_RATIO); 
  const imageAreaHeight = STRIP_HEIGHT_PX - (borderSize * 2);

  const FRAME_WIDTH = imageAreaHeight * 1.5; 
  const FRAME_GAP = FRAME_WIDTH * 0.055;

  // === 2. 计算画布总尺寸 ===
  const totalImages = images.length;
  const numRows = Math.ceil(totalImages / MAX_PER_ROW);
  const colsInMaxRow = Math.min(totalImages, MAX_PER_ROW);
  
  const START_GAP = FRAME_WIDTH * 0.2;
  const END_GAP = FRAME_WIDTH * 0.2;
  
  const totalWidth = START_GAP + (FRAME_WIDTH * colsInMaxRow) + (FRAME_GAP * (Math.max(0, colsInMaxRow - 1))) + END_GAP;
  const totalHeight = (numRows * STRIP_HEIGHT_PX) + ((numRows - 1) * ROW_GAP);

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d', { alpha: true }); 
  if (!ctx) throw new Error("Canvas init failed");

  // === 3. 逐行绘制 (优化：串行加载图片以节省内存) ===
  for (let row = 0; row < numRows; row++) {
    const rowOffsetY = row * (STRIP_HEIGHT_PX + ROW_GAP);
    const startGlobalIdx = row * MAX_PER_ROW;
    const endGlobalIdx = Math.min(startGlobalIdx + MAX_PER_ROW, totalImages);
    
    // 3.1 绘制该行的底色
    ctx.fillStyle = settings.borderColor;
    ctx.fillRect(0, rowOffsetY, totalWidth, STRIP_HEIGHT_PX);

    // 3.2 串行处理该行每一张图片
    for (let i = 0; i < (endGlobalIdx - startGlobalIdx); i++) {
        const globalIdx = startGlobalIdx + i;
        const imgItem = images[globalIdx];
        
        // 关键内存优化：每次只加载一张大图，画完立即释放引用
        // 之前 Promise.all 会同时将所有大图加载进内存
        const img = await loadImage(imgItem.previewUrl);

        const frameX = START_GAP + i * (FRAME_WIDTH + FRAME_GAP);
        const frameY = rowOffsetY + borderSize;
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

        // 施加颗粒 (使用优化后的算法)
        drawGrain(ctx, frameX, frameY, FRAME_WIDTH, imageAreaHeight, settings.grainIntensity);
    }

    // 3.3 绘制齿孔 (与图片加载无关，可以批量绘制)
    const holeH = borderSize * 0.60; 
    const holeW = holeH * 0.74; 
    const holePaddingFromImage = borderSize * 0.04; 
    
    const holeYTopLocal = borderSize - holeH - holePaddingFromImage;
    const holeYBottomLocal = (STRIP_HEIGHT_PX - borderSize) + holePaddingFromImage;
    
    const holeYTop = rowOffsetY + holeYTopLocal;
    const holeYBottom = rowOffsetY + holeYBottomLocal;

    const HOLES_PER_FRAME = 6;
    const pitch = (FRAME_WIDTH + FRAME_GAP) / HOLES_PER_FRAME; 
    const holeStartX = START_GAP - (pitch * 0.5);
    const numHoles = Math.ceil((totalWidth - holeStartX) / pitch) + 1;

    for (let k = 0; k < numHoles; k++) {
      const x = holeStartX + k * pitch;
      if (x > -holeW && x < totalWidth) {
        drawHole(ctx, settings, x, holeYTop, holeW, holeH, borderSize);
        drawHole(ctx, settings, x, holeYBottom, holeW, holeH, borderSize);
      }
    }

    // 3.4 绘制文字
    const textYTop = rowOffsetY + (holeYTopLocal / 2);
    const textYBottom = rowOffsetY + (holeYBottomLocal + holeH) + (STRIP_HEIGHT_PX - (holeYBottomLocal + holeH)) / 2;

    const isGC400 = settings.brandText.includes('GC 400');
    const baseFontSize = borderSize * 0.22; 
    
    ctx.font = `${preset.fontWeight} ${Math.floor(baseFontSize)}px ${preset.fontFamily}`;
    ctx.fillStyle = settings.textColor;
    ctx.textBaseline = 'middle';

    const brandText = settings.customText.trim() !== '' ? settings.customText : settings.brandText;

    // 重新遍历该行的数据绘制文字
    const rowImages = images.slice(startGlobalIdx, endGlobalIdx);
    rowImages.forEach((item, idx) => {
      const frameX = START_GAP + idx * (FRAME_WIDTH + FRAME_GAP);
      const globalIdx = startGlobalIdx + idx;
      const frameNum = settings.frameNumber + globalIdx;
      const dateStr = item.exifDate || settings.dateStr;

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

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(URL.createObjectURL(blob!)), 
      settings.outputFormat, 
      settings.outputQuality
    );
  });
};