# Not used

ProofLayer runs on SQLite (`db/schema.sql`, Node's built-in `node:sqlite`).
Nothing in the application, the worker or the public demo connects to
Supabase or Postgres, and no Supabase configuration or credentials exist.

`0001_init.sql` is kept as a reference for a possible multi-user,
hosted version: the same tables with row-level security scoped to the
owning user. It has not been applied or tested against a live database.
