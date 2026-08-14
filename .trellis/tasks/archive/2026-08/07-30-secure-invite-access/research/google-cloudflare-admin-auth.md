# Google 登录与 Passkey 管理认证方案

## 推荐结论

管理子域使用 Cloudflare Access Google IdP，并启用 Access Independent MFA 的 WebAuthn biometrics/security key。项目所有者已确认 Google 与 Passkey 必须同时通过，不提供两个可替代入口。

请求链路：

```text
管理员浏览器
  -> Cloudflare Access Google IdP（精确邮箱白名单）
  -> Cloudflare Independent MFA（WebAuthn）
  -> 独立管理子域
  -> OpenResty
  -> 管理服务验证 Cf-Access-Jwt-Assertion
  -> 生成 / 查询 / 撤销邀请码
```

项目不自行处理 Google authorization code、Google refresh token 或 Passkey 私钥，也不维护第二套管理员账号系统。

## Google IdP

Cloudflare 官方支持在没有 Google Workspace 的情况下接入普通 Google 账号：

- <https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/>

Google OAuth Client 类型为 Web application：

- Authorized JavaScript origin 使用 Cloudflare Access team domain。
- Redirect URI 使用 team domain 下的 `/cdn-cgi/access/callback`。
- Google Client Secret 仅保存到 Cloudflare Zero Trust IdP 配置，视为密码，不进入项目或服务器。
- 启用 PKCE。

External audience 允许任何 Gmail 账号完成身份验证，因此授权策略必须精确 Include 指定管理员邮箱，并 Require `Login Methods = Google`。只限制登录方式会错误地允许所有有效 Google 账号。

Access application 与 policy 参考：

- <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/>
- <https://developers.cloudflare.com/cloudflare-one/access-controls/policies/>

## Independent MFA

Cloudflare Access Independent MFA 原生支持：

- WebAuthn security key；
- WebAuthn biometrics，包括 Touch ID、Face ID 和 Windows Hello；
- 多个安全密钥或多个 biometrics 凭据。

官方说明：

- <https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/independent-mfa/>

建议仅为管理应用启用 biometrics/security key，并设置 8-12 小时 MFA authentication duration。关闭 `Use identity provider MFA` 的 AMR 复用，否则 Google 返回的匹配 AMR 可能跳过独立 WebAuthn 提示，无法保证两个因素都经过验证。

管理员通过 Cloudflare App Launcher 登记至少两个 MFA 凭据。凭据丢失时，由 Cloudflare Zero Trust 管理员在 dashboard/API 删除旧凭据后重新登记；应用自身不提供找回入口。

## AND 与 OR

### Google AND Passkey（已确认）

Google 确认管理员身份，Independent MFA 再确认管理员持有已登记设备或安全密钥。任一因素单独泄露都不能签发邀请码，适合低频、高权限的管理操作。

### Google OR Passkey

任一路径均可独立进入，整体安全性等于较弱路径；Google 会话或账号一旦被接管，攻击者可绕过 Passkey。实现还需要项目自建 Passkey 主登录、账号绑定、会话合并和恢复逻辑，因此不推荐。

## 源站验证

Cloudflare 明确要求源站验证 Access JWT，不能只检查请求头或依赖橙云：

- <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/>

管理服务优先读取 `Cf-Access-Jwt-Assertion`，使用 Access team domain 的 JWKS 验证：

- 仅允许 RS256；
- exact issuer；
- 管理应用专属 audience；
- `exp` / `nbf`；
- 精确管理员身份 claim。

使用成熟 JOSE 库和远程 JWKS 缓存。Access 签名密钥默认约每 6 周轮换，旧密钥保留约 7 天，因此必须自动刷新 JWKS，不能把单个公钥永久写死。

管理容器仍只监听回环或私有容器网络。直连源站、伪造 Host 或自行添加 `Cf-Access-*` 头都无法生成有效签名，验证失败时必须 fail closed。

## 会话与请求保护

- Cloudflare Access 会话和 MFA 时长设置为有限值，建议 8-12 小时。
- 前端不读取或复制 `CF_Authorization`，不把 Access JWT 写入 `localStorage`。
- 所有写操作使用 POST/DELETE，校验 exact Origin 和 CSRF token；不开放 credentialed CORS。
- 管理接口与普通邀请码接口完全分离，普通邀请码 Cookie 在管理子域没有权限。
- 日志对 JWT、Cookie、Google identity token、邀请码和错误详情做脱敏。

## 成本与约束

Cloudflare 官方资料说明 Zero Trust 免费方案适合不超过 50 名用户；Independent MFA 文档未标注独立付费门槛。实施前仍需在当前 Cloudflare 账号中确认 Google IdP、Independent MFA 和目标策略均可创建，再将其作为部署前置检查。

## 验收矩阵

- 白名单 Google + 有效 WebAuthn -> 管理页面和 API 可用。
- 白名单 Google、无 WebAuthn -> 若采用 AND，拒绝。
- 非白名单 Google + WebAuthn -> 拒绝。
- 缺失、伪造、篡改、过期、错误 issuer/audience 的 Access JWT -> 拒绝。
- 通过 Cloudflare 后直连源站与伪造 Host/Access 头 -> 拒绝。
- 管理员可在 iOS Safari、Android Chrome、桌面 Safari/Chrome/Edge 完成登录；至少登记两个 MFA 凭据。
- 删除 MFA 凭据或撤销 Access session 后，下一次管理请求立即失败。
- Google Client Secret、JWT、邀请码和 Cookie 明文不出现在仓库、构建、数据库明文字段或日志。
