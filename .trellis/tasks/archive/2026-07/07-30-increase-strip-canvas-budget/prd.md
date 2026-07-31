# 将长条 Canvas 安全预算调整到 700 MiB

## Goal

将长条合成 Canvas 的默认 RGBA 内存预算从当前约 244 MiB 提高到 700 MiB，使约 245.5 MiB 的长条画布能够通过前置预算校验，同时继续保留浏览器尺寸上限及批次工作集保护。

## Requirements

- 本任务中的 `700M` 明确定义为 `700 MiB`，即 `700 * 1024 * 1024` bytes。
- 按 RGBA 每像素 4 bytes 计算，默认 Canvas 像素上限调整为 `183,500,800` pixels。
- 保留单边最大尺寸 `32,767` pixels，不因提高总像素预算而放宽浏览器 Canvas 边长限制。
- 主线程与 Worker 必须继续复用同一套 `validateCanvasBudget` 校验逻辑，避免导出路径产生不同边界。
- 更新 `tests/renderBudget.test.ts`，覆盖新预算的精确上下边界。
- 检查并按需更新 `tests/batchAdmission.test.ts`，确保批次准入提示与新 Canvas 预算一致。
- 预算常量应以可读方式表达 700 MiB 与 RGBA 像素数的关系，避免仅留下无法解释的裸数字。

## Out Of Scope

- 不调整批次 1 GiB 工作集限制。
- 不调整 ZIP 打包、上传、下载或文件大小限制。
- 不调整源图像素量的其他批次警戒或阻断阈值，除非它们直接导致本次新边界测试失效；若发现冲突，应先记录并单独确认范围。
- 不承诺所有浏览器、手机或低内存设备都能成功分配接近 700 MiB 的 Canvas；本任务只调整应用自身的前置硬预算。
- 不修改渲染效果、胶片样式、导出格式或用户照片数据处理流程。

## Acceptance Criteria

- [x] `183,500,800` pixels 的 RGBA Canvas 预算校验通过。
- [x] `183,500,801` pixels 因超过像素预算而失败，并返回现有的明确错误类型。
- [x] 当前约 245.5 MiB 的长条场景不再因 `max-pixels-exceeded` 被 Canvas 像素预算拦截。
- [x] 任一边超过 `32,767` pixels 时仍被拒绝。
- [x] 主线程和 Worker 使用相同预算校验入口，无重复或偏离的新阈值。
- [x] 现有 1 GiB 工作集和 ZIP 相关限制保持不变。
- [x] `npm run check`、相关单元测试及 `git diff --check` 通过。

## Notes

- 推荐在 `services/renderBudget.ts` 中用局部常量表达 `700 MiB / 4 bytes per pixel`，避免与 `services/batchAdmission.ts` 形成不必要的依赖或循环引用。
- 700 MiB 只是应用层准入上限。实现及验证时应明确提示：设备内存、浏览器 Canvas 实现和 GPU/进程限制仍可能导致实际渲染失败。
- 本任务为轻量任务，PRD-only；在收到实施确认前不启动任务、不修改产品代码。
