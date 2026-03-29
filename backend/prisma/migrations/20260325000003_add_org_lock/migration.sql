CREATE TABLE "OrgLock" (
  "id"        TEXT NOT NULL DEFAULT 'singleton',
  "isLocked"  BOOLEAN NOT NULL DEFAULT false,
  "lockedAt"  TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgLock_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OrgLock" ("id", "isLocked", "updatedAt")
VALUES ('singleton', false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
