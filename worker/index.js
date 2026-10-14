import { collectJobs } from "./provider.js";
import { collectZhaopin, jobId } from "./zhaopin.js";
import { authConfig, isAuthenticated, sameOrigin, verifyPassword, sessionCookie, expiredCookie } from "./auth.js";

const VALID_STATUSES = ["new", "applied", "interview"];
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      ...headers
    }
  });
}

async function readBody(request, maxBytes = 1000000) {
  const announced = Number(request.headers.get("Content-Length") || 0);
  if (announced > maxBytes) throw new Error("请求内容过大。");
  const raw = await request.text();
  if (encoder.encode(raw).length > maxBytes) throw new Error("请求内容过大。");
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error("请求内容格式不正确。"); }
}

function validateApplications(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("求职记录格式不正确。");
  const entries = Object.entries(value);
  if (entries.length > 3000) throw new Error("求职记录数量超出限制。");
  const output = [];
  for (const [id, record] of entries) {
    if (!id || id.length > 512 || ["__proto__", "constructor", "prototype"].includes(id)) throw new Error("求职记录编号无效。");
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("求职记录内容无效。");
    const status = VALID_STATUSES.includes(record.status) ? record.status : "new";
    function timestamp(value) {
      if (value === null || value === "") return null;
      if (typeof value !== "string") throw new Error("投递或面试时间格式不正确。");
      const milliseconds = Date.parse(value);
      if (Number.isNaN(milliseconds)) throw new Error("投递或面试时间格式不正确。");
      return new Date(milliseconds).toISOString();
    }
    const normalized = {
      saved: record.saved === true,
      status,
      appliedAt: timestamp(record.appliedAt),
      interviewAt: timestamp(record.interviewAt),
      updatedAt: timestamp(record.updatedAt) || new Date().toISOString()
    };
    output.push({ id, record: normalized });
  }
  return output;
}

