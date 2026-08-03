# 生产更新架构评审结论

## 推荐方案

采用宿主机 `systemd` updater，通过 Unix socket 向 Access 管理服务暴露极小的结构化 RPC。浏览器只访问现有 Cloudflare Access 管理域名；Access 继续验证 JWT、精确管理员邮箱、Origin 与 CSRF，随后转发白名单动作。

updater 是唯一拥有 `/opt/filmframe`、Docker Compose、备份和 release 切换权限的组件。它不开放 TCP 端口，不接受任意 Shell、路径、URL 或镜像参数，也不修改其他 1Panel/OpenResty 站点。

## 三种执行器边界比较

### Access 挂载 Docker socket：拒绝

Docker socket 等同宿主机 root。Access 一旦被攻破即可读取其他容器秘密、挂载宿主文件系统或启动特权容器，与现有非 root、只读根文件系统和能力全降的边界冲突。

### 独立 updater 容器：不作为首选

如果仍挂 Docker socket，root 风险只是从 Access 转移到 updater；同时还要处理宿主 release 目录、systemd 备份、软链接和 OpenResty 配置测试，容器化会增加生命周期和路径复杂度。

### systemd updater + Unix socket：推荐

最符合当前不可变 release、`current` 软链接和宿主 Docker Compose 模型。权限集中在单一服务，便于使用文件权限、`flock`、持久状态和结构化审计收敛攻击面。

## 可信发布源

- GitHub Actions 从受保护的版本标签构建前端和 Access 镜像。
- 镜像使用不可变 digest，禁止 `latest`。
- Release manifest 包含版本、完整 commit、两份镜像 digest、schema 版本、最低可回滚版本和变更摘要。
- 使用 GitHub OIDC、Cosign 和 provenance 验证 workflow identity、仓库、标签、commit 与镜像。
- 生产机拉取并校验制品，不临时追踪浮动 `main`。

## 持久状态机

updater 使用独立 SQLite 保存目标版本、revision/digest、旧版本、阶段、时间、脱敏失败分类和回滚结果。宿主机 `flock` 是第一层全局锁，数据库唯一约束是第二层保护；同一目标的重复请求返回同一任务。

```text
queued
→ verifying
→ pulling
→ staging
→ backup
→ migration_rehearsal
→ ready_to_switch
→ switching
→ health_checking
→ succeeded
```

切换前失败进入 `failed`，生产不变；切换后失败进入 `rolling_back → rolled_back`；回滚失败进入 `recovery_required` 并锁住后续更新。

updater 重启后不能只相信旧状态，必须依据 `current`、容器 revision/digest 和健康状态重建任务真相。

## 数据库迁移与回滚边界

- 一键更新只允许 expand/contract 且至少 N-1 兼容的迁移。
- manifest 必须声明 `schema_from`、`schema_to`、`rollback_floor` 和自动回滚资格。
- 迁移先在备份恢复出的临时 named volume 演练；切换前再次在线备份并校验。
- 自动回滚只恢复旧 release、镜像和容器，继续使用向后兼容的新 schema。
- 不可逆重写、破坏旧代码兼容或需要恢复数据库备份的版本，必须进入维护窗口并人工处理。
- 数据库灾难恢复只能恢复到新 named volume，验证后显式切换，不能在自动失败分支静默覆盖生产数据。

## 发布门禁

- manifest、签名、digest 与 provenance 校验。
- 并发点击、updater 重启与状态恢复测试。
- 空间、网络、备份、镜像、迁移演练失败时保持生产不变。
- Compose 配置、回环端口、两容器 health、revision 和 schema 校验。
- OpenResty 配置测试、直连源站边界和公网 HTTPS 验证。
- 强制候选健康失败、磁盘不足、镜像损坏和自动代码回滚演练。

核心原则：交互可以一键，权限、迁移和灾难恢复不能被包装成无条件的一键操作。
