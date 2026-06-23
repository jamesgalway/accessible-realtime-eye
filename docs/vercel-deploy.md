# Vercel 部署记录

## 当前目标

把手机端实时慧眼导航原型部署到 Vercel，优先通过 GitHub 仓库自动部署，避免继续依赖 Render。

## 当前代码状态

- GitHub 仓库：`jamesgalway/accessible-realtime-eye`
- Vercel 项目：`accessible-realtime-eye`
- 正式访问域名：`https://accessible-realtime-eye.vercel.app/`
- 当前已验证：正式首页返回 200，`/api/health` 返回 `ok: true`
- 最新代码以 GitHub `main` 分支为准；本轮后台化前端提交是 `f643746`。
- 已加入 Vercel 入口：`vercel.json`
- 已加入 API Functions：`api/`
- 本地普通 HTTP 服务仍可用：`node server.js`
- 本地自检命令：`node server.js --check`

## 2026-06-23 后台配置结果

- Vercel 环境变量已加入 `BAILIAN_API_KEY`，作用范围是 Production and Preview。
- 新百炼 API Key 在阿里云百炼控制台生成，描述为 `accessible-realtime-eye`，Key ID 是 `5789034`。明文 Key 不写入项目文件，只保存在 Vercel 环境变量里。
- 百炼默认业务空间 ID：`ws-ye3smbxl6p0m9pxi`。
- 正确 WebRTC Endpoint：`llm-ws-ye3smbxl6p0m9pxi.cn-beijing.maas.aliyuncs.com`。
- Vercel 环境变量已有 `BAILIAN_WEBRTC_ENDPOINT`，并已重新部署。
- 线上 `/api/realtime/config` 已验证：`serverApiKeyConfigured: true`，`webRtcConfigured: true`。
- 线上正式页面已验证：默认展示“百炼后台已配置 Key 和 WebRTC Endpoint”，并包含“高级调试”折叠区。
- 手机端默认不需要填写 Key 或 Endpoint；页面里的临时 Key 区域只保留在“高级调试”折叠区。
- 前端默认不再把手机本机旧 Key 或旧 Endpoint 发给后端，避免旧值覆盖 Vercel 后台正确配置。

## Vercel 需要配置的环境变量

- `AMAP_KEY`：高德 Web 服务 Key，用于地点搜索和路线规划。当前生产环境仍未确认已配置。
- `BAILIAN_API_KEY` 或 `DASHSCOPE_API_KEY`：百炼 DashScope Key。当前生产环境已配置 `BAILIAN_API_KEY`，不要把明文写进仓库。
- `BAILIAN_WEBRTC_ENDPOINT`：百炼 WebRTC 白名单 Endpoint。当前生产环境已配置。
- `BAILIAN_REALTIME_MODEL`：默认 `qwen3.5-omni-plus-realtime`。
- `BAILIAN_REALTIME_REGION`：默认 `cn`。
- `BAILIAN_REALTIME_VOICE`：默认 `Tina`。

## 部署注意

- Vercel 官方在 2026-06-22 的说明中确认 Functions 原生支持 WebSocket，但连接会受函数最长运行时间约束。
- 本项目更稳的优先路径是 WebRTC：浏览器和百炼建立实时媒体链路，后端只做 SDP 交换，不长期承载音视频转发。
- WebSocket 实时流仍保留，用于测试和兜底，但上线后需要实测 Vercel 对长连接的稳定性。
- 当前本机 Vercel CLI 无法完成登录，错误发生在 CLI 访问 Vercel OpenID 配置时；浏览器访问 Vercel 正常。
- 第一次部署后出现 500，原因是 Vercel 把根目录 `server.js` 当作 Node 函数入口，而它默认导出的是对象。已改为默认导出 HTTP handler，同时保留附加属性给 API 文件使用。
- 当前服务端已经配置百炼实时通话所需的 `BAILIAN_API_KEY` 和 `BAILIAN_WEBRTC_ENDPOINT`；高德路线功能需要后续补 `AMAP_KEY` 或继续走高德 MCP/手动路线导入。
- 2026-06-23 修复“开始慧眼后报错关闭”：线上默认改为 WebRTC 通话，不再默认走 WebSocket；如果服务端没有百炼 Key 且手机页面没有临时 Key，会在调用摄像头前直接提示先填写 Key，避免打开后立即关闭。
- 2026-06-23 继续修复 WebRTC `Endpoint.AccessDenied`：这是百炼 Workspace Endpoint 权限拒绝，说明手机临时 DashScope Key 和当前 WebRTC Endpoint 可能不在同一个业务空间，或 Key 没有 Endpoint 权限。已允许用户手动选择 WebSocket 备用测试，不再在启动时强制切回 WebRTC。
- 2026-06-23 再次调整：Vercel 上的 WebSocket 握手超时，不能作为当前可用测试路径。页面新增手机端临时填写 WebRTC Endpoint，后端只允许 `*.maas.aliyuncs.com`，用于测试 Key 和 Endpoint 属于同一百炼业务空间的组合。
- 2026-06-23 后台化调整：百炼 Key 和 WebRTC Endpoint 已放入 Vercel 后台。手机端默认直接使用后台配置，不再要求用户填写；只有展开“高级调试”时才允许用手机本机保存的 Key/Endpoint 临时覆盖。

## 主动回复功能设计

前端负责采集状态：定位、摄像头画面、麦克风、路线阶段、用户按钮或语音指令。

后端负责维护状态机：当前目的地、当前路线段、允许模型主动说话的条件、冷却时间、已经提醒过的内容。

触发条件示例：

- 距离目的地小于指定米数。
- 到达公交站或医院门口附近。
- 连续一段时间没有移动。
- 画面里疑似出现门牌、站牌、入口、红绿灯、楼号。
- 用户说出预设关键词，例如“帮我看一下入口”。
- 路线和当前位置明显偏离。

安全边界：

- 不能在没有足够确认时说“肯定在左边”。
- 过马路相关指令必须保守，必要时要求现场确认。
- 主动提醒必须有冷却时间，避免频繁打断。
- 模型输出要带置信度和依据，不能编造地图或画面里没有的信息。
