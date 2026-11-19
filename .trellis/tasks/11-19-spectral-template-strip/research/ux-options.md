# Research: 光谱负片 + 模板片边 + 胶片长条 的用户侧交互方案

- Query: 光谱负片使用模板片边时请求胶片长条被弹窗阻止；在可用范围内评估交互更新（A 直接支持长条 / B 自动切物理片边 / C 弹窗两个动作 / D 禁用并静态说明）
- Scope: internal（代码 + 现有界面）+ 产品/设计规范（DESIGN.md、PRODUCT.md、docs/plans SPEC.md）
- Date: 2026-11-19

---

## 1. 错误弹窗、消息与触发链路

### 关键文件

| File Path | Description |
|---|---|
| `App.tsx:542`–`777` | `processAll()`：出片主流程，`batchMode = outputMode`，含长条分支与 catch |
| `App.tsx:752`–`767` | catch：把异常映射为用户可见文案；`e.message.includes('single frames only')` → 光谱限制文案 |
| `App.tsx:1726`–`1730` | `<ErrorDialog open={Boolean(errorMsg)} message={errorMsg} onClose={() => setErrorMsg(null)} />`（无 `onRetry`、无 `onSupport`） |
| `components/feedback/ErrorDialog.tsx` | 标题默认「需要处理」；无 `onRetry` 时唯一按钮为「我知道了」；有 `onRetry` 时显示 `retryLabel`，有 `onSupport` 时显示「获取帮助」 |
| `components/ui/ModalSurface.tsx` | 通用弹窗原语：focus trap、Escape 关闭、锁背景滚动、关闭后焦点还原 |
| `services/spectral/scope.ts:3`–`7` | `assertSpectralStripSupported`：`imagingMode==='spectral' && edgeRenderMode!=='physical135'` 时抛错，文案 `'Spectral film processing currently supports real-135 single frames only; strip rendering is not yet available.'` |
| `services/filmWorkerClient.ts:301`–`306` | `generateFilmStrip` 首行同步调用 `assertSpectralStripSupported(settings)`，**早于** Worker/主线程分配 |
| `services/filmEngine.ts:1319` | 主线程引擎同样断言（兜底） |
| `services/filmWorker.ts:967` | Worker 收到 `generateFilmStrip` 同样断言（兜底） |
| `components/workspace/WorkspaceToolbar.tsx:104`–`136` | 出片方式 tab（单张 / 胶片长条），`role="tablist"`，无可用性校验 |
| `components/settings/RecipeInspector.tsx:249`–`283` | 成像方式（经典色彩 / 光谱模拟（实验）） |
| `components/settings/RecipeInspector.tsx:336`–`361` | 片边方式（模板片边 / 物理片边） |

### 用户状态变化（从选长条到看到弹窗）

1. 用户在 `WorkspaceToolbar` 点「胶片长条」tab → `App.tsx:1546` `onOutputModeChange('strip')` → `setOutputMode('strip')`。**此刻没有任何校验**，界面正常。
2. 点「生成胶片长条」（`FilmStripWorkspace.tsx:87`–`95`，label 由 `App.tsx:1360` 给出）→ `processAll()`。
3. `processAll()`：`images.length>0`、`includedEntries.length>0`；`batchMode==='strip'` 时跳过单张 admission；执行 `evaluateBatchAdmission({operation:'strip', ...})`（`getStripCanvasSize`）。通过后：`setProcessing(true)`、`setActiveBatchMode('strip')`、`setProcessingMessage('正在拼合胶片长条...')`。
4. 进入 `generateFilmStrip()` → 同步抛错（断言在 Worker/主线程分配之前）。
5. catch（`App.tsx:752`）：非 `WorkerTimeoutError` → `setErrorMsg('光谱负片使用模板片边时仅支持单张；胶片长条请改用物理片边或经典色彩。')`。**不触碰 `stripResult`**（只有 `WorkerTimeoutError && batchMode==='strip'` 才 revoke 并清空，见 `App.tsx:760`–`766`）。
6. finally：`setProcessing(false)`、`setActiveBatchMode(null)`、`setProcessingMessage('')`。
7. `<ErrorDialog>` 打开（标题「需要处理」，正文即上面文案，唯一按钮「我知道了」）。同时 `PreviewDialog` 因 `!errorMsg` 被抑制（`App.tsx:1664`）。

