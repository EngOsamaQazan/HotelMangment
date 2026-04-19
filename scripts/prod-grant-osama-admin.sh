#!/bin/bash
# يُنفَّذ على سيرفر الإنتاج - يمنح المستخدم osama صلاحيات admin الكاملة
set -e

cd /opt/hotel-app

node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // 1) تأكد أن المستخدم موجود
  const user = await prisma.user.findUnique({ where: { username: 'osama' } });
  if (!user) throw new Error('User osama not found');
  console.log('User:', '#' + user.id, user.name, '<' + user.email + '>', 'legacyRole=' + user.role);

  // 2) تأكد أن دور admin موجود
  let adminRole = await prisma.role.findUnique({ where: { key: 'admin' } });
  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: {
        key: 'admin',
        name: 'مدير',
        description: 'صلاحية كاملة على النظام',
        isSystem: true,
        isActive: true,
      },
    });
    console.log('Created admin role #' + adminRole.id);
  } else {
    // تأكد أنه active
    if (!adminRole.isActive) {
      adminRole = await prisma.role.update({ where: { id: adminRole.id }, data: { isActive: true } });
      console.log('Re-activated admin role');
    }
  }
  console.log('Admin role:', '#' + adminRole.id, adminRole.name, 'active=' + adminRole.isActive);

  // 3) تأكد أن كل الصلاحيات النشطة مربوطة بدور admin
  const allPerms = await prisma.permission.findMany({ where: { isActive: true }, select: { id: true, key: true } });
  const existing = await prisma.rolePermission.findMany({ where: { roleId: adminRole.id }, select: { permissionId: true } });
  const existingSet = new Set(existing.map(r => r.permissionId));
  const missing = allPerms.filter(p => !existingSet.has(p.id));
  if (missing.length) {
    await prisma.rolePermission.createMany({
      data: missing.map(p => ({ roleId: adminRole.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    console.log('Added ' + missing.length + ' missing permissions to admin role (total now: ' + allPerms.length + ')');
  } else {
    console.log('Admin role already has all ' + allPerms.length + ' permissions');
  }

  // 4) اربط osama بدور admin
  const link = await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });
  console.log('UserRole link: #' + link.id + ' user=' + link.userId + ' role=' + link.roleId);

  // 5) امسح أي deny overrides على المستخدم
  const deleted = await prisma.userPermissionOverride.deleteMany({
    where: { userId: user.id, effect: 'deny' },
  });
  console.log('Cleared ' + deleted.count + ' deny overrides');

  // 6) تأكد أن الحقل legacy role = admin
  if (user.role !== 'admin') {
    await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } });
    console.log('Updated legacy role field to admin');
  }

  // 7) اعرض الصلاحيات النهائية
  const finalUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      permissionOverrides: { include: { permission: true } },
    },
  });
  const perms = new Set();
  for (const ur of finalUser.userRoles) for (const rp of ur.role.permissions) perms.add(rp.permission.key);
  for (const o of finalUser.permissionOverrides) {
    if (o.effect === 'allow') perms.add(o.permission.key);
    else perms.delete(o.permission.key);
  }
  console.log('✓ Final effective permissions count: ' + perms.size);
  console.log('✓ Roles:', finalUser.userRoles.map(ur => ur.role.key).join(', '));
  await prisma.\$disconnect();
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
"
