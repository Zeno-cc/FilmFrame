# 实施计划：光谱负片模板片边长条支持

## 前置条件

- 用户已确认真正支持长条，不只是修改弹窗。
- 不修改光谱算法、模板资产、物理/经典渲染路径。
- 实施前复核工作区未提交修改，不覆盖无关内容；不提交、不推送、不建分支。

## 执行顺序

### 1. 修正入口判断

- [x] 在 `services/spectral/scope.ts` 增加 `spectralStripSupported`，基于 `imagingMode`、`edgeRenderMode`、`brandText`、`frameRenderMode`、`useFilmOverlayTemplate` 判断。
- [x] `assertSpectralStripSupported` 只拒绝真正不可执行的光谱组合。
- [x] 保持 `filmWorkerClient`、`filmEngine`、`filmWorker` 三处调用；三处行为一致。
- [x] 旧配置 `useFilmOverlayTemplate=false` 给出具体错误，不静默经典色彩。

### 2. 长条级共享光谱 session

- [x] 在 `services/spectral/canvasAdapter.ts` 增加 `SpectralApertureSession` 与 `createSpectralApertureSession(settings,width,height)`。
- [x] session 内只创建一次 backend、stock pipeline、复用像素缓冲；帧尺寸不匹配时抛出明确错误。
- [x] `dispose()` 只释放后端资源。
- [x] `applySpectralToAperture` 改为包装 session，保持单张与现有调用行为。
- [x] 在 Worker 与主线程长条路径的 `finally` 释放 session。

### 3. 非 Gold 模板长条

- [x] `drawFlattenedReal135Frame` 增加可选 session 参数。
- [x] Worker `renderFlattenedReal135Strip` 创建一个 session 并按帧复用。
- [x] 主线程 `drawKodakGoldTemplateFrame` 同样支持 session。
- [x] 调用顺序保持：模板 → 照片 → 光谱 → 颗粒 → rebate → 齿孔 → 帧号。
- [x] 光谱失败让整条失败，不发布部分长条。

### 4. Gold 200 模板长条

- [x] Worker `renderReal135Strip` 的 Gold 分支：`supportsSpectral(settings)` 时用 session，否则保留 `applyGold200Look`。
- [x] 主线程 `generateReal135FilmStrip` 的 Gold 分支同步修改。
- [x] 保持 Gold 行布局、间距、输出尺寸、连续标记与帧号。
- [x] 验证 Gold 单张光谱行为不变。

### 5. 错误与状态

- [x] 标准组合不再触发 App 的 “single frames only” 分支。
- [x] 更新剩余不可执行组合的错误映射与文案。
- [x] 长条失败保留已有单张成片与旧长条；Worker 超时行为不变。
- [x] 处理中/导出中禁用的交互不变。

### 6. 测试

- [x] 单元：`spectralStripSupported` 真值表、session 复用/尺寸错误/dispose、单张包装释放。
- [x] 更新 `tests/filmWorkerClientFallback.test.ts` 的“不可用”断言。
- [x] 几何基线：`tests/renderAdmission.test.ts` 模板/物理/经典尺寸不变。
- [x] 更新 `tests/e2e/spectral-production.spec.ts`、`tests/e2e/physical135.spec.ts` 的旧限制断言。
- [x] 新增 `tests/e2e/spectral-template-strip.spec.ts`：
  - Gold 200 + 光谱 + 模板片边 + 长条成功，无错误弹窗。
  - Portra 400 同样成功。
  - 主线程与 Worker 各一遍，输出尺寸与非空一致。
  - Gold + 经典色彩保持 Gold look。
- [x] 像素一致性：单张光谱片窗 vs 长条第一帧片窗，CPU 下 Gold/非 Gold 各一组；WebGL2 因 SwiftShader 明确 skip，未计为通过。
- [x] 性能：在新专项中以路由计数验证 36 帧只创建一个 session；未扩展依赖生产 dist 分块的旧性能文件。
- [x] 预算：36 帧不触 32767 边长与像素预算；超上限给出既有错误。

### 7. 文档

- [x] 更新 `README.md`、`handoff.md`、`docs/project/rendering.md`、`docs/project/product-workflows.md` 的“不支持长条”描述。
- [x] 更新 `.trellis/spec/frontend/spectral-rendering.md` 的光谱长条契约与 session 生命周期。
- [x] 不修改模板资产与 provenance。

## 验证命令

```bash
npx vitest run tests/filmWorkerClient.test.ts tests/filmWorkerClientFallback.test.ts \
  tests/renderAdmission.test.ts tests/spectralMonochrome.test.ts tests/spectralCpuLimits.test.ts
npx playwright test tests/e2e/spectral-template-strip.spec.ts \
  tests/e2e/spectral-production.spec.ts tests/e2e/physical135.spec.ts \
  tests/e2e/worker-main-thread-fallback.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/strip-performance.spec.ts --project=chromium --workers=1
npm run typecheck
npm run build
npm test
```

## 实施结果（2026-11-19）

- Gold 200 与 Portra 400 的“光谱 + 模板片边 + 长条”均通过 Worker 与主线程出图；36 帧只创建一个光谱 session。
- 独立检查发现并修复：长条 translate 导致光谱区域偏移；主线程 overlay 失败时可能静默退回经典色彩。两者均补了回归测试。
- CPU 像素一致性：Gold 平均绝对差 7.93、Portra 0.21，均优于同路径 legacy 对照且低于容差。
- `npm test`：41 文件 / 388 通过；专项 Playwright 10 通过 / 2 跳过；typecheck、build 通过。
- 未验证：WebGL2 单张 vs 长条 parity（SwiftShader 环境限制）；非 Gold 36 帧绝对耗时。
- 既有无关失败：Wikimedia 图库外部请求、既有物理面板标签断言、Gold 单张 Worker/主线程 hash 差异。

## 风险与回滚

- 不删除物理长条或经典路径；入口限制可一键回退。
- Gold look 与光谱必须互斥，避免同时应用两次颜色转换。
- session 固定帧尺寸；发现变尺寸时必须抛错，不能复用错误后端。
- 性能不达标时先限制帧数或提示，不发布卡死路径。
- 若 parity 无法达到既定容差，停止并回到方案讨论，不用“近似”掩盖错误结果。
