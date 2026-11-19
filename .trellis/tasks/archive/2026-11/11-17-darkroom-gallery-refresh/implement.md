# 联网摄影示意轮换：实施计划

## 前置条件

- 用户已选择联网下载、定时轮换、到期换批并删除旧图，已批准创建并实施子任务。
- 仅接入许可明确的 Wikimedia Commons；不抓取马格南／哈苏，不上传用户照片。
- 当前版本为每批 12 张、持续匀速左移、7 天换批；失败时保留旧批次或内置示意。

## 实施清单

- [x] 1. 读取当前 `EmptyDarkroom`、缓存与隐私规范，确定独立功能边界。
- [x] 2. 编写许可/来源筛选与缓存删除单元测试，再实现 `darkroomGallery` 和 `darkroomGalleryCache`。
- [x] 3. 在 `EmptyDarkroom` 接入可暂停轮换、到期换批、来源署名与取消清理；保留首屏本地示意。
- [x] 4. 保持 3:2 几何、连续片轨、唯一主按钮和减弱动态，补充必要的局部样式。
- [x] 5. 使用真实 API 和受控浏览器响应验证联网、过期、删除和降级，复跑相关浏览器测试。
- [x] 6. 运行 `npm run typecheck`、相关 Vitest、`npm run build` 与 `git diff --check`，记录未覆盖渲染失败。
- [x] 7. 独立检查缓存所有权和请求隐私，更新 `PRODUCT.md` 与前端规范，报告实际结果。

## 2026-11-17 经典摄影与连续运动更新

- [x] 1. 审核 24 张 Lange、Parks、Evans 公共档案的实际画面、作者与许可，首轮保存 12 张官方缩略图及来源记录。
- [x] 2. 改为按审核作品 ID 获取元数据，兼容可信许可名称的规范 URL 回退，保持隐私与缓存所有权。
- [x] 3. 将逐格计时器改为基于实际片轨距离的线性连续运动，处理暂停、恢复、首尾衔接与减弱动态。
- [x] 4. 更新本地 12 张降级素材、署名、单元和浏览器测试。
- [x] 5. 执行真实网络、桌面/手机、循环、缓存与构建验证，独立检查运动连续性。

## 2026-11-18 最终验证

- 24 张公共领域纪实摄影完成画面、作者和许可审核；首屏 12 张互不重复，另 12 张用于到期换批。
- 片轨以 24 px/s 连续左移，循环距离取第 1 张与第 13 张复制帧的实际偏移；暂停保留当前位置，减弱动态保持静止。
- 真实 Wikimedia 请求已验证：1 次 API、12 张图片、本地 Blob、署名正确，请求无 Cookie 与 Referer；390px 无横向溢出。
- `npm run build` 通过；Playwright 专项 Chromium 7/7、WebKit 7/7 通过；全量 Vitest 364/364 通过。

## 验证命令

```bash
npx vitest run tests/darkroomGallery.test.ts tests/darkroomGalleryCache.test.ts tests/photographyQuotes.test.ts
npx playwright test tests/e2e/frontend-redesign.spec.ts tests/e2e/darkroom-gallery.spec.ts --project=chromium --workers=1
npm run typecheck
npm run build
git diff --check
```

不将光谱／物理渲染失败算作本任务已修复，不把浏览器仿真当作实体手机验收，不自动提交或部署。

## 回滚点

- 换批逻辑不得清空整个 IndexedDB，不得删除内置素材或用户照片。
- 任何不完整新批次都保留旧内容；若换批无法验证，移除该功能而不引入半完成缓存。
- 仅反向移除本任务新增文件与局部绑定，不覆盖用户已有未提交修改。
