# 安全邀请码访问门禁

## Goal

为 FilmFrame 官方站点增加不可由纯前端状态绕过的邀请码门禁：未持有有效服务端会话的访问者只能看到邀请码页面，无法取得应用 HTML、JavaScript、Worker 或胶片素材；管理员可以从独立公网管理端安全生成和撤销邀请码，同时保持照片只在浏览器本地处理。

本任务保护官方站点与源站的分发入口，不承诺阻止已授权用户保存、复制或离线运行已经下载到浏览器的纯前端产物。

## Background

- 当前项目是 React/Vite 客户端单体，没有服务端业务层（`docs/project/architecture.md:7`）。图片、渲染和导出均在浏览器完成，运行时只加载同源胶片素材（`docs/project/architecture.md:185`）。
- React 状态、`localStorage`、Vite 环境变量和浏览器内密钥都不可信，不能作为权限边界。
- 当前 Docker 映射为 `18082:80`（`compose.yaml:8`），公网直连时可绕过域名入口。
- 当前 `/assets/` 使用公开长期缓存（`nginx.conf:26`），Cloudflare 已缓存的资源可能绕过后来增加的源站鉴权。
- 线上使用 Cloudflare、1Panel/OpenResty 与独立 FilmFrame vhost；OpenResty 已具备 `auth_request` 能力。

## Key Decisions

- 邀请码使用至少 128 bit 熵的短随机码；数据库只持久化规范化邀请码的 SHA-256 哈希。
- 邀请码默认生成后 7 天内可兑换，只能兑换一次；同一邀请码并发兑换必须恰好一次成功。
- 兑换后仅当前浏览器获得长期设备会话；浏览器允许的持久 Cookie 周期内每次进入应用自动续期。清除 Cookie、更换设备或管理员撤销邀请码后需要新邀请码。
- 邀请码过期只阻止新的兑换；管理员撤销邀请码时，其已签发会话立即级联失效。
- 用户会话使用高熵 opaque token，数据库只保存 token 哈希，浏览器只接收 `Secure`、`HttpOnly`、`SameSite=Strict`、host-only Cookie。
- 公网管理端使用独立子域，由 Cloudflare Access Google IdP 和 Independent MFA WebAuthn 同时保护；Google 或 Passkey 任一单独通过都不能进入。
- Google Client Secret 只保存在 Cloudflare Zero Trust 配置中。项目不自行实现 Google OAuth 回调，也不保存 Google token 或 Passkey 私钥。
- 源站逐请求验证 Cloudflare Access JWT；不能只依赖橙云、前端隐藏或请求头存在性。
- FilmFrame 渲染和照片处理继续留在浏览器，不迁移到服务端。

## Requirements

### R1. Official Site Gate

- 未认证访问者只能访问邀请码页面和兑换端点；健康检查与鉴权检查只允许内部访问。
- OpenResty 必须在返回 `/`、`/index.html`、`/assets/*`、Worker、`/film-overlays/*`、`/film-sprocket-masks/*` 及其他应用资源前统一校验会话。
- 鉴权服务故障或返回异常时必须 fail closed，不能回退为匿名放行。
- 邀请码输入只通过 HTTPS POST body 提交，不进入 URL、Referer、访问日志或错误日志。
- 错误、过期、撤销和已使用邀请码使用统一失败文案，不泄露内部状态。
- 应用内不提供会误清除设备授权的退出入口；设备授权只由管理员撤销邀请码或用户清理浏览器站点数据终止。

### R2. Invite And Session Lifecycle

- 邀请码格式必须带版本前缀，可容忍分组符与大小写输入，但只能归一化为一种 canonical value 后再哈希。
- 兑换在 SQLite 原子事务中校验过期、撤销和剩余次数，递增兑换次数并创建会话。
- 会话每次鉴权都必须检查自身有效期、撤销状态及所属邀请码的撤销状态；应用启动时通过同源受保护接口滚动续期。
- 管理端只展示邀请码明文一次；列表接口不得返回邀请码明文或哈希。
- 管理端支持生成、查看状态和撤销；P0 固定使用 7 天、一次兑换、长期滚动设备会话，不增加任意策略编辑器。

### R3. Public Admin Authentication

- 管理端使用独立公网子域，匿名用户和普通邀请码用户均不得访问管理 API。
- Cloudflare Access policy 必须精确 Include 指定管理员 Google 邮箱，并 Require `Login Methods = Google`；禁止 Include Everyone，也禁止只按 Google 登录方式放行所有 Gmail 用户。
- Access Independent MFA 只允许 WebAuthn biometrics/security key，并关闭 IdP MFA 的 AMR 复用，确保 Google 与独立 Passkey 都完成验证。
- 管理员通过 Cloudflare App Launcher 至少登记两个 MFA 凭据，避免单设备丢失后锁死。
- 源站优先读取 `Cf-Access-Jwt-Assertion`，使用远程 JWKS 验证 RS256 签名、exact issuer、管理应用 audience、`exp`、`nbf` 和管理员身份。
- JWKS 必须缓存并自动处理 Cloudflare 密钥轮换；没有可信密钥或验证失败时拒绝请求。
- 管理端写操作必须使用非 GET 方法，校验 exact Origin 与自定义 CSRF header，限制请求体、关闭 credentialed CORS 并限速。
- Google Client Secret、Access JWT、Cookie 和身份 token 不得进入仓库、前端产物、应用日志或容器镜像。

