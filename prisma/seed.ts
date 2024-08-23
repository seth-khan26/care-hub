import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("Password123!", 12);

  // Create owner user + organization
  const user = await prisma.user.upsert({
    where: { email: "admin@downtown.example" },
    update: {},
    create: {
      email: "admin@downtown.example",
      passwordHash,
      firstName: "Sarah",
      lastName: "Admin",
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "downtown-family-clinic" },
    update: {},
    create: {
      name: "Downtown Family Clinic",
      slug: "downtown-family-clinic",
      phone: "555-0100",
      email: "info@downtown.example",
      timezone: "America/New_York",
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: {},
    create: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });

  // Create second org
  const user2 = await prisma.user.upsert({
    where: { email: "admin@northside.example" },
    update: {},
    create: {
      email: "admin@northside.example",
      passwordHash,
      firstName: "Tom",
      lastName: "Owner",
    },
  });

  const org2 = await prisma.organization.upsert({
    where: { slug: "northside-medical" },
    update: {},
    create: {
      name: "Northside Medical",
      slug: "northside-medical",
      phone: "555-0200",
      timezone: "America/Chicago",
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user2.id, organizationId: org2.id } },
    update: {},
    create: { userId: user2.id, organizationId: org2.id, role: "OWNER" },
  });

  // Create location for downtown clinic
  const location = await prisma.location.upsert({
    where: { id: "loc_downtown_main" },
    update: {},
    create: {
      id: "loc_downtown_main",
      organizationId: org.id,
      name: "Main Office",
      address: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
      phone: "555-0100",
    },
  });

  // Create providers
  const provider = await prisma.provider.upsert({
    where: { id: "prov_smith" },
    update: {},
    create: {
      id: "prov_smith",
      organizationId: org.id,
      locationId: location.id,
      firstName: "James",
      lastName: "Smith",
      title: "Dr.",
      specialty: "Family Medicine",
      npi: "1234567890",
    },
  });

  // Create availability
  for (const day of [1, 2, 3, 4, 5]) {
    await prisma.providerAvailability.upsert({
      where: { id: `avail_smith_${day}` },
      update: {},
      create: {
        id: `avail_smith_${day}`,
        providerId: provider.id,
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "17:00",
        slotDuration: 30,
      },
    });
  }

  // Create a staff user for downtown clinic
  const staffUser = await prisma.user.upsert({
    where: { email: "staff@downtown.example" },
    update: {},
    create: {
      email: "staff@downtown.example",
      passwordHash,
      firstName: "Maria",
      lastName: "Staff",
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: staffUser.id, organizationId: org.id } },
    update: {},
    create: { userId: staffUser.id, organizationId: org.id, role: "STAFF" },
  });

  // Create sample patient
  await prisma.patient.upsert({
    where: { organizationId_mrn: { organizationId: org.id, mrn: "MRN-000001" } },
    update: {},
    create: {
      organizationId: org.id,
      mrn: "MRN-000001",
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: new Date("1980-05-15"),
      sex: "male",
      contact: {
        create: {
          phone: "555-1234",
          email: "john.doe@example.com",
          address: "456 Oak Ave",
          city: "New York",
          state: "NY",
          zip: "10002",
          emergencyName: "Jane Doe",
          emergencyPhone: "555-5678",
          emergencyRel: "Spouse",
        },
      },
      insurance: {
        create: {
          insurerName: "BlueCross",
          policyNumber: "BC-123456",
          groupNumber: "GRP-789",
          subscriberName: "John Doe",
          relationship: "Self",
        },
      },
    },
  });

  console.log("Seed complete!");
  console.log("Logins:");
  console.log("  Owner: admin@downtown.example / Password123! → /org/downtown-family-clinic");
  console.log("  Staff: staff@downtown.example / Password123! → /org/downtown-family-clinic");
  console.log("  Other org: admin@northside.example / Password123! → /org/northside-medical");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
