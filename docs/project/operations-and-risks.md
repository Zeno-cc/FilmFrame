# 风险、排障与上线控制

> 最后核验：2026-07-30。本文区分“仓库已实现”和“生产外部状态”，避免把配置模板误认为已经上线。

## 当前状态

| 范围 | 状态 |
| --- | --- |
| Express/SQLite 邀请码与会话 sidecar | 已实现 |
| 邀请页、管理页、SSH CLI 和设备授权续期 | 已实现 |
| OpenResty 公开/管理 vhost 示例 | 已实现，尚需合并到线上目标站点 |
| Compose 回环端口、私网、持久卷与容器加固 | 已实现 |
| 根 Vitest | 2026-07-30 实测 24 文件、165 项通过 |
| Access 自动化 | 27 项；必须在 Node 22 和匹配 ABI 的原生依赖环境执行 |
| Cloudflare Google IdP、精确邮箱 policy、Independent MFA | 外部配置，尚需生产预检和验收 |
| 管理 DNS、证书路径、缓存 bypass/purge、活动 OpenResty reload | 外部配置，尚需生产实施和验收 |

## 不可降低的安全边界

### 不能只做前端弹窗

React state、localStorage、打包进 JS 的邀请码或密钥都可被用户修改或提取。真正的边界是 OpenResty 在返回任何应用字节前调用 access sidecar。首页受保护但 JS、Worker 或胶片素材公开，仍然等于门禁可绕过。

### 鉴权必须失败关闭

access sidecar 停机、超时、数据库异常或返回 5xx 时，OpenResty 必须返回 503/拒绝，不能退回静态 upstream。`auth_request` 内部 Host 必须为 `access`，否则 sidecar 的 Host allowlist 会拒绝正常子请求。

### 管理断言必须在源站验签

Cloudflare IP、橙云状态或 `Cf-Access-Jwt-Assertion` 请求头的存在都不是授权。Node 必须验证 RS256 签名、exact issuer、管理应用 audience、`exp`/`nbf` 和精确管理员邮箱。JWKS 获取或密钥轮换失败时拒绝请求。

### 图片隐私边界不能被门禁侵蚀

access sidecar 不得新增图片、EXIF、构图、渲染结果或 Object URL 接口。普通图片工作流仍应只产生同源素材请求。生产验收必须用 Network 记录证明照片没有上传，而不是只依据代码说明。

### 门禁的安全上限

合法会话取得静态应用后，可以保存或转发已下载的前端代码和素材。本期只保护官方分发入口；不能用混淆、前端加密或设备指纹夸大保护能力。

## 上线前高风险项

### 1. 外部认证能力和锁死风险

必须先确认当前 Cloudflare Zero Trust 账号可用 Google IdP、Independent MFA biometrics/security key 和目标 policy。先在管理域名验证以下矩阵，再切公开站点：

- 精确白名单 Google + WebAuthn：通过；
- 白名单 Google、没有 WebAuthn：拒绝；
- 非白名单 Google + WebAuthn：拒绝；
- 缺失/伪造/过期/错误 issuer 或 audience 的 JWT：拒绝。

至少登记两个 WebAuthn 凭据。管理端锁死时使用 SSH CLI，不得临时公开管理 API、关闭源站 JWT 验证或把管理员密码写进前端。

### 2. 公网端口与源站直连

Compose 必须显示 `127.0.0.1:18082->80` 和 `127.0.0.1:18083->3000`，不能出现 `0.0.0.0` 或 `[::]` 发布。还要检查宿主机防火墙和旧容器，确认历史应用端口不再公网监听。

直连源站 443 并伪造 Host/SNI 时，公开站点仍应 303 到 `/access`，管理站点缺有效 Access JWT 时应 401/403。

### 3. Cloudflare 旧缓存

门禁启用前公开缓存的 hashed JS、Worker、overlay 或 mask 可能绕过新鉴权。切换前必须：

1. 对完整 FilmFrame hostname 设置 cache bypass；
2. purge 既有缓存；
3. 确认源站与边缘都返回 `private, no-store`；
4. 匿名请求真实已知素材路径，验证不返回资源且 `CF-Cache-Status` 为 BYPASS/DYNAMIC。

回滚也不能恢复匿名公共缓存。

### 4. SQLite 数据与备份

数据库必须位于 named volume，目录 `0700`、数据库/WAL/SHM `0600`。备份使用 SQLite 在线 backup，不要在高写入时直接复制单个主文件。恢复演练需验证邀请码状态、会话、撤销级联和 migration idempotency。

数据库只存哈希并不意味着可以公开：标签、时间和访问关系仍属于运维数据，备份必须受限。

### 5. 秘密泄漏

不得记录或提交 Google Client Secret、Cloudflare token、Access JWT、Cookie、邀请码明文、请求 body 或完整管理员身份。重点检查：

- `.env` 与 shell history；
- OpenResty access/error log；
- Docker build args、image history 和 Compose rendered config；
- CI 输出、测试 fixture、截图和问题报告；
- SQLite 表和备份包。

