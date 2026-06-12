import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';

const adapter = new PrismaMariaDb({
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: 'root',
  database: 'opslens',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Start seeding...');

  // 1. Seed Roles
  const roles = [
    { name: 'site-admin' },
    { name: 'compliance-manager' },
    { name: 'supervisor' },
    { name: 'field-worker' },
  ];

  const dbRoles = [];
  for (const role of roles) {
    const dbRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: { name: role.name },
    });
    dbRoles.push(dbRole);
    console.log(`Upserted role: ${dbRole.name}`);
  }

  // Helper map for roles
  const roleMap = dbRoles.reduce((acc, r) => {
    acc[r.name] = r.id;
    return acc;
  }, {} as Record<string, string>);

  // 2. Seed Organizations
  const acmeOrg = await prisma.organization.create({
    data: { name: 'Acme Industrial' },
  });
  const globalHealthOrg = await prisma.organization.create({
    data: { name: 'Global Health' },
  });
  console.log(`Created organizations: ${acmeOrg.name}, ${globalHealthOrg.name}`);

  // 3. Seed Users & Memberships
  const users = [
    {
      email: 'admin@acme.com',
      name: 'Alice Admin',
      password: 'admin123',
      role: 'site-admin',
      orgId: acmeOrg.id,
    },
    {
      email: 'compliance@acme.com',
      name: 'Charlie Compliance',
      password: 'compliance123',
      role: 'compliance-manager',
      orgId: acmeOrg.id,
    },
    {
      email: 'supervisor@acme.com',
      name: 'Sam Supervisor',
      password: 'supervisor123',
      role: 'supervisor',
      orgId: acmeOrg.id,
    },
    {
      email: 'worker@acme.com',
      name: 'Wendy Worker',
      password: 'worker123',
      role: 'field-worker',
      orgId: acmeOrg.id,
    },
    {
      email: 'worker@globalhealth.com',
      name: 'Gavin Worker',
      password: 'worker123',
      role: 'field-worker',
      orgId: globalHealthOrg.id,
    },
  ];

  for (const u of users) {
    const passwordHash = bcrypt.hashSync(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
      },
    });

    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: u.orgId,
        },
      },
      update: {
        roleId: roleMap[u.role]!,
      },
      create: {
        userId: user.id,
        organizationId: u.orgId,
        roleId: roleMap[u.role]!,
      },
    });

    console.log(`Seeded user ${user.email} in Org with role ${u.role}`);
  }

  // 4. Seed basic assets for ACM (to help Phase 1.3 / 1.4)
  const acmeSite = await prisma.site.create({
    data: {
      name: 'Acme Factory Floor A',
      organizationId: acmeOrg.id,
    },
  });

  const generatorAssetType = await prisma.assetType.create({
    data: {
      name: 'Power Generator',
    },
  });

  const mainGenerator = await prisma.asset.create({
    data: {
      name: 'Main Backup Generator 01',
      organizationId: acmeOrg.id,
      siteId: acmeSite.id,
      assetTypeId: generatorAssetType.id,
    },
  });

  console.log(`Seeded Site: ${acmeSite.name}, Asset: ${mainGenerator.name}`);
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
