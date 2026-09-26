# Local database tests

`./run.sh` builds a throwaway Postgres 16, stubs what Supabase provides
(`stub.sql`: the anon/authenticated/service_role roles, `auth.uid()`,
`storage.objects`, the realtime publication), replays **every** migration in
order, seeds a small company shaped like the live one (`seed_people.sql` —
including an HR login with **no employee record**, the case that decides
whether role rules really reproduce `is_hr()`), and runs:

- `rls_tests.sql` — who may read and write what, as owner / HR / the C&M head /
  an SMM / an editor / a Sales lead (and anon). "DENIED" lines marked
  "(expect denied)" are passes.
- `team_tests.sql` — `v_client_team` and `assignable_staff()`.
- `rpc_tests.sql` — `save_view_target()`, incl. periods shifted in one save.
- `sheet_check.sql` — LavBhusan's May weeks; `running_left` must equal
  `sheet_left` on every row.
- `parity.mjs` — the app's `computeProgress()` against `v_target_progress`;
  must say "0 mismatches".

`perf.sql` (not run by default) loads a year of weekly numbers for 7 clients.

Nothing here touches the live database. Written 2026-09-26 for Agency OS
Phase 1 (migrations 0035–0037); extend it with the next migration's checks.
