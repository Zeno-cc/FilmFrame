# 光谱负片模板片边长条支持

## Goal

用户选择“光谱负片 + 模板片边 + 胶片长条”时，不再被“只能单张”弹窗挡住；在模板片边上得到与单张同一套光谱显影的连续长条。

## Background

- 当前唯一限制在 `services/spectral/scope.ts`：`imagingMode === 'spectral' && edgeRenderMode !== 'physical135'` 即抛错。
- 非 Gold 的模板长条代码 `renderFlattenedReal135Strip` 已经逐帧调用 `applySpectralToAperture`，但入口被 `assertSpectralStripSupported` 提前拦截。
- Kodak Gold 200 的模板长条分支单独使用 `applyGold200Look`，即使放开守卫也不会走光谱。
- 缺口是历史实现边界与保守校验，不是硬性内存上界；36 帧模板长条远低于 Canvas 边长与像素预算。
- 每帧单独创建光谱后端会重复加载资源；物理长条已有共享 session 的先例。
- 用户已确认：真正支持长条，不只改弹窗。

## Confirmed Decisions

- 支持范围：所有 `supportsSpectralStock` 为真且实际执行模板光谱路径的胶片，包括 Kodak Gold 200。
- 模板长条逐帧光谱后按现有模板卡片几何拼接；不改模板资产、行数、间距或输出尺寸。
- 物理片边长条、经典边框长条、经典色彩行为保持不变。
- 光谱显影使用长条级共享 session，避免每帧创建/销毁后端；结束、失败或取消时释放。
- 无法真正执行光谱的组合仍明确失败，不静默退回 Gold look 或经典色彩。
- 内部枚举、localStorage 键、渲染签名和 Worker 请求结构不变。

## Requirements

### R1 解除错误的入口限制

- `assertSpectralStripSupported` 不再把“模板片边”一概视为不支持。
- 仅在光谱实际无法执行时失败：胶片没有光谱能力，或 `useFilmOverlayTemplate === false` 导致模板光谱路径不可达。
- Worker 客户端、Worker、主线程三处守卫使用同一判断，不出现一处放行、一处拒绝。

### R2 模板长条逐帧光谱

- `renderFlattenedReal135Strip` 每帧在片窗区域应用光谱，之后才叠加颗粒、模板片边、齿孔与帧号。
- 长条每一帧使用对应帧号与该照片 transform；光谱区域严格等于模板片边布局的 `imageX/Y/W/H`。
- 光谱失败必须让整条渲染失败并保留已有内容，不发布半条。

### R3 Kodak Gold 200 分支

- Gold 200 + `imagingMode='spectral'`：模板长条走光谱，不再调用 `applyGold200Look`。
- Gold 200 + `imagingMode='legacy'`：保持现有 Gold look。
- Gold 专用布局 `createKodakGoldStripLayout` 的几何、行距和输出尺寸不变。

### R4 共享光谱会话

- 新增长条级 session：每个长条只加载一次 stock pipeline 并创建一个后端；同一长条的帧尺寸必须一致。
- session 的 `dispose()` 在正常完成、异常、取消和 Worker 回退路径都必须调用。
- 单张路径可继续使用现有 `applySpectralToAperture`；不要求重写。
- session 不跨长条复用，不持久化，不进入用户设置。

### R5 错误与状态

- 常规“光谱 + 模板片边 + 长条”不再出现“需要处理”弹窗。
- 仅剩余真正不可执行组合失败，错误说明具体原因与可执行替代。
- 失败时保留已有单张成片和旧长条；不生成部分长条。
- 处理中/导出中继续禁用操作，不启动第二次渲染。

### R6 兼容

- `renderAdmission` 的模板/物理/经典尺寸基线不变。
- 单张光谱、物理光谱长条、经典色彩长条像素与行为不变。
- 旧设置、旧配方、Worker 协议和输出文件命名不变。

### R7 验证

- 单元测试覆盖新的守卫判断、Gold/非 Gold 分支选择、session 创建与释放、异常路径。
- Playwright 覆盖光谱 + 模板片边单张和长条成功出图，Gold 200 与至少一款非 Gold 光谱胶片。
- 像素一致性：同一胶片与设置下，长条第一帧片窗与单张输出片窗在容差内一致；CPU 与 WebGL2 各验证。
- Worker 与强制主线程输出一致；36 帧不触预算上界。
- 性能探针确认共享 session 后预览帧数耗时可接受，没有逐帧资源重建。

## Acceptance Criteria

- [x] AC1：Gold 200 光谱 + 模板片边可选择胶片长条并成功生成，不再弹“仅支持单张”。
- [x] AC2：至少一款非 Gold 光谱胶片（如 Portra 400）同样成功生成模板光谱长条。
- [x] AC3：长条每帧片窗与单张光谱输出的像素在既定容差内一致，无错位、无二次颜色转换。CPU 路径已通过，证据为 `parity-kodak-gold-200-cpu.json` 与 `parity-kodak-portra-400-cpu.json`（光谱差显著小于经典差且低于容差 18）；WebGL2 用例在本机软件渲染器上按产品策略跳过，归入真机/真实 GPU 发布门禁，不再作为本任务阻塞项。
- [x] AC4：Gold 200 在经典色彩下仍使用现有 Gold look；物理片边和经典边框路径不变。
- [x] AC5：长条光谱只创建一个后端 session 并正确释放；取消、异常、Worker 回退无泄漏。
- [x] AC6：模板长条尺寸、行数、间距、帧号与现有非光谱模板长条一致。
- [x] AC7：真正不可执行的组合仍给出明确错误与替代，不静默降级。
- [x] AC8：单元、Playwright、类型检查、构建和性能探针通过；文档同步。

## Out of Scope

- 修改光谱算法、颜色管线或 stock 资源。
- 修改物理长条或经典边框长条。
- 为 `useFilmOverlayTemplate === false` 的旧配置新增光谱能力。
- 新增 UI 控件、输出模式或用户设置。
- 修改模板资产、PNG、许可或 provenance。

## Risks / Deferred

- Gold 200 模板长条几何与光谱的 CPU 像素一致性已验证；WebGL2 在本机软件渲染器上无法实测，已明确交给真机/真实 GPU 发布门禁。产品策略本身安全：`auto` 后端在不支持的 GPU 上回退 CPU，显式选择 WebGL2 时失败会直接报错（README「浏览器兼容性」）。
- 共享 session 的帧尺寸固定假设来自模板布局；若未来出现变尺寸帧，需要显式失败而不是复用错误后端。
- 36 帧光谱长条耗时取决于后端；若性能探针不通过，只允许先交付小帧数或回退到物理片边方案，不发布卡死的路径。
