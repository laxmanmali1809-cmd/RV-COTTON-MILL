# RV COTTON MILL Sharing Instructions

This is the practical sharing setup for your boss and clients.

## What Is Ready

- Admin/boss dashboard: `/`
- Client-only portal: `/client.html`
- Client direct link format: `/client.html?code=CLIENTCODE`
- Google Sheet CSV sync every 60 seconds
- Public client portal asks the server only for that client's code
- Admin Google Sheet import can be protected with `ADMIN_PIN` on hosting

## Your Google Sheet Work

Keep these columns exactly:

- `P.O NO.`
- `ORDER DATE`
- `CODE`
- `ITEM DETAILS`
- `QUANTITY`
- `DISPATCH STATUS`

Recommended extra columns:

- `CLIENT NAME`
- `IMAGE URL`
- `DISPATCH DATE`
- `DELIVERY CODE`

For `DISPATCH STATUS`:

- `TRUE` means dispatched
- `FALSE` means undispatched

For images online:

1. Upload the image to Google Drive.
2. Set the file sharing to anyone with the link can view.
3. Paste that link in the `IMAGE URL` column.

The local admin page still supports paste-from-WhatsApp, but browser-pasted images are local unless you connect real cloud storage.

## Deploy On Render

1. Create a GitHub account if you do not have one.
2. Create a new private GitHub repository, for example `rv-cotton-mill-orders`.
3. Upload all files from this folder to that repository.
4. Go to Render and create a new Web Service.
5. Connect the GitHub repository.
6. Use these settings:

```text
Runtime: Node
Build command: npm install
Start command: npm start
```

7. Add environment variables:

```text
SHEET_ID=1B5EkMFuu70iDiVcze_0y2DrqEER2Zpx4xlKuT0j57dA
ADMIN_PIN=choose-a-private-pin-for-you-and-your-boss
SHEET_CACHE_MS=60000
```

8. Deploy.

Render will give a public URL like:

```text
https://rv-cotton-mill-orders.onrender.com
```

## Links To Share

Boss/admin link:

```text
https://YOUR-RENDER-URL/
```

Client link:

```text
https://YOUR-RENDER-URL/client.html?code=FOCUS
```

Change `FOCUS` to the exact client code from the `CODE` column.

Examples:

```text
https://YOUR-RENDER-URL/client.html?code=MTC
https://YOUR-RENDER-URL/client.html?code=FRIEND
https://YOUR-RENDER-URL/client.html?code=MAIT
```

## Daily Work

1. Update orders in the Google Sheet.
2. Set dispatch status as `TRUE` or `FALSE`.
3. Add dispatch date and delivery code if those columns exist.
4. Clients refresh automatically every 60 seconds.
5. You can also open the admin dashboard and click `Import Google Sheet`.

## Important Security Note

The client portal filters data on the server endpoint, so normal client links receive only their own code's orders.

For bank-level security, login accounts, query inbox, and WhatsApp image uploads shared across all devices, the next upgrade should be Supabase or Firebase with authentication, database rules, and cloud storage.
