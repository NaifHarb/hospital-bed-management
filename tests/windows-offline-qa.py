"""Verify the BAT launcher and the offline demo on native Windows browser channels."""

import json
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import time
import traceback
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "http://localhost:8765"
URL = f"{ORIGIN}/docs/"
EVIDENCE = ROOT / "windows-qa-evidence"
CHANNEL = os.environ["QA_BROWSER"]


def record(stage, **result):
    (EVIDENCE / f"{stage}.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def wait_for_launcher(process, log_path):
    deadline = time.monotonic() + 25
    while process.poll() is None and time.monotonic() < deadline:
        if f"Open {URL}" in log_path.read_text(encoding="utf-8", errors="replace"):
            try:
                with urlopen(URL, timeout=2) as response:
                    if response.status == 200 and b'id="loginForm"' in response.read():
                        return
            except OSError:
                pass
        time.sleep(0.25)
    raise RuntimeError(f"Launcher did not serve the login page (exit: {process.poll()})")


def check_browser():
    external = []
    errors = []

    def local_only(route):
        if route.request.url.startswith(f"{ORIGIN}/"):
            route.continue_()
        else:
            external.append(route.request.url)
            route.abort()

    with sync_playwright() as playwright, playwright.chromium.launch(channel=CHANNEL) as browser:
        record("browser", channel=CHANNEL, version=browser.version)
        with browser.new_context(service_workers="block") as context:
            context.route("**/*", local_only)
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(URL)
            page.select_option("#loginGroup", "admin")
            page.select_option("#loginUser", "admin")
            page.fill('#loginForm [name="password"]', "123456")
            page.locator('#loginForm button[type="submit"]').click()
            expect(page.locator("#appShell")).to_be_visible()
            expect(page.locator('[data-dashboard-filter="all"] b')).to_have_text("40")
            record("login", result="PASS", beds=40)
            for width, height in [(1366, 768), (1920, 1080)]:
                page.set_viewport_size({"width": width, "height": height})
                for theme in ["light", "dark"]:
                    if page.locator("html").get_attribute("data-theme") != theme:
                        page.click("#themeToggle")
                    expect(page.locator("html")).to_have_attribute("dir", "rtl")
                    expect(page.locator("html")).to_have_attribute("data-theme", theme)
                    assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
                    page.screenshot(path=EVIDENCE / f"{width}x{height}-{theme}.png")
                record(f"layout-{width}x{height}", result="PASS")
            assert page.evaluate("[...document.images].every(i => i.complete && i.naturalWidth > 0)")
            record("offline", external_requests=external, page_errors=errors)
            assert not external and not errors


def main():
    EVIDENCE.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="Hospital Demo ") as demo:
        directory = Path(demo)
        for name in ["run-local-windows.bat", "run-local.py"]:
            shutil.copy2(ROOT / name, directory)
        shutil.copytree(ROOT / "docs", directory / "docs")
        log_path = EVIDENCE / "launcher.log"
        with log_path.open("wb") as log:
            process = subprocess.Popen(
                ["cmd.exe", "/d", "/c", "run-local-windows.bat"],
                cwd=directory,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                wait_for_launcher(process, log_path)
                record("launcher", result="PASS", url=URL, status=200)
                check_browser()
            finally:
                if process.poll() is None:
                    subprocess.run(
                        ["taskkill", "/pid", str(process.pid), "/t", "/f"],
                        check=True,
                        capture_output=True,
                        timeout=10,
                    )
                    process.wait(timeout=10)
    record("result", result="PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        record("result", result="FAIL", detail=traceback.format_exc())
        raise
