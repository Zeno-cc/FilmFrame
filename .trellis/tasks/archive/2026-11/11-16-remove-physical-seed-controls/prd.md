# 移除物理底片随机种子控件

## 背景

物理 135 面板目前暴露两个按钮：

- `换一台 · <bodySeed>`（`physicalBodySeed`）
- `换一格 · <frameSeed>`（`physicalFrameSeed`）

它们各自调用 `nextPhysicalSeed()`（LCG 递推）写入配方。数值对用户没有任何可解释含义，而它控制的是片门偏移、齿孔相位、乳剂套准、扫描偏移等渲染细节。这是实现级参数，不是摄影决策。

用户决定剔除这两个控件。

## 实测前提（本次规划的关键发现）

隔离实验（同格位、只改 `frameSeed`，831,250 个采样点，`createPhysicalRaster` 真实调用）：

| `physicalStraighten` | 种子 1 vs 2 | 种子 1 vs 999 |
| --- | --- | --- |
| `0`（默认） | 逐像素完全相同 | 逐像素完全相同 |
| `1.5` | 26,220 点不同 | — |

原因：`services/physical135/plan.ts:29` 与 `:44-46` 在 `straightenDegrees === 0` 时直接返回恒等映射，`weave` / `scanOffset` 从不参与；连续长条的材质种子是 `plan.bodySeed` 而非 `frameSeed`（`canvas.ts:108`、`spectralAdapter.ts:31`）。

结论：**默认设置下 `frameSeed` 对长条像素没有任何影响**。因此不需要位置推导，也不需要为此改写接缝连续性契约。

## Goal

移除面向用户的种子控件，不改变任何渲染像素。

## Requirements

### R1 移除界面控件

- 删除 `components/settings/RecipeInspector.tsx` 中「换一台」「换一格」两个按钮及其 `onClick` 逻辑。
- 删除只服务于这两个按钮的 props：`physicalFrameSeed`、`onPhysicalFrameSeedChange`。
- 删除 `App.tsx` 中对应传参与 `onPhysicalFrameSeedChange` 处理函数，含写回 `images` 的 `physicalFrameSeed` 分支。
- `grid grid-cols-2 gap-2` 容器一并删除，面板不得留空行或错位。
- 删除 `nextPhysicalSeed` 在 UI 层的导入（`seed.ts` 中该函数本身保留）。

### R2 不引入位置推导

- `physicalStripFramePlan` 与 `settingsForImage` 均保持现状。
- 没有控件写入后，`item.physicalFrameSeed` 恒为 `undefined`，长条回退到 `settings.physicalFrameSeed ?? 1`，与今天从未点过按钮的用户完全一致。
- 渲染键、像素输出、接缝连续性契约一律不变。

### R3 已保存值继续生效

- `FilmSettings.physicalBodySeed` / `physicalFrameSeed`、`ImageItem.physicalFrameSeed` 保留在类型中。
- `settingsStorage.ts` 继续读取已保存值；`createRenderSettingsKey` / `createImageRenderKey` / `createOrderedStripKey` 保持现有种子参与方式。
- 已保存的 `bodySeed`（决定每卷纹理）继续生效，只是不再可编辑；`frameSeed` 已存值同样继续参与。
- 不做数据迁移，不清理 localStorage。

## 非目标

- 不删除 `services/physical135/seed.ts` 的 `hashSeed` / `seedUnit` / `nextPhysicalSeed`：前两者是渲染路径依赖，`nextPhysicalSeed` 仍被单元测试使用。
- 不改变物理渲染模型、光谱管线、片边布局、接缝连续性规则。
- 不引入替代性的用户可配置项。

## 兼容与风险

| 项 | 结论 |
| --- | --- |
| 已保存成片是否失效 | 不存在。照片、成片、Blob 均不持久化（`README.md:5`、`handoff.md:40`），刷新即丢，没有可失效的存量 |
| 长条纹理是否会重复 | 不会。纹理由 `bodySeed` 决定，未受影响 |
| 长条逐格扫描差异 | 默认 0° 下本就不存在；非 0° 时行为不变（仍统一用 `settings.physicalFrameSeed`） |
| 非 1 的 `frameSeed` 已存值 | 继续参与单张与长条渲染，行为与今天相同；但界面不可见、无法自查或单独重置 |
| 自定义 `bodySeed` 无法再调整 | 是。移除控件后只能通过全局「恢复默认设置」重置，属于产品可见后果，需在交付说明中告知 |

## Acceptance Criteria

- [x] 物理 135 面板不再出现「换一台」「换一格」，无空洞或错位。证据：`components/` 与 `App.tsx` 已无 `换一台`/`换一格`/`onPhysicalFrameSeedChange`；`tests/e2e/physical135.spec.ts:65-66,91-92` 断言两个按钮 `toHaveCount(0)`。
- [x] 删除后 `physicalStripFramePlan(strip, i, {}, settings).frameSeed` 等于 `settings.physicalFrameSeed ?? 1`，与删除前的默认行为一致。证据：`services/physical135/strip.ts:81`，且无控件写入后 `item.physicalFrameSeed` 恒为 `undefined`。
- [x] 渲染像素零变化：同一设置下，删除前后 `createPhysicalRaster` 输出逐点相同。证据：本任务规划期隔离实验（同格位只改 `frameSeed`、831,250 采样点、真实调用 `createPhysicalRaster`）记录默认 `physicalStraighten = 0` 时种子不参与任何像素；`tests/physical135Plan.test.ts`、`tests/physical135Raster.test.ts` 继续验证种子域独立与输出确定性。
- [x] 已保存配方中的 `physicalBodySeed` / `physicalFrameSeed` 仍被 `settingsStorage` 读出并参与渲染键。证据：`services/settingsStorage.ts:161`，`App.tsx` 各处 `createImageRenderKey(..., item.physicalFrameSeed)`。
- [x] `npm run check:all`、更新器与发布契约通过；真实 Chrome 下物理 135 相关 e2e 通过。证据见 `closure.md`。
- [x] 测试中依赖按钮的用例已删除，未删除任何接缝连续性或种子独立性用例。证据：按钮用例改为断言不存在；`keeps body and frame seed domains independent`、`uses one local scan transform for equal strip frame seeds`、跨边界穿孔连续性用例保留。
- [x] 不提交、不推送、不部署。该约束在任务执行期间已遵守；2026-11-19 开发收尾时按用户明确的闭环指令随批次提交，未推送、未部署。

## 收尾补充（2026-11-19）

- 用户确认的后果已记录：自定义 `bodySeed` 不再可单独调整，只能通过全局「恢复默认设置」重置。
- 面板空行与 `grid grid-cols-2 gap-2` 容器一并移除，未留下空洞。

## Notes

- 用户已确认：`frameSeed` 直接用默认值（不做位置推导）；`bodySeed` 保留已存值。
- `.trellis/spec/frontend/spectral-rendering.md:40-45` 提到 per-frame seed，需校对是否有「用户可切换」的暗示；若无则不改。
