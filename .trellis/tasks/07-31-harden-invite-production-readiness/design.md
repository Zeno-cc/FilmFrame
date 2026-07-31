# 邀请码正式环境上线整改设计

## 1. 目标架构

保持现有边界：OpenResty 在返回任何 FilmFrame 静态资源前调用 access service；照片处理继续完全留在浏览器。整改只强化门禁、管理面、代理、测试和运维，不把渲染迁到服务端。

```text
Cloudflare
  -> public vhost -> auth_request -> access service -> SQLite
                   -> valid session -> static container
  -> admin vhost  -> Cloudflare Access Google + Passkey
                   -> source JWT verification -> admin UI/API

Host scheduler
  -> online SQLite backup -> /opt/filmframe/backups/access/
  -> checksum + restore probe -> status/log
  -> delete strictly matched backups older than 30 days
```

## 2. 会话轮换与撤销

- 为 session 增加不可猜测、可公开展示的 `id`、`last_seen_at` 和必要索引；`token_hash` 继续只作为秘密验证值。
- `POST /auth/refresh` 在 `BEGIN IMMEDIATE` 事务中校验旧 token、生成新 256 bit token、替换 hash、更新 `last_seen_at/expires_at` 并提交。
- 只有事务成功后才发送新 Cookie；旧 token 在提交后立即失效。两个标签页并发刷新时只允许一个旧 token 成功，失败响应不得清除新 Cookie。
- 管理 API/页面与 SSH CLI列出会话元数据但绝不返回 token/hash，并支持撤销单个 session。邀请码撤销继续级联全部 session。
- 定时 maintenance 删除已过期或撤销超过保留窗口的 session；授权判断始终依赖查询条件，不依赖清理任务及时运行。

## 3. 邀请码创建幂等性

- 管理页面为每次用户动作生成 `crypto.randomUUID()` 作为 `Idempotency-Key`，提交期间禁用按钮。
- 数据库记录请求键的 hash 与创建出的 invite ID，使用唯一约束和事务保证同一键只创建一次。
- 首次成功响应返回明文一次；重复请求只返回已创建 invite 的元数据和 `replayed: true`，不再次返回明文，也不创建第二个邀请码。
- 若首次响应丢失，管理页通过列表识别该记录，明确提示明文不可恢复并允许撤销后重新生成；不能静默生成第二个有效码。
- 创建成功后前端将返回的 invite 安全插入列表，保持明文区域独立并在清除/pagehide 后不可恢复。

## 4. 错误与健康契约

- `InviteUnavailableError` 保持统一 400 和无 Cookie；其他异常交给中央错误处理器。
- 生产日志只包含固定事件、request ID、操作类型和归一化错误类别，不记录 header、body、邀请码、Cookie、JWT、邮箱或数据库内容。
- `/healthz` 在短事务中创建、读取并删除固定结构的临时健康记录，证明数据库可写和可提交；失败返回 503。健康记录使用独立表或严格命名，测试确认无残留。

## 5. 可信客户端 IP 与限流

- OpenResty 只信任维护的 Cloudflare IPv4/IPv6 CIDR，使用 `real_ip_header CF-Connecting-IP` 与递归解析恢复客户端地址。
- 非 Cloudflare 直连请求不能影响可信地址；源站直连测试发送伪造头后仍以 socket 地址限流。
- OpenResty 向 access service 覆盖 `X-Forwarded-For`/`X-Real-IP`，Express 只信任回环和 Docker 私网代理。
- 保留应用层小窗口限流，并在 Cloudflare 对 `/auth/redeem` 配置第二层规则。CIDR 更新采用校验后原子替换并在 reload 前执行 `openresty -t`。

## 6. 真实代理测试栈

- 新增仅用于测试的 Compose profile，启动静态应用、access service 和带 `auth_request` 的 OpenResty。
- 测试使用隔离临时 SQLite volume、测试 Host 和非 Secure 开发 Cookie；生产配置仍强制 Secure Cookie。
- Playwright/HTTP 测试通过真实代理验证匿名资源、兑换、重载、token 轮换、重复兑换、单会话/邀请码撤销、access 停机 503、恢复和静态 upstream Cookie 清除。
- 图片流程记录请求，断言没有照片数据进入 access service 或外部地址。

## 7. 服务器内备份与恢复

- Compose 将宿主机 `/opt/filmframe/backups/access` 作为独立 bind mount 提供给受控备份命令；它不属于数据库 named volume。
- 每天先调用 SQLite online backup 写入临时文件，校验可打开、`integrity_check`、schema version 和权限后原子重命名，并生成 SHA-256 清单。
- 只删除该固定目录中匹配 `access-YYYYMMDDTHHMMSSZ.sqlite` 且修改时间超过 30 天的普通文件；拒绝符号链接、目录越界和空路径。
- 恢复脚本拒绝覆盖在线数据库，创建新 volume/临时服务验证后再切换；演练检查邀请码、session、撤销和 migration。
- systemd timer 或 1Panel 计划任务每天执行并把成功/失败写入固定状态文件与日志。用户已接受同服务器故障会同时丢失在线数据和备份。

## 8. 容器、发布与回滚

- 前端与 access build/runtime 镜像使用受支持版本，锁 patch 与 digest；最终镜像以 Git commit 标记。
- Compose 为两个服务设置健康检查、`pids_limit`、合理 memory/CPU 限制和 `json-file` 日志 `max-size/max-file`。
- 发布前执行 secret 扫描、完整构建和镜像漏洞扫描，保存镜像 digest、Compose 与 vhost 快照。
- 回滚使用已保存 digest，不从变化后的工作区重建。数据库迁移前先备份，schema 不兼容时按恢复演练切换新卷。

## 9. Cloudflare 与生产切换

1. 创建管理 DNS 和 Access 应用，配置精确邮箱、Google 与 Independent MFA AND 策略，登记两个 Passkey。
2. 配置 Cloudflare IP 恢复、兑换限流、整站 cache bypass，并 purge 旧缓存。
3. 在 1Panel 当前 vhost 内合并配置，保存原文件并运行活动 OpenResty `-t`。
4. 先验证管理域名和 JWT 正反矩阵，再启用公开门禁。
5. 验证匿名真实资源、源站直连、授权/撤销、故障关闭、其他 vhost 和照片零上传。

## 10. 回滚边界

- 任何失败都保持应用端口回环绑定、Cloudflare cache bypass 和匿名拒绝；不得回滚为公开静态站。
- 可回滚到前一镜像 digest或维护页；数据库仅从已验证的服务器备份恢复。
- 同服务器备份不构成异地灾备，交付文档必须保留这一限制。
