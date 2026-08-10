# Implementation Plan

## 1. Preflight

- [x] 固定 candidate revision，确认 GitHub `main` 与本地对象一致且工作树无无关改动。
- [x] 记录生产 current、容器健康、端口、volume、FilmFrame vhost checksum 和一个无关
      vhost 的基线，不读取或输出秘密值。
- [x] 确认 RC DNS/vhost/端口/Compose project/volume 均未被占用。
- [x] 确认服务器磁盘、内存和 Docker build 空间足够。

## 2. Prepare candidate artifacts

- [x] 从固定 commit 导出源码到新的 `/opt/filmframe/candidates/<timestamp>-v1.3.0-rc-<sha>`。
- [x] 创建 RC 专用 Compose 配置和 mode `0600` 环境文件；确认无 updater socket、
      Docker socket、生产 volume 或生产路径 mount。
- [x] 构建两个本地 RC 镜像并检查 OCI revision 标签。
- [x] 运行 Compose 配置检查后启动 RC，等待静态与 Access health 通过。

## 3. Publish isolated HTTPS entry

- [x] 生成 RC-only OpenResty vhost，使用 18182/18183、候选 Host 和现有泛域名证书。
- [x] 新建 Cloudflare proxied A 记录；已存在且不匹配时停止，不覆盖。
- [x] 活动 OpenResty `-t` 通过后 reload。

## 4. Validate candidate and production isolation

- [x] 验证两个 RC loopback health、revision、mount、volume、网络和 updater-disabled 边界。
- [x] 验证外网 HTTPS、匿名 `/access`、源站拒绝、Cloudflare cache 和安全响应头。
- [x] 生成两枚 RC-only 一次性邀请码，完成一次兑换和 `/api/runtime-config` 探针，确认
      邀请码不可复用。
- [x] 比对生产 current、容器、vhost checksum，探测正式 FilmFrame、管理站和一个无关
      1Panel vhost。

## 5. Physical handoff

- [ ] 向用户提供候选 URL、两枚临时邀请码的安全交付方式和真机步骤。
- [ ] 等待 iPhone Safari 与 Android Chrome 的脱敏 PASS/FAIL 结果；本步骤不能自动化替代。
- [ ] 两份证据通过前保持稳定标签、GitHub Release 和生产 updater 未触发。

## Validation Commands

- `docker compose -f <rc-compose> config --quiet`
- `docker compose -f <rc-compose> ps`
- `docker inspect <rc-containers>`
- `docker exec 1Panel-openresty-qMnm openresty -t`
- `curl` 回环、Cloudflare HTTPS 和 `--resolve` 源站探针
- `node scripts/verify-invite-deployment.mjs` 的候选适配参数或等价的无秘密探针
- `git diff --check`

## Rollback Points

- RC 容器启动前：删除未启用的候选目录即可，不触及生产。
- OpenResty reload 前：配置测试失败则移除候选 vhost 临时文件，不 reload。
- 外网发布后：停止 RC project、禁用候选 vhost、删除本任务创建的 DNS 记录。
- 不自动删除 RC volume；验证结束后的数据清理由用户另行批准。
