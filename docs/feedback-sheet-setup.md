# Feedback → Email + live Google Sheet

Every time someone submits feedback in the app, Supabase fires a webhook to a
Google Apps Script attached to your Sheet. The script **adds a row** to the Sheet
and **emails you**. You never open Supabase.

Flow: App → Supabase `feedback` row → Database Webhook → Apps Script → Sheet row + email.

Do this once. ~10 minutes.

---

## 1. Create the Google Sheet

1. Go to https://sheets.new and name it e.g. **Pantry — Feedback**.
2. Rename the first tab (bottom-left) to **Feedback**.
3. Put these headers in row 1 (A1 across):

   `Received | Type | Message | From | Page | Status | ID`

---

## 2. Add the Apps Script

1. In the Sheet: **Extensions → Apps Script**.
2. Delete anything in `Code.gs` and paste the script below.
3. Change the two settings at the top:
   - `NOTIFY_EMAIL` — where the email goes (already set to your Gmail).
   - `SECRET` — invent any random string (letters/numbers), e.g. `pantry-9f3k2x`. You'll reuse it in step 4.
4. Click **Save** (💾).

```javascript
// ---- Settings ----
const NOTIFY_EMAIL = 'neverewers@gmail.com';
const SECRET = 'CHANGE-ME-to-a-random-string';   // must match the ?token= in the webhook URL
const SHEET_NAME = 'Feedback';

function doPost(e) {
  try {
    // Simple shared-secret check (token comes in the URL: ...?token=SECRET)
    const token = (e && e.parameter && e.parameter.token) || '';
    if (SECRET && token !== SECRET) {
      return ContentService.createTextOutput('forbidden');
    }

    const body = JSON.parse(e.postData.contents);
    const r = body.record || {};   // Supabase sends the new row under "record"

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    sheet.appendRow([
      r.created_at ? new Date(r.created_at) : new Date(),
      r.type || '',
      r.message || '',
      r.user_email || 'unknown',
      r.page || '',
      r.status || 'new',
      r.id || ''
    ]);

    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: 'New app feedback (' + (r.type || 'general') + ')',
      body: [
        'Type:  ' + (r.type || ''),
        'From:  ' + (r.user_email || 'unknown'),
        'Page:  ' + (r.page || ''),
        'When:  ' + (r.created_at || ''),
        '',
        r.message || '',
        '',
        '— Logged to your Feedback sheet.'
      ].join('\n')
    });

    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}
```

---

## 3. Deploy the script as a Web App

1. Top-right: **Deploy → New deployment**.
2. Click the gear ⚙ next to "Select type" → choose **Web app**.
3. Set:
   - **Description:** anything (e.g. "feedback hook")
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**  ← required so Supabase can reach it
4. **Deploy**. Google will ask you to **authorize** — approve it (it needs to email + edit the Sheet). If it warns "unverified", click **Advanced → Go to (project) → Allow**. This is your own script; it's safe.
5. Copy the **Web app URL** — it ends in `/exec`. Keep it handy.

> If you ever change the script, do **Deploy → Manage deployments → Edit → Version: New version → Deploy** so the change goes live.

---

## 4. Point Supabase at it

1. Supabase dashboard → **Database → Webhooks** → **Enable webhooks** (if prompted) → **Create a new hook**.
2. Fill in:
   - **Name:** `feedback-to-sheet`
   - **Table:** `public.feedback`
   - **Events:** tick **Insert** only
   - **Type:** **HTTP Request**
   - **Method:** **POST**
   - **URL:** paste your Web app URL and add your secret as a query param:
     `https://script.google.com/macros/s/XXXXX/exec?token=YOUR-SECRET`
     (use the exact SECRET from step 2)
   - **HTTP Headers:** leave the default `Content-Type: application/json`.
3. **Create / Confirm**.

---

## 5. Test it

1. Open the app → home screen → tap the message icon (top-right) → send a test note.
2. Within a few seconds: a new row appears in your Sheet **and** an email lands in `neverewers@gmail.com`.

If nothing arrives:
- Supabase → Database → Webhooks → your hook → check the **delivery logs** for the response (should say `ok`). `forbidden` = the `?token=` doesn't match the script's `SECRET`. `error:` = re-check the script was saved and re-deployed.
- Make sure the Web app "Who has access" is **Anyone**.

---

### Notes
- Submissions are still written to Supabase (that's what triggers the webhook) — it's a silent backup. You just never have to look there; the Sheet is your working log.
- The `Status` column is yours to edit in the Sheet (new → planned → done) to track what you action.
- To change where emails go, edit `NOTIFY_EMAIL` and re-deploy (step 3 note).
