# Project Data Preservation Rules

- **Strict Data Preservation**: Always maintain, build upon, and preserve existing employee records, attendance history, leave requests, and company settings stored in `server_data.json` and `src/mockData.ts`.
- **No Data Reset**: Never wipe, reset, or overwrite real/saved employee data or server records during future features or updates. Any new fields should be added incrementally.
- **Permanent Company Logo**: The official logo of Tech Source (GDS - Global Development) is stored in `/public/logo.png`. DO NOT replace, delete, overwrite, or change this logo in any future update or code modification. Always render `/public/logo.png` as the company logo across all headers, dashboards, modals, reports, and printed documents.

