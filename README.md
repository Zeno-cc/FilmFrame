
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
  <p align="center"><strong>真实 135 胶片边框生成器 (Digital Darkroom)</strong></p>
  
  <p align="center">
    一个浏览器端 Canvas 胶片模拟工具，为照片生成 16 款真实 135 底片边框。<br />
    支持<strong>真实模板叠加</strong>、<strong>连续底片长条</strong>、<strong>批量处理</strong>与<strong>ZIP 打包下载</strong>。
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

**FilmFrame** 不仅是简单加黑边工具，它是基于 Canvas 像素级绘制的胶片模拟器，当前 16 款胶片均支持真实 135 底片边框。

### 1. 🎞️ 真实 135 工作流
- **真实 135 单张**：使用与所选胶片对应的模板，照片自动裁切/旋转进入底片窗口。
- **连续底片长条**：Gold 200 按连续片基绘制；已注册扁平模板让完整帧直接相接，不产生额外帧间空隙。
- **经典边框模式**：保留旧版程序化边框，继续支持自定义文字、边框颜色、齿孔形状等设置。

### 2. 🎨 输出控制
- **帧号递增**：批量处理时自动从起始编号递增，并按 36 张胶卷循环。
- **颗粒强度**：可调节照片区域的胶片颗粒。
- **格式选择**：支持 JPG / PNG 输出，单张模式可将所有成片打包为 ZIP。
- **大图提示**：上传超大尺寸或大体积图片时给出处理性能提醒。

### 3. 🛡️ 安全与隐私优先
- **纯前端运行**：所有图片处理均在浏览器本地完成，**绝不上传**到服务器。
- **防崩溃提示**：内置大图检测，降低用户误传超大图片导致浏览器卡死的概率。
- **安全文件名**：自动清洗下载文件名，防止特殊字符导致的文件系统问题。
- **供应链安全**：移除外部 CDN 依赖，所有核心库本地化打包。

## 📸 胶片型号 (Film Stocks)

真实 135 与经典边框模式均支持以下 16 款胶片：

| 系列 | 型号 | 风格特点 |
| :--- | :--- | :--- |
| **Kodak Portra** | 160 / 400 / 800 | 暖色调，经典的 JetBrains Mono 等宽字体 |
| **Kodak Consumer** | Gold 200 / ColorPlus 200 / Pro Image 100 | 金黄色与暖色消费负片质感 |
| **Kodak Consumer** | Ultramax 400 | **加粗**无衬线字体，高对比度风格 |
| **Kodak Ektar** | Ektar 100 | 鲜艳的红色品牌标识 |
| **Reversal (正片)** | Ektachrome E100 | 白色边框，独特的反转片质感 |
| **Fujifilm** | Superia 400 | 标志性的绿色字体，**全圆角**齿孔 |
| **Cinema** | CineStill 800T | 电影卷风格，红色高光 |
| **B&W (黑白)** | Tri-X 400 / T-Max 100 / 400 / P3200 / Ilford HP5 Plus | 纯粹的黑白灰度，锐利的字体 |

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

### 4. 验证

```bash
npm run check
npm run test:e2e
```

`npm run check` 会依次执行 Vitest、TypeScript 和生产构建；`npm run test:e2e` 使用 Playwright 检查桌面、平板和移动端的关键暗房流程。

## 🖥️ 界面与工作流

FilmFrame 使用本地数字暗房工作流：选片、排序、选择配方、冲洗、审片与导出。桌面端将接触印样工作区置于左侧、暗房配方置于右侧；平板以右侧抽屉呈现设置，手机使用底部 Sheet。照片只在当前浏览器中处理，不会上传到 FilmFrame 服务。

### Zeabur 部署

Zeabur 上选择从 GitHub 仓库部署即可：

```txt
Framework: Vite / Static Site
Install Command: npm install
Build Command: npm run build
Output Directory: dist
Node Version: >=20
```

项目没有后端、数据库或必需环境变量。`public/film-overlays/` 下的 16 款真实 135 模板会在构建时自动复制到 `dist/film-overlays/`。

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
