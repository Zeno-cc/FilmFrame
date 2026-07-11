# P1 创作闭环与单图构图控制执行计划

## Stage 1：冻结共享变换

1. 添加 `RenderTransform`、normalize、key 和 cover placement 纯函数。
2. 先跑 transform 红测，确认中心默认与现状等价。
3. 把 transform 加入 ImageItem 和结果身份，不先改 UI。

## Stage 2：接入渲染矩阵

1. 主线程 single/strip 接入共享 placement。
2. Worker payload 和 single/strip 接入同一 placement。
3. 验证 classic/real135、portrait/landscape、preview/high。
4. 保持现有画布预算、fallback 和 Blob URL 所有权。

## Stage 3：编辑预览

1. 预览 modal 增加来源标识和 Before/After。
2. 增加焦点、旋转和“应用并冲洗此张”。
3. 接入 debounced preview generation，独立管理临时 URL。
4. 快速交互和关闭时验证 generation/revoke。

## Stage 4：重复创作与分享

1. 新增本地配方纯服务和紧凑控件。
2. 新增 Web Share 能力服务；下载保持独立明确动作。
3. 更新文档和产品术语，不夸大非 Gold 预设为真实色彩模拟。

## Stage 5：验收

1. 全量单元测试、类型检查、构建。
2. 桌面与 390x844 编辑旅程。
3. console、URL 生命周期、快速连续操作检查。
4. 深度 diff 审查；渲染路径遗漏和 key 漂移属于硬阻塞。

## 风险控制

- P1-A 会触及共享渲染契约，必须先于 P1-B UI 合并。
- 自动旋入与用户旋转必须分开建模，禁止用一个布尔值混淆。
- 即时预览使用 preview processingMode，不覆盖正式高清 artifact。
- 配方只保存设置，绝不保存 File、Blob、Object URL 或图片元数据。