### 照片与已有成片是否保留

- **照片**：完全不受影响（`imagesRef`/预置 URL 不动）。
- **已有单张成片**：不受影响（strip 分支不写 `processedUrl`）。
- **已有长条**：**保留**。该错误路径不清空 `stripResult`；`stripStage`（`App.tsx:1480`–`1486`）仍显示原长条（`current` 或 `stale`）。
- **无部分产出**：长条是一次性产物，失败即整体失败，不存在「已生成部分长条」。

### 「是否可在选择阶段提前识别」

**可以。** `imagingMode`、`edgeRenderMode`、`outputMode` 三者都是 `App.tsx` 的 state（`settings` + `outputMode`），在任何时刻都可判定 `spectral + legacy-template + strip` 为不可用组合。目前唯一的相关防线只有两处自动纠正，且都不覆盖长条：

- `RecipeInspector.tsx:261` 成像方式 option 在 `physical135 && !supportsPhysicalSpectralStock` 时 `disabled`。
- `RecipeInspector.tsx:346`–`348` 选物理片边且胶片不支持物理光谱时，自动把 `imagingMode` 置为 `legacy`。
- `services/settingsStorage.ts:180`–`181`（`mergeSettings` 的 `compatibleEdge`）与 `settingsForFilmStock`/`normalizeSpectralRenderMode` 是数据层自动纠正的先例。

即：完全存在「自动纠正 + 通知」的既有一致做法（`App.tsx:222`–`224`、`1114` 的「经典片边已停用，已切换为模板片边。」）。

---

## 2. 当前设置面板可选状态

| 控件 | 位置 | 状态 |
|---|---|---|
| 成像方式（经典色彩 / 光谱模拟（实验）） | `RecipeInspector.tsx:249`–`283` | 仅当 `isReal135 && hasSpectralStock` 出现；光谱 option 在 `physical135 && !supportsPhysicalSpectralStock` 时 disabled |
| 片边方式（模板片边 / 物理片边） | `RecipeInspector.tsx:336`–`361` | 仅当 `isReal135`；切到 physical135 且胶片不支持物理光谱时自动降级成像方式为 legacy |
| 出片方式（单张 / 胶片长条） | `WorkspaceToolbar.tsx:104`–`136` | 无任何可用性校验，`strip` 永远可选、生成按钮永远可点（`disabled` 仅由 processing/exporting/includedCount 决定） |

用户能够自由组合出 `光谱 + 模板片边 + 长条`，直到点渲染才失败。

---

## 3. 四种交互评分与推荐

评分 1–5，5 为最优。「操作步数」5 = 步数最少；「误操作风险」5 = 风险最低。

| 方案 | 准确性 | 可恢复性 | 操作步数 | 与现有设备/配方状态一致性 | 误操作风险 | 合计 |
|---|---|---|---|---|---|---|
| A 直接支持长条（假定技术可行） | 5 | 5 | 5 | 5 | 5 | **25** |
| B 选「胶片长条」时自动切物理片边并说明 | 2 | 4 | 5 | 2 | 2 | **15** |
| C 弹窗两个明确动作 | 4 | 5 | 4 | 5 | 4 | **22** |
| D 禁用不可用组合 + 静态说明 | 3 | 4 | 5 | 5 | 5 | **22** |

### 评分依据

- **A（25）**：若技术研究确认可行，A 在全部维度最优，应直接实现，其余方案作废。**但不得假设可行**：光谱长条依赖（GPU/CPU 光谱渲染 + 长条拼接）当前没有实现路径证据，`services/spectral/scope.ts` 即显式的「尚未提供」。因此 A 的分数是条件分（不可行时归 0）。
- **B（15）**：静默改变用户已选的片边处理——单张出「模板片边」、长条出「物理片边」，同一卷两套片边，视觉不一致（一致性 2）。更严重的是：对不支持物理光谱的胶片（Cinestill 800T、Provia 100F、Velvia 100、Ektachrome 100、Kodachrome 64、Acros II、HP5、Tri-X 400、TMax 100，见 `services/physical135/capability.ts`），切物理片边会**连成像方式一起降级为经典色彩**（`RecipeInspector.tsx:346`），等于静默丢弃光谱——用户不会预期（准确性 2、误操作风险 2）。
- **C（22）**：不静默改动配方，把取舍交给用户（准确性 4、一致性 5）。弹窗本来就会出现，只是补两个动作，步数只多一次明确点击（4）。动作需要按胶片能力分派（见 §4），略有实现成本。**符合 `docs/plans/2025-02-14-frontend-redesign/SPEC.md:1069` 的「若上下文有重试/移除，应在卡片上提供实际动作」**。
- **D（22）**：永不进入无效状态、风险最低、步数最少。但它把「胶片长条」tab 变成死路，用户失去「改用物理片边即可出长条」的发现路径（准确性 3）。且 `DESIGN.md:369` 规定输出 tab 是键盘可操作、带计数文本的选择；禁用其一还要补一段静态解释，属于 `DESIGN.md:403` 明令禁止的「为填空区发明教学文案」；还会把可能只是暂时性的技术限制**硬编码进 UI**。

