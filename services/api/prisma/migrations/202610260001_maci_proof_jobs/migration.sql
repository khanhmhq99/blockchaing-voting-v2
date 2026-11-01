CREATE TABLE "voting"."MaciProofJob" (
  "id" UUID NOT NULL,
  "electionId" UUID NOT NULL,
  "runId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "stage" TEXT NOT NULL DEFAULT 'QUEUED',
  "diagnosticCode" TEXT,
  "closingBlock" BIGINT NOT NULL,
  "closingHash" TEXT NOT NULL,
  "genesisHash" TEXT NOT NULL,
  "snapshotBlock" BIGINT,
  "snapshotHash" TEXT,
  "manifestJson" TEXT,
  "eventsNdjson" TEXT,
  "proofsJson" TEXT,
  "tallyJson" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "MaciProofJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaciProofJob_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "voting"."MaciElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MaciProofJob_electionId_key" ON "voting"."MaciProofJob"("electionId");
CREATE UNIQUE INDEX "MaciProofJob_runId_key" ON "voting"."MaciProofJob"("runId");
CREATE INDEX "MaciProofJob_status_createdAt_idx" ON "voting"."MaciProofJob"("status", "createdAt");
ALTER TABLE "voting"."MaciProofJob" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'voting_runtime') THEN
    RAISE EXCEPTION 'Expected API database role voting_runtime is missing';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON "voting"."MaciProofJob" TO voting_runtime;
CREATE POLICY api_select ON "voting"."MaciProofJob" FOR SELECT TO voting_runtime USING (true);
CREATE POLICY api_insert ON "voting"."MaciProofJob" FOR INSERT TO voting_runtime WITH CHECK (true);
CREATE POLICY api_update ON "voting"."MaciProofJob" FOR UPDATE TO voting_runtime USING (true) WITH CHECK (true);
