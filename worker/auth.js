const COOKIE_NAME = "job_radar_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

function authConfig(env) {
  const password = env.APP_PASSWORD || "";
  const secret = env.APP_SESSION_SECRET || "";
  if (password.length < 16 || encoder.encode(secret).length < 32) {
    const error = new Error("请在 Cloudflare 配置至少 16 位的 APP_PASSWORD 和至少 32 字节的 APP_SESSION_SECRET。");
    error.code = "AUTH_NOT_CONFIGURED";
    throw error;
  }
  return { password, secret };
}

function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let mismatch = a.length ^ b.length;
  for (let i = 0, length = Math.max(a.length, b.length); i < length; i += 1) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

async function sign(expiry, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(expiry)));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function tokenFrom(request) {
  const prefix = COOKIE_NAME + "=";
  for (const item of (request.headers.get("Cookie") || "").split(";")) {
    const part = item.trim();
    if (part.startsWith(prefix)) return part.slice(prefix.length);
  }
  return "";
}

async function isAuthenticated(request, env) {
  const config = authConfig(env);
  const parts = tokenFrom(request).split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || Number(parts[0]) <= Math.floor(Date.now() / 1000)) return false;
  return constantTimeEqual(await sign(parts[0], config.secret), parts[1]);
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function verifyPassword(value, env) {
  const config = authConfig(env);
  return typeof value === "string" && constantTimeEqual(value, config.password);
}

async function sessionCookie(request, env) {
  const config = authConfig(env);
  const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return COOKIE_NAME + "=" + expiry + "." + await sign(expiry, config.secret) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + SESSION_SECONDS + secure;
}

function expiredCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return COOKIE_NAME + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + secure;
}

export { authConfig, isAuthenticated, sameOrigin, verifyPassword, sessionCookie, expiredCookie };