### 推荐

**推荐 C（弹窗提供两个明确动作），主动作按胶片能力分派。** 理由：

1. 唯一既尊重用户意图、又不静默篡改配方的方案（B 的硬伤）。
2. 复用现有 `ModalSurface` / 弹窗层，不新增卡片、不新增教学文案，符合 Operate 与「低装饰」。
3. 不把可能只是暂时的限制写死进 UI（D 的硬伤），若 A 后续可行只需移除弹窗分支。
4. 保留恢复动作：主动作直接落到「可出长条」的合法配方上并继续，符合 Operate「失败后可继续」。

**D 的合理部分作为补充，但不作为主方案**：无需新增禁用态；弹窗本身就是「选择阶段前置识别」的落地——因为它在用户**已提交渲染**时才提示，不打断浏览（Operate 不在用户决定前弹窗）。

**B、D 均不推荐单独使用。**

---

## 4. 推荐方案的设计系统落点与精确文案

- 复用 `ModalSurface`（`size="sm"`、focus trap、Escape 关闭、焦点还原）。可直接改造 `ErrorDialog`：它已有 `onRetry`/`retryLabel`（主动作）与 `onSupport`（次级动作）两个槽位；把「光谱长条」场景接上这两个槽位即可，无需新组件。或按 `IncompleteExportDialog.tsx` 的现成结构新建一个小弹窗（同原语、同尺寸、同焦点行为）。
- 触控：两个按钮沿用现有 `min-h-11`（44px）类。
- 键盘：Escape 关闭=不做改动、焦点回到「生成胶片长条」；Tab 在两动作间循环。
- 减弱动态：`ModalSurface` 只在 `requestAnimationFrame` 内做一次聚焦，无位移动画；保持现状即可（`DESIGN.md:394`「reduced-motion results」）。
- 不加装饰、不加卡片、不加额外说明段。

### 文案（≤1 行，沿用现有文案）

正文（保留现有句式，按胶片能力二选一）：

- 胶片支持物理光谱（如 KODAK GOLD 200）：
  `光谱负片用模板片边时只能出单张。改用物理片边即可生成胶片长条。`
- 胶片不支持物理光谱（Cinestill/Provia/Velvia/Ektachrome/Kodachrome/Acros/HP5/Tri-X/TMax）：
  `光谱负片用模板片边时只能出单张。改用经典色彩即可生成胶片长条。`

### 按钮文案

| 场景 | 主按钮 | 次按钮 |
|---|---|---|
| 支持物理光谱 | `改用物理片边并继续` | `保持单张` |
| 不支持物理光谱 | `改用经典色彩并继续` | `保持单张` |

有动作时不再出现「我知道了」（与 `ErrorDialog` 现有逻辑一致）。标题沿用「需要处理」。

---

## 5. 边界行为

| 边界 | 正确行为 |
|---|---|
| 已有单张成片 | 弹窗动作不得触碰 `processedUrl`；现有「已出片」数量不变 |
| 已有长条（`stripResult` 存在，current 或 stale） | 触发同样的错误时**保留**该长条（现状已如此）。若用户点「改用物理片边并继续」，`settingsKey` 变化使原长条进入 `stale`，`FilmStripWorkspace` 显示「需重新生成」并保留旧图（`App.tsx:1484`–`1485`）——这是正确表现 |
| 处理中 | 输出 tab 与生成按钮已 `disabled`（`controlsDisabled = processing || exporting`，`App.tsx:1543`）；无法中途切入非法组合，不弹窗 |
| 导出中 | 同上，`controlsDisabled` 生效 |
| 部分成片已生成 | 长条路径无部分产物；单张路径的逐张失败走 `NoticeToast`/`errorMsg`（`App.tsx:740`–`747`），不应与本弹窗混用 |
| Worker 超时 | 走另一分支（`App.tsx:756`），且**会**清空长条。两者行为不同，代码与文案都不得合并 |
| 选择合法组合（光谱+物理片边，或经典色彩+模板片边） | 不弹窗，正常生成 |

