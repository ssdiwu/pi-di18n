#!/usr/bin/env python3
"""真实 TUI 冒烟验证：在 pty 中启动 pi（加载本仓库扩展），打开 /settings，断言核心 UI 行已本地化。

用法：
  python3 scripts/tui-smoke.py [--pi /path/to/pi] [--timeout-per-step N]

依赖：仅 Python 标准库。需要能在 pty 中运行的 pi（TUI 模式）。
"""
import argparse
import os
import pty
import re
import fcntl
import select
import signal
import struct
import termios
import time

EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    parser = argparse.ArgumentParser(description="pi-di18n TUI smoke test")
    parser.add_argument("--pi", default="/opt/homebrew/bin/pi", help="pi executable")
    parser.add_argument("--timeout-per-step", type=float, default=10.0)
    args = parser.parse_args()

    screen_path = "/tmp/pi-di18n-tui-smoke-screen.log"
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.execvp(args.pi, [args.pi, "-e", EXT_DIR, "--no-session"])
        os._exit(1)

    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
    output = bytearray()

    def pump(duration: float) -> None:
        end = time.time() + duration
        while time.time() < end:
            ready, _, _ = select.select([fd], [], [], 0.2)
            if ready:
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    return
                if not data:
                    return
                output.extend(data)

    def send(text: str, settle: float) -> None:
        try:
            os.write(fd, text.encode())
        except OSError:
            pass
        pump(settle)

    step = args.timeout_per_step
    pump(step)
    send("/settings", 2)
    send("\r", step)
    send("\x1b", 2)

    text = bytes(output).decode("utf-8", errors="replace")
    open(screen_path, "w").write(text)
    try:
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, os.WNOHANG)
    except (ProcessLookupError, ChildProcessError):
        pass

    clean = re.sub(r"\x1b\[[0-9;?]*[a-zA-Z]", "", text)
    checks = {
        "Auto-compact（英文标签应消失）": ("Auto-compact" not in clean),
        "自动压缩（中文标签应出现）": ("自动压缩" in clean),
        "编辑器内距（中文标签应出现）": ("编辑器内距" in clean),
    }
    failed = [name for name, ok in checks.items() if not ok]
    for name, ok in checks.items():
        print(("PASS  " if ok else "FAIL  ") + name)
    print(f"屏幕捕获：{screen_path}（{len(text)} bytes）")
    if failed:
        print(f"\n{len(failed)} 项未通过；若 locale 非 zh-CN，先运行 /lang zh-CN。")
        return 1
    print("\n全部通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
