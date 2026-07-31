# 开发、测试与部署

> 最后核验：2026-07-30。仓库已包含邀请码门禁实现和部署模板，但 Google、Cloudflare 与生产 OpenResty 配置仍需外部完成。

## 运行环境

| 部分 | 版本/约束 |
| --- | --- |
| React/Vite 前端 | Node.js `>=20` |
| Access sidecar | Node.js `>=22 <23`，生产镜像固定 Node 22 |
| 数据库 | SQLite，由 `better-sqlite3` 提供 |
| 容器 | Docker Compose v2 |
| 入口代理 | 具备 `http_auth_request_module` 的 1Panel/OpenResty |

Access 包含原生 Node 模块，不能把在 Node 22 下安装的 `server/access/node_modules` 交给 Node 26 运行，反之亦然。切换 Node major 后必须在 Node 22 环境重新执行 `npm --prefix server/access ci`。

## 本地安装与开发

前端：

```bash
npm ci
npm run dev
```

Access sidecar：

```bash
npm --prefix server/access ci
npm --prefix server/access run dev
```

sidecar 的必需配置见 `server/access/.env.example`。本地 HTTP 只能在明确的 development 环境使用 `SECURE_COOKIES=false`；生产配置强制使用安全 Cookie。真实 Cloudflare team domain、audience 和管理员邮箱只写未提交的环境文件或部署平台，不写文档、日志和镜像。

## 构建与质量门禁

```bash
npm test                         # 根 Vitest：24 文件、165 项测试
npm run typecheck
npm run build
npm run check                   # 根测试 + 类型检查 + Vite 生产构建

npm --prefix server/access test # Node test：27 项，要求 Node 22
npm run check:access            # sidecar 测试 + 类型检查 + 构建
npm run check:all               # 前端和 sidecar 完整检查

npm run test:e2e                # Playwright 浏览器流程
git diff --check
```

`server/access/tests/all.test.ts` 在单一 Node test 进程中导入 5 个测试模块，并将 concurrency 固定为 1。这样既覆盖 SQLite 并发事务，又避免 `better-sqlite3` 在多测试子进程退出时发生本机不稳定。

根 `tsconfig.json` 明确排除 `server/access`；根构建不会误用浏览器 TypeScript 配置检查 Express 代码，`check:all` 会显式检查两边。

## Docker 构建

```bash
cp .env.example .env
# 只在本地 .env 填写非公开部署值，不提交

docker compose config
docker compose build
docker compose up -d
docker compose ps
npm run verify:deployment -- --live
```

前端镜像使用 Node 20 build stage 和 Nginx runtime。Access 镜像使用 Node 22；build stage 安装 `python3`、`make`、`g++` 并从源码构建 `better-sqlite3`，runtime 不保留编译工具。

Compose 安全合同：

- `filmframe` 只绑定 `127.0.0.1:18082`；
- `access` 只绑定 `127.0.0.1:18083`；
- 两者加入 `filmframe_private`；
- SQLite 位于 `filmframe_access_data:/data`；
- access runtime 使用非 root 用户、只读根文件系统、`no-new-privileges` 并丢弃全部 capabilities；
- `.env`、数据库和凭据不进入 build context 或镜像层。

## 部署验收脚本

默认命令只检查仓库配置，不发送邀请码、Cookie、JWT 或管理员身份：

```bash
npm run verify:deployment
```

容器启动后检查回环 health：

```bash
npm run verify:deployment -- --live
```

生产服务器上还应传入实际 URL 和 OpenResty 二进制，验证活动配置、公开 HTTPS 和直连源站边界：

```bash
npm run verify:deployment -- \
  --live \
  --site-url https://filmframe.astrocean.space \
  --admin-url https://filmframe-admin.astrocean.space \
  --origin-url https://ORIGIN_ADDRESS \
  --admin-origin-url https://ORIGIN_ADDRESS \
  --openresty-bin /path/to/openresty
```

`ORIGIN_ADDRESS` 和二进制路径属于服务器环境，不应硬编码进仓库。生产探针验证：匿名站点 303 到 `/access`、邀请页不预载 Vite bundle、内部 endpoint 隐藏、真实素材匿名不可取得、Cloudflare cache bypass、匿名管理访问进入 Access、直连管理源站缺少 JWT 时被拒绝。

