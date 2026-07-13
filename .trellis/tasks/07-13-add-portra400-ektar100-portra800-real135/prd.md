# Add Portra 400, Ektar 100, and Portra 800 real 135 templates

## Goal

将用户提供的三张生成底片接入 FilmFrame，使 Kodak Portra 400、Kodak Ektar 100 和 Kodak Portra 800 都可以在单张和连底长条工作流中使用对应的真实 135 扁平模板。

## Background

- 用户已提供三张 RGB PNG 源图：Portra 400、Ektar 100、Portra 800；每张为 `1308x1203`。
- 当前已注册 Gold 200（分层模板与 Worker）和 Portra 160（主线程扁平模板）。
- 已注册扁平模板的运行时几何不可变：画布 `1307x1203`，片窗 `x=92, y=211, width=1123, height=800`。
- Portra 160 的实践表明，直接等比/仿射缩放生成图会在片基边缘引入黑色补画布；原图必须基于实测片窗进行 3x3 分区重采样并拼回目标几何。

## Requirements

1. 为三款胶片生成并提交以下运行时 PNG 模板：`public/film-overlays/kodak-portra-400.png`、`public/film-overlays/kodak-ektar-100.png`、`public/film-overlays/kodak-portra-800.png`。
2. 每个模板必须是完整、无透明的 `1307x1203` RGB PNG，并且在精确的项目片窗区域保留均匀纯黑色，不在模板边缘引入黑色补边。
3. 在 `REAL135_TEMPLATE_URLS` 中注册三个型号，使现有能力门控自动开放真实 135 模式、正确写入 `filmOverlayUrl`，并沿用扁平模板的主线程单张/长条渲染。
4. Gold 200 的分层资源、Worker 选择规则与回退逻辑保持不变；新增模板不得进入 Gold 专用 Worker 路径。
5. 更新运行时模板说明和项目渲染文档，记录三项资产与通用几何契约。
6. 扩展单元和端到端测试，覆盖新型号的注册、能力判断、单张与连续长条工作流。

## Acceptance Criteria

- [ ] 三个目标 PNG 存在、可由 Vite 静态服务读取，尺寸均为 `1307x1203`，格式为 RGB PNG。
- [ ] 每张 PNG 的中央片窗精确为 `x=92, y=211, width=1123, height=800`，并且该区域完全为 `#000000`。
- [ ] 三个模板的片基贴满四条画布边，不存在归一化产生的外围纯黑补边。
- [ ] `getReal135OverlayUrl()` 为三个型号返回各自 URL，`supportsReal135Template()` 返回 `true`；至少一个未注册型号仍返回 `false`。
- [ ] 三个型号在真实 135 模式下均能完成单张渲染和长条渲染；长条相邻完整帧之间不出现额外黑色间隙。
- [ ] 新型号不会启用 Gold 200 专属 Worker 路径。
- [ ] `npm run check`、`npm run test:e2e` 和 `git diff --check` 均通过。

## Out of Scope

- 不改变全局真实 135 片窗尺寸、输出分辨率、Worker 架构或 Gold 200 渲染效果。
- 不修改生成底片的视觉内容，也不把该任务扩展到未提供资产的其他胶片型号。
