import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const forecastRouter = Router();
forecastRouter.use(requireAuth);

// ── Closing-date computation ───────────────────────────────────────────────────

/** Return the Nth working day of a given year/month, counting from day 1. */
function computeClosingDate(
  year: number,
  month: number,
  n: number,
  nonWorkingDates: Set<string>
): Date {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!nonWorkingDates.has(iso)) {
      count++;
      if (count === n) return new Date(Date.UTC(year, month - 1, day));
    }
  }
  // n exceeds working days in month — return last working day
  for (let day = daysInMonth; day >= 1; day--) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!nonWorkingDates.has(iso)) return new Date(Date.UTC(year, month - 1, day));
  }
  return new Date(Date.UTC(year, month - 1, daysInMonth));
}

/**
 * Look up the ClosingRule for a scope + forecastType, then compute the actual
 * closing date for the given period. Returns null if no rule exists.
 */
async function resolveClosingDate(
  forecastType: "LONG_TERM_PLAN" | "ROLLING_PRODUCTION",
  buId: string | null,
  companyId: string | null,
  plantId: string | null,
  year: number,
  month: number | null,
  quarter: number | null
): Promise<Date | null> {
  const orgFilter = buId
    ? { buId }
    : plantId
    ? { plantId }
    : companyId
    ? { companyId }
    : undefined;

  const rule = await prisma.closingRule.findFirst({
    where: {
      forecastType,
      ...(orgFilter ? { assignments: { some: orgFilter } } : {})
    },
    include: { calendar: { include: { dates: { select: { date: true } } } } }
  });
  if (!rule) return null;

  // Determine target month
  const targetMonth =
    forecastType === "ROLLING_PRODUCTION" && month
      ? month
      : forecastType === "LONG_TERM_PLAN" && quarter
        ? (quarter - 1) * 3 + 1   // first month of the quarter
        : null;
  if (!targetMonth) return null;

  // Build non-working date set (stored as UTC midnight Date objects)
  const nonWorkingDates = new Set(
    (rule.calendar?.dates ?? []).map((d) => {
      const dt = new Date(d.date);
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    })
  );

  return computeClosingDate(year, targetMonth, rule.nthWorkingDay, nonWorkingDates);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type ScopeType = "BU" | "COMPANY" | "PLANT";

function buildVersionCode(
  type: "LONG_TERM_PLAN" | "ROLLING_PRODUCTION",
  year: number,
  quarter: number | null,
  month: number | null
): string {
  if (type === "LONG_TERM_PLAN") {
    return `LTP-${year}Q${quarter}`;
  }
  const mm = String(month!).padStart(2, "0");
  return `RFC-${year}${mm}`;
}

/** Advance one period: LTP = +1 quarter (roll year if >4), RFC = +1 month (roll year if >12). */
function nextPeriod(
  type: "LONG_TERM_PLAN" | "ROLLING_PRODUCTION",
  year: number,
  quarter: number | null,
  month: number | null
): { year: number; quarter: number | null; month: number | null } {
  if (type === "LONG_TERM_PLAN") {
    const q = (quarter ?? 1) + 1;
    return q > 4 ? { year: year + 1, quarter: 1, month: null } : { year, quarter: q, month: null };
  }
  const m = (month ?? 1) + 1;
  return m > 12 ? { year: year + 1, quarter: null, month: 1 } : { year, quarter: null, month: m };
}

/**
 * Find or create the Forecast container for a given scope.
 * Scope priority: buId → companyId → plantId → salesId (legacy)
 */
async function findOrCreateForecast(
  type: "LONG_TERM_PLAN" | "ROLLING_PRODUCTION",
  buId: string | null,
  companyId: string | null,
  plantId: string | null,
  salesId: string | null
) {
  // Build the lookup key
  let where: Record<string, unknown> = { forecastType: type };
  if (buId)      where = { ...where, buId };
  else if (plantId)   where = { ...where, plantId };
  else if (companyId) where = { ...where, companyId };
  else if (salesId)   where = { ...where, salesId };

  const existing = await prisma.forecast.findFirst({ where });
  if (existing) return existing;

  const pc = await prisma.periodConfig.findFirst({
    where: { forecastType: type },
    orderBy: { createdAt: "asc" }
  });

  return prisma.forecast.create({
    data: {
      forecastType: type,
      buId:      buId      ?? null,
      companyId: companyId ?? null,
      plantId:   plantId   ?? null,
      salesId:   salesId   ?? null,
      periodConfigId:       pc!.id,
      mandatoryPeriodCount: pc!.mandatoryPeriodCount
    }
  });
}

/** Build the human-readable scope label shown in the version list. */
function buildScope(
  scopeType: ScopeType,
  id: string,
  code: string,
  groupCode?: string
): string {
  const prefix = groupCode ? `${groupCode}/` : "";
  const tag = scopeType === "BU" ? "BU" : scopeType === "COMPANY" ? "Co" : "Plant";
  return `${prefix}${tag}:${code}`;
}

// ── Schemas ────────────────────────────────────────────────────────────────────

const createVersionSchema = z.object({
  forecastType: z.enum(["LONG_TERM_PLAN", "ROLLING_PRODUCTION"]),
  // LTP scope
  buId: z.string().min(1).optional(),
  // RFC scope (one of these)
  companyId: z.string().min(1).optional(),
  plantId:   z.string().min(1).optional(),
  // period
  productionPlanningYear:    z.number().int().min(2000).max(2100),
  productionPlanningQuarter: z.number().int().min(1).max(4).optional(),
  productionPlanningMonth:   z.number().int().min(1).max(12).optional(),
  // RFC only
  closingDate: z.string().datetime().optional()
});

const createOriginSchema = z.object({
  forecastOriginId: z.string().min(1)
});

const updateOriginSchema = z.object({
  status: z.enum(["DRAFT", "SUBMITTED"]).optional()
});

// ── Version list (filtered) ────────────────────────────────────────────────────

forecastRouter.get("/versions", async (req, res) => {
  const { type, buId, companyId, plantId, salesId } = req.query as Record<string, string>;

  const forecast = type
    ? await prisma.forecast.findFirst({
        where: {
          forecastType: type as "LONG_TERM_PLAN" | "ROLLING_PRODUCTION",
          ...(buId      ? { buId }      : {}),
          ...(plantId   ? { plantId }   : {}),
          ...(companyId ? { companyId } : {}),
          ...(salesId   ? { salesId }   : {})
        }
      })
    : null;

  const versions = await prisma.version.findMany({
    where: forecast ? { forecastId: forecast.id } : type ? { forecastType: type as "LONG_TERM_PLAN" | "ROLLING_PRODUCTION" } : {},
    include: {
      forecast: { select: { forecastType: true, buId: true, companyId: true, plantId: true, salesId: true } },
      origins: {
        include: { forecastOrigin: { select: { id: true, code: true, name: true } } },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: [
      { productionPlanningYear: "desc" },
      { productionPlanningQuarter: "desc" },
      { productionPlanningMonth: "desc" }
    ]
  });

  return res.json(versions);
});

// ── All versions (unfiltered, for selectors) ───────────────────────────────────

forecastRouter.get("/versions/all", async (_req, res) => {
  const versions = await prisma.version.findMany({
    include: {
      forecast: { select: { forecastType: true, buId: true, companyId: true, plantId: true, salesId: true } },
      origins: {
        include: { forecastOrigin: { select: { id: true, code: true, name: true } } },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: [{ productionPlanningYear: "desc" }, { productionPlanningMonth: "desc" }]
  });
  return res.json(versions);
});

// ── Create version ─────────────────────────────────────────────────────────────

forecastRouter.post("/versions", async (req, res) => {
  const parsed = createVersionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid version payload." });

  const {
    forecastType,
    buId, companyId, plantId,
    productionPlanningYear, productionPlanningQuarter, productionPlanningMonth,
    closingDate
  } = parsed.data;

  // ── Scope validation ─────────────────────────────────────────────────────────
  if (forecastType === "LONG_TERM_PLAN") {
    if (!buId) return res.status(400).json({ message: "buId is required for LTP versions." });
    if (!productionPlanningQuarter) return res.status(400).json({ message: "productionPlanningQuarter is required for LTP." });
  }
  if (forecastType === "ROLLING_PRODUCTION") {
    if (!companyId && !plantId)
      return res.status(400).json({ message: "companyId or plantId is required for RFC versions." });
    if (!productionPlanningMonth)
      return res.status(400).json({ message: "productionPlanningMonth is required for RFC." });
  }

  // ── PeriodConfig check ───────────────────────────────────────────────────────
  const pc = await prisma.periodConfig.findFirst({ where: { forecastType } });
  if (!pc) return res.status(422).json({ message: "No PeriodConfig found. Configure it in Master Data → Period Config first." });

  // ── Resolve org info for scope label ─────────────────────────────────────────
  let scopeLabel = "";
  if (buId) {
    const bu = await prisma.bU.findUnique({ where: { id: buId }, include: { group: true } });
    scopeLabel = buildScope("BU", buId, bu?.code ?? buId, bu?.group.code);
  } else if (plantId) {
    const plant = await prisma.plant.findUnique({ where: { id: plantId }, include: { company: { include: { group: true } } } });
    scopeLabel = `${plant?.company.group?.code ? plant.company.group.code + "/" : ""}Plant:${plant?.code ?? plantId}`;
  } else if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, include: { group: true } });
    scopeLabel = buildScope("COMPANY", companyId, company?.code ?? companyId, company?.group?.code);
  }

  // ── Find or create Forecast container ────────────────────────────────────────
  const forecast = await findOrCreateForecast(forecastType, buId ?? null, companyId ?? null, plantId ?? null, null);

  // ── Uniqueness check: one version per forecast per period ─────────────────────
  const existing = await prisma.version.findFirst({
    where: {
      forecastId: forecast.id,
      productionPlanningYear,
      productionPlanningQuarter: productionPlanningQuarter ?? null,
      productionPlanningMonth:   productionPlanningMonth   ?? null
    }
  });
  if (existing) {
    return res.status(409).json({
      message: `Version ${existing.versionCode} already exists for this period. Use Version Origin to add more forecast sources to it.`
    });
  }

  const versionCode = buildVersionCode(forecastType, productionPlanningYear, productionPlanningQuarter ?? null, productionPlanningMonth ?? null);

  // Auto-compute closing date from ClosingRule; fall back to manually supplied value
  const autoClosingDate = await resolveClosingDate(
    forecastType,
    buId ?? null, companyId ?? null, plantId ?? null,
    productionPlanningYear,
    productionPlanningMonth ?? null,
    productionPlanningQuarter ?? null
  );
  const effectiveClosingDate = autoClosingDate ?? (closingDate ? new Date(closingDate) : null);

  const version = await prisma.version.create({
    data: {
      forecastId: forecast.id,
      forecastType,
      versionCode,
      productionPlanningYear,
      productionPlanningQuarter: productionPlanningQuarter ?? null,
      productionPlanningMonth:   productionPlanningMonth   ?? null,
      sequence: "A",
      scope: scopeLabel,
      closingDate: effectiveClosingDate,
      isAutoGenerated: false
    },
    include: {
      forecast: { select: { forecastType: true, buId: true, companyId: true, plantId: true, salesId: true } },
      origins:  { include: { forecastOrigin: { select: { id: true, code: true, name: true } } } }
    }
  });

  return res.status(201).json(version);
});

// ── Generate next period version ───────────────────────────────────────────────

forecastRouter.post("/versions/:id/generate-next", async (req, res) => {
  const current = await prisma.version.findUnique({
    where: { id: req.params.id },
    include: { forecast: true }
  });
  if (!current) return res.status(404).json({ message: "Version not found." });

  // Only RFC supports auto-next (LTP quarters can be created manually)
  if (current.forecastType !== "ROLLING_PRODUCTION") {
    return res.status(422).json({ message: "Generate-next is only supported for Rolling Production (RFC) versions." });
  }

  const { year, quarter, month } = nextPeriod(
    current.forecastType,
    current.productionPlanningYear,
    current.productionPlanningQuarter,
    current.productionPlanningMonth
  );

  // Check if next period already exists
  const exists = await prisma.version.findFirst({
    where: {
      forecastId: current.forecastId,
      productionPlanningYear: year,
      productionPlanningMonth: month
    }
  });
  if (exists) {
    return res.status(409).json({ message: `Version ${exists.versionCode} for the next period already exists.` });
  }

  const versionCode = buildVersionCode(current.forecastType, year, quarter, month);

  // Try to resolve closing date from rule, fall back to last day of month
  const autoClosingDate = await resolveClosingDate(
    current.forecastType,
    current.forecast.buId,
    current.forecast.companyId,
    current.forecast.plantId,
    year, month, quarter
  );
  const defaultClosingDate = autoClosingDate ?? (month ? new Date(Date.UTC(year, month, 0)) : null);

  const next = await prisma.version.create({
    data: {
      forecastId:  current.forecastId,
      forecastType: current.forecastType,
      versionCode,
      productionPlanningYear:  year,
      productionPlanningQuarter: quarter,
      productionPlanningMonth:   month,
      sequence: "A",
      scope: current.scope,
      closingDate: defaultClosingDate,
      isAutoGenerated: true
    },
    include: {
      forecast: { select: { forecastType: true, buId: true, companyId: true, plantId: true, salesId: true } },
      origins:  { include: { forecastOrigin: { select: { id: true, code: true, name: true } } } }
    }
  });

  return res.status(201).json(next);
});

// ── Update version (e.g. change closingDate) ───────────────────────────────────

forecastRouter.patch("/versions/:id", async (req, res) => {
  const schema = z.object({ closingDate: z.string().datetime().nullable().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload." });

  const version = await prisma.version.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.closingDate !== undefined
        ? { closingDate: parsed.data.closingDate ? new Date(parsed.data.closingDate) : null }
        : {})
    },
    include: {
      forecast: { select: { forecastType: true, buId: true, companyId: true, plantId: true, salesId: true } },
      origins:  { include: { forecastOrigin: { select: { id: true, code: true, name: true } } } }
    }
  });
  return res.json(version);
});

