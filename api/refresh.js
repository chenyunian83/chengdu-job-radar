var provider = require("../lib/provider");
var store = require("../lib/storage");

module.exports = async function handler(req, res) {
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
    return res.status(502).json({ message: error.message || "每日职位更新失败。" });
  }
};
