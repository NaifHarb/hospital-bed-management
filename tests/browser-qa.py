"""Run against the local Python server with Python Playwright and Chromium."""
import csv
import io
import json
import os
from pathlib import Path
import tempfile
import traceback

from playwright.sync_api import expect, sync_playwright

URL = "http://localhost:8765/docs/"
EVIDENCE = Path(os.environ.get("QA_EVIDENCE", "/tmp/hospital-qa"))
EVIDENCE.mkdir(parents=True, exist_ok=True)
ACCOUNTS = {
    "admin": ("admin", "123456"),
    "tech": ("tech", "Tech2026"),
    "coord": ("coord", "Coord2026"),
    "clean": ("cleaning", "Clean2026"),
    "maint": ("maintenance", "Maint2026"),
}
NURSES = {
    "العناية المركزة": ("nurse_icu", 6),
    "التنويم": ("nurse_station_1", 6),
    "الطوارئ": ("nurse_station_2", 5),
    "الأطفال": ("nurse_peds", 5),
    "الجراحة": ("nurse_surgery", 9),
    "العزل": ("nurse_station_5", 9),
}
PERMISSIONS = {
    "admin": "addBed manageBed finishCleaning approveBed addRequest manageRequest allocate addEquipment editEquipment addTransfer manageTransfer ackAlert ackAll addRecovery approveRecovery saveSettings resetDemo importJson",
    "tech": "addEquipment editEquipment addTransfer manageTransfer ackAlert ackAll addRecovery approveRecovery importJson",
    "coord": "addRequest manageRequest allocate addTransfer manageTransfer ackAlert ackAll",
    "clean": "cleaningAction",
    "maint": "finishCleaning approveBed addEquipment editEquipment ackAlert ackAll maintenanceAction",
    "nurse": "nurseDischarge nurseArrival",
}
ALL_ACTIONS = sorted(set(" ".join(PERMISSIONS.values()).split()))
RESULTS = []
BLOCKED = []
ERRORS = []


def open_page(context):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(
        "http://localhost:8765/") else (BLOCKED.append(route.request.url), route.abort()))
    p = context.pages[0] if context.pages else context.new_page()
    p.on("pageerror", lambda error: ERRORS.append(str(error)))
    p.on("dialog", lambda dialog: dialog.accept())
    p.set_default_timeout(4000)
    assert p.goto(URL).status == 200
    return p


def login(p, user="admin", department=None, bad=False):
    if department:
        group, password = f"nursing:{department}", "Nurse2026"
    else:
        group, password = ACCOUNTS[user]
    p.select_option("#loginGroup", group)
    p.select_option("#loginUser", user)
    p.fill('#loginForm [name="password"]', "incorrect" if bad else password)
    p.locator('#loginForm button[type="submit"]').click()
    expect(p.locator("#loginError" if bad else "#appShell")).to_be_visible()
    if bad:
        expect(p.locator("#loginError")).not_to_be_empty()


def logout(p):
    p.click("#userMenuButton")
    p.locator('button[onclick^="logout()"]').click()
    expect(p.locator("#loginScreen")).to_be_visible()
    expect(p.locator("#appShell")).to_be_hidden()


def nav(p, view):
    p.click(f'[data-view="{view}"]')


def shot(p, name):
    p.screenshot(path=EVIDENCE / f"{name}.png", animations="disabled")


def snapshot(p):
    return p.evaluate("structuredClone(db)")


def get_bed(p, key):
    return next(b for b in snapshot(p)["beds"] if b["id"] == key)


def kpi(p, state):
    return int(p.locator(f'[data-dashboard-filter="{state}"] b').inner_text())


