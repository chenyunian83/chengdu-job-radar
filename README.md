# 成都求职雷达

面向成都社招的英语能力岗位看板，覆盖外贸、跨境电商、海外销售、国际运营和海外市场。页面汇总 Google Jobs 公开职位，展示招聘来源与申请入口；职位快照存入 Upstash Redis，Vercel 每天北京时间 09:00 更新。

## 数据与个人记录

- SerpApi 提供 Google Jobs 结构化搜索；每天检索 5 个岗位方向。
- Upstash Redis 缓存职位快照 30 天。抓取失败时保留上次成功的数据。
- 收藏与投递状态保存在当前浏览器。用页面中的导入 / 导出功能在设备间迁移。
- 职位来源可能标注不全，发布信息也可能过期；申请前请打开原招聘页面确认。

## 部署到 GitHub 与 Vercel

1. 把本目录文件提交到 GitHub 仓库。
2. 在 Vercel 导入该仓库。Framework Preset 选 Other，Root Directory 选仓库根目录；Build Command 留空，Output Directory 设为当前目录（.）。
3. 在 Upstash 创建 Redis 数据库，在 Vercel 项目 Settings → Environment Variables 添加：
   - UPSTASH_REDIS_REST_URL：Upstash REST URL
   - UPSTASH_REDIS_REST_TOKEN：Upstash REST Token
   - SERPAPI_KEY：SerpApi API Key
   - CRON_SECRET：至少 16 位随机字符串
4. 保存环境变量后重新部署。首次自动更新会在下一个北京时间 09:00 左右运行。
5. 需要立即初始化时，向 /api/refresh 发送 GET 请求，并附请求头 Authorization: Bearer 加上你的 CRON_SECRET。成功后刷新首页。

密钥只保存在 Vercel 环境变量中，不要提交到 GitHub。SerpApi 查询额度与收费按其账户计划计算；每日任务会发起最多 5 次搜索。Vercel Hobby 的 Cron 每天仅运行一次，且可能在设定小时内的任意时间触发。

## 本地预览

页面需通过 HTTP 服务器访问。接入 API 与 Redis 的本地联调可使用 Vercel CLI 和相同环境变量。若直接双击 index.html，浏览器不能访问 /api/jobs。

## 文件

- index.html：搜索、筛选、收藏和投递进度页面
- api/jobs.js：读取共享职位快照
- api/refresh.js：由 Vercel Cron 安全触发职位更新
- lib/provider.js：查询五类英语相关岗位并规整结果
- lib/storage.js：通过 Upstash REST API 保存职位快照
- vercel.json：每日定时任务配置
