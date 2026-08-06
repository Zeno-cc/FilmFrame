export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1_000;
export const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const ACCESS_FORM_NONCE_TTL_MS = 10 * 60 * 1_000;
export const PRODUCTION_SESSION_COOKIE = "__Host-filmframe_session";
export const DEVELOPMENT_SESSION_COOKIE = "filmframe_session_dev";
export const PRODUCTION_REDEEM_COOKIE = "__Host-filmframe_redeem";
export const DEVELOPMENT_REDEEM_COOKIE = "filmframe_redeem";

export const GENERIC_INVITE_ERROR = "邀请码无效或已失效，请检查后重试。";
