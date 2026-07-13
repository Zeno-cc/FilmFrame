# P0 批量选片与资源准入任务

## 规格与契约

- [x] D1 固化 P0 目标、非目标、不变量和验收标准。
- [x] D2 定义 `included`、自然尺寸、入选子集和长条有效性关系。
- [x] D3 定义批次源像素、Canvas、ZIP 准入模型与 warning / blocked 行为。

## 选片与范围

- [x] S1 上传层返回自然尺寸；新图片默认 `included: true`。
- [x] S2 新增纯选片服务及单元测试。
- [x] S3 接触印象卡片加入单张入选 toggle。
- [x] S4 长条叙事顺序加入同一入选 toggle。
- [x] S5 工具栏显示 `入选 X / Y`，提供全选、清空与零选择恢复。
- [x] S6 单张处理、强制重冲洗、长条和 ZIP 收敛到入选子集。
- [x] S7 选片变化只使长条 stale，单张 artifact 保持 current 判定。

## 准入与反馈

- [x] A1 新增纯 `batchAdmission` 服务和边界单元测试。
- [x] A2 上传后显示批次健康摘要，不阻断正常工作。
- [x] A3 在单张处理前执行源像素 / 工作集准入。
- [x] A4 在长条生成前执行入选集与 Canvas 准入。
- [x] A5 在 ZIP fetch 前执行 current artifact 输入量准入。
- [x] A6 warning / blocked 提供不破坏数据的下一步。

## QA

- [x] Q1 扩展选片、零入选、相对顺序与长条 stale 的单元测试。
- [x] Q2 扩展桌面 / 移动 Playwright 工作流。
- [x] Q3 执行 `npm run check`、`npm run test:e2e`、`git diff --check`。
- [x] Q4 检查 console、对象 URL、横向溢出和既有裁切流程。
