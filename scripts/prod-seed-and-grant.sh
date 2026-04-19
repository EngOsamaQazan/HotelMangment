#!/bin/bash
# Install ts-node (dev dep) if missing, run permission seeder, then grant osama admin.
set -e
cd /opt/hotel-app

echo "==> 0) Ensuring ts-node + typescript are available..."
if ! [ -x node_modules/.bin/ts-node ]; then
  npm install --no-save --no-audit --no-fund ts-node typescript @types/node >/dev/null 2>&1 || npm install --no-save ts-node typescript @types/node
  echo "  installed ts-node locally."
else
  echo "  ts-node already present."
fi

echo ""
echo "==> 1) Running permission seeder..."
npm run db:seed-permissions

echo ""
echo "==> 2) Linking osama to admin role + clearing denies..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const user = await prisma.user.findUnique({ where: { username: 'osama' } });
  if (!user) throw new Error('User osama not found');

  const adminRole = await prisma.role.findUnique({ where: { key: 'admin' } });
  if (!adminRole) throw new Error('admin role missing after seed');

  const allPerms = await prisma.permission.findMany({ where: { isActive: true }, select: { id: true } });
  const existing = await prisma.rolePermission.findMany({ where: { roleId: adminRole.id }, select: { permissionId: true } });
  const existingSet = new Set(existing.map(r => r.permissionId));
  const missing = allPerms.filter(p => !existingSet.has(p.id));
  if (missing.length) {
    await prisma.rolePermission.createMany({
      data: missing.map(p => ({ roleId: adminRole.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  await prisma.userPermissionOverride.deleteMany({
    where: { userId: user.id, effect: 'deny' },
  });

  if (user.role !== 'admin') {
    await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } });
  }

  const totalPerms = await prisma.permission.count({ where: { isActive: true } });
  const adminPerms = await prisma.rolePermission.count({ where: { roleId: adminRole.id } });
  console.log('Permissions in DB: ' + totalPerms);
  console.log('Admin role permissions: ' + adminPerms);
  console.log('OK osama (#' + user.id + ') is now linked to admin role.');
  await prisma.\$disconnect();
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
"

echo ""
echo "==> 3) Done. Log out and log back in to refresh permission cache."