// ── Delete version ─────────────────────────────────────────────────────────────

forecastRouter.delete("/versions/:id", async (req, res) => {
  await prisma.version.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ── Version Origins ────────────────────────────────────────────────────────────

forecastRouter.get("/versions/:versionId/origins", async (req, res) => {
  const origins = await prisma.versionOrigin.findMany({
    where: { versionId: req.params.versionId },
    include: { forecastOrigin: { select: { id: true, code: true, name: true } } },
    orderBy: { createdAt: "asc" }
  });
  return res.json(origins);
});

forecastRouter.post("/versions/:versionId/origins", async (req, res) => {
  const parsed = createOriginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid origin payload." });

  // Check closing date not passed
  const version = await prisma.version.findUnique({ where: { id: req.params.versionId } });
  if (!version) return res.status(404).json({ message: "Version not found." });
  if (version.closingDate && version.closingDate < new Date()) {
    return res.status(422).json({ message: "This version is past its closing date. Create the next period version instead." });
  }

  const exists = await prisma.versionOrigin.findFirst({
    where: { versionId: req.params.versionId, forecastOriginId: parsed.data.forecastOriginId }
  });
  if (exists) return res.status(409).json({ message: "This forecast origin is already added to this version." });

  const origin = await prisma.versionOrigin.create({
    data: { versionId: req.params.versionId, forecastOriginId: parsed.data.forecastOriginId },
    include: { forecastOrigin: { select: { id: true, code: true, name: true } } }
  });
  return res.status(201).json(origin);
});

forecastRouter.patch("/versions/:versionId/origins/:id", async (req, res) => {
  const parsed = updateOriginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload." });

  const origin = await prisma.versionOrigin.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { forecastOrigin: { select: { id: true, code: true, name: true } } }
  });
  return res.json(origin);
});

