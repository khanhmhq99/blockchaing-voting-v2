CREATE TABLE "voting"."AdminActivity" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminActivity_createdAt_idx" ON "voting"."AdminActivity"("createdAt");
CREATE INDEX "AdminActivity_actorId_createdAt_idx" ON "voting"."AdminActivity"("actorId", "createdAt");
ALTER TABLE "voting"."AdminActivity" ADD CONSTRAINT "AdminActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "voting"."AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'voting_runtime') THEN
    GRANT SELECT, INSERT ON TABLE "voting"."AdminActivity" TO voting_runtime;
  END IF;
END $$;
