var store = require("../lib/storage");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "只支持 GET 请求。" });
  }
  try {
    var snapshot = await store.getJobs();
    if (!snapshot) return res.status(200).json({
      jobs: [],
      updatedAt: null,
      source: "Google Jobs via SerpApi",
      message: process.env.SERPAPI_KEY ? "等待首次定时更新。" : "尚未配置职位搜索源：请在 Vercel 添加 SERPAPI_KEY。"
    });
    return res.status(200).json(snapshot);
  } catch (error) {
    var missing = error.code === "STORAGE_NOT_CONFIGURED";
    return res.status(missing ? 503 : 502).json({
      jobs: [],
      updatedAt: null,
      code: error.code || "STORAGE_ERROR",
      message: missing
        ? "职位缓存尚未配置：请在 Vercel 添加 Upstash Redis 环境变量。"
        : "暂时无法读取职位缓存，请检查 Upstash Redis 配置。"
    });
  }
};
