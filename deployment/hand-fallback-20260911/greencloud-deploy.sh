#!/usr/bin/env bash
set -euo pipefail
app=/opt/gemini-eye-app
backup=/root/hand41-transaction
mkdir -p "$backup"
chmod 700 "$backup"
test "$(sha256sum "$app/server.js" | cut -d' ' -f1)" = 067ead166611400dd42a0e1fd3806b3ddda0b45dd3ce2c9d2be443f75724d215
test "$(sha256sum /tmp/hand41-server.js | cut -d' ' -f1)" = 75c55b380d241fc20c993a833ca9029245f90cd74d643d798d721a653d08146c
node --check /tmp/hand41-server.js
cp -a "$app/server.js" "$backup/server.js"
test "$(sha256sum "$app/public/app.js" | cut -d' ' -f1)" = 3044fa4ac7b28248de4c58a41a0c30779b96123baecb8170c24c7225cbee02c6
test "$(sha256sum /tmp/hand41-public-app.js | cut -d' ' -f1)" = 4e117cb0e3fc970e8c6e2851f82e8639ed8868c9d79ec7d475166ad0d0e00c9f
node --check /tmp/hand41-public-app.js
cp -a "$app/public/app.js" "$backup/public-app.js"
rollback() {
  cp -a "$backup/server.js" "$app/server.js"
  cp -a "$backup/public-app.js" "$app/public/app.js"
  systemctl restart gemini-eye
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
systemctl restart gemini-eye
healthy=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:8788/api/health > /tmp/hand41-health.json; then healthy=1; break; fi
  sleep 1
done
test "$healthy" = 1
trap - ERR
sha256sum "$app/server.js" "$app/public/app.js"
echo hand41-deployed
