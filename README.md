# 成都求职雷达

[打开线上网站](https://chengdu-job-radar.rx-job-radar.workers.dev/) · 面向成都社招的英语相关岗位，覆盖外贸、海外销售、跨境电商和国际运营；个人收藏、已投递及面试时间存于 Cloudflare D1。

## 职位来源与筛选

- **企业官网**：每日通过 SerpApi 发现公司招聘页，直接访问公司域名核对职位。官网可能未被收录、要求登录或使用动态渲染，因此无法保证遍历成都所有企业。
- **智联招聘补充**：每日检查成都的外贸、跨境运营、亚马逊、独立站等列表，并打开岗位详情页核对投递入口。只收录成都、全职、英语相关、经验不限或标注 1–3 年等与 0–2 年求职者有交集的岗位；要求标注月薪下限至少 8,000 元，发布时间在 60 天内。实际岗位要求和薪酬以原页面为准。招聘网站可能限制云端抓取，巡检失败会在来源区显示。
- **初始岗位**：2026-10-14 人工逐条核对 20 条智联招聘职位的地点、经验、薪资、发布时间和投递按钮，仅保存职位名称、公司、地点、薪资、日期、经验标签及原链接；不转载职位描述。初始数据见 `scripts/seed-2026-10-14.sql`。
- **跨天去重**：岗位按公司、职位名称和地点生成固定 ID，重复发现时更新 D1 中原记录，不新增卡片。列表保留最近 14 天内见到、发布未超过 60 天的岗位；采集某天失败时，已核对岗位不会立刻消失。

Cloudflare Cron 每天 UTC 01:17（北京时间 09:17）自动执行。网页“刷新列表”读取 D1 最新结果，不会重新抓取网站。使用 `CRON_SECRET` 调用 `POST /api/refresh` 可手动巡检。

## 个人求职记录

解锁个人记录后，可一键记录投递和面试时间，设备之间通过 D1 同步。会话采用 HttpOnly、Secure、SameSite=Lax Cookie；写请求校验同源。JSON 备份支持导入和导出。

## 部署

需要 Node.js 22 以上、Wrangler 和已授权的 Cloudflare 账号。当前 Worker 为 `chengdu-job-radar`，D1 绑定名为 `DB`。

1. `npm install`
2. `npx wrangler d1 migrations apply chengdu-job-radar --remote`
3. 首次初始化可执行 `npx wrangler d1 execute chengdu-job-radar --remote --file scripts/seed-2026-10-14.sql`
4. `npx wrangler deploy`

在 Cloudflare Worker 的 Secrets 中配置 `SERPAPI_KEY`、`CRON_SECRET`、`APP_PASSWORD` 和 `APP_SESSION_SECRET`。请勿将密钥提交到仓库或写入前端。`SERPAPI_KEY` 只用于发现官网，不用于智联招聘补充来源。

## API

- `GET /api/jobs`：公开读取职位与来源巡检摘要。
- `GET/POST/DELETE /api/session`：查询、创建和清除个人会话。
- `GET/PUT /api/applications`：登录后读取与保存个人求职记录。
- `POST /api/refresh`：携带 `Authorization: Bearer <CRON_SECRET>` 手动运行巡检。

Cloudflare 配置参见 [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) 和 [D1](https://developers.cloudflare.com/d1/)。
