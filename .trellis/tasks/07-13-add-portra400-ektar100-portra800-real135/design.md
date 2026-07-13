# Technical Design

## Scope and Boundaries

该变更只扩展已有的扁平真实 135 模板能力。它不创建新的渲染分支：模板注册表仍是 UI、设置同步和主线程渲染的唯一能力来源；Gold 200 仍是唯一允许进入 Worker 的型号。

## Asset Normalization

源图与运行时模板的几何并不相同。每个源图先独立检测中央连续纯黑片窗，得到源片窗 `{x, y, width, height}`。以源片窗边界把图像切为 3x3：左/中/右列与上/中/下行。九个分区分别重采样到目标列宽 `92/1123/92` 和目标行高 `211/800/192`，再无缝拼合为 `1307x1203`。

这保留了每个生成图的片基、齿孔和边印，同时让固定片窗与渲染器的 cover、动态帧号及模板遮罩对齐。源片窗不能通过型号或上一张图的坐标推断；每张图都需实测。输出后会以像素级检查验证目标黑窗和四边无补边。

## Runtime Contract

`services/filmOverlay.ts` 新增三个 URL 常量并写入 `REAL135_TEMPLATE_URLS`：

| FilmType | URL |
| --- | --- |
| `KODAK_PORTRA_400` | `/film-overlays/kodak-portra-400.png` |
| `KODAK_EKTAR_100` | `/film-overlays/kodak-ektar-100.png` |
| `KODAK_PORTRA_800` | `/film-overlays/kodak-portra-800.png` |

`supportsReal135Template()` 不改动。App 和设置面板已依赖该函数，因此注册后会自动开放真实 135 选项和对应 `filmOverlayUrl`。`filmEngine.ts` 对非 Gold 的已注册模板走现有主线程扁平模板路径；`createFilmTemplateStripLayout()` 的 `frameGap=0` 保持，保证相邻完整帧直接相接。

## Compatibility and Rollback

注册表以 `Partial<Record<FilmType, string>>` 表示能力；未注册的型号继续使用当前 classic 行为。若某个模板出现视觉问题，移除它的注册项即可关闭其真实 135 能力，删除相应 public asset 后应用仍会安全回退。此次不触及 Gold Worker，避免影响其性能与渲染语义。

## Verification Strategy

单元测试锁定 URL 与能力门控，端到端测试对三个型号依次选择真实 135、执行单张和长条生成。资产检查以图像元数据、目标黑窗全像素扫描和边缘采样组合执行；浏览器 smoke test 验证最终视觉效果和静态资源加载。
