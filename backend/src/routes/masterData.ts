import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const createDimensionSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["PRODUCT", "CHANNEL"]),
  groupId: z.string().optional(),
  buId: z.string().optional(),
  companyId: z.string().optional()
});

const updateDimensionSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional()
});

const createLevelSchema = z.object({
  levelOrder: z.number().int().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  parentLevelId: z.string().optional(),
  allowManualInput: z.boolean().default(false)
});

const updateLevelSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  levelOrder: z.number().int().min(1).optional(),
  parentLevelId: z.string().nullable().optional(),
  allowManualInput: z.boolean().optional()
});

const createNodeSchema = z.object({
  levelId: z.string().min(1),
  parentNodeId: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  unitOfMeasure: z.string().optional()
});

const updateNodeSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  unitOfMeasure: z.string().nullable().optional(),
  parentNodeId: z.string().nullable().optional()
});

const createForecastOriginSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  companyId: z.string().optional()
});

const createPeriodConfigSchema = z.object({
  forecastType: z.enum(["LONG_TERM_PLAN", "ROLLING_PRODUCTION"]),
  periodUnit: z.string().min(1),
  periodLength: z.number().int().min(1),
  forecastingHorizontal: z.number().int().min(1),
  updateFrequency: z.string().min(1),
  periodKeyFormat: z.string().min(1),
  mandatoryPeriodCount: z.number().int().min(0)
});

const createZeroConfigSchema = z.object({
  companyId: z.string().optional(),
  treatNullAs: z.enum(["warning", "zero", "exclude"]),
  highlightNotUpdated: z.boolean().default(true),
  mandatoryPeriodValidation: z.enum(["warn", "block"])
});

export const masterDataRouter = Router();
masterDataRouter.use(requireAuth);

// ─── Dimensions ────────────────────────────────────────────────────────────────

masterDataRouter.get("/dimensions", async (req, res) => {
  const { type } = req.query;
  const dimensions = await prisma.dimension.findMany({
    where: type ? { type: type as "PRODUCT" | "CHANNEL" } : undefined,
    include: { levels: { orderBy: { levelOrder: "asc" } } },
    orderBy: { name: "asc" }
  });
  return res.json(dimensions);
});

masterDataRouter.post("/dimensions", async (req, res) => {
  const parsed = createDimensionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid dimension payload." });
  const dimension = await prisma.dimension.create({ data: parsed.data });
  return res.status(201).json(dimension);
});

masterDataRouter.get("/dimensions/:id", async (req, res) => {
  const dimension = await prisma.dimension.findUnique({
    where: { id: req.params.id },
    include: {
      levels: { orderBy: { levelOrder: "asc" } },
      nodes: { include: { level: true }, orderBy: { code: "asc" } }
    }
  });
  if (!dimension) return res.status(404).json({ message: "Dimension not found." });
  return res.json(dimension);
});

masterDataRouter.patch("/dimensions/:id", async (req, res) => {
  const parsed = updateDimensionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid dimension payload." });
  const dimension = await prisma.dimension.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { levels: { orderBy: { levelOrder: "asc" } } }
  });
  return res.json(dimension);
});

