import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create default categories
  const defaultCategories = [
    // Income categories
    { name: "Salary", type: "income" },
    { name: "Freelance", type: "income" },
    { name: "Investment", type: "income" },
    { name: "Gifts", type: "income" },
    { name: "Other Income", type: "income" },

    // Expense categories
    { name: "Food & Dining", type: "expense" },
    { name: "Shopping", type: "expense" },
    { name: "Housing", type: "expense" },
    { name: "Transportation", type: "expense" },
    { name: "Entertainment", type: "expense" },
    { name: "Healthcare", type: "expense" },
    { name: "Education", type: "expense" },
    { name: "Utilities", type: "expense" },
    { name: "Other Expense", type: "expense" },
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
