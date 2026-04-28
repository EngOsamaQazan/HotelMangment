/**
 * Seeds the catalog of Unit Types (room types) + their rooms/beds,
 * plus the Amenity dictionary.
 *
 * Safe to re-run anytime (uses upsert semantics + resets rooms/beds/amenities
 * to match the canonical definition below).
 *
 * Called from:
 *   - `prisma/seed.ts` (main seed)
 *   - `prisma/scripts/backfill-unit-types.ts`
 *   - `npm run db:seed-unit-types` (standalone)
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────────────────
// Amenities dictionary
// ────────────────────────────────────────────────────────────────────────

type AmenityDef = {
  code: string;
  nameAr: string;
  nameEn: string;
  icon?: string;
  category: string;
};

export const AMENITIES: AmenityDef[] = [
  { code: "wifi",      nameAr: "واي فاي مجاني",     nameEn: "Free Wi-Fi",        icon: "wifi",        category: "general" },
  { code: "ac",        nameAr: "تكييف",              nameEn: "Air Conditioning",  icon: "wind",        category: "general" },
  { code: "heater",    nameAr: "تدفئة",              nameEn: "Heating",           icon: "flame",       category: "general" },
  { code: "tv",        nameAr: "تلفاز",              nameEn: "TV",                icon: "tv",          category: "entertainment" },
  { code: "fridge",    nameAr: "ثلاجة",              nameEn: "Refrigerator",      icon: "refrigerator", category: "kitchen" },
  { code: "kitchen",   nameAr: "مطبخ",               nameEn: "Kitchen",           icon: "chef-hat",    category: "kitchen" },
  { code: "kettle",    nameAr: "غلاية ماء",          nameEn: "Electric Kettle",   icon: "coffee",      category: "kitchen" },
  { code: "coffee",    nameAr: "ركن قهوة/شاي",       nameEn: "Tea/Coffee Maker",  icon: "coffee",      category: "kitchen" },
  { code: "washer",    nameAr: "غسالة",              nameEn: "Washing Machine",   icon: "washing-machine", category: "general" },
  { code: "balcony",   nameAr: "شرفة",               nameEn: "Balcony",           icon: "door-open",   category: "outdoor" },
  { code: "safe",      nameAr: "خزنة",               nameEn: "In-room Safe",      icon: "lock",        category: "general" },
  { code: "minibar",   nameAr: "ميني بار",           nameEn: "Minibar",           icon: "wine",        category: "general" },
  { code: "hairdryer", nameAr: "مجفف شعر",           nameEn: "Hairdryer",         icon: "wind",        category: "bathroom" },
  { code: "jacuzzi",   nameAr: "جاكوزي خاص",         nameEn: "Private Jacuzzi",   icon: "bath",        category: "bathroom" },
  { code: "iron",      nameAr: "مكواة",              nameEn: "Iron",              icon: "shirt",       category: "general" },
  { code: "wardrobe",  nameAr: "خزانة ملابس",        nameEn: "Wardrobe",          icon: "archive",     category: "general" },
];

// ────────────────────────────────────────────────────────────────────────
// Unit Types catalog
// ────────────────────────────────────────────────────────────────────────

type BedDef = {
  bedType: string;
  count?: number;
  sleepsExtra?: boolean;
  notes?: string;
};

type RoomDef = {
  nameAr: string;
  nameEn: string;
  kind: "bedroom" | "living_room" | "studio" | "bathroom";
  position?: number;
  beds: BedDef[];
};

type UnitTypeDef = {
  code: string;
  nameAr: string;
  nameEn: string;
  category: "apartment" | "hotel_room" | "suite" | "studio";
  descriptionAr?: string;
  descriptionEn?: string;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  sizeSqm?: number;
  hasKitchen?: boolean;
  hasBalcony?: boolean;
  view?: string;
  sortOrder: number;
  rooms: RoomDef[];
  amenities: string[];
};

export const UNIT_TYPES: UnitTypeDef[] = [
  {
    code: "APT-1BR-DBL",
    nameAr: "شقة غرفة نوم — سرير مزدوج",
    nameEn: "One-Bedroom Apartment — Double Bed",
    category: "apartment",
    descriptionAr: "شقة مفروشة بغرفة نوم واحدة وسرير مزدوج، مناسبة لشخصين.",
    descriptionEn: "Furnished one-bedroom apartment with a queen bed, ideal for two guests.",
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    hasKitchen: true,
    hasBalcony: true,
    sortOrder: 10,
    rooms: [
      {
        nameAr: "غرفة النوم",
        nameEn: "Bedroom",
        kind: "bedroom",
        position: 1,
        beds: [{ bedType: "queen", count: 1 }],
      },
    ],
    amenities: ["wifi", "ac", "heater", "tv", "fridge", "kitchen", "kettle", "washer", "balcony", "wardrobe", "iron"],
  },
  {
    code: "APT-1BR-TWIN",
    nameAr: "شقة غرفة نوم — سريران مفردان",
    nameEn: "One-Bedroom Apartment — Twin Beds",
    category: "apartment",
    descriptionAr: "شقة مفروشة بغرفة نوم وسريرين مفردين قابلين للدمج، مع صالة بجلسة عربية أرضية صالحة للنوم.",
    descriptionEn: "Furnished apartment with twin beds (combinable) and an Arabic floor-seating lounge suitable for sleeping.",
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    hasKitchen: true,
    hasBalcony: true,
    sortOrder: 20,
    rooms: [
      {
        nameAr: "غرفة النوم",
        nameEn: "Bedroom",
        kind: "bedroom",
        position: 1,
        beds: [
          { bedType: "single", count: 2 },
        ],
      },
      {
        nameAr: "الصالة",
        nameEn: "Living Room",
        kind: "living_room",
        position: 2,
        beds: [
          {
            bedType: "arabic_floor_seating",
            count: 1,
            sleepsExtra: true,
            notes: "جلسة عربية أرضية صالحة للنوم",
          },
        ],
      },
    ],
    amenities: ["wifi", "ac", "heater", "tv", "fridge", "kitchen", "kettle", "washer", "balcony", "wardrobe", "iron"],
  },
  {
    code: "APT-2BR-MIX-A",
    nameAr: "شقة غرفتين وصالة — مزدوج + ثلاثي مفرد",
    nameEn: "Two-Bedroom Apartment — Queen + Triple Single",
    category: "apartment",
    descriptionAr: "شقة واسعة بغرفتي نوم وصالة بجلسة عربية أرضية؛ غرفة بسرير مزدوج وأخرى بثلاثة أسرّة مفردة.",
    descriptionEn: "Spacious two-bedroom apartment with Arabic floor-seating lounge. Master with queen bed, second room with three single beds.",
    maxAdults: 5,
    maxChildren: 1,
    maxOccupancy: 6,
    hasKitchen: true,
    hasBalcony: true,
    sortOrder: 30,
    rooms: [
      {
        nameAr: "غرفة النوم الرئيسية",
        nameEn: "Master Bedroom",
        kind: "bedroom",
        position: 1,
        beds: [{ bedType: "queen", count: 1 }],
      },
      {
        nameAr: "غرفة النوم الثانية",
        nameEn: "Second Bedroom",
        kind: "bedroom",
        position: 2,
        beds: [{ bedType: "single", count: 3 }],
      },
      {
        nameAr: "الصالة",
        nameEn: "Living Room",
        kind: "living_room",
        position: 3,
        beds: [
          {
            bedType: "arabic_floor_seating",
            count: 1,
            sleepsExtra: true,
            notes: "جلسة عربية أرضية صالحة للنوم",
          },
        ],
      },
    ],
    amenities: ["wifi", "ac", "heater", "tv", "fridge", "kitchen", "kettle", "washer", "balcony", "wardrobe", "iron"],
  },
  {
    code: "APT-2BR-MIX-B",
    nameAr: "شقة غرفتين وصالة — مزدوج + ثنائي مفرد",
    nameEn: "Two-Bedroom Apartment — Queen + Twin",
    category: "apartment",
    descriptionAr: "شقة بغرفتي نوم وصالة بجلسة عربية أرضية؛ غرفة بسرير مزدوج وأخرى بسريرين مفردين قابلين للدمج.",
    descriptionEn: "Two-bedroom apartment with Arabic floor-seating lounge. Master with queen bed, second room with combinable twin beds.",
    maxAdults: 4,
    maxChildren: 1,
    maxOccupancy: 5,
    hasKitchen: true,
    hasBalcony: true,
    sortOrder: 40,
    rooms: [
      {
        nameAr: "غرفة النوم الرئيسية",
        nameEn: "Master Bedroom",
        kind: "bedroom",
        position: 1,
        beds: [{ bedType: "queen", count: 1 }],
      },
      {
        nameAr: "غرفة النوم الثانية",
        nameEn: "Second Bedroom",
        kind: "bedroom",
        position: 2,
        beds: [{ bedType: "single", count: 2 }],
      },
      {
        nameAr: "الصالة",
        nameEn: "Living Room",
        kind: "living_room",
        position: 3,
        beds: [
          {
            bedType: "arabic_floor_seating",
            count: 1,
            sleepsExtra: true,
            notes: "جلسة عربية أرضية صالحة للنوم",
          },
        ],
      },
    ],
    amenities: ["wifi", "ac", "heater", "tv", "fridge", "kitchen", "kettle", "washer", "balcony", "wardrobe", "iron"],
  },
  {
    code: "HTL-SUITE",
    nameAr: "جناح فندقي",
    nameEn: "Hotel Suite",
    category: "suite",
    descriptionAr: "جناح فندقي بغرفة نوم مستقلة بسرير Queen وصالة جلوس منفصلة.",
    descriptionEn: "Hotel suite with separate bedroom (queen bed) and a private sitting area.",
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    hasKitchen: false,
    hasBalcony: true,
    sortOrder: 50,
    rooms: [
      {
        nameAr: "غرفة النوم",
        nameEn: "Bedroom",
        kind: "bedroom",
        position: 1,
        beds: [{ bedType: "queen", count: 1 }],
      },
      {
        nameAr: "صالة الجلوس",
        nameEn: "Sitting Area",
        kind: "living_room",
        position: 2,
        beds: [],
      },
    ],
    amenities: ["wifi", "ac", "heater", "tv", "fridge", "kettle", "coffee", "balcony", "safe", "minibar", "hairdryer", "wardrobe", "iron"],
  },
  {
    code: "HTL-VIP-HONEYMOON-JAC",
    nameAr: "جناح شهر عسل VIP — جاكوزي خاص",
    nameEn: "VIP Honeymoon Suite — Private Jacuzzi",
    category: "suite",
    descriptionAr:
      "جناح فندقي رومانسي للعرسان مع جاكوزي داخل الحمام، أجواء هادئة وخصوصية عالية.",
    descriptionEn:
      "Romantic VIP honeymoon suite with an in-room private jacuzzi, calm atmosphere and enhanced privacy.",
    maxAdults: 2,
    maxChildren: 0,
    maxOccupancy: 2,
    hasKitchen: false,
    hasBalcony: true,
    sortOrder: 52,
    rooms: [
      {
        nameAr: "غرفة النوم",
        nameEn: "Bedroom",
        kind: "bedroom",
        position: 1,
        beds: [{ bedType: "king", count: 1 }],
      },
      {
        nameAr: "صالة جلوس",
        nameEn: "Lounge",
        kind: "living_room",
        position: 2,
        beds: [],
      },
      {
        nameAr: "حمام بجاكوزي",
        nameEn: "Bathroom with Jacuzzi",
        kind: "bathroom",
        position: 3,
        beds: [],
      },
    ],
    amenities: [
      "wifi",
      "ac",
      "heater",
      "tv",
      "fridge",
      "kettle",
      "coffee",
      "balcony",
      "safe",
      "minibar",
      "hairdryer",
      "wardrobe",
      "iron",
      "jacuzzi",
    ],
  },
  {
    code: "HTL-KING",
    nameAr: "غرفة مزدوجة كينج",
    nameEn: "Double Room — King Bed",
    category: "hotel_room",
    descriptionAr: "غرفة فندقية بسرير كينج واحد.",
    descriptionEn: "Hotel room with one king-size bed.",
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    sortOrder: 60,
    rooms: [
      {
        nameAr: "الغرفة",
        nameEn: "Room",
        kind: "bedroom",
        position: 1,
        beds: [{ bedType: "king", count: 1 }],
      },
    ],
    amenities: ["wifi", "ac", "heater", "tv", "fridge", "kettle", "safe", "hairdryer", "wardrobe", "iron"],
  },
  {
    code: "HTL-TWIN",
    nameAr: "غرفة ثنائية مفردة",
    nameEn: "Twin Room",
    category: "hotel_room",
    descriptionAr: "غرفة فندقية بسريرين مفردين قابلين للدمج لتصبح سريرًا كينج.",
    descriptionEn: "Hotel room with two single beds, combinable into a king.",
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    sortOrder: 70,
    rooms: [
      {
        nameAr: "الغرفة",
        nameEn: "Room",
        kind: "bedroom",
        position: 1,
        beds: [
          { bedType: "single", count: 2 },
        ],
      },
    ],
    amenities: ["wifi", "ac", "heater", "tv", "fridge", "kettle", "safe", "hairdryer", "wardrobe", "iron"],
  },
  {
    code: "HTL-TRIPLE",
    nameAr: "غرفة ثلاثية مفردة",
    nameEn: "Triple Room — Single Beds",
    category: "hotel_room",
    descriptionAr: "غرفة فندقية بثلاثة أسرّة مفردة؛ يمكن دمج سريرين منها لتكوين سرير كينج.",
    descriptionEn: "Hotel room with three single beds. Two of them can be combined into a king.",
    maxAdults: 3,
    maxChildren: 1,
    maxOccupancy: 4,
    sortOrder: 80,
    rooms: [
      {
        nameAr: "الغرفة",
        nameEn: "Room",
        kind: "bedroom",
        position: 1,
        beds: [
          { bedType: "single", count: 3 },
        ],
      },
    ],
    amenities: ["wifi", "ac", "heater", "tv", "fridge", "kettle", "safe", "hairdryer", "wardrobe", "iron"],
  },
  {
    code: "HTL-QUAD",
    nameAr: "غرفة رباعية مفردة",
    nameEn: "Quadruple Room — Single Beds",
    category: "hotel_room",
    descriptionAr: "غرفة فندقية بأربعة أسرّة مفردة؛ يمكن دمج الأسرّة ثنائيًا لتكوين سريرين كينج.",
    descriptionEn: "Hotel room with four single beds; combinable in pairs to form two king beds.",
    maxAdults: 4,
    maxChildren: 1,
    maxOccupancy: 5,
    sortOrder: 90,
    rooms: [
      {
        nameAr: "الغرفة",
        nameEn: "Room",
        kind: "bedroom",
        position: 1,
        beds: [
          { bedType: "single", count: 4 },
        ],
      },
    ],
    amenities: ["wifi", "ac", "heater", "tv", "fridge", "kettle", "safe", "hairdryer", "wardrobe", "iron"],
  },
];

// ────────────────────────────────────────────────────────────────────────
// Seed function
// ────────────────────────────────────────────────────────────────────────

export async function seedUnitTypes(client: PrismaClient = prisma) {
  console.log("🛏️  تهيئة أنواع الوحدات (UnitType catalog)...");

  // 1) Amenities (upsert)
  for (const a of AMENITIES) {
    await client.amenity.upsert({
      where: { code: a.code },
      update: {
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        icon: a.icon ?? null,
        category: a.category,
      },
      create: {
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        icon: a.icon ?? null,
        category: a.category,
      },
    });
  }
  console.log(`   ✓ مرافق مهيّأة: ${AMENITIES.length}`);

  // Build amenity code → id lookup
  const amenities = await client.amenity.findMany();
  const amenityIdByCode = new Map(amenities.map((a) => [a.code, a.id]));

  // 2) UnitTypes + rooms + beds + amenities (idempotent replace-children pattern)
  let created = 0;
  let updated = 0;
  for (const t of UNIT_TYPES) {
    const existing = await client.unitType.findUnique({ where: { code: t.code } });

    const baseData: Prisma.UnitTypeUncheckedCreateInput = {
      code: t.code,
      nameAr: t.nameAr,
      nameEn: t.nameEn,
      category: t.category,
      descriptionAr: t.descriptionAr ?? null,
      descriptionEn: t.descriptionEn ?? null,
      maxAdults: t.maxAdults,
      maxChildren: t.maxChildren,
      maxOccupancy: t.maxOccupancy,
      sizeSqm: t.sizeSqm ?? null,
      hasKitchen: t.hasKitchen ?? false,
      hasBalcony: t.hasBalcony ?? false,
      view: t.view ?? null,
      sortOrder: t.sortOrder,
    };

    const unitType = await client.unitType.upsert({
      where: { code: t.code },
      update: baseData,
      create: baseData,
    });

    if (existing) updated++;
    else created++;

    // Replace rooms/beds: simpler & guaranteed to match canonical definition.
    // Cascade removes child beds automatically.
    await client.unitTypeRoom.deleteMany({ where: { unitTypeId: unitType.id } });

    for (const r of t.rooms) {
      const room = await client.unitTypeRoom.create({
        data: {
          unitTypeId: unitType.id,
          nameAr: r.nameAr,
          nameEn: r.nameEn,
          kind: r.kind,
          position: r.position ?? 0,
        },
      });

      if (r.beds.length > 0) {
        await client.unitTypeBed.createMany({
          data: r.beds.map((b) => ({
            roomId: room.id,
            bedType: b.bedType,
            count: b.count ?? 1,
            sleepsExtra: b.sleepsExtra ?? false,
            notes: b.notes ?? null,
          })),
        });
      }
    }

    // Replace amenities
    await client.unitTypeAmenity.deleteMany({ where: { unitTypeId: unitType.id } });
    const amenityLinks = t.amenities
      .map((code) => amenityIdByCode.get(code))
      .filter((id): id is number => typeof id === "number")
      .map((amenityId) => ({ unitTypeId: unitType.id, amenityId }));
    if (amenityLinks.length > 0) {
      await client.unitTypeAmenity.createMany({ data: amenityLinks });
    }
  }

  console.log(`   ✓ أنواع الوحدات: ${created} جديد، ${updated} محدّث`);
  console.log(`   ✓ إجمالي الأنواع في القاعدة: ${UNIT_TYPES.length}`);
}

// ────────────────────────────────────────────────────────────────────────
// Standalone runner
// ────────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await seedUnitTypes();
    console.log("\n✅ انتهت تهيئة أنواع الوحدات بنجاح.");
  } catch (err) {
    console.error("❌ فشلت التهيئة:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (not when imported).
if (require.main === module) {
  main();
}

