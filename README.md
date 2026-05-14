# RV COTTON MILL Live Order Dispatch

A local prototype for RV COTTON MILL, Surat Textile Market Sector.

## What is included

- Admin order entry and editing
- Client-code based order filtering
- Live updates across open browser tabs using local browser storage
- Item images, dispatch status, dispatch date, delivery code, quantity, fabric, PO no., and order date
- Client query form
- Admin query inbox with replies
- JSON export for backup or migration
- Google Sheet import from the shared RV COTTON MILL sheet
- WhatsApp/clipboard image paste for each PO through the order editor
- Public client portal at `/client.html?code=CLIENTCODE`
- Server-side Google Sheet filtering for client links
- Automatic CSV refresh every 60 seconds

## Run locally

From this folder:

```powershell
node server.mjs 4173
```

Then open:

```text
http://localhost:4173
```

Client portal example:

```text
http://localhost:4173/client.html?code=FOCUS
```

## Deploy and Share

See [SHARE-INSTRUCTIONS.md](./SHARE-INSTRUCTIONS.md) for the complete owner-side checklist.

## Notes

The Google Sheet import currently maps:

- `P.O NO.` to PO no.
- `ORDER DATE` to order date
- `CODE` to client code
- `ITEM DETAILS` to fabric/details
- `QUANTITY` to quantity
- `DISPATCH STATUS` to dispatched/undispatched, where `TRUE` means dispatched

For the full client portal, add these optional columns to the sheet:

- `CLIENT NAME`
- `IMAGE URL`
- `DISPATCH DATE`
- `DELIVERY CODE`

## Adding images from WhatsApp

1. Search the PO in the admin dispatch register.
2. Click `Edit`.
3. Copy the item image from WhatsApp.
4. Click the `Paste WhatsApp image` box in the order form and paste.
5. Click `Save order`.

The saved image appears on the client-side order status card. Future Google Sheet imports preserve pasted PO images.

This is still a local prototype. For real client access on the internet, connect it to a secure backend with authentication, database storage, and hosted realtime sync.
