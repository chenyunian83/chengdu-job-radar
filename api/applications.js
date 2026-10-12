var auth = require("../lib/auth");
var store = require("../lib/storage");
var VALID_STATUSES = ["new", "applied", "interview"];

function parseTimestamp(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  var time = Date.parse(value);
  return isNaN(time) ? undefined : new Date(time).toISOString();
}

function cleanRecords(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("求职记录格式不正确。");
  var ids = Object.keys(value);
  if (ids.length > 3000) throw new Error("求职记录数量超出限制。");
  var clean = Object.create(null);
  ids.forEach(function (id) {
    if (!id || id.length > 512 || id === "__proto__" || id === "constructor" || id === "prototype") throw new Error("职位记录标识不正确。");
    var item = value[id];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("职位记录内容不正确。");
    var status = VALID_STATUSES.indexOf(item.status) >= 0 ? item.status : "new";
    var appliedAt = parseTimestamp(item.appliedAt);
    var interviewAt = parseTimestamp(item.interviewAt);
    var updatedAt = parseTimestamp(item.updatedAt);
    if (appliedAt === undefined || interviewAt === undefined || updatedAt === undefined) throw new Error("投递或面试时间格式不正确。");
    clean[id] = {
      saved: item.saved === true,
      status: status,
      appliedAt: appliedAt,
      interviewAt: interviewAt,
      updatedAt: updatedAt || new Date().toISOString()
    };
  });
  return clean;
}

function mergeRecords(current, incoming) {
  var merged = Object.create(null);
  Object.keys(current).forEach(function (id) { merged[id] = current[id]; });
  Object.keys(incoming).forEach(function (id) {
    var old = merged[id];
    if (!old || Date.parse(incoming[id].updatedAt) >= Date.parse(old.updatedAt)) merged[id] = incoming[id];
  });
  return merged;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try { auth.getConfig(); } catch (error) {
    return res.status(503).json({ code: error.code || "AUTH_NOT_CONFIGURED", message: error.message });
  }
  if (!auth.isAuthenticated(req)) return res.status(401).json({ message: "请先解锁个人求职记录。" });
  if (req.method === "GET") {
    try { return res.status(200).json({ applications: await store.getApplications() || {} }); }
    catch (error) {
      var missing = error.code === "STORAGE_NOT_CONFIGURED";
      return res.status(missing ? 503 : 502).json({ code: error.code || "STORAGE_ERROR", message: missing ? "求职记录后端未配置 Upstash Redis。" : "暂时无法读取云端求职记录。" });
    }
  }
  if (req.method === "PUT") {
    if (!auth.isSameOrigin(req)) return res.status(403).json({ message: "请求来源无效，请从本站保存。" });
    var body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (error) { body = null; } }
    try {
      var incoming = cleanRecords(body && body.applications);
      var current = cleanRecords(await store.getApplications() || {});
      var merged = mergeRecords(current, incoming);
      await store.putApplications(merged);
      return res.status(200).json({ ok: true, applications: merged });
    } catch (error) {
      if (!error.code && /格式|数量|标识|内容|时间/.test(error.message)) return res.status(400).json({ message: error.message });
      var missing = error.code === "STORAGE_NOT_CONFIGURED";
      return res.status(missing ? 503 : 502).json({ code: error.code || "STORAGE_ERROR", message: missing ? "求职记录后端未配置 Upstash Redis。" : error.message || "暂时无法保存云端求职记录。" });
    }
  }
  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ message: "不支持的请求方式。" });
};
