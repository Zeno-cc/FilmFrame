# P0 主流程与移动端可靠性执行计划

## Stage 1：先建状态契约

1. 新增图片状态、批次选择、排序和主操作纯函数。
2. 为上传拒绝/revoke、状态推导、移动排序和取消选择补红测。
3. 保持 App 现有 generation 和 URL ownership，避免先改 JSX。

## Stage 2：接入任务控制

1. 接入 active/queued、停止后续和完成摘要。
2. 默认处理待更新项，提供 force rerender。
3. ZIP 使用独立 exporting gate。
4. warning 使用非阻塞 notice，error 保持可行动 dialog。

## Stage 3：重排移动端信息架构

1. 工作室在移动端排到设置之前。
2. 设置使用展开按钮；社区与赞助入口下沉。
3. 增加 sticky action bar 和常驻卡片操作。
4. 增加上移/下移排序。

## Stage 4：无障碍与验收

1. 上传语义、icon 名称、aria-live、dialog 和焦点恢复。
2. reduced-motion 与触控目标检查。
3. 运行全量门禁和桌面/移动浏览器旅程。

## 风险控制

- 不在处理中的同一 state update 里 revoke 仍被 UI 使用的 URL。
- 取消不等于 Worker 立即中断；文案使用“停止后续”，不承诺即时终止当前 Canvas。
- 移动端 DOM 顺序和 CSS order 都要验证 tab 顺序，不能只看视觉位置。
- 设置折叠不得使桌面端丢失现有密度和快捷操作。

