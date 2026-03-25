import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

async function bootstrapAdmin() {
  const email = env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(env.BOOTSTRAP_ADMIN_PASSWORD, 10);

  const role = await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: {
      name: "admin",
      description: "System administrator with full access",
      isSystem: true
    }
  });

  const permissionCodes = [
    "forecast.view",
    "forecast.update",
    "version_origin.activate",
    "allocation.manage",
    "erp_sync.trigger",
    "role.manage"
  ];

  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code }
    });

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id }
      },
      update: {},
      create: { roleId: role.id, permissionId: permission.id }
    });
  }

  const user = await prisma.user.create({
    data: {
      email,
      displayName: env.BOOTSTRAP_ADMIN_NAME,
      passwordHash,
      allowFrozenEdit: true
    }
  });

  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id }
  });

  // eslint-disable-next-line no-console
  console.log(`Created admin user: ${email}`);
}

bootstrapAdmin()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
