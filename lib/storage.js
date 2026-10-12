function getConfig() {
  var url = process.env.UPSTASH_REDIS_REST_URL;
  var token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    var error = new Error("Upstash Redis is not configured.");
    error.code = "STORAGE_NOT_CONFIGURED";
    throw error;
  }
  return { url: url.replace(/\/+$/, ""), token: token };
}

async function command(parts) {
  var c = getConfig();
  var response = await fetch(c.url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + c.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(parts)
  });
  var payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Redis request failed.");
  }
  return payload.result;
}

async function getJobs() {
  var value = await command(["GET", "chengdu-job-radar:jobs:v1"]);
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function putJobs(value) {
  return command(["SET", "chengdu-job-radar:jobs:v1", JSON.stringify(value), "EX", 2592000]);
}

async function getApplications() {
  var value = await command(["GET", "chengdu-job-radar:applications:v1"]);
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function putApplications(value) {
  return command(["SET", "chengdu-job-radar:applications:v1", JSON.stringify(value)]);
}

module.exports = { getJobs: getJobs, putJobs: putJobs, getApplications: getApplications, putApplications: putApplications };
