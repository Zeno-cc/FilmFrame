# 邀请码正式环境上线整改

## Goal

把现有邀请码门禁从“代码候选版本”提升为可审计、可回滚、可恢复并经过真实生产链路验收的正式版本。上线后，匿名用户无法取得 FilmFrame 应用或素材，管理员必须同时满足精确 Google 身份和 Passkey，合法设备可以长期使用且管理员可可靠撤销。

## Background

- 父任务：`.trellis/tasks/07-30-secure-invite-access`，当前仍在进行且相关代码尚未提交。
- 2026-07-31 深度审查确认邀请码、会话、JWT、CSRF、Host 校验、SQLite 原子核销和 OpenResty fail-closed 的基础设计合理，未发现可直接从前端状态绕过的路径。
- 当前公网 `https://filmframe.astrocean.space/` 与 `/access` 对匿名请求均返回静态应用 `200`，管理域名尚未解析，说明门禁尚未部署。
- `npm run check:all`、40 项 Playwright、两套生产依赖审计和 Compose 静态检查通过；默认部署验证跳过活动 OpenResty 与外网探针，完整前端镜像构建曾因 Docker Hub 网络超时未完成。

## Requirements

### R1. 可追溯发布基线

- 从父任务中准确拆分邀请码前端、access service、Docker、OpenResty、测试、运维文档和 Trellis 规范，排除无关 Trellis 平台升级改动。
- 所有正式部署内容必须先通过检查并提交；不得从未提交的脏工作区直接构建生产镜像。
- 发布镜像使用受支持的 Node/Nginx 版本，锁定精确版本与 digest，并使用 commit/tag 标识不可变发布物。

### R2. 邀请码与管理端可靠性

- `server/access/src/routes/publicRoutes.ts` 只把 `InviteUnavailableError` 映射为统一 400；SQLite/I/O/未知异常进入中央错误处理，返回脱敏 500 并记录 request ID 与安全错误类别，不记录邀请码、Cookie、JWT 或请求体。
- 健康检查必须覆盖数据库可写性，而不只是 `SELECT 1` 可读性，同时不得留下持久测试数据。
- 管理端生成邀请码期间禁用重复提交；服务端使用幂等键保证重试或并发提交只创建一个邀请码。
- 创建成功后管理列表立即显示新记录，管理员可以核对和撤销，同时邀请码明文仍只显示一次。
- 普通访客继续使用长期 HttpOnly Cookie，不增加 WebAuthn 注册或设备指纹。每次成功续期必须在数据库事务中轮换随机 token，旧 token 立即失效。
- 管理端和 SSH CLI 提供按会话撤销能力；邀请码撤销仍级联撤销其全部会话。

### R3. 代理、限流与源站边界

- 只有来自已验证 Cloudflare IP 段的请求可以使用 `CF-Connecting-IP` 恢复客户端地址；直连源站不能伪造客户端 IP。
- 兑换限流按真实客户端生效，并在 Cloudflare 边缘增加第二层限制；不能因共享 Cloudflare 边缘 IP 误封其他访客。
- 静态容器和 access service 继续只绑定回环地址；内部路由、会话 Cookie 和 Access JWT 不得转发给不需要它们的 upstream。
- access service、SQLite 或 JWKS 故障时继续失败关闭，不能匿名回退到静态应用。

### R4. 管理员强认证

- Cloudflare Access 管理应用只允许精确管理员邮箱，要求 Google 登录与 Independent MFA WebAuthn 同时成立，禁止 `Everyone` 和 IdP MFA 替代。
- 至少登记两个可用 Passkey，避免单凭据锁死。
- 源站继续验证 Access JWT 的 RS256、exact issuer、audience、`exp`、`nbf` 和邮箱；若 Cloudflare 提供稳定且可验证的认证强度声明，则一并验证。
- 上线验收必须包含：白名单 Google + Passkey 成功；只有 Google、只有 Passkey、非白名单账号、错误 issuer/audience 和伪造断言全部失败。

### R5. 真实端到端测试

- 新增真实代理测试栈，启动静态容器、access service 和具备 `auth_request` 的 OpenResty/Nginx，不得只在 Vite 中 mock `/auth/refresh`。
- 自动验证匿名首页、JS、CSS、Worker、overlay、mask 均被拦截；邀请码兑换后可进入、刷新后继续使用、重复兑换失败、撤销后下一请求失败。
- 自动验证 access service 停机时返回 503、恢复后可继续使用，并验证会话 Cookie 不进入静态 upstream。
- 保留完整 FilmFrame 上传、Worker 渲染、导出和“不上传照片”的浏览器回归。

### R6. 数据保护、备份与恢复

