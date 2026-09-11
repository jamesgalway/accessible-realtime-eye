#!/usr/bin/env bash
set -euo pipefail
app=/opt/accessible-realtime-eye/app
backup=/root/hand41-transaction
mkdir -p "$backup"
chmod 700 "$backup"
test "$(sha256sum "$app/server.js" | cut -d' ' -f1)" = 9075e090b40a80459aad63b62386f53d532163463ec9fae4a3605502253cfa95
test "$(sha256sum /tmp/hand41-server.js | cut -d' ' -f1)" = d27bc3cf10305d67f71a6a6fe62b2fde54ae2e8b7fce00ca99e4d55ab73ceec9
node --check /tmp/hand41-server.js
cp -a "$app/server.js" "$backup/server.js"
test "$(sha256sum "$app/public/app.js" | cut -d' ' -f1)" = 9812471c5a555db495d3f0c7a1fecabbc3f4b476d9dceda023816c399aedc3e4
test "$(sha256sum /tmp/hand41-public-app.js | cut -d' ' -f1)" = 664629c6e1f0a023b2e250d064543cea69413bde1024edde2ec60fe87ccb8861
node --check /tmp/hand41-public-app.js
cp -a "$app/public/app.js" "$backup/public-app.js"
rollback() {
  cp -a "$backup/server.js" "$app/server.js"
  cp -a "$backup/public-app.js" "$app/public/app.js"
  pm2 restart accessible-realtime-eye
}
trap rollback ERR
cp /tmp/hand41-server.js "$app/server.js.hand41"
chown --reference="$app/server.js" "$app/server.js.hand41"
chmod --reference="$app/server.js" "$app/server.js.hand41"
mv -f "$app/server.js.hand41" "$app/server.js"
cp /tmp/hand41-public-app.js "$app/public/app.js.hand41"
chown --reference="$app/public/app.js" "$app/public/app.js.hand41"
chmod --reference="$app/public/app.js" "$app/public/app.js.hand41"
mv -f "$app/public/app.js.hand41" "$app/public/app.js"
pm2 restart accessible-realtime-eye
healthy=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:8787/api/health > /tmp/hand41-health.json; then healthy=1; break; fi
  sleep 1
done
test "$healthy" = 1
trap - ERR
sha256sum "$app/server.js" "$app/public/app.js"
echo hand41-deployed
