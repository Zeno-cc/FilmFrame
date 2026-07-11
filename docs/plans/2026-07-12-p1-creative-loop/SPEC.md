# P1 创作闭环与单图构图控制规格

> 状态：Approved for execution
>
> 日期：2026-07-12
>
> 依赖：P0 状态模型和移动端主流程

## 1. 目标

解决“用户生成前无法预判裁切、生成后无法比较效果、重复创作无法复用设置”的问题，建立选中照片的最小可控创作闭环。

## 2. 子任务 P1-A：共享 RenderTransform

### 数据模型

每张 `ImageItem` 增加：

```ts
type FocusAnchor = 0 | 0.5 | 1;
type QuarterTurn = 0 | 1 | 2 | 3;

interface RenderTransform {
  focusX: FocusAnchor;
  focusY: FocusAnchor;
  quarterTurns: QuarterTurn;
}
```

默认值是中心焦点和零用户旋转。`quarterTurns` 表示用户在解码方向基础上的顺时针旋转；自动竖图旋入只在用户旋转后仍为竖图且目标片窗为横向时发生。

### 渲染规格

1. 共享几何函数计算总旋转、旋转后尺寸、cover scale、overflow 和焦点偏移。
2. focus anchor 作用于旋转后的可见坐标；偏移必须限制在 cover overflow 内，不允许露出空白。
3. main/Worker、classic/real135、single/strip、preview/high 使用同一变换语义。
4. 单张输出方向以“用户旋转后的源方向”为准；真实 135 自动旋入可在最终输出时恢复，但不得撤销用户旋转。
5. 单图结果 key 包含 transform；strip key 包含有序 `{id, transform}`。
6. 调整单张 transform 只使该单图和包含它的 strip stale。

## 3. 子任务 P1-B：即时预览、对比、配方与分享

### 行为规格

1. 点击卡片打开编辑预览；明确显示“原图”或“成片”。
2. 编辑预览提供 3x3 焦点、顺时针旋转、Before/After。
3. transform 或影响渲染的全局设置变化后，对选中图进行 250-400ms debounce 的 preview 模式渲染；旧预览 generation 晚到时回收。
4. 临时编辑预览 URL 与批量成片 URL 分离；关闭编辑器时回收临时 URL。
5. “应用并冲洗此张”生成当前设置下的正式结果；批量处理仍使用相同 transform。
6. 支持保存、应用和删除本地配方；配方只包含合法 `FilmSettings` 与名称，不包含图片、Blob、transform 或历史任务。
7. 配方名称去首尾空白、限制 40 字符；最多 12 条，后保存的同名配方覆盖旧值。
8. 当前成片在浏览器支持时使用 Web Share API 分享文件；不支持、不能分享或调用失败时保留下载入口，不自动触发第二次外部动作。

## 4. 非目标

- 不做自由拖拽裁剪、连续缩放、透视或任意角旋转。
- 不保存图片会话，不引入 IndexedDB。
- 不做云配方、账号同步或公开模板市场。
- 不新增胶卷、不改变 Gold 色彩参数。
- 不在本轮解决随机纹理 seed。

## 5. 验收标准

- 3x3 九个焦点在横图、竖图和用户旋转后都不会露出空白。
- 同一 transform 在 Worker/main 和 preview/high 使用相同构图参数。
- transform 变化后旧成片立即标待更新，旧下载不可用。
- 连续快速修改焦点只保留最后一次即时预览，所有旧 URL 被回收。
- 用户可以保存配方、刷新页面后应用、删除；照片始终不持久化。
- 支持 Web Share 的移动浏览器出现分享命令，不支持时界面仍可下载。

