# 设计丝滑版本更新系统

## Goal

为 FilmFrame 提供管理员可在手机或电脑完成的生产版本更新：系统自动发现可信稳定版，管理员阅读变更后手动确认，服务器在浏览器生命周期之外完成备份、准备、切换、验证和失败回滚。

目标是减少人工 SSH 发布操作，同时保持 1Panel/OpenResty、Cloudflare Access、SQLite 邀请码数据和浏览器本地图片处理边界不变。

## Background

- 生产环境使用 Docker Compose，静态与 Access 容器只绑定 `127.0.0.1:18082/18083`。
- `/opt/filmframe/current` 指向不可变 release 目录；旧 release 和唯一镜像可用于代码回滚。
- Access 数据位于 SQLite named volume，已有在线备份、完整性检查和保留策略。
- 管理域名已由 Cloudflare Access 和 Access 服务双重验证精确管理员身份。
- 当前发布依赖 SSH 上传源码、生产机构建镜像、切换 release 和人工验证；仓库尚无 Release/GHCR 自动制品流水线。
- `codex2api` 可复用低干扰版本提示、弱网缓存、Release Notes、可信 URL、SHA-256、互斥和重启后自动恢复体验；其单二进制原位替换不适用于 FilmFrame 的双容器和 SQLite 迁移。

## Requirements

### Product and UX

- 系统每 6 小时自动检查固定仓库的正式稳定版，管理员进入更新页时可立即重新检查；检查失败不得影响主站或邀请码管理。
- 发现新版后，管理后台显示版本、发布日期、中文变更摘要、数据库兼容性和预期切换影响，不向普通邀请码用户暴露任何版本 API 或界面。
- 安装必须由管理员手动确认；首版不允许无人值守自动安装。
- 更新任务由服务器持续执行，刷新、关页、手机锁屏或 Access 容器重启后仍可恢复真实状态。
- 页面使用真实阶段时间线与脱敏错误编号，不使用假百分比，不输出原始命令日志。
- 同一时间只有一个全局任务；同一目标版本的重复请求返回同一任务。
- 首版不提供取消任务或任意手动降级；失败更新由 updater 自动回滚代码。

### Trust and Privilege

- 版本只来自固定 GitHub 仓库的正式 Release，不跟随 `main`、预发布版本或 `latest` 镜像。
- CI 从受保护 tag 构建两份镜像和 deploy bundle；manifest 固定完整 commit、镜像 digest、bundle checksum、schema 范围、回滚下限、最低 updater 版本和中文摘要。
- 制品必须验证签名与 provenance；仓库、workflow identity、tag、commit 和 digest 任一不匹配均拒绝更新。
- 更新执行器运行在宿主机 systemd 服务中，通过 Unix socket 接收固定结构化动作，不开放 TCP。
- Access 仅负责 Cloudflare Access JWT、管理员邮箱、Origin、CSRF 和幂等校验；不得获得 Docker socket、SSH 密钥、任意 Shell 或宿主部署目录写权限。
- updater 不接受浏览器或 Access 提供的路径、URL、镜像名、命令或任意环境值。

### Deployment and Recovery

- 下载、校验、镜像拉取、release 准备和迁移演练在旧版本继续服务期间完成。
- 更新前必须完成磁盘/配置/端口预检，并使用备份恢复出的临时 named volume 演练候选 Access 迁移。
- 切换前必须再次执行 SQLite 在线备份，校验 checksum、`integrity_check` 和 schema；失败时生产保持不变。
- 每次更新创建唯一 release 目录并使用不可变镜像 digest，保留生产 `.env`、SQLite volume 和其他站点配置。
- 首版允许最终切换时秒级短暂重连，不为“零停机”自动修改 OpenResty 或引入 Kubernetes/蓝绿平台。
- 切换后必须验证两容器 health、运行 revision/digest、schema、回环端口、OpenResty 配置、直连源站边界和公网 HTTPS。
- 切换后门禁失败时自动恢复旧 release 与旧镜像并再次验证；只有验证通过后才能声明回滚成功。
- 自动回滚不得恢复或覆盖生产 SQLite。普通一键更新只接受至少 N-1 兼容的 expand/contract 迁移；破坏性迁移转入独立维护流程。
- updater 使用持久状态和宿主 `flock`；服务重启后依据 current symlink、容器 revision/digest 与健康状态重建任务真相。
- updater 自身不随普通应用 release 自动替换；manifest 要求更高 updater 版本时拒绝一键更新并提示维护。

### Privacy and Audit

- 浏览器响应、页面、控制台和 updater 状态不得包含 `.env`、token、Cookie、JWT、邀请码、SQLite 内容、备份路径、其他站点信息或原始 stdout/stderr。
- 审计记录包含任务 ID、目标版本/revision、阶段、时间、触发管理员的不可逆标识摘要、结果和固定失败分类。
- 历史记录持久保存最近 50 条或 90 天，不随 release 切换丢失。

## Acceptance Criteria

- [ ] 管理员能看到当前版本、候选稳定版、中文变更摘要和明确的手动更新入口。
- [ ] 未通过 Cloudflare Access 的请求无法读取更新信息、任务或历史，也无法触发更新。
- [ ] 同目标重复点击或多设备并发只产生一个持久任务；不同目标在任务活动时返回冲突。
- [ ] Access 容器没有 Docker socket、SSH 密钥、宿主部署写权限或任意命令执行能力。
- [ ] 每个候选版本都通过固定仓库、签名/provenance、commit、digest、bundle checksum 和 manifest schema 校验。
- [ ] 备份、迁移演练、磁盘或制品校验失败时不切换生产流量。
- [ ] 准备阶段旧版本持续服务，切换后两容器运行目标 revision/digest 且 SQLite schema 正确。
- [ ] OpenResty、回环、直连源站和公网鉴权边界验证全部通过后才标记成功。
- [ ] 候选健康失败时自动恢复旧 release/镜像并验证公网恢复；生产 SQLite 不被自动覆盖。
- [ ] 破坏性迁移、未知回滚下限或 updater 版本不足时，一键更新被预检拒绝。
- [ ] 关闭/刷新页面或重启 Access/updater 后，任务状态能从服务器真实状态恢复。
- [ ] 页面和日志不存在凭据、邀请码、原始命令、环境变量、数据库内容或其他站点信息。
- [ ] 单元、集成、失败注入和至少一次生产回滚演练覆盖关键状态机与门禁。

## Out of Scope

- 普通用户更新提示或浏览器内自更新。
- 无人值守自动安装、预发布通道、维护窗口调度或第三方通知。
- 任意版本降级、页面任务取消、任意命令/路径/镜像输入。
- 自动恢复 SQLite 备份、在线执行破坏性迁移或数据库降级。
- 自动更新 updater 自身。
- Kubernetes、跨服务器编排、通用部署平台或自动修改其他 1Panel/OpenResty 站点。

## Deferred Items

- 稳定运行并完成多次回滚演练后，再评估 patch 版本维护窗口自动安装。
- 后续可增加已验证版本的受限手动回滚、通知、蓝绿槽位和更完整的制品证明界面。
