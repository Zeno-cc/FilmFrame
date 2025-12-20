
<div align="center">
  <br />
  <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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
  
  <h1 align="center">Film Frame Maker</h1>
  <p align="center"><strong>胶片齿孔生成器 (Master Edition)</strong></p>
  
  <p align="center">
    为你的数码照片自动添加复古胶片边框、齿孔与 EXIF 时间戳。<br />
    支持<strong>连底长条印样 (Contact Sheet)</strong>、<strong>拖拽排序</strong>与<strong>批量处理</strong>。
  </p>

  <p align="center">
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript" alt="TypeScript"></a>
    <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-Fast-646CFF?logo=vite" alt="Vite"></a>
    <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwindcss" alt="Tailwind"></a>
  </p>
  <br />
</div>

---

## ✨ 项目简介 (Introduction)

**Film Frame Maker** 是一个运行在浏览器端的“数字暗房”工具。它不仅仅是简单地给图片加一个黑框，而是通过 Canvas 像素级绘制，真实模拟了柯达 (Kodak)、富士 (Fuji)、伊尔福 (Ilford) 等经典胶卷的物理特征。

无论你是想要制作单张胶片风格的照片，还是生成一张讲述故事的**连底长条 (Film Strip)**，这里都能满足。

### 🔥 核心特性

#### 1. 双模式输出
- **🖼️ 单张卡片模式 (Single Frame)**：批量为每张照片生成独立的胶片边框，适合发朋友圈或 Instagram。
- **🎞️ 连底长条模式 (Film Strip)**：将多张照片拼接成连续的胶片印样 (Contact Sheet)。
  - **智能折行**：支持大量图片拼接，每行最多 6 张，自动折行并添加剪切间距。
  - **物理仿真**：模拟真实的底片间隔和齿孔连续性。

#### 2. 交互式叙事
- **✋ 拖拽排序 (Drag & Drop)**：在生成长条前，你可以随意拖拽图片调整顺序。
- **📖 故事线构建**：按时间、色调或情节重新组织照片，让长条图更具叙事感。

#### 3. 经典胶卷模拟
- **预设丰富**：内置 10+ 种主流胶卷预设（Kodak Portra/Gold/Ultramax, Fuji Superia, CineStill 800T 等）。
- **细节还原**：
  - **字体还原**：Portra 的等宽字体 vs Ultramax 的粗体。
  - **齿孔形状**：支持切换方孔 (Square) 或圆角孔 (Rounded)。
  - **物理质感**：内置胶片颗粒 (Grain) 和齿孔的 3D 阴影/高光效果。

#### 4. 自动化与隐私
- **📅 EXIF 智能识别**：自动读取照片拍摄日期 (`DateTimeOriginal`) 并打印在边框上。
- **🔒 纯前端处理**：利用浏览器 Canvas 性能秒级渲染，图片**不上传**服务器，完全保护隐私。

## 📸 支持的胶片型号 (Film Stocks)

我们仔细研究了不同品牌胶卷的齿孔间距和字体风格，目前支持以下型号：

| 品牌 (Brand) | 型号 (Model) | 特点 |
| :--- | :--- | :--- |
| **Kodak Pro** | Portra 160 / 400 / 800 | 专业人像，暖色调，JetBrains Mono 等宽字体 |
| **Kodak Pro** | Ektar 100 | 极其细腻，高饱和度 |
| **Kodak Consumer** | Gold 200 / ColorPlus 200 | 经典的日常记录风格 |
| **Kodak Consumer** | Ultramax 400 (GC 400) | 明亮的金黄色字体，Helvetica 粗体设计 |
| **Kodak Reversal** | Ektachrome E100 | 正片（反转片），白色边框风格 |
| **Kodak B&W** | Tri-X 400 / T-Max | 经典的黑白负片风格 |
| **Fujifilm** | Superia 400 | 独特的绿色调字体，全圆角齿孔 |
| **Cinema** | CineStill 800T | 电影胶片改制，独特的红色光晕风格 |
| **Ilford** | HP5 Plus | 英国经典的黑白胶卷 |

## 🚀 快速开始 (Getting Started)

本项目使用 `Vite` 构建。

### 1. 克隆项目

```bash
git clone https://github.com/your-username/film-frame-maker.git
cd film-frame-maker
```

### 2. 安装依赖

```bash
npm install
# 或者
yarn install
# 或者
pnpm install
```

### 3. 启动开发服务器

```bash
npm run dev
```

打开浏览器访问 `http://localhost:5173` 即可看到效果。

### 4. 构建生产版本

```bash
npm run build
```

## 🛠️ 技术栈 (Tech Stack)

- **前端框架**: [React 18](https://react.dev/) (Hooks, Functional Components)
- **开发工具**: [Vite](https://vitejs.dev/) (极速 HMR)
- **语言**: [TypeScript](https://www.typescriptlang.org/) (强类型安全)
- **样式**: [Tailwind CSS](https://tailwindcss.com/) (原子化 CSS)
- **核心逻辑**: HTML5 Canvas API (用于图像合成与绘制)
- **工具库**: `exif-js` (提取照片元数据)

## 📦 部署 (Deployment)

本项目已配置好主流平台的部署文件，开箱即用。

- **Vercel**: 项目根目录包含标准构建脚本，直接导入 Git 仓库即可。
- **Netlify**: 已包含 `netlify.toml`，处理了 SPA 重定向与构建命令。

## 📝 许可证 (License)

MIT License. 欢迎 Fork 和 Star！

---

<p align="center">Made with ❤️ by Photographers, for Photographers.</p>
