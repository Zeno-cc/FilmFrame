# Implementation Plan

## Ordered Work

1. 检查三张源图，测量各自的连续纯黑中央片窗并记录坐标。
2. 用 3x3 分区重采样规范化三张图到既有模板契约，写入 `public/film-overlays/`。
3. 对输出做尺寸、色彩模式、目标片窗纯黑和外缘补边检查；人工检查齿孔与边印没有被裁切。
4. 在 `services/filmOverlay.ts` 增加 URL 常量和模板注册项，不改变 Gold Worker 条件。
5. 更新 `public/film-overlays/README.md`、`docs/project/rendering.md` 和必要的架构说明。
6. 扩展 `tests/filmOverlayTemplates.test.ts` 的三型号注册断言。
7. 扩展 `tests/e2e/frontend-redesign.spec.ts`，循环验证新型号的真实 135 单张和长条生成。
8. 运行格式/类型/单元/E2E 校验，修复发现的问题后进行浏览器视觉 smoke test。

## Validation

运行 `npm run check`、`npm run test:e2e` 与 `git diff --check`。

此外，对每个输出 PNG 验证：`1307x1203`、RGB、目标 `1123x800` 片窗的像素均为黑色；浏览器中检查单张无四周黑边、长条无帧间黑缝且动态帧号可见。

## Risk and Rollback

- 风险最高的是对错误的源片窗分区，会拉伸片窗或在外缘留下黑边；在提交前先以像素检查和可视化检查阻断。
- 所有行为门控集中在模板注册表。发现单型号问题时，删除相应注册项和 PNG 即可回到其当前的非真实 135 行为，不影响 Gold 200 或 Portra 160。
