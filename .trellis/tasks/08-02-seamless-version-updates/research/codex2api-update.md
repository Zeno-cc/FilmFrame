# codex2api 在线更新机制研究与 FilmFrame 适配建议

## 结论先行

`codex2api` 的“丝滑”主要来自两个层面：常驻版本入口、自动检查/弱网缓存，以及点击更新后自动等待服务恢复。它的部署机制本质上却是“下载单个 Go 二进制 → 原位替换 → `exec` 重启”，并不适合直接移植到 FilmFrame。

FilmFrame 应复用它的 UX 和供应链安全思想，但必须重做更新执行器：由宿主机上的受限部署控制器管理不可变 release 目录、两个 Docker Compose 服务、SQLite 备份/迁移、健康门禁和自动回滚。不能让应用容器修改自身，也不能在容器内执行 `git pull` 或 `docker compose`。

本报告核对的是 `main` 提交 [`fc36e81579756f2c81dbbf8340408f2ad2b2f2da`](https://github.com/james-6-23/codex2api/commit/fc36e81579756f2c81dbbf8340408f2ad2b2f2da)（2026-08-01）。

## 1. codex2api 的实际更新链路

### 1.1 入口和权限

- 前端入口位于侧栏品牌名下方的版本号。发现新版本时显示红色脉冲点；点击版本号弹出当前版本、最新版本、环境警告、“立即更新”和 Release Notes。
- 更新接口是管理接口组内的 `GET /api/admin/system/update` 与 `POST /api/admin/system/update`，接口组统一经过 `adminAuthMiddleware`，不是公开更新端点。
- 服务端使用 `sync.Mutex.TryLock()` 保证单实例进程内同一时间只有一个更新任务；并发请求返回 `409`。

证据：

- [`frontend/src/components/Layout.tsx`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/frontend/src/components/Layout.tsx)
- [`admin/handler.go`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/admin/handler.go)
- [`admin/system_update.go`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/admin/system_update.go)

### 1.2 版本发现

- Release 构建通过 Go `ldflags` 注入版本，前端通过 `VITE_APP_VERSION` 注入同一 tag；开发构建保留 `dev`。
- 后端请求 GitHub `releases/latest`，只接受语义版本，按 `major.minor.patch` 比较；缺失/非法当前版本会禁用更新。
- 根据运行时 `GOOS/GOARCH` 选择名为 `codex2api_<version>_<os>_<arch>.tar.gz` 的资产。
- 后端 Release 查询缓存 2 分钟；前端 localStorage 缓存 10 分钟、每 30 分钟轮询，并在路由变化时强制刷新。GitHub 暂不可用时，前端可使用过期缓存，后端也把检查失败降级成可展示的警告，而非破坏管理界面。

证据：

- [`internal/version/version.go`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/internal/version/version.go)
- [`frontend/src/hooks/useVersionCheck.ts`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/frontend/src/hooks/useVersionCheck.ts)
- [`.github/workflows/release.yml`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/.github/workflows/release.yml)

### 1.3 下载、校验和替换

- 后端下载 Release 资产，超时 10 分钟，最大 200 MiB；前端更新请求上限 11 分钟。
- URL 限制为 HTTPS，host 只允许 GitHub 与 GitHubusercontent 相关域名；重定向后仍再次校验，降低 SSRF/任意下载风险。
- 优先校验 GitHub asset 的 `sha256:` digest；否则必须下载 `SHA256SUMS.txt` 并匹配资产名。没有 SHA-256 信息则拒绝更新。
- tar 解包只接受普通文件、拒绝绝对路径和 `..`，只提取名为 `codex2api` 的文件。
- 新文件先落到可执行文件同目录的临时目录；旧程序改名为 `.backup`，再把新程序原子 rename 到原路径。第二次 rename 失败时立即把备份恢复。

证据：[`admin/system_update.go`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/admin/system_update.go)

### 1.4 进度展示与重启

- UI 实际只有三个阶段：`更新中` spinner、`正在重启` spinner、成功/失败 toast；没有下载百分比、构建日志或服务级进度。
- 替换完成后服务延迟 900ms，在 Unix 使用 `syscall.Exec(exePath, os.Args, os.Environ())` 原地替换进程；Windows 明确不支持。
- 前端在重启开始后每 1.5 秒查询版本，首次等待 2.5 秒，最多 60 次（约 90 秒）；观察到目标版本后自动 reload。服务暂时断开被视为正常重启过程；超时则提示手动刷新。

证据：

- [`frontend/src/components/Layout.tsx`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/frontend/src/components/Layout.tsx)
- [`admin/system_update_restart_unix.go`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/admin/system_update_restart_unix.go)

### 1.5 回滚和失败处理的真实边界

- 有“替换过程失败恢复”：新二进制无法落位时恢复旧文件。
- 保留一个 `<executable>.backup`，但没有公开回滚 API、回滚按钮、启动失败自动回滚、健康检查门禁，也没有验证新版本能否成功启动。
- 重启调用发生在后台 goroutine 中；`exec` 失败只写日志，HTTP 已经对前端宣告“更新已应用”。
- 互斥锁只覆盖单进程，不是跨实例/跨节点分布式锁。
- GitHub 查询故障会静默降级；下载、校验、解包、权限、替换失败则返回明确错误。
- 仓库有针对版本比较、URL 白名单、容器警告、Release 缓存、并发互斥、二进制备份替换、checksum mismatch 的测试，但没有端到端“更新后健康/失败回滚”测试。

证据：[`admin/system_update_test.go`](https://github.com/james-6-23/codex2api/blob/fc36e81579756f2c81dbbf8340408f2ad2b2f2da/admin/system_update_test.go)

## 2. 对 FilmFrame 可复用的部分

### UX 可复用

1. 在管理后台固定展示当前版本，新版本用低干扰红点提示；不在用户照片工作区弹强制更新。
2. 弹层展示当前/目标版本、发布日期、Release Notes、兼容性或迁移警告。
3. 更新检查失败不影响应用使用，使用短 TTL 缓存并显示“暂时无法检查”。
4. 更新后自动轮询健康和版本，成功自动刷新；短暂 502/断链属于正常阶段。
5. 状态应比参考项目更细：`检查 → 备份 → 拉取/构建 → 启动候选 → 数据迁移 → 健康验证 → 切换 → 外网验证 → 完成/回滚`。FilmFrame 的操作可能持续数分钟，不能只显示一个 spinner。

### 安全机制可复用

1. 更新端点必须位于现有 Cloudflare Access 管理域名之后，并在服务端再次校验管理员身份；不能仅靠隐藏按钮。
2. 单任务锁、重复点击幂等、有限超时、有限日志输出。
3. 固定可信更新源，校验目标 commit/tag；若使用预构建镜像，应固定 image digest。禁止接受用户输入的任意 URL、任意 shell 参数。
4. 发布产物内注入 revision，并在更新完成后通过运行时端点核对目标 revision，而非仅以 HTTP 200 判断成功。
5. 失败必须给出阶段、时间和可操作信息，但不得向浏览器返回 `.env`、SSH、Cloudflare token、数据库路径或邀请码明文。

## 3. 不能照搬的部署机制（反方审查）

| codex2api 机制 | FilmFrame 缺口/风险 | 结论 |
|---|---|---|
| 容器内替换自身二进制 | FilmFrame 是 `filmframe` + `access` 两个不可变、只读 Docker 容器；容器重建会丢失修改。codex2api 自己也只给出容器警告，并未解决容器更新 | 必须重做 |
| 单一进程 `syscall.Exec` 重启 | FilmFrame 需协调两个服务、Compose network、named volume 和 OpenResty 上游；容器内也不应拥有 Docker socket | 必须重做 |
| 单个 `.backup` 文件 | FilmFrame 回滚单位是完整 release、两份镜像与 compose 配置；只回滚前端或 Access 会产生版本漂移 | 必须重做 |
| 替换成功即宣告更新成功 | Access 启动会执行 SQLite 迁移；新服务可能启动失败、迁移失败或健康检查失败 | 必须增加候选健康门禁和自动回滚 |
| 没有数据库升级/降级模型 | SQLite migration 可能不可逆。代码回滚不等于 schema 回滚；直接切回旧 Access 镜像可能不兼容新 schema | 必须在每次更新前在线备份，发布声明 migration compatibility；破坏性迁移需 expand/contract |
| 单进程锁 | 多浏览器、进程重启、未来多节点时锁会丢失 | 宿主机任务使用文件锁/持久化 job 状态 |
| GitHub `latest` + 应用直接下载 | 生产机 GitHub 网络不稳定曾是现实问题；应用进程获取发布资产扩大权限面 | 由宿主部署控制器拉取，支持超时/重试/镜像仓库；应用只发受限请求并读状态 |
| 前端等待 11 分钟的单个 POST | 代理、浏览器刷新会中断感知，无法恢复任务视图 | POST 只创建 job，返回 `202 + job_id`；状态独立查询或 SSE |
| 无启动失败自动回滚 | 用户看到超时，但生产可能已不可用 | 健康/版本/外网三重门禁失败自动切回旧 release |

FilmFrame 当前事实进一步证明不能照搬：

- [`compose.yaml`](../../../../compose.yaml) 定义两个只读容器、独立健康检查、固定回环端口和 SQLite named volume。
- [`server/access/src/migrate.ts`](../../../../server/access/src/migrate.ts) 在启动路径执行事务化、递增版本迁移；这只是“单条 migration 原子”，不是整次发布可逆。
- [`ops/backup/README.md`](../../../../ops/backup/README.md) 已确立 SQLite 在线备份、完整性验证、新 volume 恢复演练和 `/opt/filmframe/current` 稳定 symlink，应成为更新流程的一部分，而不是另造备份系统。

## 4. 推荐给 FilmFrame 的“最完美但不过度设计”方案

### 4.1 边界

- 管理 UI：现有 `filmframe-admin.astrocean.space`，只负责创建更新任务、展示状态、确认高风险步骤。
- Access 服务：增加极小的更新 API，校验 Cloudflare Access 身份后，把固定动作请求交给宿主控制器；自身无 Docker socket、无 root、无 SSH key。
- 宿主控制器：systemd root service + 固定脚本/小程序，Unix socket 通信；只允许部署 FilmFrame、固定 GitHub repo、固定 `/opt/filmframe`、固定 Compose project。它是唯一有权操作 release、Docker 和备份的组件。
- 发布源：GitHub tag/release 或 GitHub Container Registry。优选 CI 构建并推送按 digest 固定的两份镜像，生产只 pull + verify，避免服务器现场构建慢且不可重复。

### 4.2 发布状态机

`available → queued → backing_up → fetching → staging → migrating → verifying_loopback → switching → verifying_external → succeeded`

任一步失败进入 `rolling_back → failed_rolled_back`；若数据库兼容性声明不允许代码回滚，则在执行前阻止自动更新并要求维护窗口，不要假装可安全一键回滚。

每个 job 持久化：目标版本/commit、旧 release、开始/结束时间、当前阶段、脱敏摘要、结果。任务创建要带幂等键；宿主机用 `flock` 保证全局单任务。

### 4.3 更新执行顺序

1. 预检：磁盘、Docker、当前 revision、工作目录无漂移、目标 manifest/镜像 digest、迁移兼容性。
2. 使用现有 `access-backup` 创建 SQLite 在线备份，校验 SHA-256、`integrity_check` 和 migration 表；备份失败即停止。
3. 拉取或构建目标镜像，在新 timestamp release 目录准备 compose；保留生产 `.env` 和 named volume，不复制/打印秘密。
4. 候选部署先做镜像/配置/容器自检。因当前 SQLite 单写实例和固定端口，P0 可采用受控短暂停机切换，不承诺“绝对零停机”。
5. 启动 Access，等待 migration + `/healthz`；再启动静态站，验证两个回环 health、运行 revision、OpenResty `-t`（配置未变则不 reload）。
6. 原子切换 `/opt/filmframe/current`，验证公网主站的 `/access` 跳转和管理域名 Cloudflare Access 门禁。
7. 成功后保留上一 release、旧镜像和上线前备份至回滚窗口；按既有保留策略清理，不在请求链路中立即删除。
8. 失败时切回旧 release/镜像；只有 schema 仍向后兼容时复用当前 DB。数据库恢复必须是显式灾难恢复动作，不能在在线自动回滚中静默覆盖用户新写入。

### 4.4 产品范围建议

P0：手动检查、管理员确认、任务状态、备份、固定源更新、回环/公网验证、失败自动代码回滚、审计记录。

P1：预构建并签名的镜像、分阶段进度/SSE、更新窗口、Release Notes、失败诊断下载。

P2：自动更新策略（仅 patch / 指定维护窗口）、蓝绿或双栈切换。当前单机 SQLite 场景不建议为了“零停机”立即引入编排平台。

## 5. 验收标准

1. 非管理员无法查询或触发更新；应用容器无 Docker socket、SSH key 和宿主目录写权限。
2. 同时点击多次只产生一个 job，刷新/换设备仍可查看该任务状态。
3. GitHub 不可达、空间不足、备份失败、digest 不符、镜像启动失败、migration 失败、健康超时均不会切换到坏版本。
4. 更新成功后两个容器均 healthy、revision 等于目标、SQLite migration 版本正确、OpenResty 配置通过、外网主站和管理门禁行为正确。
5. 强制制造候选健康失败，系统自动恢复上一可用 release，外网恢复；事件和原因可审计。
6. 强制制造不兼容 migration，系统在执行前拒绝自动更新并说明需要维护窗口。
7. 更新全程不泄漏环境变量、凭据、邀请码明文或数据库内容。

## 最终判断

可借鉴的是“版本发现 + 低干扰入口 + 安全下载 + 自动等待恢复”的产品体验，以及 checksum、URL allowlist、互斥、版本注入等机制。必须重做的是“原位替换二进制 + 自重启”这一部署核心。对 FilmFrame，真正可靠的丝滑更新不是动画更顺，而是一次可恢复、可审计、能处理 SQLite 迁移和多容器一致性的受控发布。