masterDataRouter.delete("/dimensions/:id", async (req, res) => {
  await prisma.dimension.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ─── Dimension Levels ──────────────────────────────────────────────────────────

masterDataRouter.get("/dimensions/:id/levels", async (req, res) => {
  const levels = await prisma.dimensionLevel.findMany({
    where: { dimensionId: req.params.id },
    orderBy: { levelOrder: "asc" }
  });
  return res.json(levels);
});

masterDataRouter.post("/dimensions/:id/levels", async (req, res) => {
  const parsed = createLevelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid level payload." });

  // If allowManualInput is requested and a parent level is specified,
  // the parent must also have allowManualInput = true.
  // (When parentLevelId is absent the implicit root is always considered ON.)
  if (parsed.data.allowManualInput && parsed.data.parentLevelId) {
    const parent = await prisma.dimensionLevel.findUnique({
      where: { id: parsed.data.parentLevelId },
      select: { allowManualInput: true }
    });
    if (!parent?.allowManualInput) {
      return res.status(400).json({
        message: "Cannot enable manual input: the parent level does not allow manual input."
      });
    }
  }

  const level = await prisma.dimensionLevel.create({
    data: { ...parsed.data, dimensionId: req.params.id }
  });
  return res.status(201).json(level);
});

masterDataRouter.patch("/dimensions/:dimId/levels/:id", async (req, res) => {
  const parsed = updateLevelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload." });

  const level = await prisma.dimensionLevel.findUnique({
    where: { id: req.params.id },
    select: { parentLevelId: true, allowManualInput: true }
  });
  if (!level) return res.status(404).json({ message: "Level not found." });

  // Resolve the effective parentLevelId after this update.
  const effectiveParentId = "parentLevelId" in parsed.data
    ? parsed.data.parentLevelId
    : level.parentLevelId;

  // Enabling manual input requires the parent to have it enabled too.
  const enablingManual = parsed.data.allowManualInput === true;
  if (enablingManual && effectiveParentId) {
    const parent = await prisma.dimensionLevel.findUnique({
      where: { id: effectiveParentId },
      select: { allowManualInput: true }
    });
    if (!parent?.allowManualInput) {
      return res.status(400).json({
        message: "Cannot enable manual input: the parent level does not allow manual input."
      });
    }
  }

  // Disabling manual input must cascade: child levels must also be turned off.
  const disablingManual = parsed.data.allowManualInput === false;
  if (disablingManual) {
    await prisma.dimensionLevel.updateMany({
      where: { parentLevelId: req.params.id },
      data: { allowManualInput: false }
    });
  }

  const updated = await prisma.dimensionLevel.update({
    where: { id: req.params.id },
    data: parsed.data
  });
  return res.json(updated);
});

masterDataRouter.delete("/dimensions/:dimId/levels/:id", async (req, res) => {
  await prisma.dimensionLevel.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ─── Dimension Nodes ───────────────────────────────────────────────────────────

masterDataRouter.get("/dimensions/:id/nodes", async (req, res) => {
  const nodes = await prisma.dimensionNode.findMany({
    where: { dimensionId: req.params.id },
    include: { level: true },
    orderBy: { code: "asc" }
  });
  return res.json(nodes);
});

masterDataRouter.post("/dimensions/:id/nodes", async (req, res) => {
  const parsed = createNodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid node payload." });

  // Manual node creation is only permitted on levels that have allowManualInput = true.
  // Levels with allowManualInput = false are populated from forecast data uploads.
  const targetLevel = await prisma.dimensionLevel.findUnique({
    where: { id: parsed.data.levelId },
    select: { allowManualInput: true }
  });
  if (!targetLevel) return res.status(404).json({ message: "Level not found." });
  if (!targetLevel.allowManualInput) {
    return res.status(400).json({
      message: "This level does not allow manual input. Node values are populated from forecast data uploads."
    });
  }

  const node = await prisma.dimensionNode.create({
    data: { ...parsed.data, dimensionId: req.params.id },
    include: { level: true }
  });
  return res.status(201).json(node);
});

masterDataRouter.patch("/dimensions/:dimId/nodes/:id", async (req, res) => {
  const parsed = updateNodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid node payload." });
  const node = await prisma.dimensionNode.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { level: true }
  });
  return res.json(node);
});

masterDataRouter.delete("/dimensions/:dimId/nodes/:id", async (req, res) => {
  await prisma.dimensionNode.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ─── Forecast Origins ──────────────────────────────────────────────────────────

masterDataRouter.get("/forecast-origins", async (_req, res) => {
  const origins = await prisma.forecastOrigin.findMany({ orderBy: { name: "asc" } });
  return res.json(origins);
});

masterDataRouter.post("/forecast-origins", async (req, res) => {
  const parsed = createForecastOriginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid forecast origin payload." });
  const origin = await prisma.forecastOrigin.create({ data: parsed.data });
  return res.status(201).json(origin);
});

masterDataRouter.delete("/forecast-origins/:id", async (req, res) => {
  await prisma.forecastOrigin.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ─── Period Configs ────────────────────────────────────────────────────────────

masterDataRouter.get("/period-configs", async (_req, res) => {
  const configs = await prisma.periodConfig.findMany({ orderBy: { forecastType: "asc" } });
  return res.json(configs);
});

masterDataRouter.post("/period-configs", async (req, res) => {
  const parsed = createPeriodConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid period config payload." });
  const config = await prisma.periodConfig.create({ data: parsed.data });
  return res.status(201).json(config);
});

masterDataRouter.delete("/period-configs/:id", async (req, res) => {
  await prisma.periodConfig.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ─── Zero vs Not-Updated Configs ───────────────────────────────────────────────

masterDataRouter.get("/zero-configs", async (_req, res) => {
  const configs = await prisma.zeroVsNotUpdatedConfig.findMany();
  return res.json(configs);
});

masterDataRouter.post("/zero-configs", async (req, res) => {
  const parsed = createZeroConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid zero config payload." });
  const config = await prisma.zeroVsNotUpdatedConfig.create({ data: parsed.data });
  return res.status(201).json(config);
});

masterDataRouter.delete("/zero-configs/:id", async (req, res) => {
  await prisma.zeroVsNotUpdatedConfig.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ─── Working Calendars ─────────────────────────────────────────────────────────

// ── Parsing helpers ────────────────────────────────────────────────────────────

/**
 * Convert a user-supplied format string (e.g. "DD.MM.YYYY") into a RegExp
 * and return which capture group index holds year/month/day.
 */
function buildDateParser(format: string): {
  regex: RegExp;
  yi: number; mi: number; di: number;
} {
  // We build capture groups in the order they appear in the format string.
  const tokens = ["YYYY", "MM", "DD"] as const;
  const positions = tokens.map((t) => ({ t, pos: format.indexOf(t) })).sort((a, b) => a.pos - b.pos);
  let groupIdx = 1;
  const idxOf: Record<string, number> = {};
  positions.forEach((p) => { idxOf[p.t] = groupIdx++; });

  const pattern = format
    .replace(/YYYY/g, "(\\d{4})")
    .replace(/MM/g, "(\\d{2})")
    .replace(/DD/g, "(\\d{2})")
    .replace(/\./g, "\\.")
    .replace(/\//g, "\\/");

  return { regex: new RegExp(pattern), yi: idxOf["YYYY"], mi: idxOf["MM"], di: idxOf["DD"] };
}

function applyParser(
  raw: string,
  p: ReturnType<typeof buildDateParser>
): string | null {
  const m = raw.match(p.regex);
  if (!m) return null;
  const y = m[p.yi], mo = m[p.mi], d = m[p.di];
  if (!y || !mo || !d) return null;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (isNaN(dt.getTime())) return null;
  return `${y}-${mo}-${d}`;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "");
}

function extractLines(content: string, fileType: "HTML" | "CSV"): Array<{ raw: string; rest: string }> {
  if (fileType === "CSV") {
    return content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split(/[,\t]/, 2);
        return { raw: parts[0].trim(), rest: parts[1]?.trim() ?? "" };
      });
  }

  // HTML: convert <br> to newlines FIRST, then strip remaining tags
  const text = decodeHtmlEntities(
    content
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const firstSpace = l.search(/\s/);
      return {
        raw: firstSpace === -1 ? l : l.substring(0, firstSpace),
        rest: firstSpace === -1 ? "" : l.substring(firstSpace).trim(),
      };
    });
}

// ── Routes ─────────────────────────────────────────────────────────────────────

masterDataRouter.get("/calendars", async (_req, res) => {
  const calendars = await prisma.workingCalendar.findMany({
    include: {
      assignments: true,
      _count: { select: { dates: true } }
    },
    orderBy: [{ year: "desc" }, { name: "asc" }]
  });
  return res.json(calendars);
});

masterDataRouter.post("/calendars", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    year: z.number().int().min(2000).max(2100),
    timezone: z.string().default("UTC"),
    description: z.string().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid calendar payload." });
  const cal = await prisma.workingCalendar.create({ data: parsed.data });
  return res.status(201).json(cal);
});

masterDataRouter.delete("/calendars/:id", async (req, res) => {
  await prisma.workingCalendar.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// Upload & parse non-working dates into a calendar (replaces all existing dates)
masterDataRouter.post("/calendars/:id/upload", async (req, res) => {
  const schema = z.object({
    content:    z.string().min(1),
    fileType:   z.enum(["HTML", "CSV"]),
    dateFormat: z.string().min(1)   // e.g. "DD.MM.YYYY"
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid upload payload." });

  const { content, fileType, dateFormat } = parsed.data;
  const parser = buildDateParser(dateFormat);
  const lines = extractLines(content, fileType);

  const entries: Array<{ calendarId: string; date: Date; label: string | null }> = [];
  for (const { raw, rest } of lines) {
    const iso = applyParser(raw, parser);
    if (iso) {
      entries.push({
        calendarId: req.params.id,
        date: new Date(iso + "T00:00:00.000Z"),
        label: rest || null
      });
    }
  }

  if (entries.length === 0) {
    return res.status(422).json({ message: "No valid dates found. Check file type and date format." });
  }

  // Replace all existing dates for this calendar
  await prisma.$transaction([
    prisma.workingCalendarDate.deleteMany({ where: { calendarId: req.params.id } }),
    prisma.workingCalendarDate.createMany({ data: entries, skipDuplicates: true })
  ]);

  const cal = await prisma.workingCalendar.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { dates: true } } }
  });
  return res.json({ ...cal, imported: entries.length });
});

// All dates for a calendar (for calendar-grid view)
masterDataRouter.get("/calendars/:id/dates", async (req, res) => {
  const dates = await prisma.workingCalendarDate.findMany({
    where: { calendarId: req.params.id },
    orderBy: { date: "asc" }
  });
  return res.json(dates);
});

// Assign calendar to an org scope
masterDataRouter.post("/calendars/:id/assignments", async (req, res) => {
  const schema = z.object({
    buId:      z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
    plantId:   z.string().min(1).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid assignment payload." });
  if (!parsed.data.buId && !parsed.data.companyId && !parsed.data.plantId) {
    return res.status(400).json({ message: "Provide at least one of buId, companyId, or plantId." });
  }
  const assignment = await prisma.calendarAssignment.create({
    data: { calendarId: req.params.id, ...parsed.data }
  });
  return res.status(201).json(assignment);
});

masterDataRouter.delete("/calendars/:id/assignments/:assignmentId", async (req, res) => {
  await prisma.calendarAssignment.delete({ where: { id: req.params.assignmentId } });
  return res.status(204).send();
});

// ─── Closing Rules ─────────────────────────────────────────────────────────────

const closingRuleInclude = {
  calendar: { select: { id: true, name: true, year: true } },
  assignments: true
} as const;

masterDataRouter.get("/closing-rules", async (_req, res) => {
  const rules = await prisma.closingRule.findMany({
    include: closingRuleInclude,
    orderBy: { createdAt: "asc" }
  });
  return res.json(rules);
});

masterDataRouter.post("/closing-rules", async (req, res) => {
  const schema = z.object({
    forecastType:  z.enum(["LONG_TERM_PLAN", "ROLLING_PRODUCTION"]),
    nthWorkingDay: z.number().int().min(1).max(31),
    calendarId:    z.string().min(1).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid closing rule payload." });
  const rule = await prisma.closingRule.create({
    data: parsed.data,
    include: closingRuleInclude
  });
  return res.status(201).json(rule);
});

masterDataRouter.patch("/closing-rules/:id", async (req, res) => {
  const schema = z.object({
    nthWorkingDay: z.number().int().min(1).max(31).optional(),
    calendarId:    z.string().min(1).nullable().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload." });
  const rule = await prisma.closingRule.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: closingRuleInclude
  });
  return res.json(rule);
});

masterDataRouter.delete("/closing-rules/:id", async (req, res) => {
  await prisma.closingRule.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ── Closing Rule Assignments ────────────────────────────────────────────────

masterDataRouter.post("/closing-rules/:id/assignments", async (req, res) => {
  const schema = z.object({
    buId:      z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
    plantId:   z.string().min(1).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid assignment payload." });
  if (!parsed.data.buId && !parsed.data.companyId && !parsed.data.plantId)
    return res.status(400).json({ message: "Provide buId, companyId, or plantId." });
  const assignment = await prisma.closingRuleAssignment.create({
    data: { ruleId: req.params.id, ...parsed.data }
  });
  return res.status(201).json(assignment);
});

masterDataRouter.delete("/closing-rules/:id/assignments/:assignId", async (req, res) => {
  await prisma.closingRuleAssignment.delete({ where: { id: req.params.assignId } });
  return res.status(204).send();
});
