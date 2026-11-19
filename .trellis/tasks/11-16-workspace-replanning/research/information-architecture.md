# 信息架构审查

来源：独立 Explore 子代理，只读检查；因该子代理处于只读环境未能自行落盘，主代理按其完整返回记录，未将推断当成已验证实现。

## 核心结论

将「选片 → 调整 → 出片」作为唯一顶层任务模型；「单张 / 胶片长条」降为出片方式，保留现有状态机与渲染分支。

## 具体问题与证据

1. 「接触印象」标题与「单张成片」并列，「连底长条」同时充当页面和输出模式，任务层级混乱。`components/workspace/WorkspaceToolbar.tsx:6-17,116-148`、`components/workspace/ContactSheet.tsx:57-60`。
2. 添加、导出、冲洗在页头、工具栏、检查器和长条审片台重复竞争主操作。`components/app/AppHeader.tsx:70-100`、`components/workspace/WorkspaceToolbar.tsx:93-113`、`components/settings/RecipeInspector.tsx:696-716`、`components/workspace/FilmStripWorkspace.tsx:67-95`、`App.tsx:1503-1543`。
3. 空状态仍展示完整高级参数；「胶片与片边」混合色彩、成像后端和片边几何，「扫描输出」混含画幅与渲染质量。`components/settings/RecipeInspector.tsx:211-356,504-635`、`App.tsx:1618-1622`。
4. 「暗房配方 / 配方 / 我的暗房配方」混指整个设置面板与已保存预设。应统一为「调整 / 我的配方」。
5. 空暗房只有标题、按钮与诗意步骤，没有直接说明本地照片到 135 胶片效果的核心价值。`components/workspace/EmptyDarkroom.tsx:12-16,45-112`。

## 命名建议

顶级采用「选片 / 调整 / 出片」，作为稳定阶段标识，不新增路由状态；有照片后的页面标题可为「照片工作台」。出片区 tabs 用「单张」「胶片长条」，内部保留 `outputMode: 'single' | 'strip'`。

| 设置组 | 直接可见 | 渐进披露 |
| --- | --- | --- |
| 胶片 | 胶片型号、经典色彩 / 光谱模拟（支持时）、颗粒强度 | 光谱计算后端、技术说明 |
| 片边 | 135 胶片片边 / 经典片边、片边文字、起始帧号 | 物理底片渲染、齿孔背光、镜头光圈、拉直、灰雾、漏光、颜色与尺寸 |
| 输出 | 单张 / 胶片长条、JPG / PNG、JPG 质量 | 扫描画幅、背景色、快速预览 / 高清出片 |
| 我的配方 | 选择、命名、保存、删除本地配方 | 无 |

## 工程建议

- 保留 `App.tsx:1523-1616` 的 `ContactSheet / FilmStripWorkspace` 条件渲染，以及 `inspectorProps`、`settingsForFilmStock` 等真实设置联动。
- 将 `RecipeInspector` 的 `section` 联合类型扩展为 `film | edge | output | recipes`，移动端同步四组，不引入第二份设置状态。
- 使用带 `aria-expanded / aria-controls` 的 disclosure；折叠时使用 `hidden`，不能为通过测试仅做视觉隐藏。
- 持久化高级设置值被旧配方或本地偏好恢复时，应自动展开对应高级组，避免用户无法发现已生效的非默认参数。
- 空状态仅保留轻量准备信息或收起设置；页头保留全局「添加照片」，空状态移除工具栏重复主按钮；已出片时保留一个下载主路径。
- 保留 `#workspace-add-photos` 及原有设置可访问名称，视觉标签可另行简化。

## 测试影响

至少 15 个 E2E 文件直接依赖「成像方式 / 底片渲染 / 光谱计算」。渐进披露后需先展开高级设置再操作，重点涉及 `physical135.spec.ts`、`physical-migration.spec.ts`、`spectral-stock-picker.spec.ts`、`frontend-redesign.spec.ts:44-51`。

`frontend-redesign.spec.ts:53-200` 固定旧空胶片 332px 高度、342×228 画幅、动画时长及空间顺序。应改为新「胶片索引」构图断言，不能继续以旧布局约束实现。保留既有 `data-testid`、动画名称、暂停和减弱动态契约，改测新几何。

「暗房配方」「接触印象」「连底长条」「长条审片台」的角色与名称选择器需同步维护。`workflowState.test.ts:84-93` 与 `settingsStorage`、Worker、渲染协议无需因展示层变化而修改。
