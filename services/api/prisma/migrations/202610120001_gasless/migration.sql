-- CreateTable
CREATE TABLE "voting"."GaslessVoteRequest" (
    "id" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "voterAddress" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "intentHash" TEXT NOT NULL,
    "activeSlot" TEXT,
    "signature" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "validationMs" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(6),

    CONSTRAINT "GaslessVoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."GaslessRequestHistory" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaslessRequestHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."RelayerTransaction" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "relayerAddress" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "gasLimit" TEXT NOT NULL,
    "gasPrice" TEXT NOT NULL,
    "reservedFeeWei" TEXT NOT NULL,
    "rawTransaction" TEXT,
    "calldataHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "gasUsed" TEXT,
    "effectiveGasPrice" TEXT,
    "transactionFee" TEXT,
    "blockNumber" BIGINT,
    "blockHash" TEXT,
    "queueMs" DOUBLE PRECISION NOT NULL,
    "submissionMs" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(6),
    "confirmedAt" TIMESTAMPTZ(6),

    CONSTRAINT "RelayerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting"."RelayerBudget" (
    "id" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "reservedWei" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RelayerBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GaslessVoteRequest_intentHash_key" ON "voting"."GaslessVoteRequest"("intentHash");

-- CreateIndex
CREATE UNIQUE INDEX "GaslessVoteRequest_activeSlot_key" ON "voting"."GaslessVoteRequest"("activeSlot");

-- CreateIndex
CREATE INDEX "GaslessVoteRequest_chainId_contractAddress_status_createdAt_idx" ON "voting"."GaslessVoteRequest"("chainId", "contractAddress", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GaslessVoteRequest_chainId_contractAddress_electionId_voter_idx" ON "voting"."GaslessVoteRequest"("chainId", "contractAddress", "electionId", "voterAddress");

-- CreateIndex
CREATE INDEX "GaslessRequestHistory_requestId_createdAt_idx" ON "voting"."GaslessRequestHistory"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RelayerTransaction_requestId_key" ON "voting"."RelayerTransaction"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "RelayerTransaction_transactionHash_key" ON "voting"."RelayerTransaction"("transactionHash");

-- CreateIndex
CREATE INDEX "RelayerTransaction_chainId_relayerAddress_status_idx" ON "voting"."RelayerTransaction"("chainId", "relayerAddress", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RelayerTransaction_chainId_relayerAddress_nonce_key" ON "voting"."RelayerTransaction"("chainId", "relayerAddress", "nonce");

-- AddForeignKey
ALTER TABLE "voting"."GaslessRequestHistory" ADD CONSTRAINT "GaslessRequestHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "voting"."GaslessVoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting"."RelayerTransaction" ADD CONSTRAINT "RelayerTransaction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "voting"."GaslessVoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
