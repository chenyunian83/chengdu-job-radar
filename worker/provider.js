const SEARCHES = [
  { category: "外贸", q: "成都 外贸业务员 外贸销售 招聘 官网" },
  { category: "跨境电商", q: "成都 跨境电商运营 Amazon 招聘 官网" },
  { category: "海外销售", q: "成都 海外销售 国际销售 招聘 公司" },
  { category: "国际运营", q: "成都 国际运营 海外运营 招聘 官网" },
  { category: "海外市场", q: "成都 海外市场 国际市场 英语 招聘" }
];

const SEEDS = [
  { url: "https://www.vinchin.cn/vinchin-employment-details.html?id=7", company: "成都云祺科技", category: "海外销售", title: "海外销售工程师" },
  { url: "https://www.boe.com/join/index", company: "京东方", category: "国际运营", title: "京东方招聘官网" }
];

const BLOCKED_DOMAINS = [
  "zhipin.com", "liepin.com", "zhaopin.com", "51job.com", "lagou.com", "jobui.com", "job5156.com",
  "58.com", "ganji.com", "yingjiesheng.com", "kanzhun.com", "maimai.cn", "linkedin.com", "indeed.com",
  "glassdoor.com", "monster.com", "myworkdayjobs.com", "workday.com", "icims.com", "successfactors.com", "oraclecloud.com", "greenhouse.io", "lever.co", "ashbyhq.com", "bamboohr.com", "smartrecruiters.com", "recruitee.com", "google.com", "bing.com", "baidu.com", "weibo.com", "zhihu.com",
  "xiaohongshu.com", "douyin.com", "wechat.com", "weixin.qq.com", "toutiao.com", "kuaishou.com"
];
const CAREER_PATH = /(?:career|careers|job|jobs|join|recruit|recruitment|talent|hr|zhaopin|position|employment|招聘|招贤|加入我们)/i;
const ROLE_TERMS = /外贸|跨境|海外|国际|外销|国际贸易|销售|商务|运营|市场|跟单|amazon|亚马逊|tiktok|英语|英文|english|export|trade|overseas|global|sales|marketing|business development|account executive/i;

function sameOfficialSite(left, right) {
  const a = left.toLowerCase().replace(/^www\./, "");
  const b = right.toLowerCase().replace(/^www\./, "");
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}
function isBlockedHost(host) {
  const value = host.toLowerCase().replace(/^www\./, "");
  return BLOCKED_DOMAINS.some((domain) => value === domain || value.endsWith("." + domain));
}

function isSafeHttpsUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      !isBlockedHost(host) && !host.includes(":") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) &&
      !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host);
  } catch { return false; }
}

async function readLimitedText(response, limit = 2000000) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("官网页面超过2MB抓取上限。");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function cleanText(value) {
  return String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

function findObjects(value, predicate, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) value.forEach((item) => findObjects(item, predicate, found));
  else {
    if (predicate(value)) found.push(value);
    Object.keys(value).forEach((key) => findObjects(value[key], predicate, found));
  }
  return found;
}

function jsonLdJobs(html) {
  const output = [];
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const body = script.replace(/^.*?>/s, "").replace(/<\/script>\s*$/i, "");
    try {
      const parsed = JSON.parse(body);
      output.push(...findObjects(parsed, (item) => {
        const type = item["@type"];
        return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      }));
    } catch { /* Ignore malformed structured data. */ }
  }
  return output;
}

function locationOf(job) {
  const locations = job.jobLocation ? (Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation]) : [];
  return locations.map((item) => {
    const address = item && item.address;
    if (typeof address === "string") return address;
    if (!address) return item && item.name || "";
    return [address.addressLocality, address.addressRegion, address.addressCountry && (address.addressCountry.name || address.addressCountry)].filter(Boolean).join(" ");
  }).join(" / ");
}

function categoryFor(text, fallback) {
  if (/外贸|export|trade/i.test(text)) return "外贸";
  if (/跨境|amazon|亚马逊|tiktok/i.test(text)) return "跨境电商";
  if (/海外销售|国际销售|overseas sales|global sales/i.test(text)) return "海外销售";
  if (/运营|operation/i.test(text)) return "国际运营";
  if (/市场|marketing/i.test(text)) return "海外市场";
  return fallback || "英语相关";
}

