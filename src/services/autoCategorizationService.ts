import {
  AutoCategorizationMatchType,
  Prisma,
  PrismaClient,
  type Account,
  type AutoCategorizationRule,
} from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;
type RulePrisma = PrismaClient | TransactionClient;

export interface AutoCategorizationRuleMatch {
  id: string;
  normalizedPattern: string;
  matchType: "exact" | "keyword";
  targetCategoryAccountId: string | null;
  targetCategoryArchived: boolean;
  lastConfirmedAt: Date | null;
  updatedAt: Date;
}

export interface AutoCategorizationRuleListItem {
  id: string;
  pattern: string;
  matchType: "exact" | "keyword";
  targetCategoryAccountId: string | null;
  targetCategoryName: string | null;
  lastUpdatedAt: Date;
  status: "Valid" | "Invalid target";
}

export interface AutoCategorizationRuleUpdateInput {
  pattern: string;
  matchType: "exact" | "keyword";
  targetCategoryAccountId: string;
}

export interface AutoCategorizationMatchResult {
  rule: AutoCategorizationRuleMatch;
  matchType: "exact" | "keyword";
}

export interface ImportAutoCategorizationResolution {
  toAccountId: string | null;
  exactAutoApplied: boolean;
  keywordMatched: boolean;
}

const collapseWhitespace = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ");

export const normalizePattern = (value: string): string =>
  collapseWhitespace(value).toLowerCase();

export const isValidKeywordPattern = (value: string): boolean =>
  normalizePattern(value).length >= 3;

const getRuleTimestamp = (rule: AutoCategorizationRuleMatch): number =>
  (rule.lastConfirmedAt || rule.updatedAt).getTime();

const compareRuleSpecificity = (
  left: AutoCategorizationRuleMatch,
  right: AutoCategorizationRuleMatch
): number => {
  if (left.matchType !== right.matchType) {
    return left.matchType === "exact" ? -1 : 1;
  }

  if (left.normalizedPattern.length !== right.normalizedPattern.length) {
    return right.normalizedPattern.length - left.normalizedPattern.length;
  }

  const timestampDelta = getRuleTimestamp(right) - getRuleTimestamp(left);
  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return left.id.localeCompare(right.id);
};

export const findBestAutoCategorizationMatch = (
  rules: AutoCategorizationRuleMatch[],
  description?: string | null
): AutoCategorizationMatchResult | null => {
  const normalizedDescription = normalizePattern(description || "");
  if (!normalizedDescription) {
    return null;
  }

  const validRules = rules.filter(
    (rule) => !rule.targetCategoryArchived && Boolean(rule.targetCategoryAccountId)
  );

  const exactMatches = validRules.filter(
    (rule) =>
      rule.matchType === "exact" &&
      rule.normalizedPattern === normalizedDescription
  );
  const keywordMatches = validRules.filter(
    (rule) =>
      rule.matchType === "keyword" &&
      normalizedDescription.includes(rule.normalizedPattern)
  );

  const allMatches = [...exactMatches, ...keywordMatches].sort(compareRuleSpecificity);
  if (allMatches.length === 0) {
    return null;
  }

  return {
    rule: allMatches[0],
    matchType: allMatches[0].matchType,
  };
};

export const resolveImportAutoCategorization = (data: {
  explicitToAccountId: string | null;
  description?: string | null;
  rules: AutoCategorizationRuleMatch[];
}): ImportAutoCategorizationResolution => {
  if (data.explicitToAccountId) {
    return {
      toAccountId: data.explicitToAccountId,
      exactAutoApplied: false,
      keywordMatched: false,
    };
  }

  const match = findBestAutoCategorizationMatch(data.rules, data.description);
  if (!match) {
    return {
      toAccountId: null,
      exactAutoApplied: false,
      keywordMatched: false,
    };
  }

  if (match.matchType === "exact") {
    return {
      toAccountId: match.rule.targetCategoryAccountId,
      exactAutoApplied: Boolean(match.rule.targetCategoryAccountId),
      keywordMatched: false,
    };
  }

  return {
    toAccountId: null,
    exactAutoApplied: false,
    keywordMatched: true,
  };
};

class AutoCategorizationService {
  private toRuleMatch(
    rule: AutoCategorizationRule & { targetCategoryAccount: Account | null }
  ): AutoCategorizationRuleMatch {
    return {
      id: rule.id,
      normalizedPattern: rule.normalizedPattern,
      matchType: rule.matchType,
      targetCategoryAccountId: rule.targetCategoryAccountId,
      targetCategoryArchived: !rule.targetCategoryAccount || rule.targetCategoryAccount.isArchived,
      lastConfirmedAt: rule.lastConfirmedAt,
      updatedAt: rule.updatedAt,
    };
  }

