# Hospital Bed Management System

## Goal
Arabic RTL hospital bed and capacity management system for demo/training use. No real patient data.

## Proposed stack
- Frontend: React
- Backend: Node.js / Express
- Database: PostgreSQL
- Realtime: Socket.IO

## Core modules
- Arabic dashboard: available, occupied, reserved, cleaning and maintenance beds
- Departments, rooms and beds management
- Bed reservations, admissions, transfers and discharge
- Role-based access and audit logs
- Reports and occupancy metrics
- Server deployment configuration

## Safety and correctness
- Use synthetic data only until hospital authorization and security review
- Enforce server-side permissions and prevent double bookings with database transactions
- Keep secrets out of GitHub and use environment variables

## Delivery phases
1. Database schema and backend API
2. Arabic RTL frontend
3. Authentication and workflows
4. Realtime updates, reports and tests
5. Deployment and documentation
