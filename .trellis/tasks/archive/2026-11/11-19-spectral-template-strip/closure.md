# 闭环记录（2026-11-19）

## 交付

- `services/spectral/scope.ts`：`spectralStripSupported` / `assertSpectralStripSupported` 不再把模板片边一概视为不支持；只在胶片无光谱资源或模板路径关闭时失败。Worker 客户端、Worker、主线程使用同一判断。
- `services/filmWorker.ts`：`renderFlattenedReal135Strip` 逐帧在模板片窗 `imageX/Y/W/H` 应用光谱，再叠加颗粒、模板片边、齿孔与帧号；Gold 分支在光谱模式下改走光谱而不是 `applyGold200Look`。
- `services/spectral/canvasAdapter.ts`：新增 `SpectralApertureSession` / `createSpectralApertureSession`，长条级共享后端与复用缓冲区，尺寸不一致显式失败。
- `services/filmWorker.ts`、`services/filmEngine.ts`：长条在正常完成、异常与 Worker 回退路径都 `dispose()` 共享 session。

## 验证证据

| 项 | 证据 |
| --- | --- |
| CPU 像素一致性 | `.trellis/tasks/11-19-spectral-template-strip/parity-kodak-gold-200-cpu.json`、`parity-kodak-portra-400-cpu.json` |
| 共享 session 生命周期 | `tests/spectralApertureSession.test.ts`、`tests/physicalSpectralSession.test.ts` |
| 端到端成功出图与守卫 | `tests/e2e/spectral-template-strip.spec.ts` |
| 全量门禁 | `npm run check`（单元 + 光谱数值 + 类型 + 构建）通过 |

## 未闭环（有意保留）

- WebGL2 像素一致性：本机只有软件渲染器（SwiftShader），`explicitWebgl2SpectralUsable` 按产品策略跳过该用例。真实 GPU 上与 iPhone/Android 真机烟测合并执行，不单独阻塞本任务。
- 物理 iOS/Android 真机烟测仍为独立发布门禁。

## 关闭时的工作区状态

本任务随开发收尾批次一并提交，提交后执行 `task.py archive`。