- 每天使用 SQLite 在线备份生成一致性副本，写入宿主机专用目录，不写回数据库 named volume；备份目录与文件使用最小权限。
- 只保留最近 30 天备份，清理任务只能删除约定目录内符合严格命名规则且超过保留期的文件，并记录执行结果。
- 提供可执行的备份、校验、恢复到新卷和回滚脚本/操作手册。
- 实际恢复演练必须验证邀请码状态、有效会话、撤销状态、migration idempotency 和文件权限。
- 清理或归档过期会话，避免数据库和管理列表无限增长。

### R7. 容器与运维加固

- Compose 配置容器日志轮转、内存、CPU 和 PID 边界；异常洪峰不能耗尽宿主磁盘。
- 提供磁盘、数据库、容器健康和备份失败的可执行监控/告警入口。
- 保存前一版镜像 digest、Compose、两个目标 vhost、证书引用和数据库备份，实际演练一次应用与数据库回滚。
- 完整 Docker 构建和镜像漏洞扫描通过；不把 `.env`、数据库、邀请码、JWT、Cookie 或第三方密钥写入构建上下文、镜像层或日志。

### R8. 生产部署与验收

- 在 1Panel/OpenResty 现有站点结构内合并配置，不覆盖或破坏其他 vhost；reload 前必须 `openresty -t`。
- 创建管理 DNS、复用正确证书，配置 Cloudflare Access、整站 cache bypass，并 purge 旧公开缓存。
- 外网 HTTPS、源站直连、真实静态资源、Cloudflare 缓存、管理员登录矩阵、邀请码兑换/撤销、access 停机和其他 vhost 回归全部保存无秘密证据。
- 只有所有自动和外部验收通过后，才能将父任务和本整改任务标记完成。

## Out Of Scope

- 不把照片、EXIF、构图或渲染迁移到服务端。
- 不承诺阻止已授权用户保存或复制已下载的前端代码与素材。
- 不新增普通用户账户、邮箱密码登录、付费系统或多管理员 RBAC。
- 不用前端混淆、设备指纹或 localStorage 充当权限边界。
- 不自动下载备份到管理者电脑，也不向其他服务器或云存储同步备份。

## Acceptance Criteria

- [ ] 邀请码功能的全部代码、测试和部署配置以独立可审查提交存在，生产镜像可追溯到 commit 与 digest。
- [ ] 数据库故障返回脱敏 500 并产生不含秘密的诊断日志；无效邀请码仍统一 400。
- [ ] 双击、网络重试和并发创建只生成一个邀请码，管理列表即时显示且明文只展示一次。
- [ ] Cloudflare 代理和源站直连下的客户端 IP、限流与 Host/JWT 信任边界均通过正反测试。
- [ ] 真实代理 E2E 覆盖匿名资源阻断、兑换、持久会话、撤销、服务故障关闭和完整图片工作流。
- [ ] Google + Passkey 管理登录正反矩阵在移动端和桌面端通过并保存验收证据。
- [ ] SQLite 每日在线备份写入服务器宿主机专用目录、自动校验并只保留 30 天；清理边界和失败日志经过测试。
- [ ] 从服务器备份恢复到新卷的演练通过，邀请码、有效会话、撤销状态、迁移与权限保持正确。
- [ ] 容器日志、资源、健康、磁盘和备份监控生效；完整镜像构建和漏洞扫描通过。
- [ ] 活动 OpenResty `-t`、回环端口、外网 HTTPS、源站直连、Cloudflare cache、旧缓存清理和其他 vhost 回归全部通过。
- [ ] `npm run check:all`、`npm run test:e2e`、真实代理 E2E、部署验证和 `git diff --check` 全部通过且无跳过的生产检查。

## Key Decisions

- 普通访客采用强化的长期 bearer Cookie 模型：保留一次输入邀请码、持续使用自动续期的体验，通过 token 轮换和按会话撤销降低重放窗口；不引入访客 WebAuthn、普通用户账户或设备指纹。
- 管理员仍必须使用 Cloudflare Access 的精确 Google 身份与 Independent MFA Passkey；访客与管理员认证强度明确分层。
- 备份只保留在同一台服务器：数据库 named volume 之外的宿主机目录每日备份，保留 30 天并定时清理。该方案覆盖误删、错误迁移和卷级故障，不覆盖整机、宿主磁盘或服务商级故障；用户已明确接受此残余风险。

## Notes

- 本任务为复杂任务；产品决策已收敛，`design.md` 与 `implement.md` 已补齐。
- 当前评审识别的 400 天 bearer Cookie 是已接受的产品风险而非前端绕过：`Secure`、`HttpOnly` 与 `SameSite=Strict` 无法阻止本机恶意软件、扩展或浏览器配置备份窃取并跨设备重放 Cookie；token 轮换只能缩短重放窗口，不能形成硬件绑定。
- 同服务器备份是已接受的灾备边界；正式交付不得将其描述为异地备份或完整灾难恢复。
