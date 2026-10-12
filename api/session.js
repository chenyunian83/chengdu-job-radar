var auth = require("../lib/auth");

function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (error) { return {}; }
  }
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try { auth.getConfig(); } catch (error) {
    return res.status(503).json({ code: error.code || "AUTH_NOT_CONFIGURED", message: error.message });
  }
  if (req.method === "GET") {
    return res.status(200).json({ authenticated: auth.isAuthenticated(req) });
  }
  if (req.method === "POST") {
    if (!auth.isSameOrigin(req)) return res.status(403).json({ message: "请求来源无效，请从本站登录。" });
    if (!auth.verifyPassword(bodyOf(req).password)) return res.status(401).json({ message: "访问密码不正确。" });
    auth.setSessionCookie(req, res);
    return res.status(200).json({ authenticated: true });
  }
  if (req.method === "DELETE") {
    if (!auth.isSameOrigin(req)) return res.status(403).json({ message: "请求来源无效，请从本站操作。" });
    auth.clearSessionCookie(req, res);
    return res.status(200).json({ authenticated: false });
  }
  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ message: "不支持的请求方式。" });
};
