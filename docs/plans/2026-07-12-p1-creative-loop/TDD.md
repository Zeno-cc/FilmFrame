# P1 创作闭环与单图构图控制 TDD

## 1. P1-A 测试契约

### T1：normalize

- 缺失/非法 transform 返回 `{focusX:0.5, focusY:0.5, quarterTurns:0}`。
- focus 只接受 `0/0.5/1`；quarterTurns 只接受 `0/1/2/3`。
- transform key 与对象属性插入顺序无关。

### T2：焦点旋转映射

- 0 转保持 `(x,y)`。
- 顺时针 90° 为 `(1-y,x)`。
- 180° 为 `(1-x,1-y)`。
- 270° 为 `(y,1-x)`。

### T3：cover placement

- center anchor 与旧 center-cover 等价。
- 横向 overflow 时，左/中/右焦点分别选择允许范围的左/中/右位置。
- 纵向 overflow 时，上/中/下同理。
- 任意 quarterTurns 和九宫格焦点不产生负可见覆盖或空白。
- 自动旋入只依据用户旋转后的尺寸。

### T4：结果身份

- 单图 transform 改变时 image key 改变。
- 任一图片 transform 改变时 strip key 改变。
- 只改变另一张图片的 transform 不使当前单图 stale。

### T5：Worker 边界

- process request 包含 transform。
- strip request 中每个 ImageItem 保留 transform。
- main fallback 接收相同 transform。

## 2. P1-B 测试契约

### T6：即时预览 generation

- 新请求开始后旧结果不可接收。
- 晚到 URL 调用 revoke。
- 关闭编辑器后结果不可写入。
- debounce 内多次变化只启动最后一次。

### T7：配方

- 非法 JSON 返回空列表。
- normalize 丢弃非法字段和超长名称。
- 同名保存覆盖且移到最前。
- 最多保留 12 条。
- 删除只删除匹配 ID/名称。

### T8：分享

- 无 `navigator.share` 时返回 unsupported，不触发下载。
- `canShare({files})` 为 false 时返回 unsupported。
- 成功调用只传文件、标题和短文本，不传原图 URL。
- 用户取消与系统失败返回可展示状态，不自动重试。

## 3. 浏览器验收

- 横图和竖图分别测试九个焦点与旋转。
- 编辑器清楚显示 Before/After 当前状态。
- 快速点击三个焦点后只显示最终选中状态的预览。
- 移动端编辑控件不遮挡照片和关闭/下载按钮。
- 配方保存、应用、删除后设置与 stale 状态一致。

## 4. 完成门槛

- transform 几何不允许只靠截图测试。
- Worker/main 共享同一纯函数或同一明确参数计划，不能复制第二套焦点数学。
- 所有临时 Blob URL 有 owner 和 revoke 测试。
- `npm run check` 与浏览器 console 均通过。

