#!/bin/bash
# A throwaway local Postgres that replays every migration, seeds a small
# company shaped like the live one, and runs the Agency OS tests.
#   supabase/tests/local-db/run.sh          run everything, then stop the server
#   supabase/tests/local-db/run.sh --keep   leave it running on localhost:55432
# Needs Homebrew postgresql@16 (initdb, pg_ctl, psql) and node 24.
set -u
cd "$(dirname "$0")"
REPO=$(cd ../../.. && pwd)
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8   # postgres refuses to start without a valid locale
PORT=55432
DATA=${TMPDIR:-/tmp}/metrol-test-pg
run() { psql -h localhost -p $PORT -U postgres -d metrol -v ON_ERROR_STOP=1 -q "$@"; }

pg_ctl -D "$DATA" stop -m fast >/dev/null 2>&1
rm -rf "$DATA" && initdb -D "$DATA" -U postgres --auth=trust >/dev/null || exit 1
# TCP only: a unix socket under a long temp path exceeds the 103-byte limit.
pg_ctl -D "$DATA" -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=''" -l "$DATA.log" start >/dev/null
until pg_isready -h localhost -p $PORT >/dev/null 2>&1; do sleep 1; done
psql -h localhost -p $PORT -U postgres -q -c "create database metrol"
run -f stub.sql 2>&1 | grep -v wal_level

# Every migration in order; the people are seeded just before 0035, so the
# role seed and its old-vs-new proof run against real-shaped logins.
seeded=0
for f in "$REPO"/supabase/migrations/00*.sql; do
  n=$(basename "$f")
  if [ $seeded = 0 ] && [[ "$n" > "0035" ]]; then run -f seed_people.sql && seeded=1 && echo "-- seeded people"; fi
  if ! out=$(run -f "$f" 2>&1); then echo "FAILED $n"; echo "$out" | grep -v wal_level | grep -i -A3 error | head -12; exit 1; fi
  echo "ok $n"
  # From 0038 on, show the proof rows the SQL editor will show Adarsh.
  [[ "$n" > "0038" ]] && echo "$out" | grep -v -E "wal_level|^NOTICE|^$"
  [ "$n" = "0032_clients_pages.sql" ] && run -f "$REPO/supabase/scripts/rename_content_marketing_department.sql" >/dev/null
done

for t in rls_tests team_tests rpc_tests sheet_check security_tests; do
  echo "===== $t"
  psql -h localhost -p $PORT -U postgres -d metrol -q -f $t.sql 2>&1 | grep -v "^SET\|set_config\|^[0-9a-f-]\{36\}$\|^$"
done

echo "===== the app's computeProgress() vs v_target_progress"
psql -h localhost -p $PORT -U postgres -d metrol -At -c "select json_build_object(
  'targets', (select json_agg(t) from view_targets t where client_id='c0000000-0000-0000-0000-000000000002'),
  'periods', (select json_agg(p) from view_target_periods p join view_targets t on t.id=p.target_id where t.client_id='c0000000-0000-0000-0000-000000000002'),
  'pages', (select json_agg(p) from pages p where client_id='c0000000-0000-0000-0000-000000000002'),
  'channels', (select json_agg(c) from page_channels c join pages p on p.id=c.page_id where p.client_id='c0000000-0000-0000-0000-000000000002'),
  'weekly', (select json_agg(w) from weekly_views w join page_channels c on c.id=w.channel_id join pages p on p.id=c.page_id where p.client_id='c0000000-0000-0000-0000-000000000002'),
  'adjustments', (select json_agg(a) from view_adjustments a join view_targets t on t.id=a.target_id where t.client_id='c0000000-0000-0000-0000-000000000002'),
  'sql', (select json_agg(v) from v_target_progress v where client_id='c0000000-0000-0000-0000-000000000002'),
  'today', current_date)" > .progress_fixture.json
node parity.mjs 2>&1 | grep -v ExperimentalWarning | tail -3
rm -f .progress_fixture.json

if [ "${1:-}" = "--keep" ]; then echo "server left running: psql -h localhost -p $PORT -U postgres -d metrol"
else pg_ctl -D "$DATA" stop -m fast >/dev/null && echo "server stopped"; fi
