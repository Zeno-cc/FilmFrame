---
version: 1
slug: "app-tsx"
primary_target: "App.tsx"
related_targets: ["components/workspace/EmptyDarkroom.tsx","components/workspace/WorkspaceToolbar.tsx","components/settings/RecipeInspector.tsx"]
---

# FilmFrame 工作区

## Scope

主工作区 `App.tsx` 及其空暗房、顶部、出片工具栏、配方面板和移动操作。Operate 模式，面向摄影爱好者，主任务为「选片 → 调整 → 出片」。保留真实胶片型号、所有现有导入/渲染/导出行为、本地隐私与减弱动态。

## Direction contract

THESIS：以一枚真实画幅展开当前一卷，拒绝把全部技术能力平铺成同权重的深色控制面板。

OWN-WORLD：石墨蓝工作面、石灰白内容层、氧化橙主操作、冷青状态；人文无衬线标题和清晰正文，数据才使用等宽。照片、型号和出片共享 3:2 网格，装饰不另造网格。

STORY：用户先看到照片如何进入 135 胶片，再选片，之后按需调整胶片与片边，最后选择单张或胶片长条出片。名言退为低权重文化注脚。

FIRST VIEWPORT：轻量顶栏，主区左侧标题、说明、唯一导入按钮、拖放和隐私，右侧大型带照片示意的 135 画幅；右栏只呈现轻量配方。名言与三步路径收在底部。手机按标题、画幅、主按钮顺序重排，保持首屏可行动。

FORM：七个 grounded 候选的第 7 项「可触阅的胶片索引图谱」，seed:2756164ac7598a30。融合构成网格的共享比例、色彩功能分工与就地状态更新，标准 Web 控件。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
