# RV Cotton Mill Portal

Local full-stack demo for RV Cotton Mill, Surat textile market sector.

## Run

```powershell
node server.js
```

Open:

```text
http://localhost:3000
```

## Demo Logins

| Role | Username | Password |
| --- | --- | --- |
| Owner | `owner` | `Owner@123` |
| Admin | `admin` | `Admin@123` |
| Developer | `developer` | `Developer@123` |
| Co-worker | `dispatch` | `Dispatch@123` |
| Mill | `mill` | `Mill@123` |
| Client | `client-a` | `Client@123` |
| Client | `client-b` | `Client@123` |

Use the Users screen as owner/admin/developer to create real client, mill, or staff usernames and passwords.

## Mill Orders

Admins, owners, developers, and co-workers can create or edit any PO and set:

- `Mill order`: send the PO to the mill interface
- `Mill priority`: `Urgent` or `Normal`

The mill login only sees POs marked as mill orders. Clients still only see their own client-code POs.

## How It Works Guide

The homepage includes a public How It Works section. After login, every role also has a How It Works screen in the sidebar with role-specific instructions for owner/admin/developer/co-worker/mill/client workflows.

## Google Sheet Sync

The app imports this Sheet as CSV:

```text
https://docs.google.com/spreadsheets/d/1B5EkMFuu70iDiVcze_0y2DrqEER2Zpx4xlKuT0j57dA/export?format=csv&gid=0
```

Supported columns include:

- `P.O NO.`
- `ORDER DATE`
- `CODE`
- `ITEM DETAILS`
- `QUANTITY`
- `DISPATCH DATE`
- `DELIVERY CODE`
- `DISPATCH STATUS`

The `CODE` column is used as the client code when no separate client code column exists. A client user only sees orders where their saved client code matches that order code.

## Storage

- Local database: `data/db.json`
- Uploaded order files: `uploads/`

## Production Upgrade

For real internet access, host the Node app and replace local JSON/session storage with managed auth and a database with row-level security, for example Supabase. Keep HTTPS enabled, use strong passwords, and store file uploads in private object storage.
