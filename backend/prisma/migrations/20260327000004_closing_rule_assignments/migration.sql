-- Remove org scope columns from ClosingRule (they move to ClosingRuleAssignment)
ALTER TABLE "ClosingRule" DROP COLUMN IF EXISTS "buId";
ALTER TABLE "ClosingRule" DROP COLUMN IF EXISTS "companyId";
ALTER TABLE "ClosingRule" DROP COLUMN IF EXISTS "plantId";

-- Org scope assignments for closing rules
CREATE TABLE "ClosingRuleAssignment" (
  "id"        TEXT NOT NULL,
  "ruleId"    TEXT NOT NULL,
  "buId"      TEXT,
  "companyId" TEXT,
  "plantId"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClosingRuleAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClosingRuleAssignment_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "ClosingRule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
