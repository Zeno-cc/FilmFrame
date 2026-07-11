# P0 主流程与移动端可靠性 TDD

## 1. 测试顺序

每个行为先写失败测试，再做最小实现，最后重构。优先抽纯函数，React 视图只保留编排。

## 2. P0-A 测试契约

### U1：上传支持矩阵

- JPEG、PNG、WebP 被接受。
- SVG、GIF、HEIC、空 MIME 和非图片被拒绝。
- 尺寸解码失败时不返回 ImageItem，并调用一次 revoke。
- EXIF 失败仍接受已成功解码的文件。
- 大图产生 warning 但仍接受。

### U2：图片状态

- 没有结果 -> `unprocessed`。
- 有 current artifact -> `complete`。
- 有结果但 key 不匹配 -> `stale`。
- active ID -> `processing`。
- 当前批次中的后续 ID -> `queued`。
- `processingError` 优先显示 `failed`，但旧 current artifact 可继续下载时文案必须说明保留旧图。

### U3：批次选择与取消

- 默认只选择 unprocessed/stale/failed。
- force 模式选择全部。
- generation 变化后，循环不启动下一项。
- 取消导致的晚到 URL 被 revoke，不写入列表，不写失败状态。
- 已完成项不受取消影响。

### U4：导出互斥

- exporting 时第二次调用直接返回。
- 成功和失败都会清除 exporting。
- 失败保留可重试状态。

## 3. P0-B 测试契约

纯函数覆盖：

- 上移首项无变化，下移末项无变化。
- 中间项上移/下移保持 ID 和对象身份，不丢结果字段。
- 主操作根据 `empty / idle / processing / ready / exporting` 返回唯一命令和文案。

浏览器覆盖：

- 390x844 首屏包含上传按钮，设置内容默认不抢占整屏。
- 卡片查看、移动、删除、处理与下载在无 hover 情况可见。
- Escape 关闭所有 dialog；关闭按钮有名称。
- 状态区域存在 `aria-live=polite`。

## 4. 完成门槛

- 所有新增纯函数有单元测试。
- 取消和解码失败必须有回归测试。
- 不接受只靠截图验证状态正确性。
- 浏览器验收不得修改或上传用户真实文件，使用仓库内测试素材或生成的小型 Blob。

