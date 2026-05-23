import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('Admin@1234', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@optraassistant.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@optraassistant.com',
      passwordHash: hash,
      emailVerified: true,
      status: 'ACTIVE',
      role: 'ADMIN',
    },
  })
  console.log('Seeded admin:', admin.email)
}

main().catch(console.error).finally(() => prisma.$disconnect())
