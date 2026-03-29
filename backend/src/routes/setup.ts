import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

// ── Schemas ────────────────────────────────────────────────────────────────────

const createGroupSchema = z.object({ code: z.string().min(1), name: z.string().min(1) });
const updateGroupSchema = z.object({ code: z.string().min(1).optional(), name: z.string().min(1).optional() });

const createBUSchema = z.object({ groupId: z.string().min(1), code: z.string().min(1), name: z.string().min(1) });
const updateBUSchema = z.object({ groupId: z.string().min(1).optional(), code: z.string().min(1).optional(), name: z.string().min(1).optional() });

const createCompanySchema = z.object({
  groupId: z.string().min(1).optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["MANUFACTURING", "SALES"]),
  timezone: z.string().default("UTC")
});
const updateCompanySchema = z.object({
  groupId: z.string().min(1).nullable().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.enum(["MANUFACTURING", "SALES"]).optional()
});

const createPlantSchema = z.object({ companyId: z.string().min(1), code: z.string().min(1), name: z.string().min(1) });
const updatePlantSchema = z.object({ companyId: z.string().min(1).optional(), code: z.string().min(1).optional(), name: z.string().min(1).optional() });

const createSalesSchema = z.object({
  companyId: z.string().min(1),
  plantId: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["PERSON", "TEAM"])
});
const updateSalesSchema = z.object({
  companyId: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.enum(["PERSON", "TEAM"]).optional()
});

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissionCodes: z.array(z.string()).default([])
});

const assignRoleSchema = z.object({ userId: z.string().min(1), roleId: z.string().min(1) });

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(8)
});

const buCompanyLinkSchema = z.object({ buId: z.string().min(1), companyId: z.string().min(1) });

// ── Lock helper ────────────────────────────────────────────────────────────────

async function orgIsLocked(res: Response): Promise<boolean> {
  const lock = await prisma.orgLock.findFirst();
  if (lock?.isLocked) {
    res.status(423).json({ message: "Organization is locked. Unlock it before making changes." });
    return true;
  }
  return false;
}

// ── Router ─────────────────────────────────────────────────────────────────────

export const setupRouter = Router();
setupRouter.use(requireAuth);

// ── Org tree ───────────────────────────────────────────────────────────────────

setupRouter.get("/org-tree", async (_req, res) => {
  const groups = await prisma.group.findMany({
    include: {
      bus: { orderBy: { name: "asc" } },
      companies: {
        include: {
          plants: { orderBy: { name: "asc" } },
          sales: { orderBy: { name: "asc" } },
          buLinks: { select: { buId: true } }
        },
        orderBy: { name: "asc" }
      }
    },
    orderBy: { name: "asc" }
  });
  return res.json({ groups });
});

// ── Org lock ───────────────────────────────────────────────────────────────────

setupRouter.get("/org-lock", async (_req, res) => {
  const lock = await prisma.orgLock.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", isLocked: false }
  });
  return res.json({ isLocked: lock.isLocked, lockedAt: lock.lockedAt });
});

setupRouter.post("/org-lock/lock", async (_req, res) => {
  const lock = await prisma.orgLock.update({
    where: { id: "singleton" },
    data: { isLocked: true, lockedAt: new Date() }
  });
  return res.json({ isLocked: lock.isLocked, lockedAt: lock.lockedAt });
});

setupRouter.post("/org-lock/unlock", async (_req, res) => {
  const lock = await prisma.orgLock.update({
    where: { id: "singleton" },
    data: { isLocked: false, lockedAt: null }
  });
  return res.json({ isLocked: lock.isLocked, lockedAt: lock.lockedAt });
});

// ── Groups ─────────────────────────────────────────────────────────────────────

setupRouter.post("/groups", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid group payload." });
  const group = await prisma.group.create({ data: parsed.data });
  return res.status(201).json(group);
});

setupRouter.patch("/groups/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = updateGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid group payload." });
  const group = await prisma.group.update({ where: { id: req.params.id }, data: parsed.data });
  return res.json(group);
});

