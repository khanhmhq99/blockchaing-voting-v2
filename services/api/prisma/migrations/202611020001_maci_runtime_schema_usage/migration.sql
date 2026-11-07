-- Allow the limited API role to resolve voting tables on a fresh Supabase project.
-- Table privileges and RLS policies remain scoped by the earlier migrations.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'voting_runtime') THEN
    RAISE EXCEPTION 'Expected API database role voting_runtime is missing';
  END IF;
END $$;

GRANT USAGE ON SCHEMA "voting" TO voting_runtime;
