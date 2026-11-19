# 闭环记录（2026-11-19）

## 交付

- `components/settings/RecipeInspector.tsx`：删除「换一台 · <bodySeed>」「换一格 · <frameSeed>」两个按钮、`physicalFrameSeed` / `onPhysicalFrameSeedChange` props 与承载它们的 `grid grid-cols-2 gap-2` 容器。
- `App.tsx`：删除对应传参与写回 `images` 的分支。
- `services/physical135/seed.ts`、`FilmSettings.physicalBodySeed` / `physicalFrameSeed`、`ImageItem.physicalFrameSeed` 保持不变；`settingsStorage` 继续读取已存值并参与渲染键。

## 验收证据

| 验收项 | 证据 |
| --- | --- |
| 面板不再出现两个按钮 | `components/` 与 `App.tsx` 已无 `换一台` / `换一格` / `onPhysicalFrameSeedChange`；`tests/e2e/physical135.spec.ts` 断言 `toHaveCount(0)`，该用例在真实 Chrome 与内置 Chromium 下均通过 |
| `frameSeed` 回退默认值 | `services/physical135/strip.ts:81`：`item.physicalFrameSeed ?? settings.physicalFrameSeed ?? 1` |
| 默认设置下像素零变化 | 规划期隔离实验（同格位只改 `frameSeed`、831,250 采样点、真实调用 `createPhysicalRaster`）记录 `physicalStraighten = 0` 时种子不参与任何像素；`tests/physical135Plan.test.ts`「keeps body and frame seed domains independent」与 `tests/physical135Raster.test.ts` 的确定性用例继续通过 |
| 已存值仍生效 | `services/settingsStorage.ts:161` 读取两个字段；`App.tsx` 各处 `createImageRenderKey(..., item.physicalFrameSeed)` |
| `npm run check` | 41/41 测试文件、390/390 用例、`tsc --noEmit`、生产构建全部通过 |
| 更新器与发布契约 | `npm run test:updater`、`npm run test:release-contract` 通过 |
| 真实 Chrome e2e | `tests/e2e/physical135.spec.ts` 种子按钮用例通过（`CHROME_PATH` 指向本机 Chrome） |
| 未删除接缝/种子用例 | `keeps body and frame seed domains independent`、`uses one local scan transform for equal strip frame seeds`、跨边界穿孔连续性用例全部保留 |

## 已知环境限制（与本任务无关）

- 显式 WebGL2 在软件渲染器上被产品策略拒绝，物理光谱用例按环境解析到 CPU 后端。
- 五帧物理光谱长条超过 Worker 的 120 秒请求预算，已在无硬件 GPU 时显式跳过，理由记入 `docs/project/rendering.md` 与 `docs/project/operations-and-risks.md`。

## 提交

用户确认收尾后随开发批次提交（`feat(ui)` 与 `feat(render)` 批次）；任务执行期间未提交、未推送、未部署。