def accounts(p, browser):
    discovered = p.evaluate("Object.keys(DEMO_ACCOUNTS).sort()")
    expected = sorted([*ACCOUNTS, *(user for user, _ in NURSES.values())])
    assert discovered == expected, discovered
    failures = []
    for user, dept in [(u, None) for u in ACCOUNTS] + [(u, d) for d, (u, _) in NURSES.items()]:
        with browser.new_context() as context:
            q = open_page(context)
            try:
                login(q, user, dept, bad=True)
                login(q, user, dept)
                allowed = q.evaluate("actions => actions.filter(demoCan)", ALL_ACTIONS)
                assert allowed == sorted(PERMISSIONS["nurse" if dept else user].split())
                if dept:
                    cards = q.locator(".portal-card .portal-card-head bdi").all_text_contents()
                    expected_beds = [b["id"] for b in snapshot(q)["beds"] if b["dept"] == dept]
                    assert cards == expected_beds and len(cards) == NURSES[dept][1]
                shot(q, f"account-{user}")
                nav(q, "requests")
                expect(q.locator('button[onclick="addRequest()"]')).to_have_count(
                    1 if "addRequest" in allowed else 0)
                logout(q)
                assert q.evaluate("actions => actions.every(a => !demoCan(a))", ALL_ACTIONS)
                print(f"  account {user}: {len(allowed)}/{len(ALL_ACTIONS)} allowed", flush=True)
            except Exception as error:
                failures.append(f"{user}: {error}")
                shot(q, f"failure-{user}")
    assert not failures, failures


def capacity(p, _):
    login(p)
    assert [kpi(p, s) for s in ("all", "ready", "occupied", "reserved")] == [40, 29, 5, 1]
    expect(p.locator('[data-dashboard-filter="occupied"] .percent')).to_have_text("13%")
    shot(p, "dashboard-capacity")
    nav(p, "beds")
    for department, (_, size) in NURSES.items():
        p.select_option("#filterDept", department)
        expect(p.locator(".bed-card")).to_have_count(size)
    p.select_option("#filterDept", "")
    expect(p.locator(".bed-card")).to_have_count(40)
    shot(p, "beds-40")


def choose(p, label):
    p.locator("#actionOptions").get_by_role("button", name=label, exact=True).click()


def task(p, action, bed):
    p.click(f'[data-portal-action="{action}"][data-bed="{bed}"]')


def lifecycle(p, _):
    key = "SUR-203"
    login(p, "nurse_surgery", "الجراحة")
    assert get_bed(p, key)["status"] == "occupied"
    task(p, "discharge", key)
    assert get_bed(p, key)["status"] == "cleaning"
    shot(p, "nursing-discharge")
    logout(p)
    login(p, "clean")
    task(p, "clean", key)
    expect(p.locator(f'[data-portal-action="clean"][data-bed="{key}"]')).to_have_text("إنهاء المهمة")
    task(p, "clean", key)
    assert get_bed(p, key)["clean"] and get_bed(p, key)["status"] == "cleaning"
    shot(p, "cleaning-completed")
    logout(p)
    login(p)
    nav(p, "cleaning")
    p.get_by_role("row").filter(has_text=key).get_by_role("button", name="فحص الجاهزية").click()
    assert get_bed(p, key)["status"] == "ready"
    nav(p, "requests")
    p.get_by_role("button", name="+ طلب استقبال", exact=True).click()
    p.fill('#entryForm [name=patient]', 'حالة QA اصطناعية')
    p.fill('#entryForm [name=identity]', '9000000089')
    p.click('#entryForm button[type=submit]')
    card = p.locator(".request-card").filter(has_text="حالة QA اصطناعية")
    card.locator(".inline-accept").click()
    card.get_by_role("button", name="إدارة الطلب").click()
    choose(p, "تخصيص سرير")
    choose(p, f"{key} — الجراحة")
    assert get_bed(p, key)["status"] == "reserved"
    shot(p, "new-reservation")
    logout(p)
    login(p, "nurse_surgery", "الجراحة")
    task(p, "arrival", key)
    assert get_bed(p, key)["status"] == "occupied"
    expect(p.locator(f'[data-portal-action="arrival"][data-bed="{key}"]')).to_have_count(0)
    assert p.evaluate("runDemoChecks()") == []
    shot(p, "nursing-arrival")


