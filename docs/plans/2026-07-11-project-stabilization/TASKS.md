# FilmFrame 稳定化任务清单

> 任务状态：`[ ]` 未开始，`[-]` 进行中，`[x]` 完成，`[!]` 阻塞。

## Phase 0：保护基线与准备

- [x] 记录当前分支、HEAD、tracked/untracked 工作区。
- [x] 明确禁止 reset、stash、clean、checkout 覆盖用户工作。
- [x] 编写 `SPEC.md`。
- [x] 编写 `TASKS.md`。
- [x] 编写 `TDD.md`。
- [x] 编写 `PLAN.md`。
- [x] 校验四份文档链接、格式和相互一致性。

## Phase 1：项目级深度审查

- [x] 运行 `audit_signals.py` 获取项目结构信号。
- [x] 审查当前完整 diff，判定 scope drift 与 hard stops。
- [x] 架构审查：模块边界、主线程/Worker 重复、状态所有权。
- [x] 正确性审查：上传、处理、重试、预览、下载、ZIP、存储。
- [x] 测试与工程审查：脚本、真实执行、CI、构建和发布内容。
- [x] 性能与对抗审查：大图、长条、并发、部分失败、晚到响应。
- [x] 安全/隐私审查：文件输入、Blob、下载命名、同源素材和外链。
- [x] 合并重复 findings，并通过证据质量门禁。
- [x] 输出四轴评分与 Top 3 高杠杆动作。
- [x] 把确认项映射到 Phase 2-4，不在审查中直接大改行为。

## Phase 2：测试基线

- [x] 选择并配置最小测试 runner。
- [x] 新增 `typecheck`、真实 `test`、聚合 `check` 脚本。
- [x] 将五个现有顶层断言转换为 runner test cases。
- [x] 保留原有有效断言语义，确认 geometry 冲突来自死 helper。
- [x] 删除无生产调用的 `getKodakGoldStripSegment()` 及对应失真断言。
- [x] 验证 ZIP 预算测试在修复前真实失败。
- [x] 运行全量测试、类型检查和构建。

## Phase 3：P0 正确性修复

### 结果身份与下载

- [x] 为处理结果保存生成时的 MIME 和设置签名。
- [x] 设置或输入顺序变化时将不匹配结果标记为 stale。
- [x] stale 结果不可作为“当前成片”下载。
- [x] 未处理原图隐藏成片下载入口。
- [x] ZIP 文件扩展名从结果 MIME 得出，不从当前设置推断。
- [x] 补单图、预览、长条、ZIP 回归测试。

### 批次一致性

- [x] 定义 immutable batch snapshot 和 generation ID。
- [x] 批次结果按 image ID 合并，不整体覆盖新数组。
- [x] 删除项的晚到结果立即 revoke 且不恢复该项。
- [x] 新增/排序不会被旧批次完成回滚。
- [x] 处理期间模式/设置变化不会污染当前批次。
- [x] 补删除晚到、新增保留、排序保留和 generation 回归测试。

### 生命周期

- [x] Worker client 提供可测试的 dispose/取消边界。
- [x] App 卸载时终止 Worker 并使晚到结果无效。
- [x] 所有丢弃 Blob URL 有明确 revoke 所有者。
- [x] 补 Worker error、timeout、constructor fallback、晚到响应和 dispose 测试。

## Phase 4：渲染契约与高风险债务

- [ ] 锁定 classic/real135、single/strip 的输出尺寸契约。
- [x] 锁定竖图旋入和单张输出恢复的角度契约。
- [x] 锁定 24/36 帧循环规则，修 classic strip 不一致。
- [x] 建立 Worker 能力路由、生命周期和 fallback 测试。
- [x] classic 暂固定主线程，避免 1600/1200 和标记差异暴露给用户。
- [x] 定义 32767 边长、6400 万像素画布预算和 256 MiB ZIP 输入预算。
- [ ] 清理无运行时用途的 public 中间素材前取得所有者确认。
- [ ] 替换损坏的 `alipay.jpg` 前取得原文件。

## Phase 5：验证与文档同步

- [x] `npm test`。
- [x] `npm run typecheck`。
- [x] `npm run build`。
- [x] Chromium 浏览器 smoke。
- [x] classic 主线程路径 smoke。
- [x] 检查 console 和构建产物；public 冗余资产保留为待确认项。
- [x] `git diff --check`。
- [x] 更新 `handoff.md` 和 `docs/project/current-worktree.md`。
- [x] 输出未完成 P1/P2 backlog，不自动提交、推送或发布。
