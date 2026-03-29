-- Working Calendar
CREATE TABLE "WorkingCalendar" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "year"        INTEGER NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkingCalendar_pkey" PRIMARY KEY ("id")
);

-- Non-working dates belonging to a calendar
CREATE TABLE "WorkingCalendarDate" (
  "id"         TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "date"       DATE NOT NULL,
  "label"      TEXT,
  CONSTRAINT "WorkingCalendarDate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkingCalendarDate_calendarId_date_key" UNIQUE ("calendarId", "date"),
  CONSTRAINT "WorkingCalendarDate_calendarId_fkey"
    FOREIGN KEY ("calendarId") REFERENCES "WorkingCalendar"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Calendar ↔ Org scope (BU / Company / Plant) many-to-many
CREATE TABLE "CalendarAssignment" (
  "id"         TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "buId"       TEXT,
  "companyId"  TEXT,
  "plantId"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarAssignment_calendarId_fkey"
    FOREIGN KEY ("calendarId") REFERENCES "WorkingCalendar"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Closing rule: Nth working day per month for a given scope + forecast type
CREATE TABLE "ClosingRule" (
  "id"            TEXT NOT NULL,
  "forecastType"  "ForecastType" NOT NULL,
  "nthWorkingDay" INTEGER NOT NULL,
  "calendarId"    TEXT,
  "buId"          TEXT,
  "companyId"     TEXT,
  "plantId"       TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClosingRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClosingRule_calendarId_fkey"
    FOREIGN KEY ("calendarId") REFERENCES "WorkingCalendar"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
