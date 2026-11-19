# 闭环记录（2026-11-19）

## 处置：规划被取代，交付已由物理 135 管线完成

## 事实

- 本任务是「设计物理 135 片边升级」的规划任务，明确推迟到光谱原型评审之后。
- 物理 135 已作为生产默认落地：`services/physical135/`（几何规划、栅格、长条、光谱适配、片边注册表 25 条定义）、`services/physical135/edgeRegistry.ts`、`components/settings/RecipeInspector.tsx` 的片门/齿孔背光控制。
- 命名与范围由 `11-18-render-mode-simplification` 收敛为「模板片边 / 物理片边」，物理片边只对具备布局定义的型号可选。
- 规划期的参考集与许可边界没有独立成文，而是并入 `ops/provenance/` 与 `11-06-spectral-license-provenance`。

## 未闭环项的去向

- 物理几何与素材的来源/许可记录：转交 `11-06-spectral-license-provenance`（`ops/provenance/manifest.json`）。
- 真机（iPhone/Android）物理渲染烟测：保留为独立发布门禁。

## 结论

规划目标已由后续任务以实际实现完成，本任务不再单独推进。