def red_crescent(p, _):
    login(p, "coord")
    nav(p, "requests")

    def simulate():
        p.get_by_role("button", name="طلب وارد من الهلال الأحمر", exact=True).click()
        choose(p, "حادث مروري")
        return snapshot(p)["requests"][0]["id"]

    first = simulate()
    p.click(f'.inline-accept[data-request-id="{first}"]')
    occupied_bed = snapshot(p)["requests"][0]["bed"]
    assert get_bed(p, occupied_bed)["status"] == "occupied"
    expect(p.locator(f'.inline-accept[data-request-id="{first}"]')).to_have_count(0)
    nav(p, "dashboard")
    assert kpi(p, "occupied") == 6 and kpi(p, "ready") == 28
    expect(p.locator('[data-dashboard-filter="occupied"] .percent')).to_have_text("16%")
    shot(p, "red-crescent-live-kpi")
    nav(p, "requests")
    second = simulate()
    p.click(f'.inline-reject[data-request-id="{second}"]')
    assert snapshot(p)["requests"][0]["status"] == "rejected"
    third = simulate()
    p.click(f'.inline-accept[data-request-id="{third}"]')
    assert snapshot(p)["requests"][0]["bed"] != occupied_bed
    assert p.evaluate("runDemoChecks()") == []
    p.fill("#requestSearch", third)
    shot(p, "red-crescent-accepted")
    p.fill("#requestSearch", second)
    expect(p.locator(".request-card:visible")).to_contain_text("مرفوض")
    shot(p, "red-crescent-rejected")


def maintenance(p, _):
    login(p, "maint")
    key = p.locator('[data-portal-action="maint"]').first.get_attribute("data-bed")
    task(p, "maint", key)
    expect(p.locator(f'[data-portal-action="maint"][data-bed="{key}"]')).to_have_text("إنهاء المهمة")
    task(p, "maint", key)
    bed = get_bed(p, key)
    assert bed["status"] == "cleaning" and bed["equipment"] and not bed["clean"]
    shot(p, "maintenance-completed")
    nav(p, "housekeeping")
    expect(p.locator(".portal-card").filter(has_text=key)).to_contain_text("تنظيف بعد الصيانة")
    nav(p, "operations")
    expect(p.get_by_role("row").filter(has_text="إغلاق بلاغ الصيانة")).to_contain_text(key)
    shot(p, "operations-audit")
    nav(p, "reports")
    expect(p.locator('[data-report-filter="occupied"] b')).to_have_text("13%")
    shot(p, "reports")
    for label, filename in [("تصدير CSV", "hospital-beds.csv"), ("تصدير سجل التدقيق CSV", "hospital-audit.csv")]:
        with p.expect_download() as event:
            p.get_by_role("button", name=label, exact=True).first.click()
        assert event.value.suggested_filename == filename
        content = event.value.path().read_text(encoding="utf-8-sig")
        rows = list(csv.reader(io.StringIO(content)))
        if filename == "hospital-beds.csv":
            assert len(rows) == 41
        else:
            assert any("إغلاق بلاغ الصيانة" in row for row in rows)
    p.click('[data-report-filter="occupied"]')
    expect(p.locator("#filterState")).to_have_value("occupied")
    expect(p.locator(".bed-card")).to_have_count(5)


def backup(p, browser):
    with tempfile.TemporaryDirectory() as profile:
        for reopen in [False, True]:
            with playwright.chromium.launch_persistent_context(profile, **launch) as ctx:
                q = open_page(ctx)
                # Chromium can restore the tab and its sessionStorage with the profile.
                if q.locator("#loginScreen").is_visible():
                    login(q)
                expect(q.locator("#appShell")).to_be_visible()
                nav(q, "settings")
                if not reopen:
                    nav(q, "requests")
                    q.get_by_role("button", name="طلب وارد من الهلال الأحمر", exact=True).click()
                    choose(q, "حادث مروري")
                    request_id = snapshot(q)["requests"][0]["id"]
                    q.click(f'.inline-accept[data-request-id="{request_id}"]')
                    bed_id = snapshot(q)["requests"][0]["bed"]
                    nav(q, "settings")
                    q.fill('[name="hospital"]', 'مستشفى عرض QA')
                    q.get_by_role("button", name="حفظ الإعدادات").click()
                    q.reload()
                    expect(q.locator("#hospitalTitle")).to_have_text("مستشفى عرض QA")
                    assert get_bed(q, bed_id)["status"] == "occupied"
                    nav(q, "settings")
                    with q.expect_download() as event:
                        q.get_by_role("button", name="تصدير نسخة JSON", exact=True).click()
                    event.value.save_as(EVIDENCE / "backup.json")
                    assert json.loads((EVIDENCE / "backup.json").read_text()) == snapshot(q)
                else:
                    expect(q.locator("#hospitalTitle")).to_have_text("مستشفى عرض QA")
                    assert get_bed(q, bed_id)["status"] == "occupied"
                    shot(q, "persistent-reopen")
    login(p)
    nav(p, "settings")
    with p.expect_file_chooser() as chooser:
        p.get_by_role("button", name="استيراد نسخة JSON").click()
    chooser.value.set_files(EVIDENCE / "backup.json")
    expect(p.locator("#hospitalTitle")).to_have_text("مستشفى عرض QA")
    expected = json.loads((EVIDENCE / "backup.json").read_text())
    assert snapshot(p)["beds"] == expected["beds"] and snapshot(p)["requests"] == expected["requests"]
    shot(p, "backup-restored")


