# P1 创作闭环与单图构图控制任务

## P1-A：RenderTransform

- [x] A1 定义 transform 类型、默认值、normalize 和稳定 key。
- [x] A2 编写旋转后焦点映射和 cover placement 纯函数测试。
- [x] A3 主线程绘制函数消费 transform。
- [x] A4 Worker request、单张和长条消费 transform。
- [x] A5 classic/real135、single/strip 全路径接入。
- [x] A6 单图/长条 result key 纳入 transform。
- [x] A7 验证用户旋转与真实 135 自动旋入/恢复组合。

## P1-B：编辑闭环

- [x] B1 预览区明确原图/成片来源并增加 Before/After。
- [x] B2 增加 3x3 焦点与 90° 旋转控件。
- [x] B3 增加 debounced 即时 preview render 和独立 URL 生命周期。
- [x] B4 增加“应用并冲洗此张”。
- [x] B5 增加本地配方服务、测试和紧凑 UI。
- [x] B6 增加 Web Share 能力判断、分享命令与失败回退说明。
- [x] B7 更新批量处理为仅处理 stale/失败项。

## P1 验收

- [x] transform 纯函数、result key、Worker payload、配方服务测试。
- [ ] 横图/竖图/旋转后九宫格构图浏览器验收。
- [x] 快速连续修改只显示最后一次预览。
- [x] Before/After 不会把原图伪装成可下载成片。
- [ ] 刷新后配方存在、照片不存在。
- [x] Web Share 支持/不支持两条路径验收。
- [x] 更新 handoff、architecture、rendering、product-workflows。
