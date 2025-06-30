import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create default categories
  const defaultCategories = [
    // Income categories
    { name: "Salary", type: "category" },
    { name: "Freelance", type: "category" },
    { name: "Investment", type: "category" },
    { name: "Gifts", type: "category" },
    { name: "Other Income", type: "category" },

    // Expense categories
    { name: "Food & Dining", type: "category" },
    { name: "Shopping", type: "category" },
    { name: "Housing", type: "category" },
    { name: "Transportation", type: "category" },
    { name: "Entertainment", type: "category" },
    { name: "Healthcare", type: "category" },
    { name: "Education", type: "category" },
    { name: "Utilities", type: "category" },
    { name: "Other Expense", type: "category" },
  ];

  for (const category of defaultCategories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  console.log("Default categories created successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
