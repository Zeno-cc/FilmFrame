# 邀请码正式环境审查证据

## 结论

2026-07-31 深度审查结论为“暂缓正式上线”。核心门禁没有发现直接前端绕过，但代码、真实代理链路、Cloudflare 外部策略和运维恢复尚未形成闭环。

## 已确认问题

1. 邀请码实现仍未提交，不能从可追溯 Git 基线构建生产镜像。
2. `scripts/verify-invite-deployment.mjs:223` 在未提供活动 OpenResty 时跳过检查并可返回成功，模板通过不等于生产配置通过。
3. `tests/e2e/device-access.spec.ts:3` 只 mock `/auth/refresh`，没有经过真实 access service 与 `auth_request` 代理。
4. `server/access/src/accessJwt.ts:34` 验证 JWT 与管理员邮箱，但 Google + Independent MFA 是否同时成立依赖 Cloudflare Access 外部策略。
5. `server/access/src/routes/publicRoutes.ts:78` 将全部兑换异常映射为邀请码 400，掩盖 SQLite/I/O 故障。
6. `server/access/src/views/html.ts:123` 未阻止并发创建；网络重试或双击可能创建多个只能显示最后一个明文的邀请码。
7. `server/access/src/middleware/rateLimit.ts:21` 依赖代理后的 IP；OpenResty 模板未证明已可信恢复 `CF-Connecting-IP`，可能按 Cloudflare 边缘 IP 聚合限流。
8. `compose.yaml:33` 只有数据库 named volume；备份、恢复、日志轮转、资源上限和不可变镜像回滚尚未闭环。

## 本轮验证证据

- `npm run check:all`：前端 166 项、access service 32 项测试通过，类型检查与构建通过。
- `npm run test:e2e`：40 项通过，但门禁用例仍是 Vite mock 测试。
- 根项目与 access service 的生产依赖审计：官方 npm registry 返回 0 个漏洞。
- `docker compose config` 与默认部署模板检查通过。
- 默认部署验证明确跳过活动 OpenResty；完整 Docker 构建因 Docker Hub token 网络超时未完成，access 镜像构建成功。
- 匿名公网探针显示 `https://filmframe.astrocean.space/` 与 `/access` 均返回静态页面 200，管理域名未解析，门禁尚未部署。

## 已接受风险

- 访客使用长期 bearer Cookie，不做硬件设备绑定；通过 token 轮换和会话撤销降低风险。
- 备份只保存在同一服务器的宿主机专用目录并保留 30 天；不覆盖整机、宿主磁盘或服务商级故障。
