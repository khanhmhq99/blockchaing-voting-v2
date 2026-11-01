-- The admin monitor reads these two existing coordinator projections.
-- Keep the runtime role read-only for them; proof publication remains separate.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'voting_runtime') THEN
    RAISE EXCEPTION 'Expected API database role voting_runtime is missing';
  END IF;
END $$;

GRANT SELECT ON "voting"."MaciCoordinatorRun" TO voting_runtime;
GRANT SELECT ON "voting"."MaciProofSubmission" TO voting_runtime;
CREATE POLICY api_select ON "voting"."MaciCoordinatorRun" FOR SELECT TO voting_runtime USING (true);
CREATE POLICY api_select ON "voting"."MaciProofSubmission" FOR SELECT TO voting_runtime USING (true);
