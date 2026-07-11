# 风险、排障与后续计划

> 最后核验：2026-07-12。优先级是建议，不代表已获批准的开发计划。

## 已完成的 P0 稳定化

- Vitest 已接管真实测试，`npm run check` 聚合 117 项断言、类型检查和构建。
- 单图和长条结果记录 MIME 与设置/顺序签名；stale 结果不再显示或下载。
- 批次按图片 ID 合并，删除晚到结果会 revoke，不再整体覆盖最新数组。
- Worker client 已有懒创建、构造失败回退、120 秒超时、`messageerror`、dispose 和晚到保护。
- classic 暂固定主线程，避免已知双实现差异影响用户。
- 画布和 ZIP 在分配/读取前执行统一容量预算。

### 当前 P0/P1 工作区

`e5c5a84` 之后的主流程、移动端、RenderTransform、即时预览、配方和分享升级尚未提交。每次接手必须先运行 `git status` 并阅读本轮两组计划文档。

## P1：渲染与资源可靠性

### Worker / 主线程漂移

已知差异：Worker 文件中的 classic 长条仍为 1200，主线程为 1600；当前 client 已禁用 classic Worker，所以用户结果不再由浏览器能力决定。

建议：先抽取平台无关的布局/参数/标记描述；不必一次重写全部 Canvas，但必须建立输出尺寸、帧号和路由契约测试。

### Worker/主线程共享契约仍不完整

Gold 真实 135 的布局、色彩和标记仍有两套实现。当前已有路由和生命周期测试，但尚无完整视觉等价性测试。

### 内存峰值

来源：解码后的源图、多个 Object URL、内存内 ZIP 和随机纹理中间画布。画布已限制为 32767 边长/6400 万像素，ZIP 输入限制为 256 MiB 并顺序 fetch。

建议：下一步增加上传批次总源像素预算和用户可见的预估；长期使用流式 ZIP。25 MiB/8000px 上传提示目前仍只是警告。

### 损坏二维码

`public/alipay.jpg` 文件头不是 JPEG SOI，系统无法读取尺寸。

建议：由所有者提供原图后替换，构建 smoke 检查 `naturalWidth > 0`。

### 发布包含中间素材

`public` 约 4.6MB；Vite 复制所有内容。当前运行时只明确需要 4 个 overlay 文件，其中 shadow-derived 还不绘制。

建议：确认素材工作流，把源素材放到不发布目录，只把运行时文件留在 public；移除 `.DS_Store`。

## P1：产品正确性

### 输入契约

当前只接受 JPEG/PNG/WebP 并要求尺寸解码成功。后续若支持 HEIC/动画格式，必须新增显式转码或首帧策略，不能扩大 MIME allowlist 后交给渲染阶段失败。

### 起始编号当前会话可为负数

输入无 min/max，只有下次从 storage 加载时才 clamp。

建议：UI、状态更新和渲染入口统一 normalize。

## P2：可维护性与体验

- 拆分 `App.tsx` 的 settings/sidebar、workspace、preview dialogs 和 workflow hooks，但避免引入重型状态框架。
- 把 2026-07-12 的手工移动验收落为自动浏览器 spec。
- 增加真实 Canvas/OffscreenCanvas 的 transform 构图基准矩阵。
- 删除死配置或真正实现 `autoCropToFilmRatio`。
- 决定是否加载 JetBrains Mono，或从预设说明移除。
- 增加 LICENSE、CI、CHANGELOG、发布和 ADR 流程。

## 故障排查顺序

### 页面无法启动

1. `node --version` 是否 >=20。
2. 用干净 `npm ci`，不要依赖当前有 extraneous 的 node_modules。
3. `npm run build` 看 TypeScript/Vite 首个错误。
4. 检查 `index.html` 的 `/index.tsx` 和 `#root`。
5. 检查浏览器 console；开发模式仅出现 React DevTools 信息不算错误。

### 图片无法加入

1. 检查 `file.type` 是否以 `image/` 开头。
2. 检查 `Image` 是否能解码预览 URL。
3. 尺寸读取失败当前不会拒绝，所以继续查看渲染阶段。
4. EXIF 失败不应阻止加入；它只影响日期。

### Worker 没有启用

1. 浏览器 console 检查 Worker 构造或模块加载错误。
2. 确认四项能力全部存在。
3. 确认设置是 Gold 200 + real135 + template enabled；classic 当前设计为主线程。
4. Network 检查 `/film-overlays/*` 是否 200 且 MIME 正确。
5. Worker 报错会自动回主线程；功能成功不代表 Worker 成功。

### Gold 模板失效

按 fallback 链检查 console warning：

1. 分层 `film-base.png`、`aperture-mask-derived.png`、`aperture-shadow-derived.png`。
2. legacy `kodak-gold-200.png`。
3. 程序化 renderer。

若素材能加载但错位，先核对 1307x1203 与 aperture 92/211/1123/800，不要先调 CSS。

### 竖图方向错误

1. 记录浏览器解码后的 `img.width/height`，不要只看文件 EXIF。
2. 检查 `shouldAutoRotateForFilmFrame()` 是否触发。
3. 单张应片窗内 +90 度、最终 -90 度；长条不做最终恢复。
4. 对比 Worker 与主线程，强制回退可帮助定位。

### 下载打不开或后缀错误

1. 检查源 URL 对应 Blob 的真实 `type`。
2. 检查结果是否在设置变化前生成。
3. 未处理原图和 stale 结果不会显示成片下载入口。
4. ZIP 只收集 current artifact；部分失败会少文件。
5. 大包先检查 256 MiB 输入预算，再检查 ZIP32 上限。

### 内存不足/页面崩溃

1. 记录原图像素，不只记录文件 MB。
2. 检查是否触发 6400 万像素/32767 边长画布预算。
3. 减少图片数和长条行数。
4. 避免同时生成 ZIP。
5. 检查旧结果 Object URL 是否仍被持有。

## 浏览器兼容待测矩阵

至少覆盖：Chrome/Edge 最新、Safari macOS、Safari iOS、Firefox。每个浏览器验证：Worker 路由、主线程 fallback、JPEG/PNG、竖图方向、EXIF、长条、ZIP、多文件下载、超大图提示。

## 建议执行顺序

1. 提交或至少继续保护当前稳定化开发态。
2. 修二维码、清理发布素材、补 LICENSE/CI。
3. 增加上传总源像素预算和自动浏览器 smoke。
4. 逐步统一 Gold Worker/主线程 RenderPlan 契约。
5. 再处理移动端、可访问性和组件拆分。
