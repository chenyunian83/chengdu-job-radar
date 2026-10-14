const SEARCH_PATHS = [
  "kwB4B8QE2E399A2L2O", // 外贸业务员
  "kwHNK5H0RL6LAKD3UGGGIG", // 跨境电商运营
  "kwB4B8QE42U65UQ", // 外贸英语
  "kw9QD9KR4G18", // 亚马逊
  "kwIOVP3J2TUHEV8", // 阿里巴巴国际站
  "kwEBM7LIRQR67T1115", // 独立站运营
  "kwB4B8QE2IL5Q0C" // 外贸助理
];
const ROLE = /外贸|跨境|海外|国际贸易|国际销售|亚马逊|独立站|英语/i;
const EXCLUDE_TITLE = /经理|主管|总监|负责人|实习|兼职|副业|俄语|日语|韩语|法语|德语|西班牙语|越南语|翻译|教师|剪辑师|汽车销售|人才顾问|技术运营/;
const EXCLUDE_COMPANY = /人力资源服务|人才服务|劳务派遣|猎头/;

function salaryFloor(value) {
  const text = String(value || "").replace(/,/g, "");
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(万|千|[kK])?\s*[-~～至]/);
  if (!match) return 0;
  const number = Number(match[1]);
  const unit = match[2] || (number < 100 && /万/.test(text) ? "万" : "");
  return unit === "万" ? number * 10000 : unit === "千" || /k/i.test(unit) ? number * 1000 : number;
}
function acceptableExperience(value) {
  return /^(经验不限|1-3年|0-1年|1年以下|1年|2年)$/.test(String(value || "").trim());
}
function postedIso(value) {
  const date = new Date(String(value || "").replace(" ", "T") + "+08:00");
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
function currentEnough(value, now) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + 86400000 && now - time <= 60 * 86400000;
}
function clean(value) { return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function category(title) {
  if (/跨境|亚马逊|独立站|阿里巴巴国际站/i.test(title)) return "跨境电商";
  if (/海外|国际销售/i.test(title)) return "海外销售";
  if (/外贸|国际贸易|国际物流/i.test(title)) return "外贸";
  return "国际运营";
}
function fingerprint(job) {
  const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  return [normalize(job.company), normalize(job.title), normalize(job.location)].join("|");
}
async function jobId(job) {
  const bytes = new TextEncoder().encode(fingerprint(job));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return "job-" + Array.from(hash.slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function fetchPage(url, maxBytes = 2200000) {
  const response = await fetch(url, {
    headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; ChengduJobRadar/1.0)" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const type = response.headers.get("content-type") || "";
  if (!/html/i.test(type)) throw new Error("职位页面不是 HTML");
  if (Number(response.headers.get("content-length") || 0) > maxBytes) throw new Error("职位页面过大");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error("职位页面过大");
  return new TextDecoder().decode(buffer);
}
function pageState(html) {
  const match = html.match(/__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/i);
  if (!match) throw new Error(/Security Verification/i.test(html) ? "网站要求安全验证" : "找不到职位数据");
  return JSON.parse(match[1].trim().replace(/;\s*$/, ""));
}
async function mapLimit(items, width, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += width) {
    results.push(...await Promise.all(items.slice(i, i + width).map(fn)));
  }
  return results;
}
async function collectZhaopin(checkedAt = new Date().toISOString()) {
  const now = Date.parse(checkedAt);
  const urls = SEARCH_PATHS.flatMap((path) => [1, 2].map((page) => `https://www.zhaopin.com/sou/jl801/${path}/p${page}`));
  const pages = await mapLimit(urls, 4, async (url) => {
    try {
      const state = pageState(await fetchPage(url));
      if (!Array.isArray(state.positionList)) throw new Error("没有职位列表");
      return { url, rows: state.positionList, error: "" };
    } catch (error) { return { url, rows: [], error: String(error.message || error).slice(0, 120) }; }
  });
  const candidates = new Map();
  for (const page of pages) for (const row of page.rows) {
    const title = clean(row.name), company = clean(row.companyName);
    const posted = postedIso(row.publishTime);
    if (!/^CC[A-Z0-9]+$/.test(String(row.number || "")) || row.workCity !== "成都" || row.workType !== "全职" ||
      !ROLE.test(title) || EXCLUDE_TITLE.test(title) || EXCLUDE_COMPANY.test(company) ||
      !acceptableExperience(row.workingExp) || salaryFloor(row.salary60) < 8000 ||
      !currentEnough(posted, now)) continue;
    if (!candidates.has(row.number)) candidates.set(row.number, row);
  }
  const detailRows = await mapLimit(Array.from(candidates.values()).slice(0, 32), 5, async (candidate) => {
    const url = `https://www.zhaopin.com/jobdetail/${candidate.number}.htm`;
    try {
      const html = await fetchPage(url);
      const position = pageState(html).jobDetail?.detailedPosition;
      if (!position || position.positionStatus !== 3 || !html.includes("立即投递")) return null;
      const title = clean(position.positionName), company = clean(position.companyName);
      const posted = postedIso(position.positionPublishTime);
      const location = "成都" + (position.positionCityDistrict ? "·" + clean(position.positionCityDistrict) : "");
      if (position.positionWorkCity !== "成都" || position.workType !== "全职" || !ROLE.test(title) ||
        EXCLUDE_TITLE.test(title) || EXCLUDE_COMPANY.test(company) || !acceptableExperience(position.positionWorkingExp) ||
        salaryFloor(position.salary) < 8000 || !currentEnough(posted, now)) return null;
      const job = {
        title, company, location, salary: clean(position.salary), posted,
        description: `经验要求：${clean(position.positionWorkingExp)}。职位详情及实际薪资请以智联招聘原页面为准。`,
        category: category(title), via: "智联招聘", sourceUrl: url, applyUrl: url, shareUrl: url, seenAt: checkedAt
      };
      return { ...job, id: await jobId(job) };
    } catch { return null; }
  });
  const jobs = Array.from(new Map(detailRows.filter(Boolean).map((job) => [job.id, job])).values());
  const sources = pages.map((page) => ({
    url: page.url, domain: "zhaopin.com", company: "智联招聘补充来源", title: "成都岗位列表",
    status: page.error ? "platform_fetch_failed" : "platform_list_checked", jobCount: page.rows.length, checkedAt, error: page.error
  }));
  return { jobs, sources, pagesChecked: pages.filter((page) => !page.error).length,
    warnings: pages.filter((page) => page.error).map((page) => page.url + "：" + page.error) };
}
export { collectZhaopin, jobId, fingerprint, salaryFloor, acceptableExperience, postedIso, currentEnough, SEARCH_PATHS };




