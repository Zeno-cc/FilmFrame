# P0 批量选片与资源准入 TDD

## 1. 测试顺序

先建立纯函数失败测试，再接入 App 编排，最后验证可见交互。测试不得依赖真实用户图片、网络服务或不稳定的 Canvas 像素输出。

## 2. 选片契约

### C1：默认与切换

- 上传成功的每项都有 `included: true`、正确 `sourceWidth` 和 `sourceHeight`。
- 单项切换只改变目标图片的 `included`，保留其对象数据、文件、artifact、transform 和顺序。
- 全选、清空、空列表均可预测；全选 / 清空不创建新对象以外的副作用。

### C2：范围与顺序

- 入选子集保持原卷相对顺序。
- 单张默认 / force 批处理都不包含未入选图片。
- ZIP 只收集入选 current artifact，文件序号使用它们原卷相对顺序。
- 长条选择 key 在成员或成员顺序变化时变化；仅单张入选切换不影响单张 artifact current 判定。
- 零入选返回可识别空结果，不调用 renderer、fetch 或 ZIP builder。

### C3：异步安全

- 批处理与导出期间，选片控件禁用。
- 选择变更不 revoke preview / processed URL，不擦除 `processingError`，不改变 generation。
- 原有停止后续、删除、重试和排序测试仍通过。

## 3. 准入契约

### A1：上传元数据

- 尺寸读取成功的图片保存宽高；解码失败仍 revoke URL 并且不返回部分 metadata。
- 逐张大图 warning 与累计批次评估可以同时出现。

### A2：纯估算器

- 空选择 / 无效尺寸给出明确 `blocked` reason，不抛异常。
- 累计源像素在 warning 和 blocked 临界点的两侧有确定结果。
- 单张模式评估 source decode / 预估工作集；长条额外评估 `renderBudget` Canvas；ZIP 使用 current Blob 输入量与现有 256 MiB hard limit。
- 阈值、格式化字段和建议统一由服务产生，组件不自行算字节或猜 reason。

### A3：入口门禁

- `warning` 保持操作可用，并在 UI 中可读。
- `blocked` 或 current artifact 容量信息缺失时，`processImage`、`generateFilmStrip`、ZIP `fetch`、`createZipBlob` 中对应的高成本调用均未被执行。
- 预检成功不改变既有处理、导出或 URL ownership 行为。

## 4. 浏览器验收

使用仓库内图片 fixture 和 Playwright：

1. 桌面：上传多张，取消一张，确认 `入选 2 / 3` 与单图卡片/序列一致。
2. 点击“全部入选 / 清空入选”，确认清空后的提示与恢复按钮；主操作不触发 render。
3. 处理后导出与长条只反映入选条目，顺序不变。
4. 强制构造 blocked 准入结果，确认错误文案可关闭且无处理中的 busy 状态。
5. 移动 390x844：选片控件和摘要可点击、文本不截断造成误解、页面无水平滚动。

## 5. 完成门槛

- 所有新增纯函数具有边界测试与类型检查。
- E2E 增加正向选片和零入选回归；已有裁切、工作区、dialog 测试继续通过。
- `npm run check`、`npm run test:e2e`、`git diff --check` 均成功。
