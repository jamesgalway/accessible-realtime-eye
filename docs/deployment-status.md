# 部署状态记录

更新时间：2026-06-22

## 当前结论

这个原型已经接入阿里百炼实时模型的基础配置，后端可以连上实时模型。

当前还不能完整做“网页自动搜索规划路线 + 视频通话式慧眼”闭环，因为高德 Web 服务 Key 尚未配置。

为绕过高德账号滑块验证阻塞，网页已增加“无 Key 测试路线”入口。可以由 Codex 通过高德 MCP、百度地图 MCP 或人工核对生成路线事实，再粘贴到网页里，实时慧眼会把这段路线当作当前导航上下文使用。

## 已确认信息

- 百炼地域：华北2（北京）
- 百炼默认业务空间 ID：`ws-ye3smbxl6p0m9pxi`
- WebRTC endpoint：`llm-ws-ye3smbxl6p0m9pxi.cn-beijing.maas.aliyuncs.com`
- 实时模型：`qwen3.5-omni-plus-realtime`
- 本地服务端口：`8787`
- 本地项目目录：`E:\accessible-nav-prototype`

## 本地配置

配置文件位置：`E:\accessible-nav-prototype\.env`

已写入：

- `BAILIAN_WEBRTC_ENDPOINT`
- `BAILIAN_REALTIME_MODEL`
- `BAILIAN_REALTIME_REGION`
- `BAILIAN_REALTIME_VOICE`

未写入：

- `AMAP_KEY`
- `BAILIAN_API_KEY`
- `DASHSCOPE_API_KEY`

注意：当前机器环境变量里已有 `DASHSCOPE_API_KEY`，所以后端能连接百炼；项目 `.env` 文件里没有明文保存百炼 Key。

## 已完成验证

- `node --check server.js` 通过。
- `node --check public/app.js` 通过。
- `npm.cmd run check` 通过。
- 中文编码安全扫描通过。
- 后端健康接口显示百炼实时 WebSocket 和 WebRTC 均已配置。
- 本地 WebSocket 代理已成功连上百炼实时模型，返回 `proxy.ready`。

## 当前阻塞

高德 Key 未配置，所以以下能力暂时不可用：

- 搜索起点和终点 POI。
- 规划公交加步行路线。
- 规划纯步行路线。

补充：当前 Codex 会话里能看到高德 MCP，包含地理编码、POI 搜索、步行、公交、驾车、骑行路线规划等工具。限制是这些 MCP 工具只在 Codex 会话中可用，网页后端不能直接调用它们。因此当前临时方案是“Codex 用 MCP 生成路线事实，再导入网页测试”。

## 部署计划

第一阶段已经在本机跑通：

- Windows 本机运行 Node 服务。
- 手机测试需要 HTTPS，临时隧道已验证但读屏体验不好。
- Cloudflare Workers 已尝试，workers.dev 返回 1101，已停止继续死磕。

第二阶段再做稳定部署：

- 代码先推到 GitHub。
- GitHub Pages 只适合静态页面，不能安全保存 Key 或代理实时 WebSocket。
- 真正可用的公网体验版优先接 Render、Vercel、Railway、阿里云轻量应用服务器或 ECS 这类能运行 Node 后端的平台。
- 项目已增加 `render.yaml`，便于从 GitHub 直接接 Render 部署。

## 下一步

1. 获取或创建高德 Web 服务 Key。
2. 把高德 Key 写入 `.env` 的 `AMAP_KEY`。
3. 把代码推到 GitHub。
4. 选择一个支持 Node 后端的平台，从 GitHub 部署。
5. 在部署平台的环境变量里填入百炼 Key、高德 Key 和 WebRTC endpoint。
6. 在支持摄像头和麦克风权限的手机浏览器里测试实时慧眼。

## 操作命令

启动服务：

```powershell
cd E:\accessible-nav-prototype
npm.cmd start
```

自检：

```powershell
cd E:\accessible-nav-prototype
npm.cmd run check
```
