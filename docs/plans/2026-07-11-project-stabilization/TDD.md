# FilmFrame 稳定化 TDD 规范

> 原则：行为修复必须先建立能失败的测试。结构重构必须在行为测试保护下进行。

## 1. 测试分层

### L1：纯函数单元测试

适用：几何、帧号、设置归一化、文件名、下载决策、结果签名、批次合并。

要求：无浏览器、无随机、无真实 Worker；运行快，作为每次改动的第一反馈。

### L2：服务契约测试

适用：Worker client、fallback、Object URL 所有权、上传依赖注入、ZIP 文件项。

要求：注入 `Worker`、URL、时钟和 renderer fake；验证消息顺序、异常和 cleanup。

### L3：浏览器集成测试

适用：上传、处理按钮、设置变化、预览、删除、下载、长条。

要求：使用小型确定性 fixture；验证 UI 状态和下载建议名，不依赖大图或像素级随机输出。

### L4：视觉/性能检查

适用：模板开窗、旋转方向、主线程/Worker视觉契约、内存边界。

要求：在随机效果可注入 seed 前，不以全图逐像素快照作为唯一判据；优先检查尺寸、方向、非空区域和关键采样点。

## 2. Red-Green-Refactor 流程

每个行为任务严格执行：

1. **Red**：写最小失败测试，运行并记录失败原因与预期一致。
2. **Green**：用最小生产改动让该测试通过。
3. **Regression**：运行相关测试组，确认没有破坏相邻路径。
4. **Refactor**：仅在全绿后去重或改善命名。
5. **Full check**：运行 `test + typecheck + build`。

禁止：先重写实现，再补只会通过的测试；为了变绿而降低断言；用 mock 掩盖真实调用契约。

## 3. 当前基线测试迁移

现有五个测试文件必须从顶层自定义 `assert()` 迁移到测试 runner。迁移第一步只改变执行方式，不改变期望。

已知特殊情况：`filmGeometry.test.ts` 真实执行时，连续长条第二帧 `targetX` 步距断言失败。该项应保留为 Red，先由审查确认：

- 实现应让所有相邻 segment target 间距等于 `frameStride`；或
- 测试错误地忽略了首段左 rebate 的特殊宽度。

在设计结论前不得静默删除或放宽断言。

## 4. P0 回归场景

### R1：结果 MIME 与后缀

```text
Given 以 JPEG 设置生成结果
When 用户把当前设置切为 PNG
Then 旧结果不得以 .png 被下载
And UI 应显示需要重新处理或隐藏当前下载
```

### R2：未处理原图下载

```text
Given 上传 WebP 但未处理
When 从预览下载
Then 文件保持 .webp 和原始 Blob 类型，或下载入口不可用
```

### R3：ZIP 使用结果元数据

```text
Given 列表中存在不同生成批次/格式的结果
When 打包 ZIP
Then 每个扩展名匹配自身 Blob MIME
And stale 结果不进入当前批次 ZIP
```

### R4：删除期间晚到结果

```text
Given 图片 A 正在处理
When 用户删除 A 后任务才完成
Then A 不得重新进入列表
And 晚到 result URL 被 revoke
```

### R5：处理中新增或排序

```text
Given A/B 正在按快照处理
When 用户新增 C 或把 B 移到 A 前
Then完成结果按 ID 合并
And C 与新排序不被旧数组覆盖
```

### R6：设置变化隔离批次

```text
Given 批次以 settings S1 开始
When 处理中 UI 改为 S2
Then 当前任务仍标记为 S1 结果
And S2 UI 不把 S1 结果视为 current
```

### R7：Worker 失败回退

```text
Given Worker 能力存在但任务返回错误
When processImage 被调用
Then pending 正确清理
And 主线程 renderer 只回退一次
And 返回的 URL 有明确所有者
```

### R8：Worker 销毁与晚到响应

```text
Given 存在 pending 请求
When client dispose 或 App 卸载
Then pending 被拒绝或标记取消
And Worker terminate
And 晚到 Blob 不生成泄漏 URL
```

### R9：旋转契约

```text
Given portrait source + landscape aperture
Then frame 内旋转为 +PI/2
And single 成品恢复为 -PI/2
And strip 不做最终成品恢复
```

### R10：帧号循环

```text
Given 起始 36，第二张图片
Then 所有 renderer/mode 按选定卷长得到 1
```

## 5. 测试可设计性要求

- 把结果“是否 current”实现为纯函数或小型 value object，不塞进 JSX 条件。
- 批次结果合并使用纯 reducer，输入为当前数组、batch snapshot、result event。
- Worker 构造、URL 创建/回收、主线程 renderer 通过依赖边界注入。
- 时间戳和随机 ID 不作为核心断言。
- ZIP 测试解析 central directory 或检查可读条目，不能只断言 Blob 非空。
- Canvas 测试至少断言宽高、MIME、方向与非空，不用随机全图 golden。

## 6. 完成门槛

- 所有 P0 bug 有独立回归测试；
- 测试在修复前按预期失败；
- 修复后相关组和全量组通过；
- 测试名称描述用户可观察行为；
- 无 `.only`、skip 或被注释的失败测试；
- 构建不依赖测试专用全局污染。
