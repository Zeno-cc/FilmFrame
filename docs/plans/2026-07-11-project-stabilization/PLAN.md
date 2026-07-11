# FilmFrame 项目稳定化执行计划

> 执行策略：先审查、再测试基线、再 P0 修复、最后收敛架构。每一阶段都有停止点，防止无边界还债。

> 执行结果：Stage A-D 的 P0 已完成；Stage E 完成帧号、旋转、容量和 Worker 路由契约，完整 Gold 主线程/Worker 视觉等价性留作 P1；Stage F 已通过 66 tests、typecheck、build 和 Chromium smoke。

## 1. 审查深度与协作方式

本次属于 **Deep**：当前工作区加新文档超过 10 个文件，核心改动跨 UI、Worker、Canvas、上传和下载边界。执行四个并行视角：

1. 架构与状态所有权；
2. 正确性、并发与生命周期；
3. 测试、构建、依赖和发布；
4. 性能、安全、浏览器与对抗场景。

主代理负责：审查基线、finding quality gate、重复合并、规格决策、代码整合和最终验证。子代理先只读审查；未经主代理分配，不同时编辑同一文件。

## 2. 执行阶段

### Stage A：证据型审查

输入：当前完整工作树。
输出：四轴评分、findings、Top 3、任务映射。
停止条件：所有高严重 finding 有精确触发和上下游证据。

步骤：

1. 运行自动审计信号脚本。
2. 子代理并行阅读完整相关源码和 diff。
3. 主代理复核每个 finding 的调用链和当前行号。
4. 对抗检查有效操作序列、部分失败和大规模输入。
5. 将 finding 分类为 `safe_auto`、`gated_auto`、`manual`、`advisory`。

### Stage B：测试执行基线

输入：审查确认的测试缺口。
输出：真实 runner、`npm test`、`typecheck`、`check`。
停止条件：现有测试全部被真实执行；geometry 冲突有明确结论。

原则：先迁移不改语义，再新增回归测试。避免在同一提交中混入大范围生产重构。

### Stage C：结果正确性

输入：R1-R3。
输出：结果元数据、stale 判定、正确下载命名与 ZIP 筛选。
停止条件：切格式/质量/模式后不会误下载旧内容；原图不会伪装成目标格式。

预期设计方向：

- `processedUrl` 升级为包含 URL、MIME、render signature 的结果对象，或增加并列元数据；
- render signature 只包含真正影响输出的设置和图片/顺序信息；
- 下载逻辑消费结果元数据，不读取易变的当前设置来猜格式。

最终结构由审查和现有代码最小变更原则决定。

### Stage D：批次与生命周期

输入：R4-R8。
输出：任务快照、ID 合并、generation/cancel、Worker dispose、URL 所有权。
停止条件：处理中合法 UI 操作不会被旧批次回滚；卸载/删除无晚到 URL 泄漏。

优先最小实现：若完整取消协议成本过高，先禁止改变输入的操作并用 generation ID 丢弃晚到结果；随后再补 Worker cancel/dispose。

### Stage E：渲染契约

输入：R9-R10 与 geometry 失败。
输出：几何、旋转、帧号、尺寸和 fallback 契约测试。
停止条件：浏览器能力差异不再无测试地改变核心输出契约。

本阶段只做必要去重，不进行全面引擎重写。

### Stage F：全量验证与交接

1. 全量 test/typecheck/build。
2. 浏览器上传、单张、长条、预览、下载 smoke。
3. 检查 console、Worker chunk、静态素材和构建内容。
4. 更新 handoff、任务状态和遗留 backlog。
5. 不自动 commit、push、PR 或部署。

## 3. 决策门

以下事项必须在实现前由审查证据决定：

| 决策 | 当前结论 | 证据 |
| --- | --- | --- |
| 测试 runner | 已采用 Vitest 2.1.9 | 66 项断言通过 |
| geometry 失败 | 已删除无生产调用的死 segment helper | 生产连续片基直接使用 layout |
| 未处理原图下载 | 已隐藏成片下载入口 | 浏览器 smoke 验证 |
| 处理中交互 | 按 ID 合并 + generation，不冻结添加/排序 | 纯 reducer 测试覆盖 |
| 结果模型 | 已采用 URL + MIME + settings key | stale/MIME 测试覆盖 |
| Worker 去重 | classic 暂固定主线程；Gold 去重留 P1 | 生命周期和路由测试覆盖 |

若证据不足且选择会改变用户可见行为，停止该项并向项目所有者报告，不自行猜测。

## 4. 风险控制

- 每阶段控制文件范围，避免多个修复同时改 `App.tsx`。
- 生产行为修复一律由失败测试进入。
- 每次替换 URL 都同时审查旧 URL 的回收点。
- 每次修改设置字段都审查 storage、主线程、Worker、下载和文档。
- 每次修改渲染都至少覆盖 single/strip、classic/real135、main/worker 矩阵中相关格子。
- 不把现有未跟踪文件误判为本轮临时产物。

## 5. 预期交付

- 深度项目审查结果；
- 可执行测试与验证命令；
- P0 正确性修复及回归测试；
- 渲染契约测试；
- 更新后的 handoff 与后续 P1/P2 backlog；
- 明确的未提交变更清单。
