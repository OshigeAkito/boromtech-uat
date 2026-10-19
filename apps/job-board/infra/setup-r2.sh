#!/usr/bin/env bash
# One-time R2 setup, after enabling R2 in the Cloudflare dashboard (it needs a payment method on file).
# Run from apps/job-board/infra with `npx wrangler login` done. Then create the API tokens listed at the end
# in the dashboard (R2 → Manage API tokens); tokens can't be created from wrangler.
set -euo pipefail
ORIGIN=${ORIGIN:-https://crew.boromtech.co}

# bt-crew-files: every uploaded file, private. Browsers PUT and GET with signed URLs, so it needs CORS for
# the app's origin. No lock: profile photos are re-copied to the same key, and app.files' never_purge_attached
# CHECK already keeps attached evidence from being swept.
npx wrangler r2 bucket create bt-crew-files --location apac || true
cat > /tmp/bt-crew-files-cors.json <<JSON
{ "rules": [ { "allowed": { "origins": ["$ORIGIN", "http://localhost:5173"], "methods": ["PUT", "GET", "HEAD"],
                            "headers": ["content-type", "cache-control"] },
               "exposeHeaders": ["etag"], "maxAgeSeconds": 86400 } ] }
JSON
npx wrangler r2 bucket cors set bt-crew-files --file /tmp/bt-crew-files-cors.json --force

# bt-backups: nightly encrypted database dumps (crew/) and a copy of every file object (files/). Locked for 30
# days, so a leaked CI token can't delete or overwrite recent backups; dumps expire after 35 days.
npx wrangler r2 bucket create bt-backups --location apac || true
npx wrangler r2 bucket lock add bt-backups crew-30d crew/ --retention-days 30 --force
npx wrangler r2 bucket lock add bt-backups files-30d files/ --retention-days 30 --force
npx wrangler r2 bucket lifecycle add bt-backups crew-35d crew/ --expire-days 35 --force

# bt-public: marketing-site images at media.boromtech.co (wired up when the website moves to Cloudflare).
npx wrangler r2 bucket create bt-public --location apac || true

cat <<'TXT'

Now create these R2 API tokens (dashboard → R2 → Manage API tokens), each limited to one bucket:
  crew-api     Object Read & Write · bt-crew-files  → Secret Manager crew-r2-secret-access-key;
                                                     its key id → GitHub variable R2_ACCESS_KEY_ID
  crew-sweep   Object Read & Write · bt-crew-files  → GitHub secrets R2_SWEEP_KEY_ID, R2_SWEEP_SECRET
  backup-write Object Read & Write · bt-backups     → GitHub secrets R2_BACKUP_KEY_ID, R2_BACKUP_SECRET
  files-read   Object Read         · bt-crew-files  → GitHub secrets R2_FILESRO_KEY_ID, R2_FILESRO_SECRET
TXT
