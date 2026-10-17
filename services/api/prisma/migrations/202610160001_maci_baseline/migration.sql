-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "voting";

-- CreateTable
CREATE TABLE "voting"."AppUser" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "usernameKey" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."AdminActivity" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."AppSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."MaciElection" (
    "id" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "maciAddress" TEXT NOT NULL,
    "registrationAddress" TEXT NOT NULL,
    "pollAddress" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "deploymentBlock" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "coordinatorKeyX" TEXT NOT NULL,
    "coordinatorKeyY" TEXT NOT NULL,
    "startTimestamp" TEXT NOT NULL,
    "endTimestamp" TEXT NOT NULL,
    "voteOptions" INTEGER NOT NULL,
    "protocolVersion" TEXT NOT NULL DEFAULT 'maci-v3.0.0-full-v1',
    "status" TEXT NOT NULL DEFAULT 'REGISTRATION',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MaciElection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."MaciEligibility" (
    "id" UUID NOT NULL,
    "electionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ELIGIBLE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaciEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."MaciRegistration" (
    "id" UUID NOT NULL,
    "electionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "publicKeyX" TEXT NOT NULL,
    "publicKeyY" TEXT NOT NULL,
    "ticket" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "issuerSignature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "transactionHash" TEXT,
    "rawTransaction" TEXT,
    "calldataHash" TEXT,
    "nonce" INTEGER,
    "blockNumber" BIGINT,
    "blockHash" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MaciRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."MaciEncryptedSubmission" (
    "id" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "pollAddress" TEXT NOT NULL,
    "messageDigest" TEXT NOT NULL,
    "messageData" JSONB NOT NULL,
    "encryptionKeyX" TEXT NOT NULL,
    "encryptionKeyY" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "transactionHash" TEXT,
    "rawTransaction" TEXT,
    "calldataHash" TEXT,
    "nonce" INTEGER,
    "blockNumber" BIGINT,
    "blockHash" TEXT,
    "gasUsed" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MaciEncryptedSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."MaciPollJoinSubmission" (
    "id" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "pollAddress" TEXT NOT NULL,
    "joinDigest" TEXT NOT NULL,
    "publicKeyX" TEXT NOT NULL,
    "publicKeyY" TEXT NOT NULL,
    "nullifier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "transactionHash" TEXT,
    "rawTransaction" TEXT,
    "calldataHash" TEXT,
    "nonce" INTEGER,
    "pollStateIndex" TEXT,
    "blockNumber" BIGINT,
    "blockHash" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MaciPollJoinSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."MaciAuditRecord" (
    "id" UUID NOT NULL,
    "electionId" UUID NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "eventsNdjson" TEXT NOT NULL,
    "proofsJson" TEXT NOT NULL,
    "tallyJson" TEXT NOT NULL,
    "snapshotBlock" BIGINT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "verifiedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaciAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."MaciCoordinatorRun" (
    "id" UUID NOT NULL,
    "electionId" UUID NOT NULL,
    "runId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "processingCount" INTEGER NOT NULL DEFAULT 0,
    "tallyCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotBlock" BIGINT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "MaciCoordinatorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."MaciProofSubmission" (
    "id" UUID NOT NULL,
    "electionId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "batchIndex" INTEGER NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "gasUsed" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INCLUDED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaciProofSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."MaciChainCheckpoint" (
    "id" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "pollAddress" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MaciChainCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_usernameKey_key" ON "voting"."AppUser"("usernameKey");

-- CreateIndex
CREATE INDEX "AdminActivity_createdAt_idx" ON "voting"."AdminActivity"("createdAt");

-- CreateIndex
CREATE INDEX "AdminActivity_actorId_createdAt_idx" ON "voting"."AdminActivity"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSession_tokenHash_key" ON "voting"."AppSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AppSession_userId_expiresAt_idx" ON "voting"."AppSession"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaciElection_chainId_maciAddress_key" ON "voting"."MaciElection"("chainId", "maciAddress");

-- CreateIndex
CREATE UNIQUE INDEX "MaciElection_chainId_pollAddress_key" ON "voting"."MaciElection"("chainId", "pollAddress");

-- CreateIndex
CREATE UNIQUE INDEX "MaciEligibility_electionId_userId_key" ON "voting"."MaciEligibility"("electionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MaciRegistration_ticket_key" ON "voting"."MaciRegistration"("ticket");

-- CreateIndex
CREATE INDEX "MaciRegistration_electionId_status_idx" ON "voting"."MaciRegistration"("electionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaciRegistration_electionId_userId_key" ON "voting"."MaciRegistration"("electionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MaciRegistration_electionId_publicKeyX_publicKeyY_key" ON "voting"."MaciRegistration"("electionId", "publicKeyX", "publicKeyY");

-- CreateIndex
CREATE UNIQUE INDEX "MaciEncryptedSubmission_messageDigest_key" ON "voting"."MaciEncryptedSubmission"("messageDigest");

-- CreateIndex
CREATE INDEX "MaciEncryptedSubmission_chainId_pollAddress_status_createdA_idx" ON "voting"."MaciEncryptedSubmission"("chainId", "pollAddress", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaciPollJoinSubmission_joinDigest_key" ON "voting"."MaciPollJoinSubmission"("joinDigest");

-- CreateIndex
CREATE INDEX "MaciPollJoinSubmission_chainId_pollAddress_status_createdAt_idx" ON "voting"."MaciPollJoinSubmission"("chainId", "pollAddress", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaciPollJoinSubmission_chainId_pollAddress_nullifier_key" ON "voting"."MaciPollJoinSubmission"("chainId", "pollAddress", "nullifier");

-- CreateIndex
CREATE UNIQUE INDEX "MaciPollJoinSubmission_chainId_pollAddress_publicKeyX_publi_key" ON "voting"."MaciPollJoinSubmission"("chainId", "pollAddress", "publicKeyX", "publicKeyY");

-- CreateIndex
CREATE UNIQUE INDEX "MaciAuditRecord_electionId_key" ON "voting"."MaciAuditRecord"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "MaciCoordinatorRun_runId_key" ON "voting"."MaciCoordinatorRun"("runId");

-- CreateIndex
CREATE INDEX "MaciCoordinatorRun_electionId_startedAt_idx" ON "voting"."MaciCoordinatorRun"("electionId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaciProofSubmission_transactionHash_key" ON "voting"."MaciProofSubmission"("transactionHash");

-- CreateIndex
CREATE INDEX "MaciProofSubmission_electionId_kind_idx" ON "voting"."MaciProofSubmission"("electionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MaciProofSubmission_electionId_kind_batchIndex_key" ON "voting"."MaciProofSubmission"("electionId", "kind", "batchIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MaciChainCheckpoint_chainId_pollAddress_key" ON "voting"."MaciChainCheckpoint"("chainId", "pollAddress");

-- AddForeignKey
ALTER TABLE "voting"."AdminActivity" ADD CONSTRAINT "AdminActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "voting"."AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "voting"."AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."MaciEligibility" ADD CONSTRAINT "MaciEligibility_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "voting"."MaciElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."MaciEligibility" ADD CONSTRAINT "MaciEligibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "voting"."AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."MaciRegistration" ADD CONSTRAINT "MaciRegistration_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "voting"."MaciElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."MaciRegistration" ADD CONSTRAINT "MaciRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "voting"."AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."MaciAuditRecord" ADD CONSTRAINT "MaciAuditRecord_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "voting"."MaciElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."MaciCoordinatorRun" ADD CONSTRAINT "MaciCoordinatorRun_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "voting"."MaciElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."MaciProofSubmission" ADD CONSTRAINT "MaciProofSubmission_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "voting"."MaciElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The NestJS API uses a server-held PostgreSQL role. Browser/REST roles receive no
-- direct access to identity, encrypted-message or public-evidence tables.
DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'AppUser', 'AdminActivity', 'AppSession', 'MaciElection',
        'MaciEligibility', 'MaciRegistration', 'MaciEncryptedSubmission',
        'MaciPollJoinSubmission', 'MaciAuditRecord', 'MaciCoordinatorRun',
        'MaciProofSubmission', 'MaciChainCheckpoint'
    ] LOOP
        EXECUTE format('ALTER TABLE voting.%I ENABLE ROW LEVEL SECURITY', table_name);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON SCHEMA voting FROM anon';
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA voting FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON SCHEMA voting FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA voting FROM authenticated';
    END IF;
END $$;
