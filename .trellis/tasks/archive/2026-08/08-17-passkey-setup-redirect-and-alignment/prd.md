# Complete passkey setup navigation and button alignment

## Goal

完成设备 Passkey 设置流程的收尾交互：注册成功后自动进入 FilmFrame 主页面，并修正“稍后设置”按钮文字的垂直对齐，让授权页在桌面和移动布局下都保持稳定、可读。

## Requirements

- 在 /access/passkey/setup 页面，只有 Passkey 注册接口返回成功后才自动导航到 /；失败、取消或浏览器不支持时保留当前错误/提示状态，不得误跳转。
- “稍后设置”继续作为返回主页面的可见链接，链接的文字在按钮区域内水平、垂直居中，并与“设置设备 Passkey”按钮保持一致的可点击高度。
- 保留现有设备授权、错误提示、CSRF 请求和主页面路由行为，不改动邀请码、数据库或主应用业务逻辑。
- 覆盖桌面和移动响应式布局；不引入新的运行时依赖或抽象层。

## Confirmed Facts

- server/access/src/views/html.ts:102-106 renders the setup page and currently emits the “稍后设置” anchor beside the registration button.
- server/access/src/views/html.ts:107-108 currently sets the button text to “已设置” after a successful registration but does not navigate.
- server/access/src/views/html.ts:108 has mobile-only text alignment, but the shared field row has no vertical alignment rule, so the anchor text can sit high relative to the button box.
- server/access/src/routes/publicRoutes.ts:171 redirects a redeemed invite to the setup page, while /access/passkey/setup and / are already the supported destinations.

## Acceptance Criteria

- [ ] A successful Passkey registration (/auth/passkeys/registration/verify returns 2xx) navigates the browser to / once, without leaving the setup page visible.
- [ ] Registration options/verification failures, user cancellation, and unsupported browsers keep the user on the setup page and show the existing recovery message.
- [ ] The “稍后设置” label is visually centered within its bordered control on desktop and mobile, with no change to its / destination.
- [ ] Existing access/passkey tests and the relevant frontend checks pass; git diff --check is clean.
- [ ] The change is limited to the access-page view/test coverage; no FilmFrame image-processing or deployment behavior changes.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
