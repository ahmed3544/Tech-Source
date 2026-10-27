# Excel Online → Tech Source (Power Automate)

This integration is a one-way inbound import. Excel Online remains the source of truth; it does not send website data back to Excel.

## What the webhook imports
- Schedule assignments and OFF days recognized by the existing Excel dashboard importer.
- Existing employees are matched by employee code or name.
- Existing website accounts, PINs, roles, and admin access are not changed.
- Missing employees are not created by this webhook.
- Shift templates can be created when the importer recognizes a schedule cell containing a shift name and time range.

The current template's separate Breaks table is not yet applied by this webhook; break synchronization needs a separate mapping and should not be assumed active.

## 1. Configure the secret in Vercel
1. Generate a long random secret (at least 32 characters). Do not put it in Excel or GitHub.
2. In the Vercel project for Tech Source, add environment variable:
   - Name: `EXCEL_ONLINE_SYNC_SECRET`
   - Value: your generated secret
   - Environments: Production (and Preview only if you intend to test there)
3. Redeploy after saving the environment variable.
4. Keep the secret private. Anyone who obtains it can submit schedule imports.

Webhook endpoint:
`POST https://YOUR-TECH-SOURCE-DOMAIN/api/dashboard-import/power-automate`

Headers:
`Authorization: Bearer YOUR_SECRET`
`Content-Type: application/json`

JSON body:
```json
{
  "workbookBase64": "BASE64_FILE_CONTENT"
}
```

The endpoint accepts workbooks up to 15 MB at the application level, though the hosting platform may impose a lower request-size limit. Use a compact workbook.

## 2. Create the Power Automate flow
Use a flow whose Excel/OneDrive connection is an account that already has access to the company workbook. The ChatGPT connector could not read the supplied sharing link, so the flow must be created and authorized in the user's Microsoft 365 tenant.

1. Open Power Automate and create a Scheduled cloud flow (start with every 1 hour for testing; reduce frequency only after validation).
2. Add the OneDrive for Business or SharePoint Get file content action, selecting the actual workbook from the connected work account. If the workbook is in a SharePoint site rather than OneDrive, use the matching SharePoint action.
3. Add an HTTP action (this action may require a Power Automate Premium license).
   - Method: `POST`
   - URI: the webhook endpoint above
   - Header `Authorization`: `Bearer YOUR_SECRET`
   - Header `Content-Type`: `application/json`
   - Body:
```json
{
  "workbookBase64": "@{body('Get_file_content')?['$content']}"
}
```
   If your action is named differently, update `Get_file_content` in the expression to its actual internal action name.
4. Save the flow and run it manually once.
5. Confirm the HTTP response has `"success": true`, and verify a test schedule date in the website before enabling a recurring schedule.

## 3. Important safety checks
- Test first with a copy of the workbook and a non-critical schedule date.
- The importer overwrites assignments for dates represented in the workbook; do not include dates you do not want replaced.
- Keep employee names or codes consistent with the existing website roster.
- The endpoint records a sync status in the existing dashboard-import configuration and writes an activity log.
- Do not use a public sharing link as the webhook secret. The secret must be stored only in Vercel and in the Power Automate connection configuration.
- If the HTTP action is blocked by licensing or tenant policy, ask the Microsoft 365 administrator about the permitted connector/licensing path. This cannot be bypassed by changing the sharing URL.
