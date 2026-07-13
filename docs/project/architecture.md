# 系统架构与数据流

> 最后核验：2026-07-13。本文描述 `e5c5a84` 加当前 P0/P1 工作区。

## 总体结构

这是一个客户端单体，没有网络服务层。模块边界主要按“UI 编排、渲染、辅助纯函数”划分：

```text
Browser main thread
  React App
    state / workflows / DOM downloads
    upload + EXIF
    preferences
    preview
    ZIP
    renderer facade
      | capability + policy match
      v
  module Worker --------------------+
    OffscreenCanvas renderer         |
      | error / unsupported          |
      +------------------------------+
      v
  main-thread Canvas renderer
```

## 启动入口

1. `index.html` 设置 `lang=zh-CN`、标题、favicon，并注入 `window.process = { env: { NODE_ENV: 'production' } }` polyfill。
2. `index.tsx` 查找 `#root`，用 `ReactDOM.createRoot` 挂载 `<App />`，外层是 `React.StrictMode`。
3. `App` 初始化默认设置，并同步读取 localStorage 偏好。

没有环境变量读取、动态配置、路由初始化或服务探活。

## 核心领域模型

### `FilmSettings`

| 字段 | 类型/范围 | 当前用途 |
| --- | --- | --- |
| `brandText` | `FilmType` | 预设、文字、Gold 色彩和真实模板注册表门控 |
| `customText` | string | 经典边框替代型号文字 |
| `frameNumber` | number | 起始帧号 |
| `showDate` / `dateStr` | bool/string | 经典模式日期 |
| `borderColor` | string | 经典边框 |
| `holeColor` / `holeType` | string/enum | 经典齿孔 |
| `textColor` | string | 经典文字、Gold 动态帧号 |
| `borderSize` | number | 经典边框百分比参数 |
| `grainIntensity` | number | 所有模式的照片颗粒 |
| `outputFormat` | JPEG/PNG | Canvas/OffscreenCanvas 导出 MIME |
| `outputQuality` | 0.5-1 持久化钳制 | JPEG 质量，PNG 通常忽略 |
| `processingMode` | preview/high | 真实 135 分辨率 |
| `frameRenderMode` | classic/real135 | 渲染分支 |
| `scanOutputAspect` | native/4:3 | 真实单张扫描底板 |
| `autoCropToFilmRatio` | bool | 当前无生产读取 |
| `enableRealisticRebate` | bool | 程序化纹理开关 |
| `maxRollFrames` | 24/36 | 帧号循环 |
| `useFilmOverlayTemplate` | bool | 真实 135 模板开关/Worker 策略 |
| `filmOverlayUrl` | string | 当前模板 URL；仅 Gold legacy fallback 读取，不持久化 |

### `ImageItem`

`ImageItem` 是页面会话内图片的所有权单元：原始 `File`、自然尺寸、会话内入选状态、原始预览 URL、可选处理结果 URL/Blob 字节数、EXIF 日期、处理错误和可选 `RenderTransform`。transform 包含连续 `focusX/focusY`、`1-3x zoom` 与 `0/90/180/270` 用户旋转；数组顺序本身承载业务顺序。裁切编辑期间的 draft 只存在于 `CropEditor`，完成后才写回 ImageItem。

### React 状态

`App` 管理：图片/设置/输出、处理与导出状态、active/queued ID、即时预览、notice/error、移动设置展开、配方和覆盖层。`workflowState.ts` 负责可见状态推导，避免 JSX 直接用 URL 猜测状态。

`imagesRef`、`settingsRef`、`stripResultRef` 用于读取最新状态和卸载清理。处理任务保存 immutable 输入快照，但每个结果通过 ID 合并到 `imagesRef.current`；generation 和设置签名决定结果是否可接受或只作为 stale 历史结果保留。

## 上传数据流

```text
FileList / DataTransfer.files
  -> addFiles
  -> prepareUploadedImages
       JPEG/PNG/WebP allowlist
       URL.createObjectURL
       Image decode for dimensions
       size warning
       EXIF DateTimeOriginal, 1s race
  -> append ImageItem[]
  -> React render
```

处理是逐文件串行。无效 MIME 不创建 URL；尺寸解码失败会拒绝文件并回收 preview URL；EXIF 失败不阻止已成功解码的图片加入。大图只产生非阻塞 warning。

## 渲染门面与 Worker 协议

UI 只导入 `filmWorkerClient.processImage()` 与 `generateFilmStrip()`，不直接选择引擎。

### 能力条件

```ts
Worker
OffscreenCanvas
OffscreenCanvas.prototype.convertToBlob
createImageBitmap
```