---

## 6. 必须的 Playwright 断言点

现有测试需按新弹窗更新，不能只保留「文案可见 + 无长条图」：

- `tests/e2e/spectral-production.spec.ts:132`–`140`（`spectral strips report their explicit single-frame boundary`）
- `tests/e2e/physical135.spec.ts:438`–`446`（`legacy spectral strips remain explicitly unavailable`）

必测断言：

1. 光谱+模板片边+长条 → 点生成后弹窗可见（`getByRole('dialog', { name: '需要处理' })`），且**无**长条图（`已生成的胶片长条` count 0）。
2. 弹窗含两个按钮，文案精确：`改用物理片边并继续` / `保持单张`（不支持物理光谱的胶片为 `改用经典色彩并继续` / `保持单张`）。
3. 点 `改用物理片边并继续` → 弹窗关闭；`片边方式` 值为 `physical135`（不支持物理光谱时 `成像方式` 值为 `legacy`）；触发长条生成并最终出现 `已生成的胶片长条`。
4. 点 `保持单张` → 弹窗关闭；`出片方式` tab 选中 `单张`；不产生长条（`已生成的胶片长条` count 0）。
5. 既有单张成片在弹窗出现与两个动作后均保留（`已出片` count 不变）。
6. 已有长条时触发该错误 → 原长条仍可见（不清空）。
7. 合法组合（光谱+物理片边；经典色彩+模板片边）点生成 → 不出现该弹窗。
8. 键盘：弹窗焦点被捕获；Escape 关闭且**不**改设置；关闭后焦点回到「生成胶片长条」按钮。
9. 两个按钮至少 44px（`min-h-11`）。

### 不应添加的交互

- 不新增常驻说明文案/教学提示（inspector、toolbar、stage 内均不加）。`DESIGN.md:403` 明令禁止填空式教学文案。
- 不加新卡片/嵌套卡片承载该提示。
- 不用自动消失的 `NoticeToast` 承载这个决定（超时会丢失待决动作；与 SPEC 18.1 定位不符）。
- 不做 B 的静默自动切换（尤其不得静默把光谱降级为经典色彩）。
- 不把「胶片长条」tab 做成纯禁用 + 静态解释（D 的单独形态）。
- 不在用户选 tab 或改配方时立即弹窗打断（Operate 不打断浏览；仅在提交渲染后提示）。
- 不引入第三种选择样式或新强调色（`DESIGN.md:368`）。

---

## Related Code / Specs

- `DESIGN.md:260`（Operate 定位）、`269`/`354`（44px）、`369`（输出 tab）、`386`（弹窗原语）、`394`（focus/reduced motion）、`403`（禁止教学文案）
- `PRODUCT.md:15`/`19`/`55`（单张与长条是出片方式，不是竞争模块）
- `docs/plans/2025-02-14-frontend-redesign/SPEC.md:1050`–`1085`（Notice/ErrorDialog 规范，含「提供实际动作」与「我知道了」主按钮）
- `services/spectral/scope.ts`、`services/filmWorkerClient.ts:301`、`services/filmEngine.ts:1319`、`services/filmWorker.ts:967`（同一断言三层兜底）

## Caveats / Not Found

- **长条技术可行性未知**：本次为 UX 侧研究，未验证光谱 + 模板片边的长条渲染能否实现。方案 A 是否可用需与技术研究对齐；在技术结论出来前，C 是唯一不预设可行性的推荐。
- **未确认是否存在内联（非弹窗）替代**：当前长条空态（`FilmStripWorkspace.tsx:128`–`134`）只有一行提示文案，无动作按钮；若要改为内联选择将是更大的改动，超出了「可用范围内更新」的最小范围，故未纳入主推荐。
- 未运行应用做视觉验证；结论基于源码、既有 e2e 用例与设计规范。
