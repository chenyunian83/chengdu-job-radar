# 成都求职雷达

面向成都社招的英语能力岗位看板，覆盖外贸、跨境电商、海外销售、国际运营和海外市场。页面公开展示 Google Jobs 搜索到的职位；个人收藏、投递进度和面试时间使用独立密码登录，并存入 Upstash Redis，可在多台设备访问。

## 数据来源与更新频率

- SerpApi 提供 Google Jobs 结构化搜索；每天检索 5 个岗位方向。
- Upstash Redis 缓存职位快照 30 天。抓取失败时保留上次成功的数据。
- Vercel Cron 每日北京时间 09:00 触发一次；这是每日更新，不是每秒实时刷新。也可以通过安全的 /api/refresh 端点手动刷新。
- 招聘信息可能过期或被平台下架。每张职位卡片提供来源链接，投递前请打开来源核验。

## 个人求职记录

- 首次使用时在页面点“解锁记录”，输入 Vercel 环境变量 APP_PASSWORD。
- 登录后可在职位卡片上“一键已投递”或“记录面试”。每次点击会写入时间（显示为北京时间），同时更新进度。
- 记录保存在 Upstash Redis，登录后自动在设备间同步。登录状态由 HttpOnly Cookie 维护；个人记录 API 要求有效登录。
- 原页面在本浏览器的旧版收藏与投递状态，会在首次登录时合并到云端。旧备份 JSON 仍支持导入；导出文件用于备份或迁移。
- APP_PASSWORD 至少 16 位；APP_SESSION_SECRET 至少 32 字节。请使用长随机值，只保存在 Vercel 环境变量中，不要提交到仓库。

## 部署到 GitHub 与 Vercel

1. 将仓库推送到 GitHub，并在 Vercel 导入此仓库。
2. Framework Preset 选 Other，Root Directory 选仓库根目录；Build Command 留空，Output Directory 设为当前目录（.）。
3. 在 Upstash 创建 Redis 数据库，在 Vercel 项目 Settings → Environment Variables 添加：
   - UPSTASH_REDIS_REST_URL：Upstash REST URL
   - UPSTASH_REDIS_REST_TOKEN：Upstash REST Token
   - SERPAPI_KEY：SerpApi API Key
   - CRON_SECRET：至少 16 位随机字符串
   - APP_PASSWORD：你个人登录用的至少 16 位密码
   - APP_SESSION_SECRET：至少 32 字节的随机密钥
4. 保存环境变量后重新部署。首次自动更新会在下一个北京时间 09:00 左右运行。
5. 需要立即初始化职位快照时，向 /api/refresh 发送 GET 请求，并附请求头 Authorization: Bearer <CRON_SECRET>。成功后刷新首页。

密钥只保存在 Vercel 环境变量中。SerpApi 查询额度与收费按其账户计划计算；每日任务会发起最多 5 次搜索。Vercel Hobby 的 Cron 每天仅运行一次，且可能在设定小时内的任意时间触发。

## 本地预览

页面需通过 HTTP 服务器访问。接入 API 与 Redis 的本地联调可使用 Vercel CLI，并配置相同环境变量。若直接双击 index.html，浏览器不能访问 /api/jobs。

## 文件

- index.html：搜索和职位页面布局
- app.js：搜索、筛选、登录、时间记录与同步
- api/jobs.js：读取共享职位快照
- api/refresh.js：由 Vercel Cron 安全触发职位更新
- api/session.js：个人登录和 HttpOnly 会话
- api/applications.js：读写个人求职记录
- lib/auth.js：个人密码和会话签名
- lib/provider.js：查询五类英语相关岗位并规整结果
- lib/storage.js：通过 Upstash REST API 保存职位快照和个人记录
- vercel.json：每日定时任务配置
