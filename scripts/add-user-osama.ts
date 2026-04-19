import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "osamaqazan89@gmail.com";
  const username = "osama";
  const password = "osama123";
  const name = "أسامة";
  const role = "admin";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      username,
      passwordHash,
      role,
      name,
    },
    create: {
      email,
      username,
      name,
      role,
      passwordHash,
    },
  });

  console.log(`✅ User ready: #${user.id} ${user.name} <${user.email}> (username=${user.username}, role=${user.role})`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