### R4. Origin, Cache And Deployment

- FilmFrame 静态容器和鉴权服务只监听 `127.0.0.1` 或私有容器网络；应用端口不得对公网发布。
- 直连源站并伪造 Host/SNI 时，普通站点仍要求有效 FilmFrame 会话，管理站点仍要求有效 Access JWT。
- Cloudflare 对 FilmFrame hostname 执行 cache bypass，并在切换门禁前清理既有缓存；受保护响应使用 `private, no-store`。
- 只修改 FilmFrame 现有 vhost 与新管理 vhost，不影响 1Panel/OpenResty 中其他站点或现有泛域名证书。
- 部署切换必须保持 fail closed；回滚不得重新公开应用端口或恢复匿名静态资源缓存。

### R5. Privacy And Operations

- 门禁不得上传照片、EXIF、胶片设置、渲染结果或 Object URL；管理服务不接触图片数据。
- SQLite 数据位于持久卷，启用 WAL、外键、busy timeout 与受限文件权限；容器重启后状态保持一致。
- 备份包含数据库与必要的非敏感配置，必须验证恢复；Google Client Secret 等外部凭据不写入备份包或仓库。
- 日志只记录固定事件、随机资源 ID、时间和结果，不记录邀请码、Cookie、JWT、请求体或完整邮箱。
- 保留 SSH break-glass 管理命令，用于 Cloudflare 管理端不可用时生成或撤销邀请码；命令不对公网开放。

## Acceptance Criteria

- [ ] 匿名访问 FilmFrame 只能看到邀请码页；直接请求已知 JS、CSS、Worker、overlay 和 mask 均不能取得受保护内容，且主 Vite bundle 未加载。
- [ ] 有效邀请码成功兑换；随机、畸形、过期、撤销和已使用邀请码统一失败且不设置会话 Cookie。
- [ ] 同一一次性邀请码的串行二次兑换失败，20 路并发兑换恰好一次成功。
- [ ] 用户 Cookie 具备 `Secure`、`HttpOnly`、`SameSite=Strict`、`Path=/` 和浏览器允许范围内的持久寿命；篡改、过期或级联撤销后下一请求立即失败。
- [ ] 邀请码在 7 天兑换期内有效；设备会话每次进入应用自动续期，持续使用时不会要求重复输入邀请码，邀请码自然过期不提前终止已兑换会话。
- [ ] 管理端只有“白名单 Google + Independent MFA Passkey”同时满足时可用；任一缺失、非白名单账号、错误登录方式或普通邀请码会话均被拒绝。
- [ ] 缺失、伪造、篡改、过期、错误 issuer/audience 的 Access JWT 与直连源站请求均被拒绝；JWKS 轮换后继续正确验证。
- [ ] 公网无法连接应用和鉴权容器端口；Cloudflare 旧缓存已清理，同一静态 URL 在授权请求后仍不能被匿名缓存命中。
- [ ] 邀请码、session token、Access JWT、Google Client Secret 和 Passkey 私钥不出现在数据库明文字段、仓库、构建产物、镜像或日志中。
- [ ] 鉴权服务停机时应用关闭访问；容器重启与数据库备份恢复后邀请码、会话及撤销状态保持一致。
- [ ] 管理端可在 iOS Safari、Android Chrome、桌面 Safari/Chrome/Edge 完成 Google + Passkey 登录，并生成、一次性复制、查看和撤销邀请码。
- [ ] 授权进入 FilmFrame 后，`npm run check`、`npm run test:e2e`、上传、Worker 渲染和导出流程通过，网络检查确认照片仍不上传。
- [ ] OpenResty 配置检查、本机回环、源站直连、Cloudflare 外网 HTTPS 和其他 vhost 回归验证全部通过。

## Out Of Scope

- 防止已授权用户复制、保存或离线运行已经下载的纯前端代码与素材。
- 将胶片渲染、照片处理或导出迁移到服务端。
- 面向普通 FilmFrame 用户的账号注册、密码登录、Google/OAuth 登录、支付、订阅或设备指纹。
- 在用户主动清理 Cookie、使用浏览器无痕模式或浏览器主动清除站点数据后恢复设备授权。
- 多管理员、角色权限、邀请策略编辑器、批量导入、邮件发送和公开管理 API。
- 项目内自建 Google OAuth、Passkey 主登录、管理员密码/TOTP 或找回流程。
- 依靠 JS 混淆、隐藏路由、前端哈希比较或 `localStorage` 标记提供安全性。

## Dependencies And Risks

- Google OAuth Client 需要项目所有者在 Google Cloud 创建；Client ID/Secret 通过 Cloudflare Zero Trust 安全录入，不写入任务文档。
- Cloudflare Zero Trust 免费方案适合 50 人以内，Independent MFA 官方文档未标注独立付费门槛；部署前必须先验证当前账号可创建所需 IdP、MFA 和 Access policy。
- Cloudflare Access 或 Google IdP 故障时，公网管理端不可用，但现有邀请码和用户会话继续由源站鉴权服务处理；SSH break-glass 保留最小运维能力。
- Access 签名密钥会轮换，永久写死单个公钥会造成停机，必须使用远程 JWKS 缓存与刷新。
- 工作区已有与本任务无关的 Trellis、配置和容器文件改动；实施时必须逐文件保留，不能覆盖或顺带提交。
