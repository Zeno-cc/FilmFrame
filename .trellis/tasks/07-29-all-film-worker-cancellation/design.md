# Technical Design: All-Film Worker And Real Cancellation

## Routing

`filmWorkerClient` 的能力判断从 Gold 200 特例改为：输出风格为真实 135、胶片类型已注册模板，并且浏览器具备 Worker/OffscreenCanvas 能力。经典边框继续沿用现有策略。

Worker 内保留 Gold 200 分层专用渲染；其他真实 135 使用通用扁平模板路径。单帧与长条都必须使用与 `filmEngine.ts` 相同的窗口常量、cover/contain 计算、背景开关、齿孔 mask、帧号和无缝拼接规则。

## Resource Loading

把真实 135 overlay URL 与齿孔 mask URL 随请求传入 Worker，避免 Worker 复制注册表。Worker 维护按 URL 或 `FilmType` 键控的 `Map<string, Promise<ImageBitmap>>`：

- overlay 缓存独立于齿孔 mask 缓存；
- 加载失败从缓存删除，允许下次重试；
- Worker 终止时浏览器释放实例级缓存；
- 不改变 public 素材或主线程加载器。

通用合成优先复用现有可同时接受 Canvas 与 OffscreenCanvas 的几何/绘制 helper。只有 Worker 消息、位图加载和 Blob 产出留在 Worker 文件，避免形成第三套视觉常量。

## Cancellation Lifecycle

客户端新增显式 `cancelFilmRendering()`：

1. 将当前 Worker 实例置空并调用 `terminate()`；
2. 以专用 `FilmRenderCancelledError` 拒绝所有 pending 请求；
3. 清空 pending map，但不永久禁用 Worker；
4. 下一次请求按既有初始化逻辑创建新实例。

`App.stopProcessing()` 先递增 generation，再调用取消函数并恢复批次状态。批处理捕获专用取消错误并静默退出；其他错误仍沿用当前提示与主线程回退策略。generation guard 继续负责拒绝终止竞争窗口内的迟到结果。

## Fallback And Failure

能力不足时直接走主线程。Worker 初始化或单次执行失败时沿用现有回退，但用户主动取消不得触发回退，否则停止会继续占用主线程。素材加载失败视为 Worker 执行失败，可回退主线程以保障可用性。

## Compatibility And Rollback

请求协议只增加通用模板所需的 URL 字段，无持久化迁移。回滚可恢复 Gold-only 路由并移除取消 API，主线程实现保持完整，形成天然回退路径。

## Testing

- Worker 客户端：16 款路由、能力不足、pending 取消、实例重建、取消不回退。
- Worker 渲染：代表性的彩负、反转片、黑白片单帧与长条，验证尺寸、窗口和 mask。
- 浏览器：停止批处理后无错误、无迟到结果，可再次启动；既有 16 款真实 135 视觉流程全量通过。
