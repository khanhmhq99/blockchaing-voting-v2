-- Only the server-held API role receives the operations used by the current MACI API.
-- RLS remains enabled; anon/authenticated have no voting schema/table grants.
DO $$
DECLARE table_name text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'voting_runtime') THEN
        RAISE EXCEPTION 'Expected API database role voting_runtime is missing';
    END IF;
    FOREACH table_name IN ARRAY ARRAY[
        'AppUser', 'MaciElection', 'MaciEligibility', 'MaciRegistration',
        'MaciEncryptedSubmission', 'MaciPollJoinSubmission'
    ] LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON voting.%I TO voting_runtime', table_name);
        EXECUTE format('CREATE POLICY api_select ON voting.%I FOR SELECT TO voting_runtime USING (true)', table_name);
        EXECUTE format('CREATE POLICY api_insert ON voting.%I FOR INSERT TO voting_runtime WITH CHECK (true)', table_name);
        EXECUTE format('CREATE POLICY api_update ON voting.%I FOR UPDATE TO voting_runtime USING (true) WITH CHECK (true)', table_name);
    END LOOP;
    FOREACH table_name IN ARRAY ARRAY['AdminActivity', 'MaciAuditRecord'] LOOP
        EXECUTE format('GRANT SELECT, INSERT ON voting.%I TO voting_runtime', table_name);
        EXECUTE format('CREATE POLICY api_select ON voting.%I FOR SELECT TO voting_runtime USING (true)', table_name);
        EXECUTE format('CREATE POLICY api_insert ON voting.%I FOR INSERT TO voting_runtime WITH CHECK (true)', table_name);
    END LOOP;
    GRANT SELECT, INSERT, DELETE ON voting."AppSession" TO voting_runtime;
    CREATE POLICY api_select ON voting."AppSession" FOR SELECT TO voting_runtime USING (true);
    CREATE POLICY api_insert ON voting."AppSession" FOR INSERT TO voting_runtime WITH CHECK (true);
    CREATE POLICY api_delete ON voting."AppSession" FOR DELETE TO voting_runtime USING (true);
END $$;
