#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""JHELIX 桌面外壳。

本地 ThreadingHTTPServer + Edge --app 窗口，零第三方依赖。
- 单实例探测：双击多次只会复用已运行的服务
- 心跳看门狗：窗口关闭后自动退出，不留后台进程
- 静态资源只允许读取 ui/ 目录
"""

import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

APP_NAME = "JHELIX"
APP_ID = "jhelix-cet4"
VERSION = "1.0.0"
BASE = Path(__file__).resolve().parent
UI_DIR = (BASE / "ui").resolve()
RUNTIME = BASE / ".runtime"
LOG_FILE = RUNTIME / "app.log"
PROFILE_DIR = RUNTIME / "edge-profile"
PORTS = range(47840, 47880)
HEARTBEAT_TIMEOUT = 120.0

STATE = {
    "port": None,
    "started": time.time(),
    "last_beat": 0.0,
    "client_seen": False,
    "stopping": False,
    "server": None,
    "window_proc": None,
}

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}


def log(message):
    line = "%s  %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), message)
    try:
        RUNTIME.mkdir(parents=True, exist_ok=True)
        if LOG_FILE.exists() and LOG_FILE.stat().st_size > 512 * 1024:
            LOG_FILE.replace(LOG_FILE.with_suffix(".old.log"))
        with LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except Exception:
        pass
    if sys.stderr:
        try:
            sys.stderr.write(line + "\n")
            sys.stderr.flush()
        except Exception:
            pass


def json_bytes(obj):
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")


class JhelixServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = "Jhelix/%s" % VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def decoded_path(self):
        path = urlparse(self.path).path
        try:
            path = path.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        return unquote(path)

    # ------------------------------------------------------------ helpers

    def _send(self, status, body, content_type, extra_headers=None, head_only=False):
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store, must-revalidate")
            self.send_header("X-Jhelix-App", "1")
            for key, value in (extra_headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            if not head_only:
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def _json(self, status, obj, head_only=False):
        self._send(status, json_bytes(obj), "application/json; charset=utf-8", head_only=head_only)

    # ------------------------------------------------------------ verbs

    def do_HEAD(self):
        self.do_GET(head_only=True)

    def do_GET(self, head_only=False):
        path = self.decoded_path()
        if path in ("/api/信息", "/api/info"):
            meta = load_meta()
            self._json(
                200,
                {
                    "app": APP_ID,
                    "name": APP_NAME,
                    "version": VERSION,
                    "pid": os.getpid(),
                    "port": STATE["port"],
                    "startedAt": int(STATE["started"] * 1000),
                    "words": meta.get("total", 0),
                    "heartbeatTimeout": HEARTBEAT_TIMEOUT,
                    "clientSeen": STATE["client_seen"],
                    "lastBeat": int(STATE["last_beat"] * 1000) if STATE["last_beat"] else 0,
                },
                head_only,
            )
            return
        if path.startswith("/api/"):
            self._json(404, {"ok": False, "error": "unknown api"}, head_only)
            return
        self._serve_static(path, head_only)

    def do_POST(self):
        path = self.decoded_path()
        length = 0
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length:
            try:
                self.rfile.read(length)
            except Exception:
                pass

        if path in ("/api/心跳", "/api/beat"):
            STATE["last_beat"] = time.time()
            STATE["client_seen"] = True
            self._json(200, {"ok": True, "t": int(time.time() * 1000)})
            return
        if path in ("/api/退出", "/api/exit"):
            STATE["client_seen"] = True
            self._json(200, {"ok": True})
            schedule_shutdown("用户退出", delay=0.7)
            return
        if path in ("/api/打开目录", "/api/open-dir"):
            try:
                if hasattr(os, "startfile"):
                    os.startfile(str(BASE))
                self._json(200, {"ok": True, "path": str(BASE)})
            except Exception as exc:
                self._json(500, {"ok": False, "error": str(exc)})
            return
        self._json(404, {"ok": False, "error": "unknown api"})

    # ------------------------------------------------------------ static

    def _serve_static(self, path, head_only=False):
        raw = unquote(path)
        if raw in ("", "/"):
            raw = "/index.html"
        rel = raw.lstrip("/").replace("\\", "/")
        target = (UI_DIR / rel).resolve()
        if target != UI_DIR and UI_DIR not in target.parents:
            self._json(403, {"ok": False, "error": "forbidden"}, head_only)
            return
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            if "." not in Path(rel).name:
                target = UI_DIR / "index.html"
            else:
                self._json(404, {"ok": False, "error": "not found"}, head_only)
                return
        try:
            body = target.read_bytes()
        except OSError:
            self._json(500, {"ok": False, "error": "read failed"}, head_only)
            return
        content_type = MIME.get(target.suffix.lower(), "application/octet-stream")
        self._send(200, body, content_type, head_only=head_only)


def load_meta():
    try:
        with (UI_DIR / "data" / "words.json").open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return {"total": data.get("total", 0), "builtAt": data.get("builtAt")}
    except Exception:
        return {}


def probe_existing():
    for port in PORTS:
        if not port_in_use(port):
            continue
        request = urllib.request.Request(
            "http://127.0.0.1:%d/api/info" % port,
            headers={"X-Jhelix-Probe": "1"},
        )
        try:
            with urllib.request.urlopen(request, timeout=0.4) as response:
                if response.headers.get("X-Jhelix-App") != "1":
                    continue
                payload = json.loads(response.read().decode("utf-8"))
                if payload.get("app") == APP_ID:
                    return payload
        except Exception:
            continue
    return None


def find_edge():
    candidates = []
    for env in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"):
        root = os.environ.get(env)
        if root:
            candidates.append(Path(root) / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    candidates.append(Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"))
    for path in candidates:
        if path.is_file():
            return str(path)
    return None


def open_window(url):
    edge = find_edge()
    if not edge:
        log("未找到 Edge，改用默认浏览器")
        try:
            import webbrowser

            webbrowser.open(url)
        except Exception as exc:
            log("打开浏览器失败: %s" % exc)
        return

    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    command = [
        edge,
        "--app=%s" % url,
        "--user-data-dir=%s" % PROFILE_DIR,
        "--window-size=1460,940",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=msEdgeFirstRunExperience",
        "--disable-background-mode",
    ]
    try:
        creationflags = 0
        if hasattr(subprocess, "DETACHED_PROCESS"):
            from subprocess import CREATE_NEW_PROCESS_GROUP, DETACHED_PROCESS

            creationflags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        proc = subprocess.Popen(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
            close_fds=True,
        )
        STATE["window_proc"] = proc
        log("已打开 Edge 应用窗口 pid=%s url=%s" % (proc.pid, url))
    except Exception as exc:
        log("Edge 启动失败(%s)，改用默认浏览器" % exc)
        try:
            import webbrowser

            webbrowser.open(url)
        except Exception as exc2:
            log("默认浏览器也失败了: %s" % exc2)


def schedule_shutdown(reason, delay=0.0):
    if STATE["stopping"]:
        return
    STATE["stopping"] = True

    def worker():
        if delay:
            time.sleep(delay)
        log("准备退出：%s" % reason)
        server = STATE.get("server")
        if server:
            try:
                server.shutdown()
            except Exception:
                pass

    threading.Thread(target=worker, daemon=True).start()


def watchdog():
    while not STATE["stopping"]:
        time.sleep(5)
        if STATE["stopping"]:
            break
        now = time.time()
        if not STATE["client_seen"]:
            if now - STATE["started"] > 90:
                schedule_shutdown("启动后没有客户端连接")
                break
            continue
        last = STATE["last_beat"]
        if last and now - last > HEARTBEAT_TIMEOUT:
            schedule_shutdown("心跳超时（窗口可能已关闭）")
            break


def port_in_use(port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.01)
    try:
        return sock.connect_ex(("127.0.0.1", port)) == 0
    except OSError:
        return False
    finally:
        try:
            sock.close()
        except OSError:
            pass


def bind_server():
    last_error = None
    for port in PORTS:
        if port_in_use(port):
            continue
        try:
            httpd = JhelixServer(("127.0.0.1", port), Handler)
            return httpd, port
        except OSError as exc:
            last_error = exc
    raise RuntimeError("没有可用端口: %s" % last_error)


def main():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    no_window = "--no-window" in sys.argv or "--headless" in sys.argv

    existing = probe_existing()
    if existing:
        url = "http://127.0.0.1:%s/#/today" % existing.get("port")
        log("检测到已运行实例 pid=%s port=%s" % (existing.get("pid"), existing.get("port")))
        if not no_window:
            open_window(url)
        return 0

    try:
        httpd, port = bind_server()
    except Exception as exc:
        log("启动失败: %s" % exc)
        return 1

    STATE["server"] = httpd
    STATE["port"] = port
    url = "http://127.0.0.1:%d/#/today" % port
    log("JHELIX 启动 port=%d runtime=%s" % (port, RUNTIME))

    if not no_window:
        threading.Timer(0.45, lambda: open_window(url)).start()
    threading.Thread(target=watchdog, daemon=True).start()

    try:
        httpd.serve_forever(poll_interval=0.4)
    except KeyboardInterrupt:
        pass
    finally:
        try:
            httpd.server_close()
        except Exception:
            pass
        log("服务已停止 port=%d" % port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
