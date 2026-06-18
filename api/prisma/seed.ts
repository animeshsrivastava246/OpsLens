import bcrypt from 'bcryptjs';
import prisma from '../src/db';

async function seedRoles(): Promise<Record<string, string>> {
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

  return dbRoles.reduce((acc, r) => {
    acc[r.name] = r.id;
    return acc;
  }, {} as Record<string, string>);
}

async function seedOrganizations() {
  const acmeOrg = await prisma.organization.create({
    data: { name: 'Acme Industrial' },
  });
  const globalHealthOrg = await prisma.organization.create({
    data: { name: 'Global Health' },
  });
  console.log(`Created organizations: ${acmeOrg.name}, ${globalHealthOrg.name}`);
  return { acmeOrg, globalHealthOrg };
}

async function seedUsers(roleMap: Record<string, string>, acmeOrgId: string, globalHealthOrgId: string) {
  const users = [
    {
      email: 'admin@acme.com',
      name: 'Alice Admin',
      password: 'admin123',
      role: 'site-admin',
      orgId: acmeOrgId,
    },
    {
      email: 'compliance@acme.com',
      name: 'Charlie Compliance',
      password: 'compliance123',
      role: 'compliance-manager',
      orgId: acmeOrgId,
    },
    {
      email: 'supervisor@acme.com',
      name: 'Sam Supervisor',
      password: 'supervisor123',
      role: 'supervisor',
      orgId: acmeOrgId,
    },
    {
      email: 'worker@acme.com',
      name: 'Wendy Worker',
      password: 'worker123',
      role: 'field-worker',
      orgId: acmeOrgId,
    },
    {
      email: 'worker@globalhealth.com',
      name: 'Gavin Worker',
      password: 'worker123',
      role: 'field-worker',
      orgId: globalHealthOrgId,
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
}

async function seedAssets(acmeOrgId: string) {
  const acmeSite = await prisma.site.create({
    data: {
      name: 'Acme Factory Floor A',
      organizationId: acmeOrgId,
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
      organizationId: acmeOrgId,
      siteId: acmeSite.id,
      assetTypeId: generatorAssetType.id,
    },
  });

  console.log(`Seeded Site: ${acmeSite.name}, Asset: ${mainGenerator.name}`);
}

async function main() {
  console.log('Start seeding...');

  const roleMap = await seedRoles();
  const { acmeOrg, globalHealthOrg } = await seedOrganizations();
  await seedUsers(roleMap, acmeOrg.id, globalHealthOrg.id);
  await seedAssets(acmeOrg.id);

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
