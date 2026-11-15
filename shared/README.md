# EventLoop: local two-user prototype

This prototype lets two separate browser sessions on one computer test a shared handoff: an owner lists an item, a claimant requests it, the owner accepts, and each participant records their confirmation. Data is stored in a local SQLite database. The prototype is not deployed and cannot be accessed over the internet.

## Run locally

Install Node.js 24 or newer; no third-party dependencies are required. From the `eventloop` directory, run:

```sh
node shared/server.mjs
```

Open <http://127.0.0.1:8787/> and leave the server running. Press Ctrl+C in the terminal to stop it. By default, data is stored in `eventloop/.data/`; data from the older single-browser prototype is not imported. The service listens only on the local machine and cannot be accessed directly from another device or the internet.

## Simulate two participants on one computer

1. Open `http://127.0.0.1:8787/` and register account A. Usernames contain 3–32 letters, numbers, underscores or hyphens; passwords contain 8–128 characters. **Use passwords created only for testing.**
2. Open `http://localhost:8787/` in another tab and register account B. The hostnames keep separate login cookies while sharing the same local database. If `localhost` does not connect, open `127.0.0.1` in another browser or a private window. Ordinary tabs using the same hostname normally share a login session.
3. As A, list an item with an availability date of today or later and a clearance date on or after that date.
4. For a direct handoff, refresh as B, choose a pickup date between availability and clearance, choose direct pickup and submit the request.
5. For a storage bridge, first have someone authorised to offer a storage point register its intake dates, hold-until date and item-slot capacity. As B, choose a pickup date after clearance, select that storage point and submit the request.
6. Refresh as A and accept the request in the handoff records. The server rechecks capacity across the whole storage interval and occupies a slot only when acceptance succeeds; conflicts are rejected. Refresh each session and confirm the handoff separately; the record is complete after both confirmations.

When a request is accepted, other pending requests for that item are rejected. An unconfirmed request can be cancelled. Updates do not arrive automatically: use Refresh or reload the page. Do not publish test accounts, test data or database files.

## Current limitations

- Storage capacity uses whole inclusive dates and one slot per item. It does not check dimensions, materials, actual opening hours or transport.
- Users list storage themselves; **there is no separate approval by a storage manager**. An application or acceptance does not mean a space has actually been booked or authorised. Participants must arrange this independently.
- There are no notifications or automatic live updates. The older single-browser prototype's data is not imported.
- Two in-app confirmations are records, not independent proof of a physical transfer or later reuse. No real waste reduction has been measured.
- There are no real campus storage partnerships, transport arrangements or user pilots represented by the demo. Users must verify the location, dates and condition themselves.
- This is a local development prototype, not a publicly deployed or security-audited production service. Hosting, privacy, security and cross-device testing require further work.

