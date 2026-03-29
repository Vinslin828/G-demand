-- Add groupId to Company (Group -> Company relationship)
ALTER TABLE "Company" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Company" ADD CONSTRAINT "Company_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove old buId FK from Company (replaced by BUCompany join table)
ALTER TABLE "Company" DROP CONSTRAINT IF EXISTS "Company_buId_fkey";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "buId";

-- Remove old companies relation from BU (replaced by BUCompany join table)
-- (no SQL needed — the BU.companies array was a virtual Prisma relation via Company.buId)

-- Create BUCompany join table for N:M BU <-> Company
CREATE TABLE "BUCompany" (
  "buId"      TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  CONSTRAINT "BUCompany_pkey" PRIMARY KEY ("buId", "companyId"),
  CONSTRAINT "BUCompany_buId_fkey"
    FOREIGN KEY ("buId") REFERENCES "BU"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BUCompany_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
