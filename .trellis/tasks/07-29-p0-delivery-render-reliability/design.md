# Technical Design: P0 Delivery And Rendering Reliability

## Delivery Boundary

本父任务由两个顺序执行的子任务组成。第一个修复用户命令与结果完整性的语义，第二个优化执行位置与取消生命周期。二者共享现有批处理状态，但不共享新增组件或抽象。

```text
ZIP command -> export decision -> complete: download
                               -> incomplete: process remaining -> revalidate -> download

process request -> Worker-capable real 135 -> worker instance -> result
                                              stop -> terminate/reject
                -> unsupported/failure -> main-thread fallback
```

## Integration Contract

- 导出补齐流程只依赖批处理返回的成功/停止结果，不直接控制 Worker。
- Worker 取消通过现有停止命令进入，不感知 ZIP 对话框或导出意图。
- 停止后导出补齐意图必须清除，已完成成片继续作为下次决策输入。
- 主线程回退保证任一 Worker 改造都不会使支持的胶片失去渲染能力。

## Rollout And Rollback

先合入导出子任务并通过回归，再实施 Worker 子任务。若 Worker 输出或兼容性异常，只回滚 Worker 路由，导出闭环仍可独立工作。无服务端、数据库或持久化迁移。
