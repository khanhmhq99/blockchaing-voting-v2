-- Chain 31337 restarts may reuse deterministic contract addresses. Keep historical projections separate.
ALTER TABLE "voting"."MaciElection" ADD COLUMN "deploymentInstanceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "voting"."MaciEncryptedSubmission" ADD COLUMN "deploymentInstanceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "voting"."MaciPollJoinSubmission" ADD COLUMN "deploymentInstanceId" TEXT NOT NULL DEFAULT 'legacy';

DROP INDEX "voting"."MaciElection_chainId_maciAddress_key";
DROP INDEX "voting"."MaciElection_chainId_pollAddress_key";
CREATE UNIQUE INDEX "MaciElection_chainId_maciAddress_deploymentInstanceId_key" ON "voting"."MaciElection"("chainId", "maciAddress", "deploymentInstanceId");
CREATE UNIQUE INDEX "MaciElection_chainId_pollAddress_deploymentInstanceId_key" ON "voting"."MaciElection"("chainId", "pollAddress", "deploymentInstanceId");

DROP INDEX "voting"."MaciEncryptedSubmission_messageDigest_key";
DROP INDEX "voting"."MaciEncryptedSubmission_chainId_pollAddress_status_createdA_idx";
CREATE UNIQUE INDEX "MaciEncryptedSubmission_deploymentInstanceId_messageDigest_key" ON "voting"."MaciEncryptedSubmission"("deploymentInstanceId", "messageDigest");
CREATE INDEX "MaciEncryptedSubmission_instance_status_idx" ON "voting"."MaciEncryptedSubmission"("chainId", "pollAddress", "deploymentInstanceId", "status", "createdAt");

DROP INDEX "voting"."MaciPollJoinSubmission_joinDigest_key";
DROP INDEX "voting"."MaciPollJoinSubmission_chainId_pollAddress_nullifier_key";
DROP INDEX "voting"."MaciPollJoinSubmission_chainId_pollAddress_publicKeyX_publi_key";
DROP INDEX "voting"."MaciPollJoinSubmission_chainId_pollAddress_status_createdAt_idx";
CREATE UNIQUE INDEX "MaciPollJoinSubmission_deploymentInstanceId_joinDigest_key" ON "voting"."MaciPollJoinSubmission"("deploymentInstanceId", "joinDigest");
CREATE UNIQUE INDEX "MaciPollJoinSubmission_instance_nullifier_key" ON "voting"."MaciPollJoinSubmission"("chainId", "pollAddress", "deploymentInstanceId", "nullifier");
CREATE UNIQUE INDEX "MaciPollJoinSubmission_instance_publicKey_key" ON "voting"."MaciPollJoinSubmission"("chainId", "pollAddress", "deploymentInstanceId", "publicKeyX", "publicKeyY");
CREATE INDEX "MaciPollJoinSubmission_instance_status_idx" ON "voting"."MaciPollJoinSubmission"("chainId", "pollAddress", "deploymentInstanceId", "status", "createdAt");
