---
name: deploy-cloudflare-pages-free
description: 将适合静态托管的前端网站安全地构建、验证并免费发布到 Cloudflare Pages。用于用户希望获得 pages.dev 地址、从 GitHub 或本地项目发布、检查 SPA 深层路由与 PWA 离线文件，或排查 Pages 部署问题；不把免费 Pages 描述成中国大陆稳定托管方案。
---

# 免费部署到 Cloudflare Pages

目标是交付一个能打开、能刷新深层路径、可继续更新的 `*.pages.dev` 网站，同时保留原项目和已有部署。

## 先判断是否适合

检查项目的构建命令、输出目录和是否依赖服务端功能。

- 纯 HTML、Vite、React/Vue SPA、静态导出的 Next.js 通常适合。
- 如果项目需要服务端渲染、私密环境变量、数据库或 API，不要为了静态部署静默删除功能；说明限制并选择 Pages Functions、Workers 或其他托管方式。
- 本地优先应用要提醒：浏览器数据按域名隔离。换到新域名后旧文章不会自动出现，需要导出和导入。

## 安全边界

- 创建项目和公开发布属于外部写入；只有在用户明确要求部署后执行。
- 不上传 `.env`、密钥、账号令牌、数据库文件或用户内容。
- 不覆盖已有 Pages 项目；先列出现有项目，优先创建含义清楚的新名称。
- 不使用强制推送、重置或删除来解决 Git 历史问题。
- Cloudflare 免费版适合个人项目和小规模测试，但 `pages.dev` 在中国大陆的可访问性因网络而异，不能承诺稳定直连。

## 构建

1. 阅读 `package.json` 和框架配置，确认构建命令与输出目录。
2. 对 SPA 配置深层路径回退：Cloudflare Pages 的 `_redirects` 通常为 `/* /index.html 200`。
3. 若原项目已有 Worker/SSR 构建，使用独立的静态构建入口，避免覆盖原部署方式。
4. 运行生产构建和现有测试。修复由新入口造成的路由、SSR 或导入冲突后再发布。
5. 确认输出包含 `index.html`、静态资源；PWA 项目还应包含 manifest、图标和 service worker。

不要假设输出目录一定是 `dist`：从实际构建结果读取。

## 发布

使用已安装的 Wrangler；没有登录时运行 `wrangler login`，由用户在浏览器完成授权。

```text
wrangler pages project list
wrangler pages project create <project-name> --production-branch main
wrangler pages deploy <output-directory> --project-name <project-name> --branch main
```

只有在连接失败且已确认浏览器使用本机代理时，才为当前命令临时设置同一代理；不要永久修改系统代理。

## 必须验证

发布成功不等于任务完成。至少检查：

- 固定项目地址返回 200 且标题正确。
- 一个真实深层路径（如 `/writing`）刷新后仍返回应用，而不是 404。
- JS/CSS 资源正常加载。
- PWA 项目的 `sw.js` 与 manifest 返回 200。
- 原构建和测试仍通过。

如果可视化浏览器难以读取复杂页面，可用 HTTP 状态与 HTML 资源引用完成结构验证，并请用户在目标网络做最终可访问性测试。

## 交付说明

给用户：

- 固定生产网址，不只给一次性部署预览网址。
- 说明新域名的数据隔离与首次联网要求。
- 说明以后如何更新：重新构建并部署；若已连接 GitHub 自动构建，则推送主分支即可。
- 对中国大陆用户明确区分“技术上已发布”和“当地网络稳定可访问”。

