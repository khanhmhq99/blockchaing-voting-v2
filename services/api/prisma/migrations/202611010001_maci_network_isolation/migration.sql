-- Preserve existing deployment jobs as Hardhat Local records and isolate future workers by chain.
ALTER TABLE "voting"."MaciDeploymentJob" ADD COLUMN "chainId" TEXT NOT NULL DEFAULT '31337';
CREATE INDEX "MaciDeploymentJob_chainId_status_createdAt_idx" ON "voting"."MaciDeploymentJob"("chainId", "status", "createdAt");

-- A restarted Hardhat chain can reuse a poll address; checkpoint identity must include its deployment instance.
ALTER TABLE "voting"."MaciChainCheckpoint" ADD COLUMN "deploymentInstanceId" TEXT NOT NULL DEFAULT 'legacy';
CREATE UNIQUE INDEX "MaciChainCheckpoint_chainId_pollAddress_deploymentInstanceId_key"
  ON "voting"."MaciChainCheckpoint"("chainId", "pollAddress", "deploymentInstanceId");
DROP INDEX "voting"."MaciChainCheckpoint_chainId_pollAddress_key";
