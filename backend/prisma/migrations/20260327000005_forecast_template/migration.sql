CREATE TABLE "ForecastTemplate" (
  "id"             TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "productDimId"   TEXT NOT NULL,
  "productLevelId" TEXT NOT NULL,
  "channelDimId"   TEXT NOT NULL,
  "channelLevelId" TEXT NOT NULL,
  "isLocked"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForecastTemplateAssignment" (
  "id"               TEXT NOT NULL,
  "templateId"       TEXT NOT NULL,
  "forecastType"     "ForecastType" NOT NULL,
  "buId"             TEXT,
  "companyId"        TEXT,
  "plantId"          TEXT,
  "forecastOriginId" TEXT,
  "initialYear"      INTEGER NOT NULL,
  "initialQuarter"   INTEGER,
  "initialMonth"     INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastTemplateAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ForecastTemplateAssignment_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "ForecastTemplate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
