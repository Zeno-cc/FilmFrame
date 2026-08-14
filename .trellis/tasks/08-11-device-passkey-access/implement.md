# 实施计划

## 1. Session hardening

- [x] 修改 `refreshSession` 保留 token hash，只更新使用时间和滚动过期时间。
- [x] 更新 session route/store 测试，覆盖重复刷新、响应丢失后原 token 仍有效、过期/撤销失败关闭。
- [x] 更新 backend access-control spec 中关于 refresh 的旧令牌轮换描述。

## 2. Passkey backend

- [x] 增加 SimpleWebAuthn server/browser 依赖及 Access client bundle 构建产物。
- [x] 编写 006 migration、challenge/credential store、session recovery helper。
- [x] 实现 registration options/verify、authentication options/verify 和 setup route。
- [x] 添加 exact origin/CSRF/Host、challenge 一次性、TTL、credential/invite 状态、速率和敏感字段边界。
- [x] 扩展管理员列表和单个 Passkey 撤销 API/页面。

## 3. Passkey frontend

- [x] 更新 Access SSR 页、setup 页和同源 client bundle，覆盖能力检测、loading、失败、重试、稍后设置和焦点管理。
- [x] 在应用 MoreMenu 添加设备授权入口，不在 localStorage 保存授权信息。
- [x] 验证 Cookie 有效时完全无感，Cookie 丢失时 Passkey 恢复不要求重新输入邀请码。

## 4. Cross-layer verification

- [x] 更新 release manifest schema transition 和部署合同，确认 schema 5 -> 6 向后兼容。
- [x] 运行 Access Node 22 测试、类型检查、构建、根测试、Playwright、deployment verify、Compose config 和 diff check。
- [ ] 使用 Chromium virtual authenticator 覆盖注册/恢复/撤销；使用桌面 Safari/Edge 可行性检查和手工兼容性记录，不把模拟器结果写成真机 PASS（当前仓库无该自动化脚本，需后续专门兼容性任务）。
- [x] 核对网络请求不包含照片/EXIF/Blob/渲染结果，公开资源仍由 OpenResty auth_request 保护。

## Validation commands

```bash
npm --prefix server/access test
npm --prefix server/access run typecheck
npm --prefix server/access run build
npm run check
npm run test:e2e
npm run verify:deployment
docker compose config --quiet
git diff --check
```

## Risk and rollback points

- 依赖构建或 WebAuthn 解析失败：不启用入口，保留 Cookie/邀请码路径。
- migration 失败：停止发布，恢复 SQLite 备份，不直接修改生产数据库。
- Passkey 注册/恢复回归：回滚 Access client route 和新表代码；旧 session/邀请码表不受影响。
- 线上切换属于后续发布任务，必须通过可信 Release/updater，不手工覆盖生产容器。
