import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedAccounting } from "./seed-accounting";

const prisma = new PrismaClient();

async function main() {
  console.log("🏨 بدء تهيئة قاعدة بيانات فندق الفاخر...\n");

  // ===== Users =====
  console.log("👤 إنشاء المستخدمين...");
  const adminHash = await bcrypt.hash("admin123", 10);
  const receptionHash = await bcrypt.hash("reception123", 10);
  const accountantHash = await bcrypt.hash("accountant123", 10);
  const osamaHash = await bcrypt.hash("osama123", 10);

  await prisma.user.upsert({
    where: { email: "admin@fakher.jo" },
    update: {},
    create: {
      name: "المدير العام",
      email: "admin@fakher.jo",
      username: "admin",
      passwordHash: adminHash,
      role: "admin",
    },
  });

  await prisma.user.upsert({
    where: { email: "osamaqazan89@gmail.com" },
    update: {
      username: "osama",
      passwordHash: osamaHash,
      role: "admin",
    },
    create: {
      name: "أسامة",
      email: "osamaqazan89@gmail.com",
      username: "osama",
      passwordHash: osamaHash,
      role: "admin",
    },
  });

  await prisma.user.upsert({
    where: { email: "reception@fakher.jo" },
    update: {},
    create: {
      name: "موظف الاستقبال",
      email: "reception@fakher.jo",
      passwordHash: receptionHash,
      role: "receptionist",
    },
  });

  await prisma.user.upsert({
    where: { email: "accountant@fakher.jo" },
    update: {},
    create: {
      name: "المحاسب",
      email: "accountant@fakher.jo",
      passwordHash: accountantHash,
      role: "accountant",
    },
  });

  // ===== Units =====
  console.log("🏠 إنشاء الغرف والشقق...");
  const rooms = ["101", "102", "103", "104", "105", "106", "107", "108", "109"];
  const apartments = ["01", "02", "03", "04", "05", "06"];

  for (const num of rooms) {
    await prisma.unit.upsert({
      where: { unitNumber: num },
      update: {},
      create: {
        unitNumber: num,
        unitType: "room",
        status: "available",
        floor: 1,
        description: `غرفة فندقية رقم ${num}`,
      },
    });
  }

  for (const num of apartments) {
    await prisma.unit.upsert({
      where: { unitNumber: num },
      update: {},
      create: {
        unitNumber: num,
        unitType: "apartment",
        status: "available",
        floor: num <= "03" ? 1 : 2,
        description: `شقة مفروشة رقم ${num}`,
      },
    });
  }

  // ===== Seasonal Prices =====
  console.log("💰 إنشاء الأسعار الموسمية...");
  const seasons = [
    {
      seasonName: "موسم عادي",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-28"),
      roomDaily: 120, roomWeekly: 700, roomMonthly: 2500,
      aptDaily: 200, aptWeekly: 1200, aptMonthly: 3500,
    },
    {
      seasonName: "موسم الربيع",
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-05-31"),
      roomDaily: 150, roomWeekly: 900, roomMonthly: 3000,
      aptDaily: 250, aptWeekly: 1500, aptMonthly: 4000,
    },
    {
      seasonName: "موسم الصيف",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-08-31"),
      roomDaily: 200, roomWeekly: 1200, roomMonthly: 4000,
      aptDaily: 350, aptWeekly: 2000, aptMonthly: 6000,
    },
    {
      seasonName: "موسم الأعياد",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-10-31"),
      roomDaily: 180, roomWeekly: 1100, roomMonthly: 3500,
      aptDaily: 300, aptWeekly: 1800, aptMonthly: 5000,
    },
    {
      seasonName: "موسم الشتاء",
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-12-31"),
      roomDaily: 130, roomWeekly: 800, roomMonthly: 2800,
      aptDaily: 220, aptWeekly: 1300, aptMonthly: 3800,
    },
  ];

  for (const season of seasons) {
    await prisma.seasonalPrice.create({ data: season });
  }

  // ===== Reservations from Excel =====
  console.log("📋 إنشاء الحجوزات...");
  const unit101 = await prisma.unit.findUnique({ where: { unitNumber: "101" } });
  const unit01 = await prisma.unit.findUnique({ where: { unitNumber: "01" } });
  const unit105 = await prisma.unit.findUnique({ where: { unitNumber: "105" } });
  const unit102 = await prisma.unit.findUnique({ where: { unitNumber: "102" } });
  const unit103 = await prisma.unit.findUnique({ where: { unitNumber: "103" } });

  const res1 = await prisma.reservation.create({
    data: {
      unitId: unit101!.id,
      guestName: "محمد أحمد الزهراني",
      phone: "0501234567",
      numNights: 4,
      stayType: "daily",
      checkIn: new Date("2026-04-01"),
      checkOut: new Date("2026-04-05"),
      unitPrice: 150,
      totalAmount: 600,
      paidAmount: 500,
      remaining: 100,
      paymentMethod: "نقد",
      status: "active",
      numGuests: 2,
    },
  });

  const res2 = await prisma.reservation.create({
    data: {
      unitId: unit01!.id,
      guestName: "سارة خالد العمري",
      phone: "0559876543",
      numNights: 30,
      stayType: "monthly",
      checkIn: new Date("2026-04-03"),
      checkOut: new Date("2026-05-03"),
      unitPrice: 3500,
      totalAmount: 3500,
      paidAmount: 3500,
      remaining: 0,
      paymentMethod: "تحويل بنكي",
      status: "active",
      numGuests: 1,
      notes: "سداد كامل",
    },
  });

  const res3 = await prisma.reservation.create({
    data: {
      unitId: unit105!.id,
      guestName: "عبدالله محمد الحارثي",
      phone: "0571234567",
      numNights: 2,
      stayType: "daily",
      checkIn: new Date("2026-04-05"),
      checkOut: new Date("2026-04-07"),
      unitPrice: 150,
      totalAmount: 300,
      paidAmount: 150,
      remaining: 150,
      paymentMethod: "نقد",
      status: "completed",
      numGuests: 1,
    },
  });

  const res4 = await prisma.reservation.create({
    data: {
      unitId: unit102!.id,
      guestName: "خالد عمر المطيري",
      phone: "0542345678",
      numNights: 3,
      stayType: "daily",
      checkIn: new Date("2026-04-06"),
      checkOut: new Date("2026-04-09"),
      unitPrice: 150,
      totalAmount: 450,
      paidAmount: 100,
      remaining: 350,
      paymentMethod: "نقد",
      status: "active",
      groupId: "G001",
      numGuests: 3,
      notes: "حجز مجموعة",
    },
  });

  await prisma.reservation.create({
    data: {
      unitId: unit103!.id,
      guestName: "خالد عمر المطيري",
      phone: "0542345678",
      numNights: 3,
      stayType: "daily",
      checkIn: new Date("2026-04-06"),
      checkOut: new Date("2026-04-09"),
      unitPrice: 150,
      totalAmount: 450,
      paidAmount: 100,
      remaining: 350,
      paymentMethod: "نقد",
      status: "active",
      groupId: "G001",
      numGuests: 3,
      notes: "نفس الضيف - حجز مجموعة",
    },
  });

  // Update unit statuses for active reservations
  await prisma.unit.update({ where: { unitNumber: "101" }, data: { status: "occupied" } });
  await prisma.unit.update({ where: { unitNumber: "01" }, data: { status: "occupied" } });
  await prisma.unit.update({ where: { unitNumber: "102" }, data: { status: "occupied" } });
  await prisma.unit.update({ where: { unitNumber: "103" }, data: { status: "occupied" } });

  // ===== Guests =====
  console.log("👥 إنشاء بيانات النزلاء...");
  await prisma.guest.createMany({
    data: [
      { reservationId: res1.id, guestOrder: 1, fullName: "محمد أحمد الزهراني", idNumber: "1088765432", nationality: "أردني", notes: "النزيل الرئيسي" },
      { reservationId: res1.id, guestOrder: 2, fullName: "فاطمة سالم الزهراني", idNumber: "1099876543", nationality: "أردني" },
      { reservationId: res2.id, guestOrder: 1, fullName: "سارة خالد العمري", idNumber: "2388001122", nationality: "أردني", notes: "النزيل الرئيسي" },
      { reservationId: res4.id, guestOrder: 1, fullName: "خالد عمر المطيري", idNumber: "1077654321", nationality: "أردني", notes: "النزيل الرئيسي" },
      { reservationId: res4.id, guestOrder: 2, fullName: "أحمد خالد المطيري", idNumber: "1100123456", nationality: "أردني" },
      { reservationId: res4.id, guestOrder: 3, fullName: "نورة خالد المطيري", idNumber: "1105678901", nationality: "أردني" },
    ],
  });

  // ===== Maintenance =====
  console.log("🔧 إنشاء سجلات الصيانة...");
  await prisma.maintenance.create({
    data: {
      unitId: unit103!.id,
      description: "إصلاح مكيف الهواء",
      contractor: "شركة برودة للتكييف",
      cost: 500,
      status: "completed",
      requestDate: new Date("2026-04-08"),
      completionDate: new Date("2026-04-09"),
      notes: "تم بنجاح",
    },
  });

  const unit02 = await prisma.unit.findUnique({ where: { unitNumber: "02" } });
  await prisma.maintenance.create({
    data: {
      unitId: unit02!.id,
      description: "إصلاح تسريب حمام",
      contractor: "أبو محمد السباك",
      cost: 200,
      status: "in_progress",
      requestDate: new Date("2026-04-10"),
      notes: "في انتظار قطع الغيار",
    },
  });

  // ===== Transactions =====
  console.log("💵 إنشاء الحركات المالية...");
  await prisma.transaction.createMany({
    data: [
      { date: new Date("2026-04-01"), description: `إيجار غرفة 101 — ${res1.id}`, reservationId: res1.id, amount: 500, type: "income", account: "cash" },
      { date: new Date("2026-04-03"), description: `إيجار شقة 01 — ${res2.id}`, reservationId: res2.id, amount: 3500, type: "income", account: "bank" },
      { date: new Date("2026-04-05"), description: `إيجار غرفة 105 — ${res3.id}`, reservationId: res3.id, amount: 150, type: "income", account: "cash" },
      { date: new Date("2026-04-06"), description: `إيجار غرفة 102 — ${res4.id}`, reservationId: res4.id, amount: 100, type: "income", account: "cash" },
      { date: new Date("2026-04-09"), description: "صيانة مكيف غرفة 103", amount: 500, type: "expense", account: "cash" },
    ],
  });

  // ===== Accounting Chart of Accounts =====
  await seedAccounting();

  console.log("\n✅ تمت تهيئة قاعدة البيانات بنجاح!");
  console.log("📊 الحسابات الافتراضية:");
  console.log("   مدير: admin@fakher.jo / admin123");
  console.log("   استقبال: reception@fakher.jo / reception123");
  console.log("   محاسب: accountant@fakher.jo / accountant123");
}

main()
  .catch((e) => {
    console.error("❌ خطأ:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
