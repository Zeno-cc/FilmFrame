# P0 批量选片与资源准入实施计划

## 交付边界

本计划将 P0 拆成三条可并行的代码路径，最终由 `App.tsx` 编排。共享边界是 `ImageItem` 的新增会话字段和纯函数准入结果；不把选片逻辑塞入渲染引擎或 Worker。

## Stage 1：规格与纯数据契约

1. 将上传尺寸从 `prepareUploadedImages` 返回值写入 `ImageItem`；新图片默认为 `included: true`。
2. 新建 `services/batchCuration.ts`，提供：
   - 过滤入选图片；
   - 切换单图、全选、清空；
   - 入选总数 / 零入选状态；
   - 创建包含成员 ID 和原卷顺序的长条选择签名。
3. 新建 `services/batchAdmission.ts`，集中维护保守的源像素、工作内存、Canvas 和 ZIP 预算，返回结构化 `AdmissionResult`。
4. 为两组纯函数先写 Vitest：默认入选、相对顺序、空选择、独立 artifact 语义、warning / blocked 临界值和各种无效尺寸。

## Stage 2：处理与导出收敛

1. 在 `App.tsx` 派生 `includedImages`，保留 `images` 作为全卷排序与预览真源。
2. 单张 `processAll` 与 force 重冲洗只从入选集合挑选；用原卷 index 计算每张现有 frame number，保持旧 render key 兼容。
3. `generateFilmStrip` 和 `createOrderedStripKey` 只接收入选子集；为该集合增加选择签名，防止切换入选后复用旧长条。
4. ZIP 仅枚举入选且 current 的 artifact；渲染结果记录 Blob 字节数，并在 fetch 前做 ZIP 准入。
5. 每个昂贵入口调用对应预检。阻断时保留现有数据、展示可操作错误，不设置 `processing` / `exporting`。

## Stage 3：选片 UI

1. 在 `PhotoCard` 添加紧凑的入选 toggle，包含状态、文件名和 tooltip；不可在批处理/导出中改变范围。
2. 在 `FilmSequenceRail` 同步同一状态，避免单张与长条模式的选择模型漂移。
3. 在工作区 toolbar / summary 增加入选计数与全选、清空入口；零入选直接呈现“全部入选”恢复操作。
4. 所有新控件使用现有 `Button` / `IconButton` / 图标系统，维持不超过现有 6px 圆角、44px 移动触摸目标和无横向溢出。

## Stage 4：质量门禁

1. 单元测试运行时不依赖 Canvas / 浏览器，实现边界精确可测。
2. 扩展 Playwright fixture 流程：上传多图、取消其中一张、处理、切换长条、检查选择数量和零选择恢复。
3. 为容量预检加入可控测试数据，验证 warning 可继续、blocked 不启动昂贵任务。
4. 运行 `npm run check`、`npm run test:e2e`、`git diff --check`，检查 console 及 1440x1000 / 390x844 布局。

## 并行分工

| Agent | 范围 | 允许修改 |
| --- | --- | --- |
| Selection UI | 入选状态接入、卡片/序列/工具栏、App 的集合收敛 | `App.tsx`、workspace 组件、样式、选片测试 |
| Admission | 上传元数据、纯准入服务与单元测试 | `types.ts`、`services/uploadFiles.ts`、新服务、对应测试 |
| QA | 测试设计、E2E 覆盖、回归审查 | `tests/**`，不改生产行为 |

主代理负责冲突处理、入口连接、全量验证和范围审查。

## 风险控制

- `included` 变化绝不重新创建 / revoke 现有 Blob URL。
- 单图 frame number 继续以全卷 index 计算，否则取消第一张会意外改变后续成片。
- 长条结果必须将入选成员纳入有效性 key，否则会导出已经被排除的照片。
- 预算仅在调用前阻断；不能假装能精确预估浏览器实际内存，也不能静默降采样。
- 批量操作的 disabled 状态须与 `processing` 和 `exporting` 一致，避免运行中的输入集合发生变化。
