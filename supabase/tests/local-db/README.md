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
- `security_tests.sql` — 0038 (HR sees and sets targets) and 0039: a signed-out
  visitor reads no table, a stranger's new account (and a company-code
  sign-up, which lands in Sales) reads only its own profile, staff lose only
  `qr_token`, HR/owner still get the QR codes, `punch_by_qr` still resolves,
  employee-ID sign-in needs the right password, /apply still submits.
- `parity.mjs` — the app's `computeProgress()` against `v_target_progress`;
  must say "0 mismatches".

From 0038 on, run.sh also prints each migration's proof rows — exactly what
the SQL editor will show Adarsh.

`perf.sql` (not run by default) loads a year of weekly numbers for 7 clients.

Nothing here touches the live database. Written 2026-09-26 for Agency OS
Phase 1 (migrations 0035–0037), extended for 0038–0039; extend it with the
next migration's checks.
