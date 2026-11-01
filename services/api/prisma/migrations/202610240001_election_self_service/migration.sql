-- Additive account-side approval and local deployment intent. Apply only to an authorized database.
CREATE TABLE "voting"."MaciParticipationRequest" (
  "id" UUID NOT NULL, "electionId" UUID NOT NULL, "userId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMPTZ(6), "reviewedById" UUID,
  CONSTRAINT "MaciParticipationRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaciParticipationRequest_electionId_userId_key" UNIQUE ("electionId", "userId"),
  CONSTRAINT "MaciParticipationRequest_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "voting"."MaciElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaciParticipationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "voting"."AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaciParticipationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "voting"."AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MaciParticipationRequest_electionId_status_requestedAt_idx" ON "voting"."MaciParticipationRequest"("electionId", "status", "requestedAt");
CREATE TABLE "voting"."MaciDeploymentJob" (
  "id" UUID NOT NULL, "requestedById" UUID NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL, "requestedConfig" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATING', "stage" TEXT NOT NULL DEFAULT 'QUEUED',
  "genesisHash" TEXT NOT NULL, "deployment" JSONB, "diagnosticCode" TEXT,
  "electionId" UUID, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "MaciDeploymentJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaciDeploymentJob_requestedById_idempotencyKey_key" UNIQUE ("requestedById", "idempotencyKey"),
  CONSTRAINT "MaciDeploymentJob_electionId_key" UNIQUE ("electionId"),
  CONSTRAINT "MaciDeploymentJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "voting"."AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaciDeploymentJob_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "voting"."MaciElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MaciDeploymentJob_status_createdAt_idx" ON "voting"."MaciDeploymentJob"("status", "createdAt");
ALTER TABLE "voting"."MaciParticipationRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voting"."MaciDeploymentJob" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'voting_runtime') THEN
    RAISE EXCEPTION 'Expected API database role voting_runtime is missing';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON "voting"."MaciParticipationRequest" TO voting_runtime;
GRANT SELECT, INSERT, UPDATE ON "voting"."MaciDeploymentJob" TO voting_runtime;
CREATE POLICY api_select ON "voting"."MaciParticipationRequest" FOR SELECT TO voting_runtime USING (true);
CREATE POLICY api_insert ON "voting"."MaciParticipationRequest" FOR INSERT TO voting_runtime WITH CHECK (true);
CREATE POLICY api_update ON "voting"."MaciParticipationRequest" FOR UPDATE TO voting_runtime USING (true) WITH CHECK (true);
CREATE POLICY api_select ON "voting"."MaciDeploymentJob" FOR SELECT TO voting_runtime USING (true);
CREATE POLICY api_insert ON "voting"."MaciDeploymentJob" FOR INSERT TO voting_runtime WITH CHECK (true);
CREATE POLICY api_update ON "voting"."MaciDeploymentJob" FOR UPDATE TO voting_runtime USING (true) WITH CHECK (true);
