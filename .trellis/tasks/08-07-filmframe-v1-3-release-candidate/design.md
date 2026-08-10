# Technical Design

## Architecture

候选实例与生产实例共用服务器和 1Panel OpenResty，但不共用应用运行边界：

```text
Cloudflare: filmframe-rc.astrocean.space (proxied A)
  -> 1Panel OpenResty: new RC-only vhost + existing wildcard certificate
    -> 127.0.0.1:18182  RC static container
    -> 127.0.0.1:18183  RC access container
      -> filmframe_rc_access_data (RC-only SQLite volume)
```

生产 `18082` / `18083`、`filmframe_access_data`、`/opt/filmframe/current` 和现有
vhost 不进入候选数据流。

## Candidate source and images

- 从本地已验证 Git 对象导出完整 revision `838e4b0...` 到服务器候选 release 目录，
  避免依赖服务器工作树状态。
- 在服务器本地构建 RC 静态和 Access 镜像，镜像标签包含短 revision 和 `rc` 标记。
- RC Compose 使用独立文件或显式覆盖，移除 updater socket/group，固定独立端口和 volume。
- `.env` 只复用运行 Access 所需的非代码环境配置；候选主机固定为
  `filmframe-rc.astrocean.space`，候选 admin host 使用不公开的
  `filmframe-rc-admin.astrocean.space`，更新器强制关闭。
- RC 镜像不具备 GitHub attestation，永远不写入正式 release manifest，不可供 updater
  选择。

## OpenResty and TLS

- 新 vhost 文件：`/opt/1panel/www/conf.d/filmframe-rc.astrocean.space.conf`。
- 新 upstream 名称带 `rc` 前缀，防止与生产 upstream/map 冲突。
- Cookie map 仍只提取 `__Host-filmframe_session`；`__Host-` Cookie 是 host-only，
  因此 RC 与正式站即使 cookie 名相同也不会共享授权。
- TLS 复用现有 `astrocean.space_wildcard_ecc` 证书。
- 先把候选 vhost 写入临时路径并进行语法/边界审查，再原子安装到 conf.d；活动
  OpenResty `-t` 通过后才 reload。

## Cloudflare

- 查询 zone 和现有同名记录，只有记录不存在时才创建 proxied A；若存在但值不符则
  fail closed，人工复核，不覆盖未知记录。
- DNS 只指向现有服务器公网 IP。候选 vhost 的 Host allowlist 和 Cloudflare
  real-IP include 与生产一致。
- 不改变正式域名缓存、SSL、Access 或 WAF 规则。

## Invitation and physical evidence

- 通过 `docker compose exec` 调用 RC Access CLI 创建两枚一次性邀请码。
- 邀请码明文只在生成响应和用户测试设备上短暂出现；不写入任务文档、Git、环境文件
  或命令历史文件。
- 两台设备分别使用独立邀请码，测试后撤销其会话或邀请码。
- 证据基于 `docs/project/mobile-smoke-evidence-template.md`，只提交脱敏字段。

## Validation

- 部署前记录生产 current revision、容器 health 和相关 vhost checksum。
- 部署后检查 RC container health/revision、端口只绑定 loopback、volume/mount、
  OpenResty `-t`、Cloudflare HTTPS、匿名/授权流、runtime config、cache 和 direct-origin。
- 再比对生产记录并探测正式站、管理站及一个无关 vhost。

## Rollback

1. 停止 RC Compose project，但保留 RC volume。
2. 将 RC vhost 移出活动 conf.d，运行 OpenResty `-t` 后 reload。
3. 删除本任务创建的 RC DNS 记录。
4. 确认正式站、管理站和抽查 vhost 仍健康。

生产 release、volume、备份和 updater 状态不参与回滚。