  private async validateRuleUpdateInput(
    input: AutoCategorizationRuleUpdateInput,
    prisma: RulePrisma,
    options: { excludeRuleId?: string } = {},
  ): Promise<{ normalizedPattern: string; matchType: AutoCategorizationMatchType }> {
    const normalizedPattern = normalizePattern(input.pattern || "");
    if (!normalizedPattern) {
      throw new Error("Pattern is required");
    }

    const matchType = input.matchType;
    if (matchType !== "exact" && matchType !== "keyword") {
      throw new Error("Invalid match type");
    }

    if (matchType === "keyword" && !isValidKeywordPattern(normalizedPattern)) {
      throw new Error("Keyword pattern must be at least 3 characters");
    }

    const targetCategory = await prisma.account.findFirst({
      where: {
        id: input.targetCategoryAccountId,
        type: "category",
        isArchived: false,
      },
    });

    if (!targetCategory) {
      throw new Error("Target category must be an active category account");
    }

    const duplicate = await prisma.autoCategorizationRule.findFirst({
      where: {
        normalizedPattern,
        matchType,
        ...(options.excludeRuleId
          ? {
              NOT: {
                id: options.excludeRuleId,
              },
            }
          : {}),
      },
    });

    if (duplicate) {
      throw new Error("Rule with same pattern and match type already exists");
    }

    return {
      normalizedPattern,
      matchType,
    };
  }

  public async getRulesForImport(prisma: RulePrisma): Promise<AutoCategorizationRuleMatch[]> {
    const rules = await prisma.autoCategorizationRule.findMany({
      include: {
        targetCategoryAccount: true,
      },
    });

    return rules.map((rule) => this.toRuleMatch(rule));
  }

  public async getRulesForSettings(prisma: RulePrisma): Promise<AutoCategorizationRuleListItem[]> {
    const rules = await prisma.autoCategorizationRule.findMany({
      include: {
        targetCategoryAccount: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return rules.map((rule) => ({
      id: rule.id,
      pattern: rule.normalizedPattern,
      matchType: rule.matchType,
      targetCategoryAccountId: rule.targetCategoryAccountId,
      targetCategoryName: rule.targetCategoryAccount?.name || null,
      lastUpdatedAt: rule.updatedAt,
      status:
        !rule.targetCategoryAccount || rule.targetCategoryAccount.isArchived
          ? "Invalid target"
          : "Valid",
    }));
  }

  public async updateRule(
    ruleId: string,
    input: AutoCategorizationRuleUpdateInput,
    prisma: RulePrisma
  ): Promise<AutoCategorizationRuleListItem> {
    const { normalizedPattern, matchType } = await this.validateRuleUpdateInput(
      input,
      prisma,
      { excludeRuleId: ruleId },
    );

    const updated = await prisma.autoCategorizationRule.update({
      where: { id: ruleId },
      data: {
        normalizedPattern,
        matchType,
        targetCategoryAccountId: input.targetCategoryAccountId,
      },
      include: {
        targetCategoryAccount: true,
      },
    });

    return {
      id: updated.id,
      pattern: updated.normalizedPattern,
      matchType: updated.matchType,
      targetCategoryAccountId: updated.targetCategoryAccountId,
      targetCategoryName: updated.targetCategoryAccount?.name || null,
      lastUpdatedAt: updated.updatedAt,
      status: updated.targetCategoryAccount?.isArchived ? "Invalid target" : "Valid",
    };
  }

  public async deleteRule(ruleId: string, prisma: RulePrisma): Promise<void> {
    await prisma.autoCategorizationRule.delete({
      where: { id: ruleId },
    });
  }

  public async upsertExactRuleFromCleanupAction(
    data: {
      description?: string | null;
      targetCategoryAccountId: string;
    },
    prisma: RulePrisma
  ): Promise<AutoCategorizationRule | null> {
    const normalizedPattern = normalizePattern(data.description || "");
    if (!normalizedPattern) {
      return null;
    }

    const targetCategory = await prisma.account.findFirst({
      where: {
        id: data.targetCategoryAccountId,
        type: "category",
        isArchived: false,
      },
    });

    if (!targetCategory) {
      return null;
    }

    const now = new Date();
    const existing = await prisma.autoCategorizationRule.findUnique({
      where: {
        normalizedPattern_matchType: {
          normalizedPattern,
          matchType: "exact",
        },
      },
    });

    if (existing) {
      return prisma.autoCategorizationRule.update({
        where: { id: existing.id },
        data: {
          targetCategoryAccountId: data.targetCategoryAccountId,
          lastConfirmedAt: now,
        },
      });
    }

    return prisma.autoCategorizationRule.create({
      data: {
        normalizedPattern,
        matchType: "exact",
        targetCategoryAccountId: data.targetCategoryAccountId,
        lastConfirmedAt: now,
      },
    });
  }
}

export const autoCategorizationService = new AutoCategorizationService();
