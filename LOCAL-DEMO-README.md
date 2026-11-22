# Hospital Bed Management — Offline University Demo

## How to run

1. Download the repository ZIP from GitHub and extract **all** files.
2. On Windows double-click `run-local-windows.bat` (Python 3 must be installed). On macOS/Linux run `sh run-local-mac-linux.sh`.
3. Open `http://localhost:8765/docs/` in a browser. No Internet is needed after extraction; this is a local static web server, **not** a multi-user hospital backend.
4. Log in as `admin` using the existing demo credentials, open Settings, and choose **تجهيز سيناريو المناقشة**. This replaces the local demo data after confirmation; export JSON first if needed.
5. Accept the sample Red Crescent request `DEMO-AMB-001`, verify the occupied bed and dashboard counters, then demonstrate discharge and cleaning.

## Important

- Data is stored in browser localStorage per browser profile. Use the **same browser and localhost URL** throughout the demonstration. Different browsers/devices do not share data.
- Do not use real patient data. Credentials and permissions are for academic simulation, not production security.
- Keep a backup JSON export and a copy of the repository ZIP on a USB drive.
- If port 8765 is busy, close the other local server before relaunching.
