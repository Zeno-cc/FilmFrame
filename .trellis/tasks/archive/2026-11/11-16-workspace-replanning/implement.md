# 工作区重规划：实施计划

## 前置条件

- 用户已选择「胶片索引」，并明确批准本最终规划摘要后，运行 `python3 ./.trellis/scripts/task.py start .trellis/tasks/11-16-workspace-replanning`。
- 任务目录 `.trellis/tasks/11-16-workspace-replanning/`。
- 不修改用户已有渲染、发布、访问控制修改，不提交或部署。

## 实施清单

- [x] 1. 读取已确认方向、`prd.md`、`design.md`、前端规范与现有未提交差异，确定 UI 文件基线。
- [x] 2. 添加本地、明确标注的空状态摄影示意素材及来源记录，不进入渲染流程，不请求第三方服务。
- [x] 3. 重构 `EmptyDarkroom` 的图文、画幅、导入、名言和三步路径；保留动画 DOM 契约与无障碍状态。
- [x] 4. 调整 `App.tsx` 的空状态工具栏、右栏和移动操作显示，收敛重复主操作，保留已有状态/事件逻辑。
- [x] 5. 统一 `AppHeader`、`WorkspaceToolbar`、照片/长条列表的「选片、调整、出片」与「单张、胶片长条」命名。
- [x] 6. 将设置重组为胶片、片边、输出、我的配方；同步四组移动 tabs，给高级控制添加可访问折叠入口，保留真实设置联动。
- [x] 7. 更新语义 token、按钮、输入、摘要、工作区与空暗房样式，消除重复英文小标签和不必要嵌套卡片。
- [x] 8. 更新相关 E2E 的名称、展开高级设置动作和空暗房几何断言，增加新空状态唯一主操作与照片示意验证。
- [x] 9. 运行静态检查和相关测试，修复本任务引入的问题；不通过删除功能或弱化断言规避失败。
- [x] 10. 浏览器批量检查桌面、平板、390px 手机的空状态、有照片、设置展开、预览和导出；截图并执行一次 Impeccable 检测。
- [x] 11. 交给独立 finish reviewer，按其结论修复与复查；由 documenter 记录真实落地的视觉系统。
- [x] 12. 对照 PRD 验收，报告通过、失败和未验证项；单独进行提交计划确认，不自动提交。

## 验证命令

```bash
npm run typecheck
npx vitest run tests/workflowState.test.ts tests/settingsStorage.test.ts tests/photographyQuotes.test.ts
npx playwright test tests/e2e/frontend-redesign.spec.ts --workers=1
# 相关物理、光谱与长条测试按最终 DOM 影响串行补跑
npm run build
git diff --check
"/Users/zacheryxu/.zcode/cli/plugins/cache/impeccable/impeccable/4.9.2/skills/impeccable/scripts/impeccable" detect --json --changed
```

完整 `npm run check` 与 `npm run test:e2e` 按项目前端质量规范执行；若既有无关失败阻塞，保留日志、区分归因，不虚报通过。移动仿真不替代项目发布要求的实体设备 smoke。

## 风险文件与保护

- `App.tsx`：已有 Worker 超时等未提交修改，只局部编辑 render 区域。
- `components/settings/RecipeInspector.tsx`：已有物理种子控制移除修改，先读当前文件再编辑，不恢复已移除 props。
- `styles/tokens.css`：影响全局，必须检查对话框与反馈层，不只检查首页。
- `tests/e2e/frontend-redesign.spec.ts`：旧几何断言需要有意替换，保留动画、引用、上传、资源释放及焦点断言。
- `tests/e2e/*.spec.ts`：高级设置选择器需统一辅助函数，减少重复展开代码。
- `public/`：只新增空状态示例图与来源，不替换真实胶片模板或蒙版。

## 回滚点

- 方向、信息架构和测试映射均已记录在任务目录；如实现与已确认方向冲突，先停在当前任务，不用另一套视觉模板覆盖。
- 按本任务新修改的 UI 文件局部回退；不执行 `git reset --hard`、`git clean` 或覆盖用户其他修改。
