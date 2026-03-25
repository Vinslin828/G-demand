import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.get("/summary", async (_req, res) => {
  const [groups, bus, companies, plants, sales, users, roles] = await Promise.all([
    prisma.group.count(),
    prisma.bU.count(),
    prisma.company.count(),
    prisma.plant.count(),
    prisma.sales.count(),
    prisma.user.count(),
    prisma.role.count()
  ]);

  return res.json({
    counts: { groups, bus, companies, plants, sales, users, roles }
  });
});
