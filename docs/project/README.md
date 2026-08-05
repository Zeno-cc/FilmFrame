# FilmFrame 工程文档索引

> 最后核验：2026-07-11，稳定化交付的前序基线为 `a036da628e15`。

根目录 [handoff.md](../../handoff.md) 是唯一接手入口。本目录按知识寿命和职责拆分：

| 文档 | 适用问题 |
| --- | --- |
| [product-workflows.md](product-workflows.md) | 产品做什么、用户怎么操作、哪些设置在哪些模式生效 |
| [architecture.md](architecture.md) | 入口、状态、数据流、Worker 分流、存储和生命周期 |
| [rendering.md](rendering.md) | 胶片几何、模板、色彩、纹理、旋转、分辨率和输出算法 |
| [file-map.md](file-map.md) | 每个源码、配置、测试和素材文件负责什么 |
| [engineering.md](engineering.md) | 安装、构建、测试实况、依赖、部署、CI 和发布建议 |
| [operations-and-risks.md](operations-and-risks.md) | 已知缺陷、排障顺序、内存/浏览器/素材风险和优先级 |
| [browser-mobile-smoke.md](browser-mobile-smoke.md) | v1.3 desktop compatibility, physical-device smoke, privacy, and bounded stress protocol |
| [mobile-smoke-evidence-template.md](mobile-smoke-evidence-template.md) | Redacted iPhone Safari and Android Chrome release evidence template |
| [current-worktree.md](current-worktree.md) | 稳定化提交范围、相对前序基线的变化和验证快照 |

维护原则：实现细节只在最相关的文档中展开，其他文档通过链接引用；所有“已验证”陈述必须能对应源码、配置或实际命令结果。
