#!/usr/bin/env bash
# Boot backend + vite, run BOTH UI suites, tear down — one invocation, because
# background processes started in an earlier tool call get reaped before the
# next call runs.
set -u
ROOT="/c/Users/91915/Documents/Mira-CRM"
NODE="C:/Users/91915/.workbuddy-ai/binaries/node/versions/22.22.2-3/node.exe"
export NODE_PATH="C:/Users/91915/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules"

cleanup() {
  for PID in $(netstat -ano 2>/dev/null | grep -E ":(4000|5173)" | grep LISTENING | awk '{print $NF}' | sort -u); do
    taskkill //PID "$PID" //F >/dev/null 2>&1
  done
}
trap cleanup EXIT
cleanup; sleep 1

( cd "$ROOT/backend" && "$NODE" server.js > /tmp/mira-be-run.log 2>&1 ) &
( cd "$ROOT/frontend" && "$NODE" ./node_modules/vite/bin/vite.js --port 5173 --strictPort > /tmp/mira-vite-run.log 2>&1 ) &

for i in $(seq 1 40); do
  BE=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" http://localhost:4000/api/leads 2>/dev/null)
  FE=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null)
  if [ "$BE" = "401" ] && [ "$FE" = "200" ]; then echo "servers ready after ${i}s"; break; fi
  sleep 1
done

cd "$ROOT/frontend/audit"
FAIL=0

echo; echo "########## mobile responsiveness ##########"
"$NODE" mobile-shots.cjs || FAIL=1

echo; echo "########## feature UI smoke ##########"
"$NODE" ui-lifecycle-smoke.cjs || FAIL=1

echo; echo "########## backend lifecycle ##########"
"$NODE" lifecycle-test.cjs || FAIL=1

echo; echo "== overall: $([ $FAIL -eq 0 ] && echo ALL PASS || echo FAILURES) =="
exit $FAIL
