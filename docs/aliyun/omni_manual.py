# Manual 模式测试：验证静默期间视频帧是否进入上下文
# 操作方式：持续发送音频+视频，按 Enter 键手动提交并请求模型响应
# 依赖：dashscope >= 1.23.9，pyaudio，opencv-python
import os
import sys
import base64
import time
import json
import threading
import pyaudio
import cv2
from dashscope.audio.qwen_omni import MultiModality, AudioFormat, OmniRealtimeCallback, OmniRealtimeConversation
import dashscope

# 配置参数
region = 'cn'
base_domain = 'dashscope.aliyuncs.com' if region == 'cn' else '{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com'
url = f'wss://{base_domain}/api-ws/v1/realtime'
dashscope.api_key = os.getenv('DASHSCOPE_API_KEY')
voice = 'Ethan'
model = 'qwen3.5-omni-plus-realtime'
instructions = (
    "你是一个视障辅助助手。你可以通过摄像头持续观察用户面前的画面。"
    "请在用户提问时，结合你之前看到的所有画面内容来回答，包括用户不说话时你观察到的内容。"
    "如果你确实没有看到相关内容，请如实说不确定。回答要简洁。"
)

# 全局状态
response_done = threading.Event()
transcription_done = threading.Event()


class ManualCallback(OmniRealtimeCallback):
    def __init__(self):
        self.audio_out = None
        self.session_ready = threading.Event()
        self.connection_closed = threading.Event()
        self.close_info = {}

    def on_open(self):
        print("[Connection] WebSocket 连接已建立")

    def on_close(self, close_status_code, close_msg):
        print(f"\n[Connection] 连接关闭 (code={close_status_code}, msg={close_msg})")
        self.close_info = {'code': close_status_code, 'msg': close_msg}
        self.connection_closed.set()
        self.session_ready.set()

    def on_event(self, response):
        event_type = response['type']
        if event_type == 'session.updated':
            print("[Session] 会话配置已更新（Manual 模式）")
            self.session_ready.set()
        elif event_type == 'error':
            print(f"[Error] {json.dumps(response, ensure_ascii=False, indent=2)}")
        elif event_type == 'input_audio_buffer.committed':
            print("[Commit] 音频+图像缓冲区已提交")
        elif event_type == 'response.created':
            print("[Response] 模型开始生成响应...")
        elif event_type == 'response.done':
            print("[Response] 模型响应完成")
            response_done.set()
        elif event_type == 'response.audio.delta':
            if self.audio_out:
                self.audio_out.write(base64.b64decode(response['delta']))
        elif event_type == 'conversation.item.input_audio_transcription.delta':
            preview = response.get('text', '') + response.get('stash', '')
            print(f"\r[User] {preview}", end='', flush=True)
        elif event_type == 'conversation.item.input_audio_transcription.completed':
            transcript = response.get('transcript', '')
            if transcript:
                print(f"\r[User] {transcript}")
            transcription_done.set()
        elif event_type == 'response.audio_transcript.done':
            print(f"[LLM] {response['transcript']}")


def capture_camera(conv, stop_event, camera_id=0, fps=1, resolution=(640, 480)):
    """从摄像头采集画面并以指定帧率发送给模型"""
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print("[Camera] 无法打开摄像头，跳过视频输入")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, resolution[0])
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, resolution[1])
    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[Camera] 摄像头已打开，分辨率: {actual_w}x{actual_h}，帧率: {fps} fps")

    interval = 1.0 / fps
    frame_count = 0

    try:
        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.5)
                continue

            _, jpeg_data = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            jpeg_bytes = jpeg_data.tobytes()

            if len(jpeg_bytes) > 190 * 1024:
                _, jpeg_data = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
                jpeg_bytes = jpeg_data.tobytes()

            image_b64 = base64.b64encode(jpeg_bytes).decode()
            try:
                conv.append_video(image_b64)
                frame_count += 1
                if frame_count % 10 == 0:
                    print(f"[Camera] 已发送 {frame_count} 帧")
            except Exception as e:
                print(f"[Camera] 发送图像帧失败: {e}")
                break

            time.sleep(interval)
    finally:
        cap.release()
        print(f"[Camera] 摄像头已释放，共发送 {frame_count} 帧")


