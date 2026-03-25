import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const createGroupSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1)
});

const createBUSchema = z.object({
  groupId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1)
});

const createCompanySchema = z.object({
  buId: z.string().min(1).optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["MANUFACTURING", "SALES"]),
  timezone: z.string().default("UTC")
});

const createPlantSchema = z.object({
  companyId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1)
});

const createSalesSchema = z.object({
  companyId: z.string().min(1),
  plantId: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["PERSON", "TEAM"])
});

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissionCodes: z.array(z.string()).default([])
});

const assignRoleSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1)
});

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(8)
});

export const setupRouter = Router();
setupRouter.use(requireAuth);

setupRouter.get("/org-tree", async (_req, res) => {
  const groups = await prisma.group.findMany({
    include: {
      bus: {
        include: {
          companies: {
            include: {
              plants: true,
              sales: true
            }
          }
        }
      }
    },
    orderBy: { name: "asc" }
  });

  return res.json(groups);
});

setupRouter.post("/groups", async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid group payload." });

  const group = await prisma.group.create({ data: parsed.data });
  return res.status(201).json(group);
});

setupRouter.post("/bus", async (req, res) => {
  const parsed = createBUSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid BU payload." });

  const bu = await prisma.bU.create({ data: parsed.data });
  return res.status(201).json(bu);
});

setupRouter.post("/companies", async (req, res) => {
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid company payload." });

  const company = await prisma.company.create({ data: parsed.data });
  return res.status(201).json(company);
});

setupRouter.post("/plants", async (req, res) => {
  const parsed = createPlantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid plant payload." });

  const plant = await prisma.plant.create({ data: parsed.data });
  return res.status(201).json(plant);
});

setupRouter.post("/sales", async (req, res) => {
  const parsed = createSalesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid sales payload." });

  const sales = await prisma.sales.create({ data: parsed.data });
  return res.status(201).json(sales);
});

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
            connectOrCreate: {
              where: { code },
              create: { code, description: code }
            }
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
    include: {
      roleAssignments: { include: { role: true } },
      memberships: true
    },
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

  return res.status(201).json({
    id: user.id,
    email: user.email,
    displayName: user.displayName
  });
});

setupRouter.post("/users/assign-role", async (req, res) => {
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid role assignment payload." });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: parsed.data.userId,
        roleId: parsed.data.roleId
      }
    },
    update: {},
    create: parsed.data
  });

  return res.status(204).send();
});
