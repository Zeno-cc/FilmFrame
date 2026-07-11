# 渲染引擎与图像算法

> 最后核验：2026-07-11。核心文件：`filmEngine.ts`、`filmWorker.ts`、`filmGeometry.ts`、`filmOverlay.ts`、`filmResolution.ts`。

## 路由决策

UI 先决定 `OutputMode`，渲染门面再按能力与 `FrameRenderMode` 决定线程：

```text
single
  classic -> classic frame
  real135 -> Gold template/layered frame, fallback programmatic

strip
  classic -> classic strip
  real135 -> continuous Gold 135 strip
```

Worker 和主线程仍是独立实现，不是同一组平台无关绘制函数。为避免已知差异影响用户，classic 当前固定主线程；Worker 只服务 Gold 200 真实 135 模板路径。

## 135 物理模型

`PHYS_135`：

| 常量 | 值 |
| --- | --- |
| 片宽 | 35 mm |
| 画幅 | 36 x 24 mm |
| 帧进给 | 38 mm |
| 每帧齿孔 | 8 |
| 齿孔节距 | 4.75 mm |
| 齿孔尺寸 | 2.8 x 2.0 mm |
| rebate | 5.5 mm |

`create135LandscapeLayout(targetImageWidthPx)` 用 `target / 36` 得到 px/mm，生成传统上下齿孔布局。当前生产的程序化单张主要用 `create135SidePerforationLayout()`：左右各 3 mm rail、上下各 2 mm rebate、每侧 8 孔。前一个布局当前主要由测试覆盖，不要误以为两个都在主路径使用。

## 模板几何契约

Gold 模板基准必须维持 1307 x 1203。片窗实测坐标：

```text
x = 92
y = 211
w = 1123
h = 800
```

`createKodakGoldOverlayLayout(targetImageWidthPx)` 按 `target / (1123/1307)` 反推整张胶片尺寸，再使用归一化坐标计算片窗。替换图片但不保持同一尺寸和开窗会导致照片、mask、片基和帧号全部错位。

当前运行时资产：

| 文件 | 尺寸 | 角色 |
| --- | --- | --- |
| `film-base.png` | 1307x1203 RGBA | 分层片基 |
| `aperture-mask-derived.png` | 1307x1203 grayscale | 片窗亮度 alpha mask |
| `aperture-shadow-derived.png` | 1307x1203 RGBA | 已加载，当前不绘制 |
| `kodak-gold-200.png` | 1307x1203 RGBA | legacy 单图模板 fallback |

`aperture-mask.png`、`aperture-shadow.png`、`*-clean`、`*-cutout` 看起来是素材处理过程文件，当前源码未引用。删除前仍需确认资产来源和人工工作流。

## 真实 135 单张主线程路径

`processImage()` 在 `frameRenderMode=real135` 时，Gold 200 先调用模板路径：

1. 加载分层素材 Promise；成功值在模块内缓存，失败会清空缓存以允许重试。
2. 加载用户图片。
3. 根据 processing mode 选择片窗宽度。
4. 创建模板比例画布和独立 emulsion canvas。
5. 将照片 center-cover 到片窗；竖图先旋转。
6. 对 Gold 200 应用 `applyGold200Look()`。
7. 在照片区域叠加颗粒。
8. 把 grayscale mask 的 RGB 亮度转换为 alpha。
9. 用 `destination-in` 把 emulsion 裁进片窗。
10. 绘制片基、动态帧号；shadow 当前禁用。
11. 可选合成到 4:3 扫描底板。
12. 若源图为竖图，把最终单张成片逆时针旋回。
13. 导出 JPEG/PNG Blob URL。

分层加载失败后，先尝试 legacy overlay；再失败才调用程序化 `processImageReal135()`。

## Worker 真实单张路径

Worker 用 `createImageBitmap(file)` 解码原图，用 `fetch()` + `createImageBitmap(blob)` 读取同源分层资产，用 `OffscreenCanvas.convertToBlob()` 导出。成功返回 Blob，而不是 URL。

结构大体与主线程分层路径相同，但通过类型断言把 `OffscreenCanvasRenderingContext2D` 交给接收 `CanvasRenderingContext2D` 的色彩函数。浏览器 API 兼容是实际运行前提。

Worker 若缺资产或任一步报错，不在 Worker 内执行 legacy 模板 fallback，而是把错误回主线程；client 随后让完整主线程引擎重新处理。

## 照片 cover 与旋转

普通 cover：比较源宽高比和目标宽高比，裁掉多余宽或高，居中绘制。

