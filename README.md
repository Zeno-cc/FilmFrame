
<div align="center">
  <br />
  <!-- 使用应用中的胶片 Logo 概念 -->
  <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 32 32">
    <defs>
      <linearGradient id="g" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/>
      </linearGradient>
    </defs>
    <path fill="url(#g)" d="M6 2C3.79 2 2 3.79 2 6v20c0 2.21 1.79 4 4 4h20c2.21 0 4-1.79 4-4V6c0-2.21-1.79-4-4-4H6zm0 4h20c.55 0 1 .45 1 1v18c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1zm3 3v14h14V9H9zm-4 2v2h2v-2H5zm22 0v2h2v-2h-2zm-22 8v2h2v-2H5zm22 0v2h2v-2h-2z"/>
  </svg>
  
  <h1 align="center">FilmFrame</h1>
  <p align="center"><strong>胶片齿孔生成器 (Digital Darkroom)</strong></p>
  
  <p align="center">
    一个优雅的浏览器端工具，为您的照片添加复古胶片边框、真实齿孔与 EXIF 时间戳。<br />
    支持<strong>连底长条印样 (Contact Sheet)</strong>、<strong>自定义文字</strong>与<strong>批量无损处理</strong>。
  </p>

  <p align="center">
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript" alt="TypeScript"></a>
    <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-Fast-646CFF?logo=vite" alt="Vite"></a>
    <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwindcss" alt="Tailwind"></a>
    <img src="https://img.shields.io/badge/Privacy-Local_Only-green" alt="Privacy">
  </p>
  <br />
</div>

---

## ✨ 核心特性 (Features)

**FilmFrame** 不仅仅是简单的加框工具，它是基于 Canvas 像素级绘制的胶片模拟器，能够还原柯达 (Kodak)、富士 (Fuji) 等经典胶卷的物理质感。

### 1. 🎞️ 双模式工作室
- **单张精修 (Single Frame)**：为每张照片生成独立的胶片卡片，支持全屏预览和单独下载。
- **连底长条 (Film Strip)**：将多张照片拼接成复古的“印样”长条。
  - **叙事编排**：通过**长按拖拽**调整图片顺序，讲述您的摄影故事。
  - **智能拼接**：自动处理不同比例的图片，支持自动折行（每行 6 张）。

### 2. 🎨 高度客制化
- **胶片模拟**：内置 10+ 种主流胶卷预设（Portra, Gold, Ultramax, CineStill, Ilford 等）。
- **自定义文字**：支持修改边框上的品牌标识（如 "SHOT BY ME"），彰显个性。
- **物理细节**：
  - **齿孔形状**：可选方孔 (Square) 或圆角孔 (Rounded)。
  - **颗粒感**：可调节的胶片颗粒强度 (Grain Intensity)。
  - **日期戳**：一键读取 EXIF 拍摄时间 (`DateTimeOriginal`) 并打印。

### 3. 🛡️ 安全与隐私优先
- **纯前端运行**：所有图片处理均在浏览器本地完成，**绝不上传**到服务器。
- **防崩溃设计**：内置大图检测与内存保护，防止超大分辨率图片导致浏览器卡死。
- **安全文件名**：自动清洗下载文件名，防止特殊字符导致的文件系统问题。
- **供应链安全**：移除外部 CDN 依赖，所有核心库本地化打包。

### 4. 💾 专业输出
- **格式选择**：支持 **JPG** (体积小，适合社交媒体) 和 **PNG** (无损，适合存档)。
- **质量控制**：可调节 JPG 压缩质量。

## 📸 支持的胶片型号 (Film Stocks)

我们针对每种胶卷的齿孔间距、字体风格和品牌色进行了还原：

| 系列 | 型号 | 风格特点 |
| :--- | :--- | :--- |
| **Kodak Portra** | 160 / 400 / 800 | 暖色调，经典的 JetBrains Mono 等宽字体 |
| **Kodak Consumer** | Gold 200 / ColorPlus | 金黄色复古感 |
| **Kodak Consumer** | Ultramax 400 | **加粗**无衬线字体，高对比度风格 |
| **Kodak Ektar** | Ektar 100 | 鲜艳的红色品牌标识 |
| **Reversal (正片)** | Ektachrome E100 | 白色边框，独特的反转片质感 |
| **Fujifilm** | Superia 400 | 标志性的绿色字体，**全圆角**齿孔 |
| **Cinema** | CineStill 800T | 电影卷风格，红色高光 |
| **B&W (黑白)** | Tri-X / T-Max / Ilford | 纯粹的黑白灰度，锐利的字体 |

## 🚀 开发指南 (Development)

本项目使用 `Vite` + `React` + `TypeScript` 构建。

### 1. 环境准备

```bash
git clone https://github.com/your-username/FilmFrame.git
cd FilmFrame
npm install
```

### 2. 启动开发

```bash
npm run dev
```

### 3. 构建部署

```bash
npm run build
```

构建产物位于 `dist` 目录，可直接部署至 Vercel, Netlify 或任何静态服务器。

## 🛠️ 技术栈 (Tech Stack)

- **UI 框架**: React 19
- **构建工具**: Vite 5
- **样式引擎**: Tailwind CSS
- **图像核心**: HTML5 Canvas API (Offscreen processing optimized)
- **元数据**: `exif-js` (Local dependency)

## 📄 许可证 (License)

MIT License. 

---

<p align="center">Made with ❤️ for Photographers.</p>