async function saveSnapshot(env, snapshot) {
  const values = [
    ["jobs_snapshot", JSON.stringify(snapshot.jobs)],
    ["sources_snapshot", JSON.stringify(snapshot.sources)],
    ["jobs_updated_at", snapshot.updatedAt],
    ["source_summary", JSON.stringify(snapshot.sourceSummary || {})]
  ];
  const statements = values.map(([key, value]) => env.DB.prepare(
    "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(key, value));
  await env.DB.batch(statements);
}

async function upsertJobs(env, jobs, checkedAt) {
  const unique = new Map();
  for (const row of jobs) {
    if (!row.title || !row.company || !row.applyUrl) continue;
    const job = { ...row, id: await jobId(row) };
    const previous = unique.get(job.id);
    if (!previous || job.via === "企业官网") unique.set(job.id, job);
  }
  const statements = Array.from(unique.values()).map((job) => env.DB.prepare(
    "INSERT INTO job_cache (id, payload, first_seen, last_seen, published_at, source) VALUES (?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, last_seen = excluded.last_seen, published_at = excluded.published_at, source = excluded.source"
  ).bind(job.id, JSON.stringify(job), checkedAt, checkedAt, job.posted || "", job.via || "企业官网"));
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
  return unique.size;
}

async function refresh(env) {
  if (!env.DB) throw new Error("Cloudflare D1 binding DB 尚未配置。");
  const checkedAt = new Date().toISOString();
  const [officialResult, platformResult] = await Promise.allSettled([collectJobs(env), collectZhaopin(checkedAt)]);
  const official = officialResult.status === "fulfilled" ? officialResult.value : null;
  const platform = platformResult.status === "fulfilled" ? platformResult.value : null;
  if (!official && !platform) throw new Error("两个职位来源均巡检失败。");
  const jobs = [...(official?.jobs || []), ...(platform?.jobs || [])];
  const added = await upsertJobs(env, jobs, checkedAt);
  const warnings = [
    ...(official?.sourceSummary?.warnings || []), ...(platform?.warnings || []),
    ...(!official ? ["企业官网巡检失败：" + String(officialResult.reason?.message || "未知错误")] : []),
    ...(!platform ? ["智联招聘巡检失败：" + String(platformResult.reason?.message || "未知错误")] : [])
  ];
  const snapshot = {
    jobs, sources: [...(official?.sources || []), ...(platform?.sources || [])], updatedAt: checkedAt,
    sourceSummary: {
      ...(official?.sourceSummary || {}),
      platformPagesChecked: platform?.pagesChecked || 0,
      platformJobsFound: platform?.jobs.length || 0,
      jobsUpserted: added, warnings
    }
  };
  await saveSnapshot(env, snapshot);
  return snapshot;
}

async function jobsRoute(env) {
  if (!env.DB) return json({ jobs: [], sources: [], updatedAt: null, message: "Cloudflare D1 尚未配置，请先创建数据库并部署迁移。" }, 503);
  try {
    const today = new Date();
    const seenCutoff = new Date(today.getTime() - 14 * 86400000).toISOString();
    const publishedCutoff = new Date(today.getTime() - 60 * 86400000).toISOString();
    const [result, cached] = await Promise.all([
      env.DB.prepare("SELECT key, value FROM metadata WHERE key IN ('sources_snapshot', 'jobs_updated_at', 'source_summary')").all(),
      env.DB.prepare("SELECT payload FROM job_cache WHERE last_seen >= ? AND (published_at = '' OR published_at >= ?) ORDER BY published_at DESC LIMIT 500").bind(seenCutoff, publishedCutoff).all()
    ]);
    const metadata = Object.create(null);
    for (const row of result.results || []) metadata[row.key] = row.value;
    const jobs = (cached.results || []).map((row) => JSON.parse(row.payload));
    return json({
      jobs, sources: metadata.sources_snapshot ? JSON.parse(metadata.sources_snapshot) : [],
      updatedAt: metadata.jobs_updated_at || null,
      sourceSummary: metadata.source_summary ? JSON.parse(metadata.source_summary) : null,
      message: jobs.length || metadata.jobs_updated_at ? null : "等待第一次职位巡检任务运行。"
    });
  } catch (error) {
    console.error("Read job cache failed:", error?.message || error);
    return json({ jobs: [], sources: [], updatedAt: null, message: "无法读取D1职位缓存；请确认已运行数据库迁移。" }, 503);
  }
}

async function sessionRoute(request, env) {
  let configured = true;
  try { authConfig(env); } catch { configured = false; }
  if (!configured) return json({ code: "AUTH_NOT_CONFIGURED", message: "请在 Cloudflare 添加 APP_PASSWORD 和 APP_SESSION_SECRET。" }, 503);
  if (request.method === "GET") {
    try { return json({ authenticated: await isAuthenticated(request, env) }); }
    catch { return json({ authenticated: false }, 401); }
  }
  if (!sameOrigin(request)) return json({ message: "请求来源无效，请从本站操作。" }, 403);
  if (request.method === "POST") {
    let body;
    try { body = await readBody(request, 10000); } catch (error) { return json({ message: error.message }, 400); }
    if (!(await verifyPassword(body.password, env))) return json({ message: "访问密码不正确。" }, 401);
    return json({ authenticated: true }, 200, { "Set-Cookie": await sessionCookie(request, env) });
  }
  if (request.method === "DELETE") return json({ authenticated: false }, 200, { "Set-Cookie": expiredCookie(request) });
  return json({ message: "不支持的请求方式。" }, 405, { Allow: "GET, POST, DELETE" });
}

async function applicationsRoute(request, env) {
  try {
    if (!await isAuthenticated(request, env)) return json({ message: "请先解锁个人求职记录。" }, 401);
  } catch {
    return json({ code: "AUTH_NOT_CONFIGURED", message: "个人记录登录尚未配置。" }, 503);
  }
  if (!env.DB) return json({ message: "Cloudflare D1 尚未配置，无法读取个人记录。" }, 503);
  if (request.method === "GET") {
    try {
      const result = await env.DB.prepare("SELECT id, payload FROM applications ORDER BY updated_at DESC").all();
      const applications = Object.create(null);
      for (const row of result.results || []) applications[row.id] = JSON.parse(row.payload);
      return json({ applications });
    } catch { return json({ message: "暂时无法读取云端求职记录。" }, 503); }
  }
  if (request.method === "PUT") {
    if (!sameOrigin(request)) return json({ message: "请求来源无效，请从本站操作。" }, 403);
    let entries;
    try { entries = validateApplications((await readBody(request)).applications); }
    catch (error) { return json({ message: error.message || "求职记录格式不正确。" }, 400); }
    try {
      const statements = entries.map(({ id, record }) => env.DB.prepare(
        "INSERT INTO applications (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
      ).bind(id, JSON.stringify(record), record.updatedAt));
      for (let i = 0; i < statements.length; i += 100) await env.DB.batch(statements.slice(i, i + 100));
      const applications = Object.create(null);
      for (const entry of entries) applications[entry.id] = entry.record;
      return json({ applications });
    } catch { return json({ message: "暂时无法保存云端求职记录。" }, 503); }
  }
  return json({ message: "不支持的请求方式。" }, 405, { Allow: "GET, PUT" });
}

async function apiRoute(request, env) {
  const path = new URL(request.url).pathname;
  if (path === "/api/jobs" && request.method === "GET") return jobsRoute(env);
  if (path === "/api/session") return sessionRoute(request, env);
  if (path === "/api/applications") return applicationsRoute(request, env);
  if (path === "/api/refresh") {
    if (request.method !== "POST") return json({ message: "只支持 POST 请求。" }, 405, { Allow: "POST" });
    if (!env.CRON_SECRET || request.headers.get("Authorization") !== "Bearer " + env.CRON_SECRET) return json({ message: "请求未授权。" }, 401);
    try {
      const snapshot = await refresh(env);
      return json({ updatedAt: snapshot.updatedAt, jobsFound: snapshot.jobs.length, pagesChecked: snapshot.sources.length });
    } catch (error) {
      return json({ message: error.code === "SOURCE_NOT_CONFIGURED" ? error.message : "职位巡检失败，请检查来源和D1配置。" }, error.code === "SOURCE_NOT_CONFIGURED" ? 503 : 502);
    }
  }
  return json({ message: "未找到 API。" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return apiRoute(request, env);
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refresh(env).catch((error) => {
      console.error("Daily job crawl failed:", error && error.message || error);
    }));
  }
};

export { refresh, saveSnapshot, validateApplications };
