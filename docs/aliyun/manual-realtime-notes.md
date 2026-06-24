# 百炼 Realtime Manual 模式记录

## 结论

WebRTC 通话模式可以在用户静默时持续发送 RTP 视频帧，但百炼官方回复确认：WebRTC 只支持服务端 VAD 模式，不支持 Manual 模式。静默期间如果没有形成用户输入 turn，视频帧不会被固化到上下文里。

要验证“我不说话时看到的画面，稍后还能回答”，需要使用 WebSocket Manual 模式：

1. `session.update` 中设置 `turn_detection: null`。
2. 前端持续发送 `input_audio_buffer.append`。
3. 前端持续发送 `input_image_buffer.append`，建议约 1 帧每秒。
4. 需要固化上下文时发送 `input_audio_buffer.commit`。
5. 需要模型回答时再发送 `response.create`。

## 本项目实现

- WebRTC 模式保留，用于真实视频通话式体验和语音打断测试。
- WebSocket Manual 模式已启用为默认测试入口，用于静默视觉记忆测试。
- 页面新增两个按钮：
  - “只提交静默画面到上下文”：只发 `input_audio_buffer.commit`，不请求回答。
  - “提交并请求模型回答”：先发 `input_audio_buffer.commit`，再发 `response.create`。
- “静默视频推送自检”已支持 WebSocket，10 秒内检查图像帧计数是否增长。
- 官方 demo 已保存到 `docs/aliyun/omni_manual.py`。

## 推荐测试流程

1. 打开页面，默认选择 “WebSocket Manual，测试静默视觉记忆”。
2. 点击“开始实时慧眼”，允许摄像头和麦克风。
3. 保持不说话，把一个明显物体放到镜头前几秒，然后拿开。
4. 点击“只提交静默画面到上下文”。
5. 说：“刚才看到了什么？”
6. 点击“提交并请求模型回答”。
7. 如果模型能说出刚才静默期间出现过的物体，说明静默视觉记忆链路成立。

## 已完成的本地验证

- `npm.cmd run check` 通过。
- `node --check server.js` 和 `node --check public/app.js` 通过。
- UTF-8 安全扫描通过。
- 本地 WebSocket 代理能连接百炼并收到 `proxy.ready` 与 `session.created`。
- 发送 `session.update` 且 `turn_detection: null` 后，百炼返回 `session.updated`，说明 Manual 模式被接受。
- 发送一段静音音频、一张测试图片，再发送 `input_audio_buffer.commit` 后，百炼返回 `input_audio_buffer.committed`。

## 注意

- Manual 模式不会自动因为用户说完话就回答，必须由按钮或后续程序逻辑显式提交和请求回答。
- 这只是“静默画面能否进入上下文”的基础验证。真正的主动提醒，还需要再加定时提交、触发条件和安全策略。
