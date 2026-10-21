# YASTER RTM Dashboard

Standalone, browser-only dashboard for importing Yeastar CSV exports:
- CDR
- Agent Login Activity
- Agent Pause Activity

## Run locally
Open `index.html` in a modern browser. Data, employee schedules, and break plans are saved in that browser's local storage. Export a backup before changing devices or clearing browser data.

## Notes
- This is an import-only dashboard; it does not connect to the Yeastar API.
- Import the three CSV exports manually.
- Attendance and break compliance depend on the timestamp and duration columns available in the exported CSV files.