def send_audio_loop(conv, mic, stop_event):
    """在后台线程持续发送麦克风音频"""
    while not stop_event.is_set():
        try:
            audio_data = mic.read(3200, exception_on_overflow=False)
            conv.append_audio(base64.b64encode(audio_data).decode())
            time.sleep(0.01)
        except Exception as e:
            if not stop_event.is_set():
                print(f"[Audio] 发送音频失败: {e}")
            break


# ==================== 主流程 ====================

# 1. 初始化音频设备
pya = pyaudio.PyAudio()
audio_out = pya.open(format=pyaudio.paInt16, channels=1, rate=24000, output=True)
mic = pya.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True)

# 2. 创建回调和会话
callback = ManualCallback()
callback.audio_out = audio_out
conv = OmniRealtimeConversation(model=model, callback=callback, url=url)

# 3. 建立连接
print("[Init] 正在连接...")
try:
    conv.connect()
except Exception as e:
    print(f"[Error] 连接失败: {e}")
    sys.exit(1)

# 4. 配置会话：Manual 模式（禁用 VAD）
print("[Init] 正在配置会话（Manual 模式，禁用 VAD）...")
conv.update_session(
    output_modalities=[MultiModality.AUDIO, MultiModality.TEXT],
    voice=voice,
    instructions=instructions,
    enable_turn_detection=False,  # 关键：禁用 VAD，使用 Manual 模式
)

# 等待 session.updated 确认
if not callback.session_ready.wait(timeout=10):
    print("[Error] 等待 session.updated 超时")
    conv.close()
    sys.exit(1)

if callback.connection_closed.is_set():
    print(f"[Error] 连接在配置阶段被关闭: {callback.close_info}")
    sys.exit(1)

# 5. 先发送约1秒音频，满足"至少发送过一次音频"的前提
print("[Init] 正在初始化音频缓冲区...")
for _ in range(100):
    audio_data = mic.read(3200, exception_on_overflow=False)
    conv.append_audio(base64.b64encode(audio_data).decode())
    time.sleep(0.01)
time.sleep(0.5)

# 6. 启动后台线程
audio_stop = threading.Event()
camera_stop = threading.Event()

audio_thread = threading.Thread(target=send_audio_loop, args=(conv, mic, audio_stop), daemon=True)
camera_thread = threading.Thread(target=capture_camera, args=(conv, camera_stop), daemon=True)

audio_thread.start()
camera_thread.start()

# 7. 主循环：等待用户按 Enter 提交并请求响应
print()
print("=" * 60)
print("  Manual 模式已启动（VAD 已禁用）")
print("  - 音频和视频在后台持续发送")
print("  - 按 Enter 键：提交当前缓冲区并请求模型响应")
print("  - 输入 q 后按 Enter：退出")
print("=" * 60)
print()
print("测试建议：")
print("  1. 保持静默，将物体放到镜头前几秒")
print("  2. 拿开物体")
print("  3. 按 Enter 提交缓冲区")
print("  4. 等几秒后再按 Enter 提问")
print()

try:
    while True:
        try:
            user_input = input()  # 阻塞等待用户输入
        except EOFError:
            break

        if user_input.strip().lower() == 'q':
            print("[Exit] 正在退出...")
            break

        # 提交音频+图像缓冲区
        print("\n[Action] 正在提交缓冲区...")
        response_done.clear()
        transcription_done.clear()

        try:
            conv.commit()
        except Exception as e:
            print(f"[Error] commit 失败: {e}")
            continue

        # 等待 commit 确认
        time.sleep(0.5)

        # 请求模型响应
        print("[Action] 正在请求模型响应...")
        try:
            conv.create_response()
        except Exception as e:
            print(f"[Error] create_response 失败: {e}")
            continue

        # 等待响应完成，最多15秒
        if not response_done.wait(timeout=15):
            print("[Warning] 等待响应超时")

        print()  # 空行分隔

except KeyboardInterrupt:
    print("\n[Exit] Ctrl+C 退出")

# 清理资源
audio_stop.set()
camera_stop.set()
audio_thread.join(timeout=3)
camera_thread.join(timeout=3)
conv.close()
mic.close()
audio_out.close()
pya.terminate()
print("对话结束")