### 策略条件

- classic：暂不允许 Worker，统一走主线程，避免当前双实现的尺寸和标记差异暴露给用户。
- real135：Gold 200、Portra 160、Portra 400、Ektar 100 与 Portra 800 由模板注册表开放；仅 `brandText === KODAK_GOLD_200` 且 `useFilmOverlayTemplate !== false` 允许 Worker，其余已注册型号走主线程扁平模板路径。
- 不满足时直接主线程。

### 请求协议

请求为 `processImage` 或 `generateFilmStrip`，附递增整数 `id`。客户端用 `Map<id, {resolve,reject}>` 关联响应。Worker 返回 `{id, ok, blob}` 或 `{id, ok:false, error}`；客户端把 Blob 转为 `{url, byteSize}`，供结果生命周期与 ZIP 预检共同使用。

Worker client 懒创建；构造器被 CSP/策略阻止时返回 null 并走主线程。`onerror` 或 `messageerror` 会：

1. 创建统一错误；
2. reject 全部 pending；
3. 清空 Map；
4. terminate Worker；
5. 把错误记为永久 unavailable。

单个任务返回业务错误不会终止 Worker。普通任务错误会回退主线程；dispose 产生 `WorkerCancelledError`，不会在卸载后再次启动主线程。请求有 120 秒超时，App 卸载会 dispose、reject pending 并 terminate；晚到响应找不到 pending，因此不创建 Object URL。

仍缺失：细粒度单请求 AbortSignal、进度、主动健康检查和传输列表优化。

## 单张批处理状态转换

```text
idle
  -> processing=true
  -> snapshot images/settings + generation
  -> for each item sequentially
       -> worker or main thread
       -> success: merge result metadata by image ID
       -> failure: set processingError, continue
  -> reject/revoke deleted or stale-generation late results
  -> preserve latest additions and ordering
  -> processing=false
```

结果携带 MIME、settings key 与 Blob 字节数。单图 key 还包含 EXIF override 和 transform；长条 key 包含设置、有序入选图片 ID、原卷位置和逐图 transform。当前签名不匹配时，旧结果显示为“待更新”且不可下载；新批次替换时回收旧 URL。

## Object URL 所有权

| URL | 创建者 | 正常回收点 |
| --- | --- | --- |
| 原图 `previewUrl` | `addFiles` | 删除图片、App 卸载 |
| 单图 `processedUrl` | Worker client / main engine | 替换成功、删除图片、晚到拒绝、App 卸载 |
| `stripResult.url` | Worker client / main engine | 图片数组变化、签名拒绝、替换结果、App 卸载 |
| ZIP 临时 URL | `downloadBlob` | 下载触发 1 秒后 |
| file-to-main-thread 临时 URL | `withImageSourceUrl` | `finally`，仅无 fallback URL 时 |
| 即时编辑预览 URL | `previewRenderController` | 新预览替换、generation 拒绝、关闭编辑器 |

潜在泄漏：App 卸载后仍完成的异步请求可能创建新的 URL；没有 abort 或 mounted guard 捕获它。

## 偏好存储

设置偏好 key 为 `filmFrame.preferences.v1`，本地配方 key 为 `filmFrame.recipes.v1`。两者读写均包在 `try/catch`；配方最多 12 条，只保存白名单设置，不保存图片、Blob、URL 或 transform。

存储前执行白名单归一化：

- `borderSize` 5-25；
- `grainIntensity` 0-60；
- `outputQuality` 0.5-1；
- `frameNumber` 至少 1；
- enum 用 Set 校验；
- `maxRollFrames` 仅 24/36；
- `filmOverlayUrl` 永不持久化。

未来 schema 改动应升级 key 或实现显式迁移，不能在同一个 `v1` 中无提示改变含义。

## ZIP 数据流

```text
processed object URLs
  -> fetch each URL
  -> Blob
  -> arrayBuffer / Uint8Array
  -> CRC32
  -> local file headers + raw image bytes
  -> central directory + end record
  -> application/zip Blob
```

实现使用 UTF-8 标志和 Store 方法，不做 deflate。优点是无依赖且图片通常已压缩；代价是 ZIP 构建时会复制全部图片字节，内存峰值较高，并受 ZIP32 限制。

## 外部边界与隐私

运行时没有图片上传请求。已知网络边界只有：

- 页面上的 GitHub 外链，用户点击后打开；
- Worker 用 `fetch()` 加载同源 `/film-overlays/*`；
- README 徽章，不属于应用运行时。

应用不申请相机、麦克风、位置、剪贴板或文件系统写权限。下载通过 `<a download>` 和 Blob URL 完成。