## 生产切换顺序

以下步骤同时完成前，不启用线上门禁：

1. 备份当前 Compose、FilmFrame vhost、证书引用和数据库目标目录。
2. 在 Google Cloud 创建 Web OAuth Client；Client Secret 只录入 Cloudflare Zero Trust，启用 PKCE。
3. 在 Cloudflare Access 创建管理应用：Include 精确管理员邮箱，Require Google 登录方式。
4. 启用 Independent MFA WebAuthn，关闭 IdP MFA AMR 复用，并至少登记两个凭据。
5. 为管理子域创建橙云 DNS；确认现有泛域名或站点证书覆盖两个 hostname。
6. 构建并启动两个仅回环容器，运行迁移和 health 检查，确认公网端口拒绝连接。
7. 将 `ops/openresty/` 示例合并到两个对应 1Panel vhost，只替换真实证书路径，不修改其他站点。
8. 对 FilmFrame hostname 设置整站 cache bypass，关闭陈旧公开缓存路径并 purge 旧缓存。
9. 执行 `openresty -t`；成功后再 reload。
10. 运行部署脚本和手工验收矩阵，最后回归其他 1Panel vhost。

不能把“Cloudflare 橙云已开启”当作源站授权。公开站点仍依赖 OpenResty session subrequest，管理站点仍由 Node 逐请求验证 Access JWT。

## 线上手工验收

- 匿名 `/`、已知 JS、Worker、overlay、mask 都不能返回应用字节。
- 有效邀请码成功；随机、过期、撤销、已用邀请码统一失败且不设置 Cookie。
- Cookie 篡改、会话过期、用户清理站点数据和管理员撤销邀请后，下一请求立即失败。
- 鉴权容器停止时公开应用返回 503，而不是匿名静态页面。
- 白名单 Google + 已登记 WebAuthn 可进入管理端；缺任一因素、非白名单账号或错误 audience 均拒绝。
- 直连源站并设置生产 Host/SNI 仍不能绕过公开或管理鉴权。
- `CF-Cache-Status` 为 BYPASS/DYNAMIC，旧 hashed asset URL 匿名不可读。
- 完整上传、Worker/主线程渲染、长条、JPEG/PNG、ZIP 和设备授权续期流程正常。
- 浏览器 Network 中没有照片、EXIF、Blob 或渲染结果上传请求。
- iOS Safari、Android Chrome、桌面 Safari/Chrome/Edge 至少完成一次管理登录和邀请码操作。

## 数据备份与 SSH 应急

只通过服务器 SSH 或 `docker compose exec` 使用 sidecar CLI：

```bash
node dist/src/cli.js create --label "临时访客"
node dist/src/cli.js list
node dist/src/cli.js revoke <invite-id>
docker compose --profile maintenance run --rm --no-deps access-backup \
  node dist/src/cli.js backup /backups/access-$(date -u +%Y%m%dT%H%M%SZ).sqlite
```

`create` 会在 stdout 显示一次邀请码明文，执行时应避免 shell 历史和会话录屏。手工 backup 通过无网络的短生命周期 Compose profile 使用 SQLite 在线备份并写入独立的 `/backups` 宿主机挂载；长期运行的 access 服务不能修改该目录。正式定时任务应运行 `ops/backup/backup-access.sh`，同时完成完整性、校验和、保留期与状态检查。备份成功不等于可恢复；上线前和定期运维都要做独立恢复演练。

## 当前工程门禁缺口

- 仓库尚无正式 CI、coverage、ESLint/format、tag/CHANGELOG 自动化和发布流水线。
- Playwright 以 Chromium 为主，Safari/Firefox/移动设备仍需手工或新增 CI 覆盖。
- Canvas/OffscreenCanvas 尚无完整像素级视觉等价性基线。
- Cloudflare Access、Google OAuth Client、DNS、证书和线上 OpenResty 属于外部状态，仓库测试无法证明其已经正确配置。

因此发布证据必须同时包含仓库检查、Docker 构建、活动 OpenResty `-t`、回环探针、直连源站探针和外网 HTTPS 验收，不能只引用 `npm run build`。