setupRouter.delete("/groups/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  await prisma.group.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ── Business Units ─────────────────────────────────────────────────────────────

setupRouter.post("/bus", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = createBUSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid BU payload." });
  const bu = await prisma.bU.create({ data: parsed.data });
  return res.status(201).json(bu);
});

setupRouter.patch("/bus/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = updateBUSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid BU payload." });
  const bu = await prisma.bU.update({ where: { id: req.params.id }, data: parsed.data });
  return res.json(bu);
});

setupRouter.delete("/bus/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  await prisma.bU.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ── Companies ──────────────────────────────────────────────────────────────────

setupRouter.post("/companies", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid company payload." });
  const { groupId, ...rest } = parsed.data;
  const company = await prisma.company.create({
    data: { ...rest, ...(groupId ? { groupId } : {}) }
  });
  return res.status(201).json(company);
});

setupRouter.patch("/companies/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = updateCompanySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid company payload." });
  const company = await prisma.company.update({ where: { id: req.params.id }, data: parsed.data });
  return res.json(company);
});

setupRouter.delete("/companies/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  await prisma.company.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ── Plants ─────────────────────────────────────────────────────────────────────

setupRouter.post("/plants", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = createPlantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid plant payload." });
  const plant = await prisma.plant.create({ data: parsed.data });
  return res.status(201).json(plant);
});

setupRouter.patch("/plants/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = updatePlantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid plant payload." });
  const plant = await prisma.plant.update({ where: { id: req.params.id }, data: parsed.data });
  return res.json(plant);
});

setupRouter.delete("/plants/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  await prisma.plant.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ── Sales ──────────────────────────────────────────────────────────────────────

setupRouter.post("/sales", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = createSalesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid sales payload." });
  const sales = await prisma.sales.create({ data: parsed.data });
  return res.status(201).json(sales);
});

setupRouter.patch("/sales/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = updateSalesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid sales payload." });
  const sales = await prisma.sales.update({ where: { id: req.params.id }, data: parsed.data });
  return res.json(sales);
});

setupRouter.delete("/sales/:id", async (req, res) => {
  if (await orgIsLocked(res)) return;
  await prisma.sales.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ── BU ↔ Company links ─────────────────────────────────────────────────────────

setupRouter.post("/bu-company-links", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = buCompanyLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload." });
  await prisma.bUCompany.upsert({
    where: { buId_companyId: parsed.data },
    update: {},
    create: parsed.data
  });
  return res.status(201).json(parsed.data);
});

setupRouter.delete("/bu-company-links", async (req, res) => {
  if (await orgIsLocked(res)) return;
  const parsed = buCompanyLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload." });
  await prisma.bUCompany.deleteMany({ where: parsed.data });
  return res.status(204).send();
});

// ── Permissions, Roles, Users ──────────────────────────────────────────────────

setupRouter.get("/permissions", async (_req, res) => {
  const permissions = await prisma.permission.findMany({ orderBy: { code: "asc" } });
  return res.json(permissions);
});

setupRouter.get("/roles", async (_req, res) => {
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: "asc" }
  });
  return res.json(roles);
});

setupRouter.post("/roles", async (req, res) => {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid role payload." });
  const role = await prisma.role.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      permissions: {
        create: parsed.data.permissionCodes.map((code) => ({
          permission: {
            connectOrCreate: { where: { code }, create: { code, description: code } }
          }
        }))
      }
    },
    include: { permissions: { include: { permission: true } } }
  });
  return res.status(201).json(role);
});

setupRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { roleAssignments: { include: { role: true } }, memberships: true },
    orderBy: { createdAt: "desc" }
  });
  return res.json(users);
});

setupRouter.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid user payload." });
  const bcrypt = await import("bcryptjs");
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email.toLowerCase(),
      displayName: parsed.data.displayName,
      passwordHash: await bcrypt.hash(parsed.data.password, 10)
    }
  });
  return res.status(201).json({ id: user.id, email: user.email, displayName: user.displayName });
});

setupRouter.post("/users/assign-role", async (req, res) => {
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid role assignment payload." });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: parsed.data.userId, roleId: parsed.data.roleId } },
    update: {},
    create: parsed.data
  });
  return res.status(204).send();
});
