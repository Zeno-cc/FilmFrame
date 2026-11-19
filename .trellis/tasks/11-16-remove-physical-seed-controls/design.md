# Design: 移除物理底片随机种子控件

## 1. 已核对的事实

| 事实 | 位置 |
| --- | --- |
| 两个按钮只调用 `nextPhysicalSeed()` 写设置 | `components/settings/RecipeInspector.tsx:322-327` |
| `item.physicalFrameSeed` 唯一写入点是「换一格」处理器 | `App.tsx:1449-1458` |
| 长条逐格种子优先取 `item.physicalFrameSeed`，否则回退 `settings.physicalFrameSeed ?? 1` | `services/physical135/strip.ts:81` |
| 单张逐图设置在 `settingsForImage` 中合并 `item.physicalFrameSeed` | `services/renderAdmission.ts:43-48` |
| 两个种子都进入渲染键 | `services/renderResult.ts:41-42,58,69-70` |
| `body` 整卷复制，`frame` 逐格重建 | `services/physical135/strip.ts:88-96` |
| 默认两个种子都是 `1`，`physicalStraighten` 默认 `0` | `App.tsx:126-130` |

## 2. 关键实测：种子的真实作用域

用真实函数（`createPhysicalStripPlan` → `physicalStripFramePlan` → `createPhysicalRaster`）在同一格位只改 `physicalFrameSeed`，比较 831,250 个 `presence` 采样点：

| `physicalStraighten` | 1 vs 2 | 1 vs 999 |
| --- | --- | --- |
| `0` | 0 点不同 | 0 点不同 |
| `1.5` | 26,220 点不同 | — |

根因：
- `plan.ts:29` / `:44-46`：`straightenDegrees === 0` 时 `filmToCanvas` / `canvasToFilm` 直接返回恒等映射，`weave` 与 `scanOffset` 不参与计算。
- `canvas.ts:108`、`spectralAdapter.ts:31`：`plan.continuous` 时 `materialSeed = plan.bodySeed`，长条材质纹理与 `frameSeed` 无关。

因此：
- 默认场景下 `frameSeed` 对长条像素**零影响**。
- 长条的视觉差异来自 `bodySeed`（整卷）与每格照片本身，不是 `frameSeed`。
- 给 `frameSeed` 做位置推导在默认场景下等于无操作；在非 0° 场景会破坏接缝连续性契约（`tests/physical135Raster.test.ts:248-291` 要求相邻格对同一胶片坐标采样一致）。

## 3. 设计决策

**只删 UI，不动任何渲染路径。**

- `physicalStripFramePlan` 保持原样。删除控件后 `item.physicalFrameSeed` 恒为 `undefined`，回退到 `settings.physicalFrameSeed ?? 1`，与「从未点过按钮的用户」今日行为完全一致。
- `settingsForImage` 保持原样。
- `renderResult.ts` 三处键函数保持原样。
- `seed.ts` 保持原样。

这是范围最小的正确解：用户要求的是「界面上不要出现这个看不懂的东西」，而不是「改变长条像素」。

## 4. 已保存值的处理

| 字段 | 保留 | 效果 |
| --- | --- | --- |
| `physicalBodySeed` | 是 | 已存值（含非 1）继续决定整卷纹理；不再可编辑 |
| `physicalFrameSeed` | 是 | 已存值继续参与单张与长条渲染键；不再可编辑 |
| `item.physicalFrameSeed` | 是（类型与合并分支） | 无写入者，恒 `undefined` |

`settingsStorage.ts:159-162` 的白名单不需要改动。

不做数据迁移。已保存的自定义 `bodySeed` 移除控件后只能通过全局「恢复默认设置」重置，这是产品可见后果，交付说明需告知。

## 5. 变更清单

| 文件 | 变更 |
| --- | --- |
| `components/settings/RecipeInspector.tsx` | 删两个按钮与 `grid grid-cols-2` 容器；删 `physicalFrameSeed` / `onPhysicalFrameSeedChange` props；删 `nextPhysicalSeed` 导入 |
| `App.tsx` | 删 `physicalFrameSeed` / `onPhysicalFrameSeedChange` 传参；删写回 `images` 的分支；`createImageRenderKey` 的第 4 参传 `item.physicalFrameSeed`（无写入者，保持原样即可） |
| `tests/e2e/physical135.spec.ts` | 删除两条依赖按钮的用例（`:59-79`、`:126-140`）；新增面板不含该控件的断言 |
| `tests/physical135Raster.test.ts` | 不删任何用例；`:126-127` / `:239-240` 传 `{ physicalFrameSeed: X }` 是纯函数 `item` 参数，与 UI 无关，仍有效 |
| `tests/physical135Plan.test.ts` | 不改（种子独立性测试直接构造 settings，不依赖 UI） |
| `tests/physical135Stocks.test.ts` | 不改 |
| `tests/renderResult.test.ts` | 不改 |
| `tests/settingsStorage.test.ts` | 不改（R3 的读取断言继续有效） |
| `.trellis/spec/frontend/spectral-rendering.md` | 仅在存在「用户可切换种子」暗示时校对，否则不改 |

## 6. 验证策略

1. **界面**：真实 Chrome 打开物理 135 面板，断言「换一台」「换一格」不存在，布局无空洞。
2. **像素零变化**：用同一组设置分别在删除前后构建 `createPhysicalRaster`，比较 `presence` / `backing` / `filmBase` / `wall` 全量采样（此断言可在删除前用 HEAD 版本记录基准值）。
3. **行为等价**：`physicalStripFramePlan(strip, 1, {}, settings).frameSeed === 1`，删除前后一致。
4. **存量兼容**：`settingsStorage` 读出含非 1 `physicalBodySeed` / `physicalFrameSeed` 的旧 payload，值完整保留。
5. **全量**：`npm run check:all`、`npm run test:updater`、`npm run test:release-contract`。
6. **e2e**：真实 Chrome 跑 `tests/e2e/physical135.spec.ts`。注意 Playwright 自带无头 Chromium 报 SwiftShader，光谱后端会拒绝软件渲染器，必须用 `CHROME_PATH` 指定真实 Chrome。

## 7. 明确不做

- 不写 `frameSeedForIndex`。
- 不修改 `createOrderedStripKey`。
- 不修改接缝连续性测试或相关契约。
- 不清理已保存的种子值。
