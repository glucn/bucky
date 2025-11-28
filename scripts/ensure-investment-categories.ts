/**
 * Script to ensure investment-related category accounts exist in the database.
 * This script is safe to run multiple times - it only creates missing accounts.
 */

import { PrismaClient, AccountSubtype } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./dev.db',
    },
  },
});

const REQUIRED_CATEGORIES = [
  { name: 'Dividend Income', subtype: AccountSubtype.asset },
  { name: 'Interest Income', subtype: AccountSubtype.asset },
  { name: 'Realized Gains/Losses', subtype: AccountSubtype.asset },
  { name: 'Investment Expenses', subtype: AccountSubtype.liability },
];

async function ensureInvestmentCategories() {
  console.log('Checking for required investment category accounts...\n');

  for (const category of REQUIRED_CATEGORIES) {
    // Check if account already exists
    const existing = await prisma.account.findFirst({
      where: {
        name: category.name,
        type: 'category',
      },
    });

    if (existing) {
      console.log(`✓ "${category.name}" already exists (ID: ${existing.id})`);
    } else {
      // Create the account
      const created = await prisma.account.create({
        data: {
          name: category.name,
          type: 'category',
          subtype: category.subtype,
          currency: 'USD',
        },
      });
      console.log(`✓ Created "${category.name}" (ID: ${created.id})`);
    }
  }

  console.log('\n✅ All required investment category accounts are present.');
}

async function main() {
  try {
    await ensureInvestmentCategories();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
