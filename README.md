# 成都求职雷达

面向成都社招的英语能力岗位看板，关注外贸、跨境电商、海外销售、国际运营和海外市场；同时记录个人收藏、投递时间与面试时间。前端静态资源、API、每日任务和个人数据库统一运行在 Cloudflare Workers + Cron + D1。

## 职位来源与覆盖边界

- 每天按五个岗位方向通过 SerpApi 的普通 Google 网页搜索发现招聘页候选链接；这一步只用于找页面，不读取 Google Jobs 聚合职位。
- Worker 随后直接访问候选页面，只提取公司自有域名上的职位内容。BOSS直聘、猎聘、智联、前程无忧、拉勾等招聘网站及常见ATS托管域名会被过滤。
- 只有岗位方向匹配、页面明确能核验成都地点的职位才进入列表。优先解析官方 JobPosting JSON-LD；少数传统页面使用标题和岗位职责等页面文本识别。超过60天的有日期职位会从当前机会列表过滤。
- 页面里的“公司官网巡检”展示本次发现并检查的链接、检查时间和结果。抓取失败、页面没有匹配职位、旧职位被过滤会分别标注。
- 这是尽量拓宽官网覆盖的每日巡检，不能保证遍历成都所有企业。搜索引擎可能漏掉未收录的官网，页面可能需要登录或脚本渲染，也可能禁止自动访问；因此空列表表示本次没有提取到可核验职位，不等于成都没有招聘。
- D1 会逐日累积发现到的官网候选页，并按最近检查时间轮巡；每次最多访问36页。每日北京时间约 09:17 自动执行；列表每次打开和点击“刷新列表”都会读取D1快照，但不会立刻重新抓取官网。可用受保护的 `POST /api/refresh` 手动启动巡检。

## 个人求职记录

- 职位公开可看；解锁个人记录后，收藏、状态、投递和面试时间会在设备间同步到D1。
- 页面的一键投递和记录面试会以北京时间显示操作时间；也可通过状态下拉框更新进度。
- 会话使用 HttpOnly、Secure、SameSite=Lax Cookie，API校验同源写请求。个人记录备份仍支持 JSON 导入/导出。
- 从旧站迁移时，先在旧站导出 JSON 备份，再在新站解锁个人记录并导入。不同网址的浏览器本地存储不会自动共享；新D1也不会自动读旧 Upstash 数据。

## 部署到 Cloudflare

仓库已推送至 GitHub。部署一次后，可在 Cloudflare Worker 的 **Settings → Builds → Connect** 连接 GitHub 仓库，后续 push 可自动部署。

1. 确认已安装 Node.js 22 或更高版本，再安装依赖并授权 Wrangler：
   `npm install`
   `npx wrangler login`
2. 创建D1：
   `npx wrangler d1 create chengdu-job-radar`
   当前配置中的全零 UUID 是占位符；远程迁移或部署前，将命令返回的 UUID 填入根目录 wrangler.jsonc 的 database_id。
3. 创建数据库表：
   `npx wrangler d1 migrations apply chengdu-job-radar --remote`
4. 添加 Worker Secrets（每条命令会提示输入值，密钥不要发给我，也不要提交仓库）：
   `npx wrangler secret put SERPAPI_KEY`
   `npx wrangler secret put CRON_SECRET`
   `npx wrangler secret put APP_PASSWORD`
   `npx wrangler secret put APP_SESSION_SECRET`
   密码至少16位，会话密钥至少32字节。SerpApi 只承担官网页面发现，每次巡检最多发起5个搜索请求。
5. 部署：
   `npx wrangler deploy`
   成功后可从 Cloudflare Workers & Pages 页面打开自动分配的 `workers.dev` 地址。
6. 如需自定义域名，在 Worker 设置里绑定已接入 Cloudflare DNS 的域名。也可以按上方 Builds 指引连接 GitHub，后续 push 自动部署。
7. 到次日北京时间约09:17检查首轮巡检；想现在初始化时调用 `POST /api/refresh`，请求头为 `Authorization: Bearer <CRON_SECRET>`。

本地先应用 D1 迁移：`npx wrangler d1 migrations apply chengdu-job-radar --local`。Wrangler 的本地调试命令为 `npm run dev`。本地私密变量可从 `.dev.vars.example` 复制为未提交的 `.dev.vars` 后填写；不要把密钥放入前端。

## API

- `GET /api/jobs`：公开读取职位和官网巡检摘要。
- `GET/POST/DELETE /api/session`：查询、创建和清除个人登录会话。
- `GET/PUT /api/applications`：登录后读取和保存个人求职记录。
- `POST /api/refresh`：使用 `CRON_SECRET` 手动运行官网巡检。
- Worker Cron 配置每天 UTC 01:17（北京时间09:17）自动执行。

Cloudflare Cron Triggers 配置见 [官方文档](https://developers.cloudflare.com/workers/configuration/cron-triggers/)，D1绑定和迁移见 [D1文档](https://developers.cloudflare.com/d1/)。静态页面由同一Worker的 assets 配置提供。
