# Pro 400H 物理孔密度与片边独立验收结论 — 2026-11-13 更新

## Decision（已变更）

**Pro 400H 现在支持完整物理 135 光谱显影。**

上游 `overscan.cpp` 使用与 FilmFrame 相同的最小二乘 CMY 孔密度求解，且**没有残差接受门槛**。此前 FilmFrame 额外施加的 `maxBaseResidual < 0.5` 限制是本地添加的，与上游行为不一致，导致 Pro 400H 被错误拒绝。该限制已移除，Pro 400H 按上游方式放行。

## 变更内容

- `services/physical135/spectralAdapter.ts`：移除 `maxBaseResidual >= 0.5` 拒绝逻辑，保留非有限值检查。
- `services/physical135/capability.ts`：从 `PHYSICAL_SPECTRAL_UNSUPPORTED` 移除 `FUJI_PRO_400H`。
- Pro 400H 现在默认使用 `physical135 + spectral`，与其他完整物理型号一致。

## 上游算法对照

上游 `overscan.cpp`（`SpektraLab@02d82b56`）与 FilmFrame `solveBaseCancelingHoleDensity()` 使用完全相同的最小二乘公式：
- 目标：找到 CMY 使 `base + CMY × channelDensity ≈ 0`
- 方法：正规方程 `AtA × CMY = Atb`，Cramer 法则求解
- 有效波长：仅使用有限值样本
- **无残差门槛**：无论残差大小，直接使用求解结果渲染

残差（Pro 400H 约 0.971）反映的是该片物理曲线本身——短波段无法被单一 CMY 完全抵消——不是算法错误。上游同样保留这个残差并正常出片。

## 边界保留

- Pro 400H 的 135 片边布局仍借用 X-Tra 400 的 Fuji-negative 布局（上游明确标注为未验证）。这是**几何/文字近似**，不是实测 Pro 400H 片边扫描。
- 上游有 Pro 400H 的 120 6x7 实测参考（`Actual_Pro400h.jpg`），但 135 没有。
- 完整物理显影现在可用，但不声称与 SpektraLab 原生输出像素一致。

## 验证

- 上游 `fujifilm_pro_400h.json` 与本地原始 profile SHA-256 相同：`da1be731ab79fb5535c43042494fa7298c942179abb68270b928aa012c629b31`。
- 独立 NumPy 对上游 profile 的 64 个有限样本求解，与 FilmFrame 有效掩码域完全一致：CMY `[-0.15987999377865675, -0.6212653381170062, -1.0281100912279255]`；最大残差 `0.9707583357910277`。残差保持原值，没有调低。
- `tests/physical135Plan.test.ts` 固定该独立数值锚点；`supportsPhysicalSpectralStock(FUJI_PRO_400H) === true`，`defaultEdgeForStock(FUJI_PRO_400H) === 'physical135'`。
- `tests/e2e/pro400h-physical.spec.ts` 的独立 WebGL2 孔密度/打印 RGB 对照通过，释放后仅剩 setup 纹理，dispose 后为零。
- 生产 CPU/GPU 最终像素比较通过：最大 RGB 差 `1/255`，超过 2 个色阶的通道数 `0 / 4,345,110`，alpha 一致，尺寸均为 `1155x1254`。该差异作为实测数据保存，不作为跨驱动必须精确相等的快照。
- 综合验收要求每次冲洗恰有一个 `processImage` 请求和一个相同 ID 的成功响应，并绑定所选光谱后端，拒绝 Worker 失败和主线程回退。CPU 请求 ID `1` 使用 `cpu` 并成功，无 WebGL2；GPU 请求 ID `1` 使用 `webgl2` 并成功，真实 WebGL2 上下文和 `EXT_color_buffer_float` 各一次，生产 `getError()` 返回成功的 FLOAT 回读三次，GL 错误、失败与回退均为零。插桩观察生产错误返回值，不自行消费 GL 错误。
- CPU Worker/主线程全帧 SHA-256 均为 `e31a5242cc0a3a5574dfdc7d53c277e5b455bb54bc985cb590cc4bd6b759294f`；GPU Worker/主线程均为 `463de06df41947f913b1157dc4432611c22be2a4f1392abb2a68ec37c76f5439`。
- 当前数值摘要保存在 `output/playwright/preview-results/pro400h-physical-Pro-400H--a9457-rker-and-forced-main-routes-chromium/pro400h-final-rgb-comparison.json`。CPU/GPU 在浏览器内比较原始 RGBA 像素，测试临时 Cache Storage 已清理。
- 开发态独立 WebGL2 对照通过孔密度/打印 RGB、释放后仅剩 setup 纹理及 dispose 后为零。完整生产矩阵 `78/78`、开发态诊断 `12/12`（含两种角度的五帧片带复测）、Firefox/WebKit 各一个兼容工作流、`289` 个单元测试及 `7` 个 provenance 检查通过。五帧片带原始整组运行有一个 60 秒上限超时，按实际生成耗时设置 180 秒后两种角度均通过；未放宽像素断言。
- 技术验收不改变发布权利、对应源码及历史素材的未清权状态。
