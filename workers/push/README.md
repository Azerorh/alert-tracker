# alert-tracker-push

Cloudflare Worker: Web Push for UA oblast watches (background phone notifications).

## Endpoints

- `GET /health`
- `GET /vapid-public-key`
- `POST /subscribe` — `{ subscription, watched[], kinds }`
- `POST /unsubscribe` — `{ endpoint }`
- `POST /tick` — manual cron cycle
- `POST /test-push` — `{ endpoint }`

## Deploy

```bash
cd workers/push
npm install
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npx wrangler deploy
```

Cron: every minute (`* * * * *`). Public URL: `https://alert-tracker-push.azerorh.workers.dev`
