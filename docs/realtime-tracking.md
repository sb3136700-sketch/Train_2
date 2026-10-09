# Realtime train tracking integration

This branch adds a server-side live-status proxy to the existing Express server.

## Configure
Set `RAILRADAR_API_KEY` in the server deployment environment (never in browser/Vite variables). Optional: set `RAILRADAR_BASE_URL` (defaults to `https://api.railradar.in/v1`).

Endpoint:
`GET /api/trains/:trainNumber/live?date=YYYY-MM-DD`

A valid upstream response is returned with provider timestamp and source status. Errors return explicit unavailable/stale-friendly states; the endpoint does not generate fake GPS coordinates.

## Mobile + web
The frontend can call this same-origin endpoint from desktop and mobile browsers, then poll every 30–60 seconds while visible. Pause polling when the tab is hidden. Display source timestamp and mark data stale if the upstream timestamp ages. If the provider supplies only station status and no train coordinates/route geometry, show that station status rather than inventing a moving train marker.

## Limitations
- Requires a valid provider API key/account and allowed quota.
- Precise train coordinates depend on provider data; an HTTP live-status response is not a guarantee of GPS-level telemetry.
- This integration branch does not alter main.
