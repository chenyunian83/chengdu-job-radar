var provider = require("../lib/provider");
var store = require("../lib/storage");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "只支持 GET 请求。" });
  }
  var secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: "尚未配置 CRON_SECRET。" });
  if (req.headers.authorization !== "Bearer " + secret) {
    return res.status(401).json({ message: "未授权的更新请求。" });
  }
  try {
    var snapshot = await provider.collectJobs();
    await store.putJobs(snapshot);
    return res.status(200).json({
      ok: true,
      count: snapshot.jobs.length,
      updatedAt: snapshot.updatedAt,
      completedQueries: snapshot.completedQueries,
      warnings: snapshot.warnings
    });
  } catch (error) {
    console.error("Daily job refresh failed:", error.message);
    var missingConfig = error.code === "SOURCE_NOT_CONFIGURED" || error.code === "STORAGE_NOT_CONFIGURED";
    return res.status(missingConfig ? 503 : 502).json({
      code: error.code || "REFRESH_FAILED",
      message: error.code === "STORAGE_NOT_CONFIGURED"
        ? "职位缓存尚未配置：请在 Vercel 添加 Upstash Redis 环境变量。"
        : error.message || "每日职位更新失败。"
    });
  }
};