竖图进入横向片窗的条件：

```text
sourceHeight > sourceWidth && frameWidth > frameHeight
```

满足时：

- 片窗内顺时针 `Math.PI / 2`；
- 旋转后以源高作为逻辑宽、源宽作为逻辑高做 cover；
- 单张输出最后逆时针 `-Math.PI / 2` 恢复产品方向。

这意味着照片一定可能发生中心裁切，当前没有裁切位置或缩放 UI。EXIF orientation 是否已被 `Image` / `createImageBitmap` 统一处理依赖浏览器，需要目标浏览器实测。

## 分辨率策略

| 模式 | 片窗宽度 |
| --- | --- |
| 真实单张 preview | 1200 |
| 真实单张 high | `max(1800, min(sourceWidth, 3600))` |
| 真实长条 preview | 每帧 900 |
| 真实长条 high | 每帧 1400 |

高质量模式会把小于 1800 宽的源图放大。所有单张和长条画布创建前统一检查 32767 最大边长和 6400 万最大像素；超限时在分配画布前失败。

## Gold 200 色彩

`applyGold200Look()` 逐像素执行：

- 红：`r * 1.045 + 3`；
- 绿：`g * 1.015 + 1`；
- 蓝：`b * 0.965`；
- 各通道做轻微绕 0.5 中心的软对比；
- 归一化值超过 0.72 的高光按 0.82 压缩；
- 最后 clamp 到 0-255。

这是 sRGB 字节空间的直接处理，没有色彩管理、ICC、线性光转换或广色域策略。

## 纹理与非确定性

- 主线程真实颗粒使用缓存的 256x256 高斯噪声 canvas，overlay 混合并随机偏移。
- Worker 有独立的颗粒实现。
- 程序化片基会随机绘制扫描线、灰尘、划痕和树脂颗粒。
- 部分 DX-like blocks 的 alpha 随机。

由于没有 seed，视觉回归应使用容差/结构性断言，或先把随机源可注入化。

## 经典单张

主线程使用原图宽高确定横图/竖图：

- 横图上下扩边，竖图左右扩边；
- 边宽约为长边乘 `borderSize / 100`；
- 原图绘于中心；
- 按预设绘制齿孔、型号/自定义文字、帧号和可选日期；
- `dateOverride` 优先于手填日期；
- 输出格式与质量直接传给 `canvas.toBlob()`。

Worker 文件仍保留对应实现，但 client 不再把 classic 路由给 Worker；重新启用前必须先完成标记、尺寸和旋转契约对齐。

## 连续真实长条

`createKodakGoldStripLayout(target, count, 4)`：

- 最多 4 帧一行；
- `frameGap = round(imageW * 0.065)`；
- `frameStride = imageW + frameGap`；
- 行距为单模板高的约 8%；
- 外边距为单模板宽的约 3.5%；
- 最后一行可以少于 4 帧，但总宽仍按第一行最大列数。

主线程先为每一行画连续片基，再逐帧加载图片、cover、Gold 色彩、颗粒和文字。Worker 同样程序化绘制连续片基，不读取分层 PNG。

旧版 `getKodakGoldStripSegment()` 没有生产调用，且它的分段算法与真实布局契约不一致，已经连同失真断言删除。当前几何测试覆盖实际使用的 strip layout、旋转和帧号契约。

## 经典长条差异

主线程经典长条：每行最多 6，固定条带高度 1600，并绘制完整边框、齿孔和文字；帧号统一通过 `getFrameNumberForIndex()` 按 24/36 卷长循环。

Worker 文件中的旧 classic 长条仍为 1200 高且绘制简化，但当前路由策略禁用它。长期方案是共享 RenderPlan/绘制契约，而不是再次复制常量。

## 4:3 扫描底板

以胶片宽为初始输出宽，高为 `width * 3/4`；若胶片高度加 5.5% 上下 padding 后放不下，则先扩高，再按 4:3 扩宽。底色 `#e8e3d8`，叠加轻微径向明暗渐变，胶片居中。原先阴影已经移除。

## 导出契约

- 主线程 `canvas.toBlob(type, quality)` -> Object URL。
- Worker `convertToBlob({type, quality})` -> Blob -> 主线程 Object URL。
- PNG 不使用 alpha 的多条路径以不透明 canvas 创建；扫描底板固定不透明。
- 结果记录生成时 MIME 与稳定 settings key；长条 key 还包含有序图片 ID。下载只接受 current 结果，文件扩展名来自 artifact MIME。
