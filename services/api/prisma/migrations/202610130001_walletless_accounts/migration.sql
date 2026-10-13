-- Additive MVP 2.5 account, session, and election-specific signing identity storage.
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
CREATE UNIQUE INDEX "AppUser_usernameKey_key" ON "voting"."AppUser"("usernameKey");

CREATE TABLE "voting"."AppSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppSession_tokenHash_key" ON "voting"."AppSession"("tokenHash");
CREATE INDEX "AppSession_userId_expiresAt_idx" ON "voting"."AppSession"("userId", "expiresAt");
ALTER TABLE "voting"."AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "voting"."AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "voting"."ElectionVoterIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "chainId" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "voterAddress" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ElectionVoterIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ElectionVoterIdentity_election_user_key" ON "voting"."ElectionVoterIdentity"("chainId", "contractAddress", "electionId", "userId");
CREATE UNIQUE INDEX "ElectionVoterIdentity_election_address_key" ON "voting"."ElectionVoterIdentity"("chainId", "contractAddress", "electionId", "voterAddress");
CREATE INDEX "ElectionVoterIdentity_userId_status_idx" ON "voting"."ElectionVoterIdentity"("userId", "status");
ALTER TABLE "voting"."ElectionVoterIdentity" ADD CONSTRAINT "ElectionVoterIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "voting"."AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