function postedDate(value, text) {
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const match = text.match(/(?:发布时间|发布日期|更新日期)\s*[:：]?\s*(20\d{2})年?\s*(\d{1,2})月\s*(\d{1,2})日?/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toISOString();
  return "";
}

function isExpiredPosting(value, checkedAt) {
  if (!value) return false;
  const expiry = Date.parse(value);
  if (Number.isNaN(expiry)) return false;
  const endOfDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? expiry + 86400000 - 1 : expiry;
  return endOfDate < (Date.parse(checkedAt) || Date.now());
}

function normalizedCity(place) {
  return /成都|chengdu/i.test(place) ? "成都" : place;
}

function extractJobs(html, url, candidate, checkedAt) {
  const pageTitle = cleanText((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const body = cleanText(html);
  const structured = jsonLdJobs(html);
  const rows = [];
  let expiredCount = 0;
  if (structured.length) {
    for (const raw of structured) {
      if (isExpiredPosting(raw.validThrough, checkedAt)) { expiredCount += 1; continue; }
      const title = cleanText(raw.title);
      const place = locationOf(raw) || (body.match(/(?:工作地点|工作地|常驻工作地)\s*[:：]?\s*([^，。;；]{2,40})/) || [])[1] || "";
      const fullText = [title, raw.description, raw.qualifications, raw.responsibilities].filter(Boolean).join(" ");
      if (!title || !ROLE_TERMS.test(fullText) || !/成都|chengdu/i.test(place)) continue;
      const org = raw.hiringOrganization && (raw.hiringOrganization.name || raw.hiringOrganization.legalName);
      rows.push({
        title, company: cleanText(org || candidate.company || pageTitle.split(/[|｜-]/).pop()),
        location: normalizedCity(place), salary: salaryOf(raw.baseSalary), posted: postedDate(raw.datePosted, body),
        description: cleanText(raw.description || "").slice(0, 1600),
        category: categoryFor(title + " " + fullText, candidate.category), via: "企业官网",
        sourceUrl: url, applyUrl: safeUrl(raw.url, url), shareUrl: safeUrl(raw.url, url), seenAt: checkedAt
      });
    }
  } else {
    const roleTitle = pageTitle.replace(/\s*[|｜–—-]\s*.*$/, "").trim();
    const locationMatch = body.match(/(?:工作地点|工作地|常驻工作地)\s*[:：]?\s*([^，。;；]{2,40})/);
    const place = locationMatch ? locationMatch[1] : (/成都|chengdu/i.test(body) ? "成都" : "");
    const bodyHasDuties = /岗位职责|任职要求|职位描述|工作内容|岗位要求/.test(body);
    if (roleTitle && ROLE_TERMS.test(roleTitle) && ROLE_TERMS.test(body) && /成都|chengdu/i.test(place) && bodyHasDuties) {
      const titleSuffix = pageTitle.match(/[-–—|｜]\s*([^|｜-]+)$/);
      const company = candidate.company || (titleSuffix && titleSuffix[1]) || new URL(url).hostname.replace(/^www\./, "");
      const start = body.indexOf("岗位职责");
      const description = (start >= 0 ? body.slice(start, start + 1000) : body).slice(0, 1000);
      rows.push({
        title: roleTitle, company: cleanText(company), location: normalizedCity(place), salary: "",
        posted: postedDate("", body), description, category: categoryFor(roleTitle + " " + body, candidate.category),
        via: "企业官网", sourceUrl: url, applyUrl: url, shareUrl: url, seenAt: checkedAt
      });
    }
  }
  const checkTime = Date.parse(checkedAt) || Date.now();
  const currentRows = rows.filter((row) => !row.posted || checkTime - Date.parse(row.posted) <= 60 * 86400000);
  return { rows: currentRows, staleCount: rows.length - currentRows.length, expiredCount, pageTitle, body };
}

function salaryOf(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  const currency = value.currency || "CNY";
  const unit = value.unitText || "";
  const min = value.value && (value.value.minValue || value.value.value);
  const max = value.value && value.value.maxValue;
  return min == null ? "" : String(min) + (max == null ? "" : "–" + max) + " " + currency + (unit ? " / " + unit : "");
}

function safeUrl(value, base) {
  try {
    const url = new URL(value || base, base);
    return isSafeHttpsUrl(url.href) ? url.href : "";
  } catch { return ""; }
}

async function stableId(url, title, company) {
  const data = new TextEncoder().encode([url, title, company].join("|"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return "official-" + Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function searchCandidates(key) {
  const results = await Promise.allSettled(SEARCHES.map(async (search) => {
    const params = new URLSearchParams({
      engine: "google", q: search.q, location: "Chengdu, Sichuan, China",
      google_domain: "google.com", gl: "cn", hl: "zh-CN", num: "10", api_key: key
    });
    const response = await fetch("https://serpapi.com/search.json?" + params, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || "搜索发现服务响应异常");
    return (payload.organic_results || []).map((item) => ({
      url: item.link, company: cleanText(item.source || item.displayed_link || ""),
      category: search.category, title: cleanText(item.title || "")
    }));
  }));
  const candidates = new Map();
  let succeeded = 0;
  const warnings = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.status === "rejected") {
      warnings.push(SEARCHES[i].category + "：" + String(result.reason.message || "搜索失败").slice(0, 140));
      continue;
    }
    succeeded += 1;
    for (const item of result.value) {
      try {
        const url = new URL(item.url);
        if (!isSafeHttpsUrl(url.href) || !CAREER_PATH.test(url.pathname + " " + item.title)) continue;
        const key = url.origin + url.pathname + url.search;
        if (!candidates.has(key)) candidates.set(key, { ...item, url: url.href });
      } catch { /* Ignore malformed search results. */ }
    }
  }
  return { candidates: Array.from(candidates.values()).slice(0, 34), succeeded, warnings };
}

async function inspectCandidate(candidate, checkedAt) {
  let url;
  try { url = new URL(candidate.url); } catch { return { source: sourceRecord(candidate, checkedAt, "invalid_url", 0), jobs: [] }; }
  if (!isSafeHttpsUrl(url.href)) return { source: sourceRecord(candidate, checkedAt, "excluded_non_company", 0), jobs: [] };
  try {
    const response = await fetch(url.href, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "ChengduCareerRadar/1.0 (+official-career-page monitoring)" },
      redirect: "follow", signal: AbortSignal.timeout(10000)
    });
    const finalUrl = new URL(response.url || url.href);
    if (!isSafeHttpsUrl(finalUrl.href) || !sameOfficialSite(url.hostname, finalUrl.hostname)) return { source: sourceRecord(candidate, checkedAt, "redirected_to_platform", 0), jobs: [] };
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !/text\/html|xhtml/i.test(contentType)) {
      return { source: sourceRecord({ ...candidate, url: finalUrl.href }, checkedAt, "fetch_failed_" + response.status, 0), jobs: [] };
    }
    const html = await readLimitedText(response);
    const extracted = extractJobs(html, finalUrl.href, candidate, checkedAt);
    const jobs = [];
    for (const row of extracted.rows) jobs.push({ ...row, id: await stableId(row.sourceUrl, row.title, row.company) });
    const status = jobs.length ? "jobs_found" : extracted.expiredCount ? "expired_postings_filtered" : extracted.staleCount ? "stale_postings_filtered" : extracted.body.length ? "checked_no_matching_job" : "empty_page";
    return { source: sourceRecord({ ...candidate, url: finalUrl.href, pageTitle: extracted.pageTitle }, checkedAt, status, jobs.length), jobs };
  } catch (error) {
    return { source: sourceRecord(candidate, checkedAt, "fetch_failed", 0, String(error.message || "抓取失败").slice(0, 180)), jobs: [] };
  }
}

function sourceRecord(candidate, checkedAt, status, jobCount, error = "") {
  let domain = "";
  try { domain = new URL(candidate.url).hostname.replace(/^www\./, ""); } catch { /* Keep empty domain. */ }
  return {
    url: candidate.url, domain, company: candidate.company || candidate.pageTitle || domain,
    title: candidate.title || candidate.pageTitle || "企业招聘页面", status, jobCount, checkedAt, error
  };
}

async function inBatches(items, size, fn) {
  const output = [];
  for (let i = 0; i < items.length; i += size) output.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return output;
}

async function collectJobs(env) {
  if (!env.DB) throw new Error("Cloudflare D1 binding DB 尚未配置。");
  const checkedAt = new Date().toISOString();
  let discovery = { candidates: [], succeeded: 0, warnings: [] };
  if (env.SERPAPI_KEY) discovery = await searchCandidates(env.SERPAPI_KEY);
  else discovery.warnings.push("SERPAPI_KEY 未配置；本轮仅巡检D1中已记录的官网候选页面。");

  const candidates = new Map();
  for (const candidate of [...SEEDS.map((item) => ({ ...item, isSeed: true })), ...discovery.candidates]) {
    try {
      const url = new URL(candidate.url);
      if (!isSafeHttpsUrl(url.href)) continue;
      const key = url.origin + url.pathname + url.search;
      if (!candidates.has(key)) candidates.set(key, { ...candidate, url: url.href, domain: url.hostname.replace(/^www\./, "") });
    } catch { /* Ignore malformed candidate URLs. */ }
  }
  const discovered = Array.from(candidates.values());
  const inserts = discovered.map((candidate) => env.DB.prepare(
    "INSERT INTO career_sources (url, domain, company, title, first_seen, last_seen, is_seed) VALUES (?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(url) DO UPDATE SET domain = excluded.domain, company = CASE WHEN excluded.company = '' THEN career_sources.company ELSE excluded.company END, " +
    "title = CASE WHEN excluded.title = '' THEN career_sources.title ELSE excluded.title END, last_seen = excluded.last_seen, is_seed = MAX(career_sources.is_seed, excluded.is_seed)"
  ).bind(candidate.url, candidate.domain, candidate.company || "", candidate.title || "", checkedAt, checkedAt, candidate.isSeed ? 1 : 0));
  for (let i = 0; i < inserts.length; i += 100) await env.DB.batch(inserts.slice(i, i + 100));

  const [countRow, queue] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total FROM career_sources").first(),
    env.DB.prepare("SELECT url, domain, company, title FROM career_sources ORDER BY CASE WHEN last_checked IS NULL THEN 0 ELSE 1 END, COALESCE(last_checked, ''), last_seen DESC LIMIT 10").all()
  ]);
  const knownCareerPages = Number(countRow && countRow.total || 0);
  const candidatesToCheck = queue.results || [];
  const inspected = await inBatches(candidatesToCheck, 8, (candidate) => inspectCandidate(candidate, checkedAt));
  const jobs = new Map();
  for (const result of inspected) for (const job of result.jobs) jobs.set(job.id, job);
  const checkUpdates = inspected.map((result) => env.DB.prepare(
    "UPDATE career_sources SET last_checked = ?, status = ?, job_count = ? WHERE url = ?"
  ).bind(checkedAt, result.source.status, result.source.jobCount, result.source.url));
  for (let i = 0; i < checkUpdates.length; i += 100) await env.DB.batch(checkUpdates.slice(i, i + 100));

  const sources = inspected.map((item) => item.source);
  for (let i = 0; i < discovery.warnings.length; i += 1) {
    sources.push({
      url: "", domain: "serpapi.com", company: "官网发现服务", title: "搜索查询失败或未配置",
      status: "search_warning", jobCount: 0, checkedAt, error: discovery.warnings[i]
    });
  }
  return {
    jobs: Array.from(jobs.values()), sources, updatedAt: checkedAt,
    sourceSummary: {
      queriesSucceeded: discovery.succeeded, queriesTotal: SEARCHES.length,
      pagesChecked: inspected.length, knownCareerPages, pendingChecks: Math.max(0, knownCareerPages - inspected.length),
      officialJobsFound: jobs.size, warnings: discovery.warnings
    }
  };
}

export { collectJobs, extractJobs, isBlockedHost, isSafeHttpsUrl, isExpiredPosting, sameOfficialSite, SEARCHES };

