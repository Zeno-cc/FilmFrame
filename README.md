# FilmFrame

FilmFrame 是一间运行在浏览器里的数字暗房。它把本地照片排成接触印样，为单张照片或整卷长条生成 35mm（135）胶片边框，并在当前设备完成裁切、渲染与导出。

照片不会上传到 FilmFrame 服务。刷新或关闭页面后，照片和处理结果不会保留；胶片设置与本地配方会保存在浏览器中。生产部署可以启用服务端邀请码门禁，但鉴权服务只处理邀请码哈希与会话状态，不接触照片。

[![React 19](https://img.shields.io/badge/React-19-149eca?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite)](https://vite.dev/)
[![Local processing](https://img.shields.io/badge/image_processing-local-2f855a)](#隐私与数据边界)

## 当前能力

### 真实 135 与经典片边

- 16 款胶片均配有独立的真实 135 PNG 模板和齿孔蒙版。
- 真实 135 支持单张成片与连续胶片长条。
- 经典片边使用 Canvas 程序化绘制，可调整文字、日期、边框和齿孔。
- 帧号颜色与真实 135 齿孔颜色可以全局自定义，也可以恢复为原片效果。
- 扫描输出可保留自定义背景色，也可以只保留底片主体。

### 选片与冲洗

- 支持 JPG、PNG、WebP，既可选择文件，也可拖入工作区。
- 接触印样支持排序、逐张入选、全部入选、清空入选和一键删除整卷。
- 只冲洗待处理或设置已变化的照片，失败项可单独重试。
- 冲洗期间可以停止后续任务，已完成的结果会保留。
- 大尺寸或高内存压力批次会在渲染前给出提示或阻止危险操作。

### 构图与预览

- 在固定胶片窗口内拖动照片，使用滚轮或滑杆进行 100% 至 300% 缩放。
- 支持 90 度旋转、重置、取消与应用构图。
- 原图与成片可快速切换，设置变化后会生成本地即时预览。
- 构图只在确认后写入当前照片，取消不会改变正式结果。

### 导出

- 单张输出支持 JPEG 与 PNG。
- 多张单幅成片可按当前顺序打包为 ZIP。
- 连底长条按入选顺序生成，可直接预览和下载。
- 只有与当前设置和构图匹配的结果可以下载，旧结果会标记为待更新。

### 空暗房

- 空工作区使用连续滚动的 135 胶片作为背景，画幅保持 36:24（3:2）。
- 胶片动画在悬停、键盘聚焦和拖入文件时暂停，并遵守 `prefers-reduced-motion`。
- 摄影名言来自人工审核的本地快照，每 24 小时自动更换；浏览器不会为轮换实时请求第三方接口。

## 支持的胶片

| 品牌 / 系列 | 型号 |
| --- | --- |
| Kodak Portra | 160、400、800 |
| Kodak 彩色负片 | Gold 200、Ultramax 400、ColorPlus 200、Pro Image 100、Ektar 100 |
| Kodak 反转片 | Ektachrome E100 |
| Kodak 黑白片 | Tri-X 400、T-Max 100、T-Max 400、T-Max P3200 |
| Fujifilm | Superia 400 |
| CineStill | 800T |
| Ilford | HP5 Plus |

## 快速开始

环境要求：Node.js 20 或更高版本。

```bash
git clone https://github.com/Zeno-cc/FilmFrame.git
cd FilmFrame
npm ci
npm run dev
```

Vite 默认输出本地访问地址。若需要固定到项目常用端口：

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

## 使用流程

1. 添加 JPG、PNG 或 WebP 照片。
2. 在接触印样中排序并选择需要冲洗的照片。
3. 在暗房配方中选择胶片、真实 135 或经典片边，以及输出设置。
4. 需要时打开单张预览调整构图。
5. 生成单张成片或连续胶片长条。
6. 下载单图、长条，或把当前有效成片打包为 ZIP。

桌面端使用右侧暗房配方面板；平板使用侧边抽屉；手机使用底部设置面板和固定操作栏。

## 常用命令

```bash
npm run dev          # 启动 Vite 开发服务器
npm run typecheck    # TypeScript 类型检查
npm test             # 运行 Vitest 单元测试
npm run test:e2e     # 运行 Playwright 浏览器测试
npm run check        # 单元测试 + 类型检查 + 生产构建
npm run check:access # 鉴权服务测试 + 类型检查 + 构建
npm run check:all    # 前端与鉴权服务完整检查
npm run build        # 构建 dist 静态站点
npm run preview      # 本地预览生产构建
npm run sync:quotes  # 从 Wikiquote 生成待人工审核的名言候选
npm run verify:deployment # 校验 Compose、OpenResty 边界与可选线上探针
```

`sync:quotes` 只生成 `generated/` 下的候选文件，不会自动覆盖应用使用的审核快照。

## 技术结构

```text
Cloudflare / OpenResty
  -> 服务端邀请码与会话检查
  -> 通过后分发 React 静态应用
      -> App 工作流与页面状态
      -> Canvas / Worker 本地图像处理
      -> Blob URL 预览、下载与 ZIP

独立管理域名
  -> Cloudflare Access：白名单 Google + Independent MFA Passkey
  -> 鉴权服务验证 Access JWT
  -> 生成、查看和撤销邀请码
```

- React 19 + TypeScript + Vite 5
- Tailwind CSS 4 + 项目语义化 CSS token
- Canvas / OffscreenCanvas 图像合成
- Web Worker 可选渲染路径
- `exif-js` 本地读取拍摄日期
- Express 5 + SQLite 邀请码与服务端会话
- Cloudflare Access JWT 源站校验
- Vitest 单元测试与 Playwright 浏览器测试

关键文档：

- [产品工作流](docs/project/product-workflows.md)
- [系统架构](docs/project/architecture.md)
- [渲染实现](docs/project/rendering.md)
- [工程与部署](docs/project/engineering.md)
- [风险与排障](docs/project/operations-and-risks.md)

## 隐私与数据边界

应用没有普通用户账户、图片上传接口、云同步或遥测。用户照片只通过浏览器 `File`、Canvas、Worker 和 Blob URL 在当前页面会话中流转。

可选的生产门禁使用 SQLite 保存邀请码与会话 token 的 SHA-256 哈希、有效期和撤销状态。数据库不保存邀请码明文、照片、EXIF、胶片设置或渲染结果。

运行时网络请求仅用于同源静态素材，例如真实 135 模板和齿孔蒙版。摄影名言来自随应用发布的审核快照；只有用户主动点击出处链接时才会打开 Wikiquote。

## 测试

提交前建议运行：

```bash
npm ci
npm --prefix server/access ci
npm run check:all
npm run test:e2e
git diff --check
```

当前测试覆盖上传校验、设置与配方存储、构图几何、批次准入、结果失效、Worker 生命周期、真实 135 素材、齿孔蒙版、空暗房响应式布局，以及从上传到冲洗、预览和导出的关键浏览器流程。

## 部署

不启用访问控制时，`dist/` 仍可部署到任意静态文件服务器。需要不可由前端状态绕过的邀请码门禁时，必须使用仓库中的 Compose 与 OpenResty 反代方案；纯静态托管不能形成权限边界。

| 配置项 | 值 |
| --- | --- |
| 前端 Node.js | `>=20` |
| 鉴权服务 Node.js | `22 LTS` |
| 静态容器 | `127.0.0.1:18082` |
| 鉴权容器 | `127.0.0.1:18083` |
| 持久化 | SQLite named volume |
| 配置模板 | `.env.example` |
| OpenResty 模板 | `ops/openresty/` |

```bash
cp .env.example .env
# 填写 Cloudflare Access team domain、管理应用 audience 和管理员邮箱
docker compose up -d --build
npm run verify:deployment -- --live
```

生产切换前还必须配置 Cloudflare Access 的精确管理员邮箱、Google 登录方式与 Independent MFA WebAuthn，清理旧缓存，并把两个 OpenResty 示例合并到对应的 1Panel 站点。任何 Google Client Secret 都只能保存在 Google/Cloudflare 配置中，不能写入 `.env` 或仓库。

## 浏览器兼容性

主要开发和自动化测试环境为 Chromium。应用为不支持 Worker 或 OffscreenCanvas 的环境保留主线程 Canvas 回退，但正式发布前仍建议在 Safari、Firefox 和移动设备上完成实际图片流程验证。

## 许可证

仓库目前没有许可证文件。在添加明确许可证之前，请不要假定代码或胶片素材可以自由复制、修改或商用。