def invalid_backup(p, _):
    login(p)
    nav(p, "settings")
    before = snapshot(p)
    bad = json.loads(json.dumps(before))
    bad["beds"].append(bad["beds"][0])
    for malformed in [bad, {**before, "alerts": [None]}, {**before, "settings": []}]:
        with p.expect_file_chooser() as chooser:
            p.get_by_role("button", name="استيراد نسخة JSON").click()
        with p.expect_event("dialog") as notice:
            chooser.value.set_files({"name": "invalid.json", "mimeType": "application/json",
                                     "buffer": json.dumps(malformed).encode()})
        assert "تعذر الاستيراد" in notice.value.message
        assert snapshot(p) == before
        print(f"  rejected invalid JSON: {notice.value.message}", flush=True)
    shot(p, "invalid-backup-state-preserved")


def academic_demo(p, _):
    login(p)
    nav(p, "settings")
    p.get_by_role("button", name="تجهيز سيناريو المناقشة", exact=True).click()
    key = "DEMO-AMB-001"
    p.fill("#requestSearch", key)
    card = p.locator(".request-card:visible")
    expect(card).to_contain_text(key)
    card.locator(".inline-accept").click()
    assert snapshot(p)["requests"][0]["status"] == "arrived"
    assert p.evaluate("runDemoChecks()") == []
    shot(p, "academic-demo")


def layout(p, _):
    login(p)
    for width, height in [(1366, 768), (1920, 1080)]:
        p.set_viewport_size({"width": width, "height": height})
        for theme in ["light", "dark"]:
            if p.locator("html").get_attribute("data-theme") != theme:
                p.click("#themeToggle")
            expect(p.locator("html")).to_have_attribute("dir", "rtl")
            expect(p.locator("html")).to_have_attribute("data-theme", theme)
            for view in ["dashboard", "beds", "requests", "reports"]:
                nav(p, view)
                assert p.evaluate("document.documentElement.scrollWidth === innerWidth"), (width, theme, view)
                shot(p, f"{width}x{height}-{theme}-{view}")
    assert p.evaluate("[...document.images].every(i => i.complete && i.naturalWidth > 0)")


cases = [accounts, capacity, lifecycle, red_crescent, maintenance, backup, invalid_backup, academic_demo, layout]
launch = {"executable_path": os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), "args": ["--disable-dev-shm-usage"]}
with sync_playwright() as playwright, playwright.chromium.launch(**launch) as browser:
    print(f"Chromium {browser.version} | {URL}", flush=True)
    for case in cases:
        with browser.new_context(accept_downloads=True, service_workers="block") as context:
            start_errors = len(ERRORS)
            p = open_page(context)
            try:
                case(p, browser)
                assert not ERRORS[start_errors:], ERRORS[start_errors:]
                entry = {"case": case.__name__, "result": "PASS"}
            except Exception:
                entry = {"case": case.__name__, "result": "FAIL", "detail": traceback.format_exc()}
                shot(p, f"failure-{case.__name__}")
            RESULTS.append(entry)
            print(entry, flush=True)
    entry = {"case": "external_network", "result": "FAIL" if BLOCKED else "PASS", "blocked_urls": BLOCKED}
    RESULTS.append(entry)
    print(entry, flush=True)
(EVIDENCE / "results.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2))
raise SystemExit(any(r["result"] == "FAIL" for r in RESULTS))
