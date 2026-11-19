# Hospital Bed Management Dashboard

Arabic RTL React + Vite dashboard. **Demo only — do not use real patient data.**

## Local development
1. Install Node.js 20+ and run `npm install`.
2. Copy `.env.example` to `.env`.
3. Start the backend from [Hospital-api](https://github.com/NaifHarb/Hospital-api/tree/feature/bed-management-api-foundation) and configure PostgreSQL.
4. Run `npm run dev` and open the displayed local URL.
5. Run `npm run build` to validate the production bundle.

## Current scope
Read-only dashboard for bed counts, occupancy percentage, departments and bed statuses, with refresh and department filtering. No patient records, login, editing, real-time Socket.IO or deployment yet. The API must be available at `VITE_API_BASE_URL`.
