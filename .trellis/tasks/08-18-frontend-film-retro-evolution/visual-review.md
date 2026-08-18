# 观感验收：前端胶片味 / 复古感

截图目录：screenshots/

| 文件 | 状态 |
|------|------|
| before-empty-desktop-1440x1000.png | 改前基线（旧侧栏 SaaS 空态） |
| after-empty-desktop-1440x1000.png / after-empty-desktop.png | 改后桌面空态 |
| after-empty-darkroom.png | 空暗房区域 |
| after-with-photos-desktop-1440x1000.png | 改后有图工作区 |
| after-header.png / after-empty-mobile.png | 顶栏与窄屏 |

## 结论

- 胶片/暗房感：明显提升。暖黑底 + 全局 grain/vignette、胶片齿孔条、接触印相文案、引言纸卡、压印 amber CTA、仪表芯片顶栏。
- AI 味：相对改前大幅下降。空态改为胶片底 + 台面 CTA + 便签流程 + 引言卡；按钮与面板有内凹/纸面投影。
- 有图状态：PhotoCard 帧号/卡纸边与桌面隐喻一致。
- 第三方 JS：未引入；CSS noise tile + 伪元素即可。

## 残余与后续（非阻塞）

- 侧栏仍有部分仪器英文标签，属既有暗房词库，克制保留。
- 全局 grain 可用 --ff-grain-opacity / --ff-vignette-strength 调节。
- 运行配置 toast 仍偏通用通知样式（P1）。

## 回归

- npm run check 通过（196 tests + typecheck + build）
- frontend-redesign e2e 通过
- git diff --check 通过
