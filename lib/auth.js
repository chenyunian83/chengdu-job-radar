var crypto = require("crypto");
var COOKIE_NAME = "job_radar_session";
var SESSION_SECONDS = 60 * 60 * 24 * 30;

function getConfig() {
  var password = process.env.APP_PASSWORD;
  var secret = process.env.APP_SESSION_SECRET;
  if (!password || password.length < 16 || !secret || Buffer.byteLength(secret, "utf8") < 32) {
    var error = new Error("请在 Vercel 配置至少 16 位的 APP_PASSWORD 和至少 32 字节的 APP_SESSION_SECRET。");
    error.code = "AUTH_NOT_CONFIGURED";
    throw error;
  }
  return { password: password, secret: secret };
}

function constantTimeEqual(left, right) {
  var a = Buffer.from(String(left));
  var b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyPassword(value) {
  var config = getConfig();
  return typeof value === "string" && constantTimeEqual(value, config.password);
}

function signature(expiry, secret) {
  return crypto.createHmac("sha256", secret).update(String(expiry)).digest("base64url");
}

function cookieToken(req) {
  var cookies = String((req.headers && req.headers.cookie) || "").split(";");
  for (var i = 0; i < cookies.length; i += 1) {
    var part = cookies[i].trim();
    if (part.indexOf(COOKIE_NAME + "=") === 0) return part.slice(COOKIE_NAME.length + 1);
  }
  return "";
}

function isAuthenticated(req) {
  var config = getConfig();
  var parts = cookieToken(req).split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return false;
  var expiry = Number(parts[0]);
  if (expiry <= Math.floor(Date.now() / 1000)) return false;
  return constantTimeEqual(signature(parts[0], config.secret), parts[1]);
}

function setSessionCookie(req, res) {
  var config = getConfig();
  var expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  var value = expiry + "." + signature(expiry, config.secret);
  var forwardedProto = String((req.headers && req.headers["x-forwarded-proto"]) || "").split(",")[0].trim();
  var secure = forwardedProto === "https" || process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", COOKIE_NAME + "=" + value + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + SESSION_SECONDS + (secure ? "; Secure" : ""));
}

function clearSessionCookie(req, res) {
  var forwardedProto = String((req.headers && req.headers["x-forwarded-proto"]) || "").split(",")[0].trim();
  var secure = forwardedProto === "https" || process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", COOKIE_NAME + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (secure ? "; Secure" : ""));
}

function isSameOrigin(req) {
  var origin = req.headers && req.headers.origin;
  if (!origin) return process.env.NODE_ENV !== "production";
  var forwarded = String((req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "").split(",")[0].trim();
  if (!forwarded) return false;
  try { return new URL(origin).host.toLowerCase() === forwarded.toLowerCase(); } catch (error) { return false; }
}

module.exports = {
  getConfig: getConfig,
  verifyPassword: verifyPassword,
  isAuthenticated: isAuthenticated,
  setSessionCookie: setSessionCookie,
  clearSessionCookie: clearSessionCookie,
  isSameOrigin: isSameOrigin
};
