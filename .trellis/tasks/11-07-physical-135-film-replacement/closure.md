# 闭环记录（2026-11-19）

## 处置：已交付并被后续任务取代（不逐项勾选历史验收）

## 事实

- 「用完整物理胶片管线替换真实 135 贴图」已经实现：`services/physical135/` 负责片门/前进/穿孔几何、栅格与长条；`services/filmEngine.ts`、`services/filmWorker.ts` 接入 Worker 与主线程；新会话默认物理片边。
- 旧模板保留为「模板片边」兼容路径，并有迁移规则把旧偏好的经典片边迁移为模板片边。
- 已存在的测试证据：`tests/physical135Plan.test.ts`（几何、方向置换、种子域独立、跨边界连续性）、`tests/physical135Raster.test.ts`（基底、雾/漏光、种子确定性）、`tests/physical135Stocks.test.ts`（型号级洞密度与兼容性）、`tests/physicalSpectralSession.test.ts` 与 `tests/e2e/physical135.spec.ts`、`tests/e2e/physical-migration.spec.ts`、`tests/e2e/pro400h-physical.spec.ts`。
- 本任务正文里的 16 项验收写成「取代前必须先通过」的门禁清单，其中的命名、人眼评审与最终默认切换已被 `11-18-render-mode-simplification`（验收全部勾选）以更窄范围重新确认；因此不逐项回填勾选，避免把不同口径的证据混为一谈。

## 未闭环项的去向

- 分发/来源/对应源码类阻塞（验收最后一条）：转交 `11-06-spectral-license-provenance` 与 `11-11-spektralab-full-stock-migration`。
- 真机 GPU/移动端物理渲染验证：保留为独立发布门禁。

## 结论

实现目标已交付，剩余条件全部落在许可与真机门禁上，本任务不再单独推进。
