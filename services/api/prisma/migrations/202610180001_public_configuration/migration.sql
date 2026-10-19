ALTER TABLE "voting"."MaciAuditRecord"
    ADD COLUMN "configurationJson" TEXT,
    ADD COLUMN "configurationHash" TEXT;

GRANT UPDATE ("configurationJson", "configurationHash") ON "voting"."MaciAuditRecord" TO voting_runtime;
CREATE POLICY api_config_update ON "voting"."MaciAuditRecord"
    FOR UPDATE TO voting_runtime USING (true) WITH CHECK (true);
