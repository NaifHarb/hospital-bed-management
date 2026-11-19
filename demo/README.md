# Demo for University Cooperative Training Committee

**Open [demo/index.html](./index.html) in Chrome, Edge, Safari or Firefox.** The standalone file includes its CSS, JavaScript and synthetic data. No Node.js, PostgreSQL, server or internet connection is needed after the file is downloaded.

## Presentation walkthrough (5 minutes)
1. Show the dashboard: 32 beds, status counts and occupancy percentage.
2. Filter by department and explain the hospital capacity problem.
3. Find an available bed and click **حجز**. Enter a demo reference (e.g. DEMO-001). Observe the reserved count.
4. Click **دخول** for the reserved bed. Observe occupied count and occupancy percentage.
5. Click **خروج**. The bed becomes **تنظيف**; click **جاهز** to return it to available.
6. Click **تصدير تقرير CSV** to download a simple status report.
7. Click **إعادة ضبط بيانات العرض** to restore the original demo before the next presentation.

## Important limitations
- The demo is a **standalone frontend simulation**, not connected to the React/Express/PostgreSQL production-track application.
- Data persists in this browser's localStorage and can be reset. Use the same browser profile for the presentation.
- This prototype does not implement real users, authentication, server-side transactions, real patients or hospital integration.
- All data and references must be synthetic. Do not enter real patient identifiers.
- If a browser blocks local-file storage, the demo still runs, but changes may not persist after refresh.
