# 邀请码正式环境上线整改实施计划

## Phase 0: 隔离与基线

1. 核对父任务全部邀请码相关差异，排除 Trellis 平台升级和其他无关文件。
2. 更新 access-control 规范以反映 token 轮换、会话撤销、幂等创建、可写健康检查和服务器备份契约。
3. 先运行现有 `npm run check:all`、`npm run test:e2e`、部署验证与依赖审计，保存基线。

## Phase 1: 数据模型与核心服务

1. 新增 migration：session 公共 ID/last_seen、幂等请求记录、健康检查支持和必要索引。
2. 实现原子 token 轮换、单会话撤销、过期数据 maintenance，并补并发与迁移测试。
3. 区分邀请码业务失败与数据库/未知异常，增加脱敏结构化日志和数据库可写 health check。
4. 实现管理创建幂等契约及其丢响应/重试行为。

## Phase 2: 管理页面与 CLI

1. 创建期间锁定表单，使用稳定 idempotency key，处理 replayed/明文丢失状态。
2. 创建后即时更新列表；加入 session 列表和单会话撤销，保持移动端可用与无 XSS。
3. CLI 增加 session list/revoke、maintenance、backup verify/restore 辅助命令。

## Phase 3: 代理与真实 E2E

1. 增加受信 Cloudflare CIDR 配置/更新流程和直连伪造头防护。
2. 增加测试代理 Compose profile 与隔离数据库。
3. 覆盖匿名资源、兑换、重载、轮换、重复创建、撤销、Cookie 清除、access 停机/恢复和照片零上传。
4. 将真实代理测试加入 `check:all` 或独立的发布阻断命令，禁止生产验证出现 skip。

## Phase 4: 备份、容器和发布物

1. 实现宿主机备份目录、在线备份、完整性/校验和验证、30 天严格清理与状态日志。
2. 实现恢复到新卷和 migration/权限/业务状态验证，实际运行恢复演练。
3. 锁定受支持基础镜像 patch/digest，配置资源限制、日志轮转和健康检查。
4. 完成完整镜像构建、secret 扫描、漏洞扫描，并记录 commit/tag/digest 回滚信息。

## Phase 5: Cloudflare、1Panel 与生产验收

1. 备份当前线上 Compose、两个目标 vhost、证书引用与数据库状态。
2. 配置管理 DNS、Google + Independent MFA、两个 Passkey、可信 IP、边缘限流、cache bypass/purge。
3. 合并 1Panel/OpenResty 配置，运行活动 `openresty -t` 后 reload。
4. 运行外网 HTTPS、源站直连、真实资源、授权/撤销、故障关闭、备份恢复和其他 vhost 矩阵。
5. 所有证据无秘密且无跳过后，提交代码，归档父任务与本任务并记录会话。

## Validation Commands

```bash
npm ci
npm --prefix server/access ci
npm run check:all
npm run test:e2e
npm run test:e2e:access-proxy
docker compose config --quiet
docker compose build --pull
npm run verify:deployment -- --live
git diff --check
```

生产服务器额外执行活动 OpenResty 检查、镜像漏洞扫描、备份/恢复演练和带完整生产参数的外网验证命令。任何 skip、网络失败、配置占位符、未提交文件或验收失败都阻止上线。

## Risky Files And Rollback Points

- `server/access/migrations/*`：先备份再迁移；不得修改已应用 migration。
- `server/access/src/store.ts`、`sessionCookie.ts`：并发 token 轮换必须避免清除另一标签页刚写入的新 Cookie。
- `ops/openresty/*` 与 1Panel 活动 vhost：先备份并 `-t`，不能覆盖其他站点。
- `compose.yaml`、Dockerfile 与 volume：不能删除或重建现有数据卷；恢复必须先在新卷验证。
- Cloudflare Access/cache/DNS：先完成管理面正反验证，再切公开门禁；回滚保持匿名拒绝。

## Start Gate

- `prd.md`、`design.md`、`implement.md` 已通过最终审阅。
- `implement.jsonl` 和 `check.jsonl` 均为真实上下文条目。
- 用户在看到最终规划摘要后明确批准实施。
