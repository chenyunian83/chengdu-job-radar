var searches = [
  { category: "外贸", q: "成都 外贸业务员 外贸销售 英语" },
  { category: "跨境电商", q: "成都 跨境电商运营 Amazon 英语" },
  { category: "海外销售", q: "成都 海外销售 国际销售 英语" },
  { category: "国际运营", q: "成都 国际运营 海外运营 英语" },
  { category: "海外市场", q: "成都 海外市场 国际市场 英语" }
];

function normalize(raw, category, fetchedAt) {
  var apply = Array.isArray(raw.apply_options) ? raw.apply_options : [];
  var ext = raw.detected_extensions || {};
  var location = raw.location || "成都";
  return {
    id: String(raw.job_id || [raw.title, raw.company_name, location].join("|")),
    title: raw.title || "职位名称未提供",
    company: raw.company_name || "招聘企业",
    location: location,
    salary: ext.salary || "",
    posted: ext.posted_at || "",
    description: raw.description || "",
    category: category,
    via: raw.via || (apply[0] && apply[0].title) || "Google Jobs",
    applyUrl: (apply[0] && apply[0].link) || "",
    shareUrl: raw.share_link || "",
    workType: ext.schedule_type || "",
    seenAt: fetchedAt
  };
}

async function searchOne(item, key, fetchedAt) {
  var params = new URLSearchParams({
    engine: "google_jobs",
    q: item.q,
    location: "Chengdu, Sichuan, China",
    google_domain: "google.com",
    gl: "cn",
    hl: "zh-CN",
    api_key: key
  });
  var response = await fetch("https://serpapi.com/search.json?" + params.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25000)
  });
  var payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error || "职位搜索服务响应异常。");
  }
  return (payload.jobs_results || []).map(function (job) {
    return normalize(job, item.category, fetchedAt);
  });
}

async function collectJobs() {
  var key = process.env.SERPAPI_KEY;
  if (!key) {
    var error = new Error("未配置 SERPAPI_KEY。");
    error.code = "SOURCE_NOT_CONFIGURED";
    throw error;
  }
  var fetchedAt = new Date().toISOString();
  var results = await Promise.allSettled(searches.map(function (item) {
    return searchOne(item, key, fetchedAt);
  }));
  var jobs = new Map();
  var errors = [];
  results.forEach(function (result, index) {
    if (result.status === "fulfilled") {
      result.value.forEach(function (job) {
        if (!jobs.has(job.id)) jobs.set(job.id, job);
      });
    } else {
      errors.push(searches[index].category + ": " + result.reason.message);
    }
  });
  if (!jobs.size && errors.length) throw new Error(errors.join("; "));
  return {
    jobs: Array.from(jobs.values()),
    updatedAt: fetchedAt,
    source: "Google Jobs via SerpApi",
    completedQueries: results.filter(function (r) { return r.status === "fulfilled"; }).length,
    warnings: errors
  };
}

module.exports = { collectJobs: collectJobs };
