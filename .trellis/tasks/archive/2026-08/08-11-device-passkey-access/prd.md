# 设备长期授权与 Passkey 恢复

## Goal

让用户完成一次邀请码激活后，在同一设备的不同浏览器或 Cookie 丢失后仍能恢复访问；日常打开网站不再重复输入邀请码，也不因后台续期请求丢失而失去授权。

## Background and Evidence

- 当前公开站点使用 `__Host-filmframe_session` 浏览器 Cookie，Cookie 与浏览器 Profile 绑定，无法代表物理设备。
- [App.tsx:279](/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/App.tsx:279) 启动时 fire-and-forget 调用 `/auth/refresh`。
- [server/access/src/store.ts:659](/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/server/access/src/store.ts:659) 会在响应抵达浏览器前替换数据库中的 `token_hash`；响应丢失时旧 Cookie 立即失效。
- 现有会话有效期为 400 天滚动；邀请码自然过期不会终止已签发会话。
- 线上数据库检查显示会话数据持久化正常，问题不是数据库卷丢失、邀请码自然过期或生产切换造成的。

## Product Decisions

- “永久记住”定义为：只要设备持续使用，授权可无限滚动延长；用户清除站点数据、管理员撤销设备/邀请码，或设备长期超过 400 天未使用时需要恢复，不承诺浏览器无法清理的数据永久存在。
- 首次邀请码兑换后提供“在此设备上记住我”Passkey 注册；用户可以稍后设置，Cookie 仍然立即可用。
- Passkey 允许系统同步（Apple iCloud 钥匙串、Google 密码管理器等），优先保证 Android、Windows、macOS 与跨浏览器的可恢复性；不宣称严格的物理设备唯一性。
- Cookie 有效时完全无感；Cookie 不存在或失效时，用户通过一次系统生物识别/PIN 使用 Passkey 恢复，不重新消耗邀请码。
- 不使用浏览器指纹、IP、MAC、硬件序列号或前端 `localStorage` 作为授权依据。

## Requirements

### R1. Stable rolling session

- 保留现有 opaque session token 和 400 天滚动有效期。
- `/auth/refresh` 只更新 `last_seen_at`、`expires_at`，不得更换 `token_hash`。
- 成功刷新可以用同一个 token 重发 `Set-Cookie` 以延长浏览器 Max-Age；响应丢失不得令现有 Cookie 失效。
- 保留 exact Origin、CSRF、Host、撤销和过期检查。
- 现有邀请码兑换仍只生成一个随机会话，不增加兑换次数。

### R2. Passkey registration

- 只有有效公开会话可以创建注册 challenge 和验证注册结果。
- 使用固定公开站点 origin/RP ID，`userVerification: required`、`residentKey: required`、隐私友好的 `attestation: none`。
- Passkey 归属邀请码授权，不保存用户邮箱、照片或私钥。
- 记录 credential ID、公钥、签名计数器、同步/设备类型、transports、创建/最近使用时间和撤销时间。
- Challenge 必须服务端一次性消费，具有短 TTL，不能跨会话或跨邀请码使用。

### R3. Passkey recovery

- 未携带有效 session Cookie 的 `/access` 页面显示 Passkey 解锁入口；不支持 WebAuthn 的浏览器保留邀请码输入入口。
- 认证 challenge 必须 exact Origin、短 TTL、一次性消费，并验证公钥、RP ID、origin、用户验证和授权所属邀请码状态。
- 恢复成功创建新的浏览器 session，不消耗邀请码 `redemption_count`，并设置同样的 HttpOnly Cookie。
- 邀请码或 Passkey 被管理员撤销后，恢复和后续请求立即失败。
- 认证失败使用不泄露内部状态的统一文案，接口不得回显 credential ID、公钥或用户信息。

### R4. User experience

- 首次兑换后的引导页明确说明“记住此设备”，提供注册、稍后设置两个路径。
- 已有有效 Cookie 的用户直接进入应用，不显示登录或 Passkey 弹窗。
- 应用现有工具菜单提供再次打开设备授权设置的入口，便于已有会话补注册。
- Access 页的 Passkey 解锁使用中文可访问控件、加载/成功/失败状态和键盘焦点管理。
- 照片、EXIF、Canvas、Blob 和渲染结果继续只在浏览器处理，不发送到 Access 服务。

### R5. Administrator controls

- 管理页面显示设备凭证的非敏感元数据：凭证短标识、同步/设备类型、创建时间、最近使用、状态。
- 管理员可以单独撤销 Passkey；撤销邀请码仍级联撤销其全部 session 和 Passkey。
- 审计事件只记录目标 ID 和影响数量，不记录 challenge、Cookie、JWT、邀请码明文或公钥原文。

### R6. Compatibility and rollout

- Android Chrome/Edge、Windows Chrome/Edge/Firefox、macOS Safari/Chrome/Edge 使用标准 WebAuthn 能力；不支持时保留 Cookie/邀请码回退。
- 数据库迁移必须向后兼容旧数据；旧版本回滚时新增表可保留且不影响邀请码和 session。
- 使用维护良好的 WebAuthn 服务端库，禁止手写公钥解析、签名验证或 CBOR 解析。
- 生产发布和版本号更新另行执行，不在本任务中直接切换线上环境。

## Acceptance Criteria

- [ ] 同一个 session token 连续刷新两次后仍可访问，刷新响应丢失/Abort 后原 Cookie 仍可访问。
- [ ] 现有有效 Cookie 的启动路径不显示邀请码页或 Passkey 弹窗。
- [ ] 有效 session 能完成 Passkey 注册；重复 credential、过期 challenge、跨 session challenge 和错误 origin 均被拒绝。
- [ ] 新浏览器无 session Cookie 时可使用已注册 Passkey 恢复访问，且不增加邀请码兑换次数。
- [ ] 撤销单个 Passkey、撤销邀请码、过期授权后的访问和恢复行为符合预期。
- [ ] 管理页面能列出并单独撤销 Passkey，敏感字段不会出现在 HTML、API、日志或审计事件中。
- [ ] WebAuthn 不可用时 Access 页仍可使用原邀请码流程；公开站点和图片本地处理边界不变。
- [ ] SQLite 迁移、Node 22 Access 构建、根测试、Access 测试、类型检查、浏览器流程和部署合同通过。

## Out of Scope

- 不实现普通用户 Google 登录或公共 OAuth 账号体系。
- 不实现客户端证书、原生 App、硬件序列号识别、浏览器指纹或 IP 绑定。
- 不强制拒绝同步 Passkey，不保证严格的单一物理设备唯一性。
- 不修改 Cloudflare Access 管理员登录策略，不把照片处理移到服务端。
- 不在本任务中直接创建 GitHub Release、生产切换或清理现有授权数据。

## Open Questions

无。用户已批准优先兼容性和无感日常访问的 Passkey 方案。
