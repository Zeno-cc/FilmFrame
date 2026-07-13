# 开发、测试与部署

> 最后核验：2026-07-12。验证环境为 macOS arm64、Node v22.8.0、npm 11.17.0；项目声明的最低 Node 为 20。

## 安装与运行

```bash
npm ci
npm run dev
npm run build
npm run preview
npm run test:e2e
```

开发使用 Vite。无 `.env`、`.nvmrc`、`.node-version`、Dockerfile 或 Makefile。建议团队增加 Node 20 锁定文件，CI 以最低支持版本为准，而不是依赖个人机器的 Node 26。

## 构建

`npm run build` 等于：

```text
tsc && vite build
```

暗房重构后实测成功：95 modules；主 JS 约 344.32KB（gzip 105.20KB），CSS 51.29KB（gzip 10.06KB），Worker 18.28KB。完整静态输出的大部分仍来自 `public` 素材。

构建会写入 `dist/`，并复制 `public/` 的所有文件，包括未被代码引用的 PNG、素材 README 和 `.DS_Store`。

## 测试与验证

项目已使用与 Vite 5 兼容的 Vitest 2.1.9。当前命令：

```bash
npm test
npm run typecheck
npm run build
npm run check
npm run test:e2e
```

`npm run check` 依次执行真实测试、类型检查和构建。2026-07-12 实测 18 个测试文件、137 项断言全部通过；`npm run test:e2e` 的 14 条 Chromium 旅程也通过。E2E 覆盖桌面空态/Inspector、手机 Sheet 与底栏焦点恢复、平板 Drawer 焦点恢复、手机 secondary actions、上传冲洗预览/长条、裁切取消回焦、损坏二维码 fallback、单一 active modal、Header 更多菜单键盘导航和 Toast 位置，以及选片同步、仅处理入选、长条 stale 与移动端无横向溢出。新增单元覆盖连续 transform/zoom 几何、批次选片/准入、完整卷帧号、artifact 字节数、结果 key、Worker payload、工作流状态与 task ownership、严格上传、即时预览 generation、配方和 Web Share。

旧 geometry 失败来自只被测试引用的 `getKodakGoldStripSegment()`；连续片基生产实现已不使用该 helper。本轮删除死 helper、死绘制函数和对应失真断言，其余几何断言保留。

Worker client 已支持注入 fake Worker，测试构造失败、dispose、timeout、`messageerror`、晚到响应和路由策略。浏览器 smoke 另验证了上传、处理、预览下载出现以及格式变化后 stale 下载消失。

## 当前缺失的工程门禁

- 无 CI；
- 无 ESLint/format；
- 无 coverage；
- 无完整的主线程/Worker 视觉等价性测试；
- 无发布脚本、tag、CHANGELOG 或版本策略。

审计初期的 `App.tsx` 行尾空白已清理，当前 `git diff --check` 通过。

## 依赖状态

直接生产依赖：React、ReactDOM、exif-js。其余为构建开发依赖。

审计初期本机存在带 `2` 后缀的 extraneous 包；安装 Vitest 时 npm 已移除残余。当前 `npm ls --depth=0` 干净，但正式发布仍应使用全新 `npm ci` 验证。

工程审计在官方 npm registry 得到 4 个开发工具链漏洞：1 high、2 moderate、1 low，涉及旧 Vite/esbuild/plugin-react/Babel 路径或 dev server 风险；`npm audit --omit=dev` 为 0。修复应单独立项，因为 Vite 最新版是 major upgrade，不能在文档任务中顺手升级。

建议审计命令：

```bash
npm audit --registry=https://registry.npmjs.org
npm audit --omit=dev --registry=https://registry.npmjs.org
```

lockfile 中 tarball 使用 `registry.npmmirror.com`，README 的“供应链安全”不应写成绝对保证。

## CI 建议

最小 CI：

```text
checkout
setup Node 20 with npm cache
npm ci
npm run typecheck
npm test
npm run build
```

随后再加：依赖审计策略、Playwright smoke、产物体积阈值。CI 与生产部署分开，最初不要在 main 检查成功后直接自动生产发布。

## 部署现状

应用是静态站，无路由，因此任何能托管 `dist/` 的平台都能运行。README 提到 Zeabur/Netlify/Vercel，但仓库没有有效平台配置：`netlify.toml` 为空。

平台参数：

| 项 | 值 |
| --- | --- |
| Install | `npm ci` |
| Build | `npm run build` |
| Output | `dist` |
| Node | >=20，建议固定 20 |
| 环境变量 | 无 |

如果未来引入客户端路由，需要添加 SPA fallback；当前不需要。

生产配置待补：

- immutable hashed asset cache；
- HTML no-cache/revalidate；
- CSP，注意 Worker、blob URL、data favicon 和同源图片；
- `X-Content-Type-Options`、`Referrer-Policy`、frame policy；
- 是否需要 COOP/COEP。当前 OffscreenCanvas 不要求 cross-origin isolation，SharedArrayBuffer 才需要。

## 发布检查单

1. 确认工作区干净或所有变更已明确纳入版本。
2. 使用 Node 20 全新 `npm ci`。
3. 真正执行测试，而非只执行现有 test 脚本。
4. `npm run build`。
5. 在 Chromium 和至少一个不支持/禁用 Worker 路径的浏览器做相同样例检查。
6. 验证竖图、横图、单张、长条、JPEG、PNG、ZIP。
7. 检查 `dist/` 没有 `.DS_Store` 和不必要素材。
8. 检查二维码、模板 200 响应和 MIME。
9. 更新版本、CHANGELOG、handoff 当前快照。
10. 发布后用真实生产 URL做 smoke。

## README 待修项目

- clone URL 从 `your-username` 改为真实仓库；
- `npm install` 改为可复现的 `npm ci`；
- 说明 Worker、transform 与体验升级的当前提交边界；
- 修正素材 fallback 顺序；
- 不要说只复制单个 overlay，Vite 复制整个 public；
- 补 `LICENSE` 后再明确 MIT；
- 大图是警告，不是防崩溃限制；
- 经典长条帧号不保证 36 循环。