// Activate one origin per version (deactivates all others)
forecastRouter.post("/versions/:versionId/origins/:id/activate", async (req, res) => {
  const origin = await prisma.versionOrigin.findUnique({ where: { id: req.params.id } });
  if (!origin) return res.status(404).json({ message: "Origin not found." });
  if (origin.status !== "SUBMITTED") return res.status(422).json({ message: "Only a submitted origin can be activated." });

  await prisma.$transaction([
    prisma.versionOrigin.updateMany({ where: { versionId: req.params.versionId }, data: { isActivated: false } }),
    prisma.versionOrigin.update({ where: { id: req.params.id }, data: { isActivated: true } })
  ]);

  const updated = await prisma.versionOrigin.findMany({
    where: { versionId: req.params.versionId },
    include: { forecastOrigin: { select: { id: true, code: true, name: true } } }
  });
  return res.json(updated);
});

forecastRouter.delete("/versions/:versionId/origins/:id", async (req, res) => {
  const origin = await prisma.versionOrigin.findUnique({ where: { id: req.params.id } });
  if (!origin) return res.status(404).json({ message: "Origin not found." });
  if (origin.isActivated) return res.status(422).json({ message: "Cannot delete the activated origin." });

  await prisma.versionOrigin.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ── Phase 3b: Template Generation & Data Upload ────────────────────────────────

/** Generate sequential period keys from a version's starting period. */
function generatePeriodKeys(
  forecastType: string,
  year: number,
  quarter: number | null,
  month: number | null,
  horizon: number
): string[] {
  const keys: string[] = [];
  if (forecastType === "LONG_TERM_PLAN") {
    let y = year, q = quarter ?? 1;
    for (let i = 0; i < horizon; i++) {
      keys.push(`${y}-Q${q}`);
      if (++q > 4) { q = 1; y++; }
    }
  } else {
    let y = year, m = month ?? 1;
    for (let i = 0; i < horizon; i++) {
      keys.push(`${y}-${String(m).padStart(2, "0")}`);
      if (++m > 12) { m = 1; y++; }
    }
  }
  return keys;
}

/** Return all leaf nodes (nodes with no children) for a dimension. */
async function getLeafNodes(dimensionId: string) {
  const allNodes = await prisma.dimensionNode.findMany({
    where: { dimensionId },
    include: { level: { select: { levelOrder: true, name: true } } }
  });
  const parentIds = new Set(allNodes.map((n) => n.parentNodeId).filter(Boolean));
  return allNodes.filter((n) => !parentIds.has(n.id));
}

/** Build full path string for a node (e.g. "Brand A / Model X / SKU001"). */
async function buildNodePath(nodeId: string): Promise<string> {
  const parts: string[] = [];
  let current: string | null = nodeId;
  while (current) {
    const node = await prisma.dimensionNode.findUnique({ where: { id: current } });
    if (!node) break;
    parts.unshift(node.name);
    current = node.parentNodeId;
  }
  return parts.join(" / ");
}

/**
 * Find the product and channel dimensions that apply to a forecast scope.
 * Preference order: companyId → buId → groupId → (any with no scope).
 */
async function getDimensionsForForecast(forecast: {
  forecastType: string;
  buId: string | null;
  companyId: string | null;
  plantId: string | null;
}) {
  const buildWhere = (type: "PRODUCT" | "CHANNEL") => {
    const wheres: Record<string, unknown>[] = [];
    if (forecast.companyId) wheres.push({ type, companyId: forecast.companyId });
    if (forecast.buId)      wheres.push({ type, buId: forecast.buId });
    wheres.push({ type, groupId: { not: null } });
    wheres.push({ type, groupId: null, buId: null, companyId: null });
    return wheres;
  };
  const [productDims, channelDims] = await Promise.all([
    prisma.dimension.findMany({ where: { OR: buildWhere("PRODUCT") } }),
    prisma.dimension.findMany({ where: { OR: buildWhere("CHANNEL") } })
  ]);
  // Pick the most-specific dimension
  const pick = (dims: typeof productDims, scopeId: string | null) => {
    if (!dims.length) return null;
    if (scopeId) {
      const exact = dims.find((d) => d.companyId === scopeId || d.buId === scopeId);
      if (exact) return exact;
    }
    return dims[0];
  };
  return {
    product: pick(productDims, forecast.companyId ?? forecast.buId),
    channel: pick(channelDims, forecast.companyId ?? forecast.buId)
  };
}

// GET /forecast/versions/:versionId/origins/:originId/template
// Returns a CSV template pre-populated with product × channel rows and period headers.
forecastRouter.get("/versions/:versionId/origins/:originId/template", async (req, res) => {
  const origin = await prisma.versionOrigin.findUnique({
    where: { id: req.params.originId },
    include: {
      version: {
        include: {
          forecast: { include: { periodConfig: true } }
        }
      }
    }
  });
  if (!origin || origin.versionId !== req.params.versionId)
    return res.status(404).json({ message: "Origin not found." });

  const { version } = origin;
  const { forecast } = version;
  const periodConfig = forecast.periodConfig;

  const periods = generatePeriodKeys(
    version.forecastType,
    version.productionPlanningYear,
    version.productionPlanningQuarter,
    version.productionPlanningMonth,
    periodConfig.forecastingHorizontal
  );

  const { product: productDim, channel: channelDim } = await getDimensionsForForecast(forecast);
  if (!productDim || !channelDim)
    return res.status(422).json({ message: "No product or channel dimension found for this forecast scope. Please configure dimensions first." });

  const [productLeaves, channelLeaves] = await Promise.all([
    getLeafNodes(productDim.id),
    getLeafNodes(channelDim.id)
  ]);

  if (!productLeaves.length || !channelLeaves.length)
    return res.status(422).json({ message: "No nodes found in product or channel dimension." });

  // Build CSV header
  const periodHeaders = periods.join(",");
  const header = `ProductCode,ProductName,ChannelCode,ChannelName,Unit,${periodHeaders},Price,Currency`;

  // Build rows — one per product × channel leaf combination
  const rows: string[] = [header];
  for (const prod of productLeaves) {
    for (const ch of channelLeaves) {
      const unit = prod.unitOfMeasure ?? "";
      const periodCells = periods.map(() => "").join(",");
      rows.push(`${prod.code},${prod.name},${ch.code},${ch.name},${unit},${periodCells},,`);
    }
  }

  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="template_${version.versionCode}_${origin.forecastOrigin?.code ?? origin.id}.csv"`
  );
  // Also send as JSON if client requests it (for browser FileReader pattern)
  if (req.headers.accept?.includes("application/json")) {
    return res.json({ csv, periods, versionCode: version.versionCode });
  }
  return res.send(csv);
});

// POST /forecast/versions/:versionId/origins/:originId/upload
// Accepts CSV content as JSON body { csv: string }; parses and upserts ForecastData.
forecastRouter.post("/versions/:versionId/origins/:originId/upload", async (req, res) => {
  const schema = z.object({ csv: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide { csv: string } in request body." });

  const origin = await prisma.versionOrigin.findUnique({
    where: { id: req.params.originId },
    include: {
      version: {
        include: { forecast: { include: { periodConfig: true } } }
      }
    }
  });
  if (!origin || origin.versionId !== req.params.versionId)
    return res.status(404).json({ message: "Origin not found." });

  if (origin.version.closingDate && origin.version.closingDate < new Date())
    return res.status(422).json({ message: "This version is past its closing date." });

  const { version } = origin;
  const { forecast } = version;

  const { product: productDim, channel: channelDim } = await getDimensionsForForecast(forecast);
  if (!productDim || !channelDim)
    return res.status(422).json({ message: "No product or channel dimension found." });

  // Build code → node map for fast lookup
  const [productNodes, channelNodes] = await Promise.all([
    prisma.dimensionNode.findMany({ where: { dimensionId: productDim.id } }),
    prisma.dimensionNode.findMany({ where: { dimensionId: channelDim.id } })
  ]);
  const productByCode = new Map(productNodes.map((n) => [n.code.toLowerCase(), n]));
  const channelByCode = new Map(channelNodes.map((n) => [n.code.toLowerCase(), n]));

  // Parse CSV
  const lines = parsed.data.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return res.status(400).json({ message: "CSV must have a header row and at least one data row." });

  const headers = lines[0].split(",").map((h) => h.trim());
  const productCodeIdx  = headers.indexOf("ProductCode");
  const channelCodeIdx  = headers.indexOf("ChannelCode");
  const unitIdx         = headers.indexOf("Unit");
  const priceIdx        = headers.indexOf("Price");
  const currencyIdx     = headers.indexOf("Currency");

  if (productCodeIdx === -1 || channelCodeIdx === -1)
    return res.status(400).json({ message: "CSV must contain ProductCode and ChannelCode columns." });

  // Identify period columns (those matching period key format)
  const periodKeyPattern = /^\d{4}-(Q[1-4]|\d{2})$/;
  const periodColIndices: Array<{ key: string; idx: number }> = headers
    .map((h, i) => ({ key: h, idx: i }))
    .filter(({ key }) => periodKeyPattern.test(key));

  if (!periodColIndices.length)
    return res.status(400).json({ message: "No valid period columns found (expected e.g. 2026-Q1 or 2026-01)." });

  // Process rows
  const toUpsert: Array<{
    versionOriginId: string;
    productNodeId: string;
    channelNodeId: string;
    periodKey: string;
    quantity: number | null;
    price: number | null;
    currency: string | null;
  }> = [];

  const errors: string[] = [];
  const unitUpdates: Array<{ id: string; unitOfMeasure: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const pCode = cells[productCodeIdx]?.trim().toLowerCase();
    const cCode = cells[channelCodeIdx]?.trim().toLowerCase();
    if (!pCode && !cCode) continue; // skip blank rows

    const productNode = productByCode.get(pCode ?? "");
    const channelNode = channelByCode.get(cCode ?? "");
    if (!productNode) { errors.push(`Row ${i + 1}: Unknown product code "${pCode}".`); continue; }
    if (!channelNode) { errors.push(`Row ${i + 1}: Unknown channel code "${cCode}".`); continue; }

    // Handle unit — update product node if unit provided and not already set
    const unit = cells[unitIdx]?.trim();
    if (unit && unit !== productNode.unitOfMeasure) {
      if (!productNode.unitOfMeasure) {
        unitUpdates.push({ id: productNode.id, unitOfMeasure: unit });
        productNode.unitOfMeasure = unit; // update in-memory to avoid duplicate updates
      } else {
        errors.push(`Row ${i + 1}: Unit mismatch for product "${productNode.code}" (expected "${productNode.unitOfMeasure}", got "${unit}").`);
        continue;
      }
    }

    const price = priceIdx !== -1 && cells[priceIdx]?.trim() ? parseFloat(cells[priceIdx].trim()) : null;
    const currency = currencyIdx !== -1 ? (cells[currencyIdx]?.trim() || null) : null;

    for (const { key, idx } of periodColIndices) {
      const raw = cells[idx]?.trim();
      const quantity = raw && raw !== "" ? parseFloat(raw) : null;
      toUpsert.push({
        versionOriginId: origin.id,
        productNodeId: productNode.id,
        channelNodeId: channelNode.id,
        periodKey: key,
        quantity: isNaN(quantity as number) ? null : quantity,
        price: price !== null && !isNaN(price) ? price : null,
        currency
      });
    }
  }

  if (errors.length && !toUpsert.length)
    return res.status(422).json({ message: "Upload failed.", errors });

  // Apply unit updates
  await Promise.all(
    unitUpdates.map((u) =>
      prisma.dimensionNode.update({ where: { id: u.id }, data: { unitOfMeasure: u.unitOfMeasure } })
    )
  );

  // Delete existing data for this origin then bulk insert
  await prisma.forecastData.deleteMany({ where: { versionOriginId: origin.id } });
  await prisma.forecastData.createMany({ data: toUpsert });

  return res.json({
    imported: toUpsert.length,
    warnings: errors.length ? errors : undefined,
    unitUpdates: unitUpdates.map((u) => u.id).length
  });
});

// GET /forecast/versions/:versionId/origins/:originId/data
// Returns summary counts and sample data for the origin.
forecastRouter.get("/versions/:versionId/origins/:originId/data", async (req, res) => {
  const origin = await prisma.versionOrigin.findUnique({ where: { id: req.params.originId } });
  if (!origin || origin.versionId !== req.params.versionId)
    return res.status(404).json({ message: "Origin not found." });

  const [total, byPeriod] = await Promise.all([
    prisma.forecastData.count({ where: { versionOriginId: origin.id } }),
    prisma.forecastData.groupBy({
      by: ["periodKey"],
      where: { versionOriginId: origin.id },
      _count: { id: true },
      _sum: { quantity: true },
      orderBy: { periodKey: "asc" }
    })
  ]);

  return res.json({ total, byPeriod });
});

// ── Forecast Templates ──────────────────────────────────────────────────────────

const templateInclude = {
  assignments: true
} as const;

forecastRouter.get("/templates", async (_req, res) => {
  const templates = await prisma.forecastTemplate.findMany({
    include: templateInclude,
    orderBy: { createdAt: "desc" }
  });
  return res.json(templates);
});

forecastRouter.post("/templates", async (req, res) => {
  const schema = z.object({
    name:           z.string().min(1),
    productDimId:   z.string().min(1),
    productLevelId: z.string().min(1),
    channelDimId:   z.string().min(1),
    channelLevelId: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid template payload." });
  const tpl = await prisma.forecastTemplate.create({
    data: parsed.data,
    include: templateInclude
  });
  return res.status(201).json(tpl);
});

forecastRouter.patch("/templates/:id", async (req, res) => {
  const tpl = await prisma.forecastTemplate.findUnique({ where: { id: req.params.id } });
  if (!tpl) return res.status(404).json({ message: "Template not found." });
  if (tpl.isLocked) return res.status(422).json({ message: "Template is locked. Unlock it first (admin only)." });

  const schema = z.object({
    name:           z.string().min(1).optional(),
    productDimId:   z.string().min(1).optional(),
    productLevelId: z.string().min(1).optional(),
    channelDimId:   z.string().min(1).optional(),
    channelLevelId: z.string().min(1).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload." });
  const updated = await prisma.forecastTemplate.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: templateInclude
  });
  return res.json(updated);
});

forecastRouter.delete("/templates/:id", async (req, res) => {
  const tpl = await prisma.forecastTemplate.findUnique({ where: { id: req.params.id } });
  if (!tpl) return res.status(404).json({ message: "Template not found." });
  if (tpl.isLocked) return res.status(422).json({ message: "Cannot delete a locked template. Unlock it first." });
  await prisma.forecastTemplate.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// Admin: toggle lock
forecastRouter.post("/templates/:id/unlock", async (req, res) => {
  const tpl = await prisma.forecastTemplate.findUnique({ where: { id: req.params.id } });
  if (!tpl) return res.status(404).json({ message: "Template not found." });
  const updated = await prisma.forecastTemplate.update({
    where: { id: req.params.id },
    data: { isLocked: !tpl.isLocked },
    include: templateInclude
  });
  return res.json(updated);
});

// Template assignments
forecastRouter.post("/templates/:id/assignments", async (req, res) => {
  const schema = z.object({
    forecastType:     z.enum(["LONG_TERM_PLAN", "ROLLING_PRODUCTION"]),
    buId:             z.string().min(1).optional(),
    companyId:        z.string().min(1).optional(),
    plantId:          z.string().min(1).optional(),
    forecastOriginId: z.string().min(1).optional(),
    initialYear:      z.number().int().min(2000).max(2100),
    initialQuarter:   z.number().int().min(1).max(4).optional(),
    initialMonth:     z.number().int().min(1).max(12).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid assignment payload." });
  const tpl = await prisma.forecastTemplate.findUnique({ where: { id: req.params.id } });
  if (!tpl) return res.status(404).json({ message: "Template not found." });
  const assignment = await prisma.forecastTemplateAssignment.create({
    data: { templateId: req.params.id, ...parsed.data }
  });
  return res.status(201).json(assignment);
});

forecastRouter.delete("/templates/:id/assignments/:assignId", async (req, res) => {
  await prisma.forecastTemplateAssignment.delete({ where: { id: req.params.assignId } });
  return res.status(204).send();
});

// Generate CSV — column order: channel levels (high→low) then product levels (high→low)
// then period columns, Unit, Price, Currency
forecastRouter.get("/templates/:id/csv", async (req, res) => {
  const tpl = await prisma.forecastTemplate.findUnique({ where: { id: req.params.id } });
  if (!tpl) return res.status(404).json({ message: "Template not found." });

  // Load dimension levels ordered by levelOrder
  const [allChLevels, allProdLevels] = await Promise.all([
    prisma.dimensionLevel.findMany({ where: { dimensionId: tpl.channelDimId }, orderBy: { levelOrder: "asc" } }),
    prisma.dimensionLevel.findMany({ where: { dimensionId: tpl.productDimId }, orderBy: { levelOrder: "asc" } })
  ]);

  // Levels from root up to the selected level (inclusive)
  const selectedChLevel  = allChLevels.find((l) => l.id === tpl.channelLevelId);
  const selectedProdLevel = allProdLevels.find((l) => l.id === tpl.productLevelId);
  if (!selectedChLevel || !selectedProdLevel)
    return res.status(422).json({ message: "Selected level not found in dimension." });

  const chLevels   = allChLevels.filter((l) => l.levelOrder <= selectedChLevel.levelOrder);
  const prodLevels = allProdLevels.filter((l) => l.levelOrder <= selectedProdLevel.levelOrder);

  // All nodes for each dimension
  const [chNodes, prodNodes] = await Promise.all([
    prisma.dimensionNode.findMany({ where: { dimensionId: tpl.channelDimId } }),
    prisma.dimensionNode.findMany({ where: { dimensionId: tpl.productDimId } })
  ]);

  // Build ancestor path for a node (array from root → node, matching the level ids)
  function buildPath(nodeId: string, allNodes: typeof chNodes, levelIds: string[]): string[] {
    const byId = new Map(allNodes.map((n) => [n.id, n]));
    // Walk up from node to collect ancestors
    const chain: typeof chNodes = [];
    let cur = byId.get(nodeId);
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentNodeId ? byId.get(cur.parentNodeId) : undefined;
    }
    // Map each required level to its node code (or empty if not in chain)
    const chainByLevel = new Map(chain.map((n) => [n.levelId, n]));
    return levelIds.map((lid) => chainByLevel.get(lid)?.code ?? "");
  }

  // Get nodes AT the selected level
  const chLeafNodes   = chNodes.filter((n) => n.levelId === tpl.channelLevelId);
  const prodLeafNodes = prodNodes.filter((n) => n.levelId === tpl.productLevelId);

  // Period columns from assignment context (query params) or placeholder
  const { assignmentId } = req.query as Record<string, string>;
  let periods: string[] = [];
  if (assignmentId) {
    const asgn = await prisma.forecastTemplateAssignment.findUnique({ where: { id: assignmentId } });
    if (asgn) {
      // Get horizon from period config matching forecast type
      const periodCfg = await prisma.periodConfig.findFirst({ where: { forecastType: asgn.forecastType } });
      const horizon = periodCfg?.forecastingHorizontal ?? 12;
      periods = generatePeriodKeys(asgn.forecastType, asgn.initialYear, asgn.initialQuarter, asgn.initialMonth, horizon);
    }
  }
  if (!periods.length) {
    // Fallback: show 4 placeholder period columns
    const y = new Date().getFullYear();
    periods = ["Q1", "Q2", "Q3", "Q4"].map((q) => `${y}-${q}`);
  }

  // Build header: [ch levels...] [prod levels...] [periods...] Unit Price Currency
  const chLevelNames   = chLevels.map((l) => l.name);
  const prodLevelNames = prodLevels.map((l) => l.name);
  const header = [...chLevelNames, ...prodLevelNames, ...periods, "Unit", "Price", "Currency"].join(",");

  // Build rows
  const rows: string[] = [header];
  const chLevelIds   = chLevels.map((l) => l.id);
  const prodLevelIds = prodLevels.map((l) => l.id);

  for (const chNode of chLeafNodes) {
    const chPath = buildPath(chNode.id, chNodes, chLevelIds);
    for (const prodNode of prodLeafNodes) {
      const prodPath = buildPath(prodNode.id, prodNodes, prodLevelIds);
      const unit = prodNode.unitOfMeasure ?? "";
      const periodCells = periods.map(() => "").join(",");
      rows.push([...chPath, ...prodPath, periodCells, unit, "", ""].join(","));
    }
  }

  const csv = rows.join("\n");
  const fileName = `template_${tpl.name.replace(/\s+/g, "_")}.csv`;

  if (req.headers.accept?.includes("application/json")) {
    return res.json({ csv, fileName, chLevels: chLevelNames, prodLevels: prodLevelNames, periods });
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.send(csv);
});
