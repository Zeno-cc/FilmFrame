# 建立 FilmFrame v1.3 候选发布环境

## Goal

在不改变现有 `filmframe.astrocean.space`、生产容器、生产邀请码数据库、
`/opt/filmframe/current` 和其他 1Panel 站点的前提下，为提交
`838e4b0afcf5f35a285553c7e9a0cb8947e6af26` 建立一个临时、可撤销的公网 HTTPS
候选环境，供 iPhone Safari 与 Android Chrome 完成 `v1.3.0` 发布前真机验证。

## Background

- GitHub `main` 已指向候选提交 `838e4b0afcf5f35a285553c7e9a0cb8947e6af26`。
- 正式站当前仍运行 `v1.2.0`，稳定 release 指向
  `/opt/filmframe/releases/20260804T075336Z-v1.2.0-fa2f3125ad9c`。
- 服务器已有独立 FilmFrame 静态站与 Access 容器，仅绑定回环端口
  `18082` / `18083`，1Panel OpenResty 是唯一公网入口。
- 服务器已有可覆盖子域名的 `astrocean.space` 泛域名证书。
- `filmframe-rc.astrocean.space` 当前没有 DNS 解析或 OpenResty vhost。
- 正式更新器只接受由稳定 `vMAJOR.MINOR.PATCH` 标签生成、签名并证明来源的
  GitHub Release；候选构建不得伪装成稳定发布。
- 项目规定 `v1.3.0` 标签、GitHub Release 和生产切换必须等待 iPhone Safari
  与 Android Chrome 两份脱敏真机证据通过。
- 2026-08-10，用户明确要求跳过真机验证并直接发布。该决定只作为 `v1.3.0`
  的一次性风险豁免，不得记录或暗示真机 PASS，也不改变后续版本的默认门禁。

## Requirements

### R1. Candidate identity and isolation

- 候选入口固定为 `https://filmframe-rc.astrocean.space`。
- 候选源码必须固定到完整提交
  `838e4b0afcf5f35a285553c7e9a0cb8947e6af26`，页面和容器标签可追溯该 revision。
- 候选实例使用独立 Compose project、回环端口、Access SQLite volume、容器名和
  release 目录；不得复用生产邀请码、会话或持久化数据。
- 候选 Access 必须关闭更新器功能且不得挂载 updater socket、Docker socket、生产
  release 树或生产备份目录。
- 候选构建必须明确标记为 RC，只能用于验证，不得作为正式生产镜像或 updater 输入。

### R2. 1Panel / OpenResty and Cloudflare boundary

- Cloudflare 新增 `filmframe-rc.astrocean.space` 的代理 A 记录并开启橙云；不得修改
  `filmframe.astrocean.space`、`filmframe-admin.astrocean.space` 或其他记录。
- 新增独立 RC vhost，复用现有泛域名证书和 Cloudflare real-IP include；不得编辑
  其他 vhost。
- RC vhost 必须实现与正式站一致的 `/access`、`/auth/redeem`、
  `/auth/refresh`、`/api/runtime-config`、内部 session check、静态资源门禁、
  `no-store` 和源站 Host 限制。
- OpenResty 配置必须在 reload 前通过活动容器的配置检查；失败时不得 reload。

### R3. Candidate access and evidence preparation

- 候选环境必须能创建至少两枚临时、一次性邀请码，分别用于 iPhone 与 Android；
  明文邀请码不得写入 Git、服务器配置、日志或真机证据文件。
- 候选管理员页面、候选更新器控制、生产数据复制不属于本任务；邀请码通过服务器上的
  候选 Access CLI 生成。
- 仓库中的真机证据模板保持脱敏，只记录 revision、设备/系统/浏览器版本、UTC 时间、
  结果和不含用户内容的请求类别。

### R4. Verification and rollback

- 部署后验证候选静态/Access 回环健康、OpenResty 配置、外网 HTTPS、匿名重定向、
  邀请码兑换、受邀 `/api/runtime-config`、源站直连拒绝和 Cloudflare 不缓存。
- 对正式 FilmFrame 站、正式管理站以及至少一个无关 1Panel vhost 做回归探针，确认
  状态未改变。
- 候选失败时，回滚只停止 RC Compose project、移除或禁用 RC vhost，并删除 RC DNS
  记录；不得操作生产 `current`、生产 volume、生产备份或其他站点。
- RC 数据在真机验证结束前保留。删除 RC 数据属于单独的显式清理操作。

## Acceptance Criteria

- [x] `filmframe-rc.astrocean.space` 通过 Cloudflare 橙云提供有效 HTTPS，匿名访问跳转到 `/access`。
- [x] 候选两个容器仅绑定独立回环端口，健康检查通过，revision 精确为 `838e4b0afcf5f35a285553c7e9a0cb8947e6af26`。
- [x] 候选 Access 使用独立 SQLite volume，禁用且无法连接 FilmFrame updater，不挂载任何生产数据目录。
- [x] 有效候选邀请码能建立设备会话，受邀用户可加载应用和 `/api/runtime-config`，无效或复用邀请码被拒绝。
- [x] 活动 OpenResty `-t`、本机回环、外网 HTTPS、Host/源站边界和 Cloudflare cache 检查全部通过。
- [x] 正式 FilmFrame 站、正式管理站、生产容器、生产 `current` 指针和抽查的无关 vhost 在候选部署后保持健康且配置未被改写。
- [x] 真机验证仍有可执行的脱敏 runbook，但用户明确豁免 `v1.3.0` 的真机执行；仓库不记录虚假 PASS。
- [x] 用户已明确批准在保留该豁免记录和剩余风险的前提下创建 `v1.3.0` Release 并切换生产。

## Out Of Scope

- 创建 `v1.3.0` 标签、GitHub Release 或正式生产切换。
- 修改 FilmFrame 产品代码、邀请码业务规则、管理员登录或 Cloudflare Access 策略。
- 为 RC 建立独立管理员前端、独立 Google OAuth 应用或独立 updater。
- 复制生产 SQLite、邀请码、会话、备份、日志或用户数据到 RC。
- 修改、重启或迁移其他 1Panel 站点及其容器。
- 真机验证步骤本身；该部分需要用户持有的实际 iPhone 与 Android 设备完成。

## Release Gate

默认门禁仍要求两份脱敏真机证据。对于 `v1.3.0`，用户于 2026-08-10 明确批准
跳过该外部证据并承担移动端兼容性与内存压力未被真机覆盖的剩余风险。发布记录必须
如实标注 waiver，不得把豁免写成 PASS。
