# P0 主流程与移动端可靠性任务

## P0-A：状态、上传与任务控制

- [x] A1 建立纯函数图片状态模型，区分 current、stale、active、queued、failed。
- [x] A2 将状态文本和批次摘要接入卡片及 `aria-live`。
- [x] A3 上传 MIME 收紧到 JPEG/PNG/WebP，解码失败拒绝并 revoke URL。
- [x] A4 将 warning notice 与 blocking error 分离。
- [x] A5 增加停止后续处理，generation 失效后不标失败、不接收晚到结果。
- [x] A6 默认仅处理 stale/failed/unprocessed，保留“重新处理全部”。
- [x] A7 增加独立 ZIP exporting 状态并阻止重复打包。
- [x] A8 批次完成显示成功/失败/停止摘要和下一步动作。

## P0-B：移动端与无障碍

- [x] B1 移动端工作室前置，设置改为可展开区域并移除整屏嵌套滚动。
- [x] B2 空态加入“本地处理，不上传照片”承诺。
- [x] B3 增加移动端 sticky 主操作区。
- [x] B4 卡片操作在触屏/键盘下常驻可用，所有 icon-only 控件命名。
- [x] B5 增加上移/下移排序并覆盖 single/strip 列表。
- [x] B6 上传区改为语义化可键盘激活控件。
- [x] B7 三类覆盖层补 dialog、Escape、焦点进入与恢复。
- [x] B8 增加 reduced-motion 和 44px 触控目标检查。

## P0 验收

- [x] `npm test`。
- [x] `npm run typecheck`。
- [x] `npm run build`。
- [x] 390x844 首屏、设置可见性、dialog、触控尺寸验收。
- [ ] 桌面上传、排序、处理、停止、重试、ZIP 验收。
- [x] 检查 console、对象 URL 回收和无重复导出。
- [x] 更新项目交接与产品流程文档。
