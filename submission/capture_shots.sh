#!/usr/bin/env bash
# Captures 1920x1080 app screenshots for the slides with headless Firefox (app must be running on :8000).
set -e
cd "$(dirname "$0")"
mkdir -p shots
B=http://localhost:8000
tok() { curl -s -XPOST $B/api/login -H 'content-type: application/json' -d "{\"user_id\":\"$1\",\"pin\":\"$2\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }

# set the scene: Sara's tachycardia, her case report and a private message to Earth
S=$(tok sara 1111)
curl -s -XPOST $B/api/demo/speed?seconds_per_reading=0.3 -H "authorization: Bearer $S" >/dev/null
curl -s -XPOST $B/api/demo/inject -H "authorization: Bearer $S" -H 'content-type: application/json' -d '{"crew_id":1,"type":"tachycardia"}' >/dev/null
sleep 8
curl -s -XPOST $B/api/chat -H "authorization: Bearer $S" -H 'content-type: application/json' -d "{\"message\":\"I don't feel well\"}" >/dev/null
curl -s -XPOST $B/api/cases -H "authorization: Bearer $S" -H 'content-type: application/json' -d '{}' >/dev/null
curl -s -XPOST $B/api/comms -H "authorization: Bearer $S" -H 'content-type: application/json' \
  -d '{"subject":"Private: trouble sleeping","body":"Since the dust storm drill I sleep badly. Can we talk privately?","private":true}' >/dev/null
sleep 6
curl -s -XPOST $B/api/demo/speed?seconds_per_reading=1 -H "authorization: Bearer $S" >/dev/null

shot() {  # name, url  (fresh profile each time so no sign-in leaks between shots)
  PROF=$(mktemp -d)
  firefox --headless --no-remote --profile "$PROF" --window-size 1920,1080 --screenshot "$PWD/shots/$1.png" "${2/\?shot=1/?shot=1\&theme=dark}" >/dev/null 2>&1
  rm -rf "$PROF"; echo "captured $1"
}
shot crew "$B/?shot=1&as=amina#/crew"
shot crewtiles "$B/?shot=1&as=amina#/crew/1"
shot assistant "$B/?shot=1&as=sara#/assistant?q=I%20feel%20dizzy%20and%20my%20heart%20is%20racing"
shot earth "$B/?shot=1&as=mansour#/comms"
shot risks "$B/?shot=1&as=mansour#/risks"
shot login "$B/?shot=1"