邀请码明文只允许出现在创建响应或 SSH CLI stdout 一次，交付后立即从管理页清除。

### 6. Node 原生模块 ABI

`better-sqlite3` 是原生模块。典型错误为 `ERR_DLOPEN_FAILED`、`NODE_MODULE_VERSION ...` 不匹配，原因通常是用另一 Node major 安装/运行。处理方式：

```bash
# 确认当前 node --version 为 22.x
npm --prefix server/access ci
npm run check:access
```

不要把本机 `node_modules` 复制进镜像。Access Dockerfile 会在 Node 22 build stage 安装编译工具并从源码构建，runtime 只复制生产依赖和编译结果。

## 常见故障排查

### 匿名用户直接看到应用

1. 检查请求是否经过预期的 FilmFrame OpenResty vhost。
2. 检查 `location /` 是否实际执行 `auth_request /_filmframe_session_check`。
3. 匿名请求真实 `/assets/*`、Worker、overlay 和 mask，而不是只测首页。
4. 检查 Cloudflare 旧缓存和其他更高优先级 location。
5. 检查静态容器端口是否仍对公网开放。

### 所有人都被拒绝或返回 503

1. `docker compose ps` 检查 access health。
2. 从宿主机请求 `http://127.0.0.1:18083/healthz` 并设置 `Host: access`。
3. 确认内部 subrequest 传 `Host: access`，而不是公开域名。
4. 检查 SQLite volume 权限、migration 和磁盘空间。
5. 查看脱敏后的固定事件日志，不要临时打印 Cookie 或请求 body。

### 邀请码无法兑换

1. 确认请求是 `application/x-www-form-urlencoded` POST，body 未超过 4 KiB。
2. 确认表单 nonce 签名有效且未过 10 分钟。
3. 检查邀请码是否已兑换、过期或撤销；对用户仍返回统一失败文案。
4. 检查反代是否保留 exact Host/HTTPS 语义及 Cookie Set-Cookie。
5. 并发问题用 20 路一次性兑换测试复现，不手工修改数据库计数。

### 管理端循环登录或 401

1. 检查 Cloudflare Access 应用 hostname、audience 和 team domain 是否与 sidecar 环境一致。
2. policy 必须 Include 精确邮箱并 Require Google，不能 Include Everyone。
3. 检查 Independent MFA 是否开启且 IdP MFA AMR 复用已关闭。
4. 确认 OpenResty 转发原始 `Cf-Access-Jwt-Assertion`，但清空普通 Cookie。
5. 检查服务器时钟；JWT `exp`/`nbf` 对时钟漂移敏感。
6. 未知 `kid` 应触发远程 JWKS 刷新，不能写死旧公钥。

### 设备授权没有自动续期

1. 浏览器进入应用后必须发送同源 `POST /auth/refresh`、Cookie 与 `X-FilmFrame-CSRF: 1`。
2. Origin 必须精确等于公开站点 HTTPS origin。
3. 成功应返回 204，并原子轮换 256-bit token、更新数据库会话与 HttpOnly Cookie 的 400 天有效期；提交后旧 token 必须立即失效。
4. 管理员撤销所属邀请码后，续期与后续访问都必须失败；不得由前端状态绕过。

### 图片处理异常

门禁与渲染是独立层。先确认应用资源已授权加载，再按原有顺序检查 MIME/尺寸解码、同源胶片素材、Worker 能力、主线程 fallback、Canvas 预算、stale 结果和 Object URL 回收。不要通过上传用户照片到 sidecar 来规避浏览器兼容问题。

## 回滚原则

上线前保存时间戳备份：当前 Compose、两个目标 OpenResty vhost、证书引用和迁移前 SQLite。任何 reload 前先运行 `openresty -t`。

发生故障时：

1. 恢复上一版应用镜像或目标 vhost；
2. 保持静态/access 端口只监听回环；
3. 保持 Cloudflare cache bypass 和旧缓存清理结果；
4. 若管理端不可用，使用 SSH break-glass CLI；
5. 若数据迁移失败，从已验证备份恢复 SQLite；
6. 无法安全恢复时返回维护页/503，不开放匿名静态站作为捷径；
7. 回归其他 1Panel vhost 的状态、证书和内容。

回滚成功的标准不是“页面能打开”，而是公开入口仍不可匿名绕过、管理入口仍要求双因素、照片仍不上传，且邀请码/会话状态一致。

## 发布证据

每次生产切换至少保存以下不含秘密的结果：

```bash
npm run check:all
npm run test:e2e
git diff --check
docker compose config
docker compose build
npm run verify:deployment -- --live
openresty -t
```

再补充外网 HTTPS、直连源站、Cloudflare cache、Google + WebAuthn、管理员撤销、站点数据清理、access 停机 fail-closed、数据库恢复和其他 vhost 回归结果。缺少这些外部证据时，只能说仓库实现完成，不能说生产门禁完成。
