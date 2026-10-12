-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "voting";

-- CreateTable
CREATE TABLE "voting"."ElectionMetadata" (
    "id" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ElectionMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."CandidateProfile" (
    "id" UUID NOT NULL,
    "metadataId" UUID NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "biography" TEXT NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."IndexedEvent" (
    "id" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "syncStatus" TEXT NOT NULL DEFAULT 'confirmed',

    CONSTRAINT "IndexedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."BlockchainTransaction" (
    "id" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "electionId" TEXT,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "gasUsed" TEXT NOT NULL,
    "effectiveGasPrice" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockchainTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."ChainCheckpoint" (
    "id" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ChainCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."BenchmarkRun" (
    "id" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."BenchmarkMeasurement" (
    "id" UUID NOT NULL,
    "runId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "gasUsed" TEXT NOT NULL,
    "effectiveGasPrice" TEXT NOT NULL,
    "confirmationMs" DOUBLE PRECISION NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,

    CONSTRAINT "BenchmarkMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ElectionMetadata_chainId_contractAddress_electionId_key" ON "voting"."ElectionMetadata"("chainId", "contractAddress", "electionId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_metadataId_candidateId_key" ON "voting"."CandidateProfile"("metadataId", "candidateId");

-- CreateIndex
CREATE INDEX "IndexedEvent_chainId_contractAddress_blockNumber_idx" ON "voting"."IndexedEvent"("chainId", "contractAddress", "blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IndexedEvent_chainId_contractAddress_transactionHash_logInd_key" ON "voting"."IndexedEvent"("chainId", "contractAddress", "transactionHash", "logIndex");

-- CreateIndex
CREATE INDEX "BlockchainTransaction_chainId_contractAddress_electionId_idx" ON "voting"."BlockchainTransaction"("chainId", "contractAddress", "electionId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockchainTransaction_chainId_transactionHash_key" ON "voting"."BlockchainTransaction"("chainId", "transactionHash");

-- CreateIndex
CREATE INDEX "BenchmarkMeasurement_runId_operation_idx" ON "voting"."BenchmarkMeasurement"("runId", "operation");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkMeasurement_runId_transactionHash_key" ON "voting"."BenchmarkMeasurement"("runId", "transactionHash");

-- AddForeignKey
ALTER TABLE "voting"."CandidateProfile" ADD CONSTRAINT "CandidateProfile_metadataId_fkey" FOREIGN KEY ("metadataId") REFERENCES "voting"."ElectionMetadata"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."BenchmarkMeasurement" ADD CONSTRAINT "BenchmarkMeasurement_runId_fkey" FOREIGN KEY ("runId") REFERENCES "voting"."BenchmarkRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


REVOKE ALL ON SCHEMA voting FROM PUBLIC;
