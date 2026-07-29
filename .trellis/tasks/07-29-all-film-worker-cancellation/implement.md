# Implementation Plan: All-Film Worker And Real Cancellation

## Ordered Work

1. 为 Worker 请求补齐通用真实 135 overlay/mask 资源描述，并把路由扩展到全部注册模板。
2. 抽取或复用主线程扁平模板合成所需的共享绘制 helper，保持现有视觉常量唯一。
3. 在 Worker 实现按胶片缓存的通用单帧真实 135 合成，保留 Gold 200 专用路径。
4. 在 Worker 实现非 Gold 连续长条合成，与主线程 `frameGap=0` 和帧号规则一致。
5. 增加取消错误、pending 请求清理、Worker 终止和自动重建；接入 `stopProcessing()`。
6. 扩展单元测试到 16 款路由、资源缓存、取消/重建、回退和代表性输出。
7. 运行全量真实 135 端到端与质量门，检查视觉和主线程响应。

## Validation Commands

- `npm run test -- tests/filmWorkerClient.test.ts tests/filmOverlayTemplates.test.ts`
- `npm run typecheck`
- `npm run test:e2e -- --grep "真实 135|停止"`
- `npm run check`
- `npm run test:e2e`
- `git diff --check`

## Review Gates

- 用户主动取消必须与渲染失败区分，禁止取消后回退主线程。
- 通用 Worker 路径不得复制或改变已验收的窗口、齿孔和帧号几何。
- 每一种注册模板都必须有路由断言；抽样视觉验证不能替代全注册表覆盖。
- 终止后 pending map 必须清空，下一次调用必须创建可用的新 Worker。

## Rollback Points

- 保留完整主线程渲染器作为能力回退和快速回滚路径。
- Gold 200 专用 Worker 路径独立保留；通用路径异常时可临时恢复 Gold-only 策略。
