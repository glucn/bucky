import { PrismaClient, Prisma } from "@prisma/client";
import { databaseService } from "./database";
import { creditCardService } from "./creditCardService";
import { parseToStandardDate } from "../shared/dateUtils";
import { AccountSubtype } from "../shared/accountTypes";
import {
  LiabilityDueScheduleType,
  LiabilityMinimumPaymentType,
  LiabilityPaymentFrequency,
  LiabilityProfileInput,
  LiabilityRepaymentMethod,
  LiabilityTemplate,
} from "../shared/liabilityTypes";

type TransactionClient = Prisma.TransactionClient;

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function assertDayOfMonth(value: number | undefined, field: string): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`${field} must be an integer between 1 and 31`);
  }
}

function assertWeekday(value: number | undefined, field: string): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    throw new Error(`${field} must be an integer between 0 and 6`);
  }
}

function getExpectedDueScheduleType(
  paymentFrequency: LiabilityPaymentFrequency | undefined
): LiabilityDueScheduleType | undefined {
  if (!paymentFrequency) return undefined;
  if (paymentFrequency === LiabilityPaymentFrequency.Monthly) return LiabilityDueScheduleType.MonthlyDay;
  if (paymentFrequency === LiabilityPaymentFrequency.Weekly) return LiabilityDueScheduleType.WeeklyWeekday;
  return LiabilityDueScheduleType.BiweeklyWeekdayAnchor;
}

function normalizeLoanScheduleInput(input: LiabilityProfileInput): LiabilityProfileInput {
  if (input.template !== LiabilityTemplate.LoanMortgage) {
    return input;
  }

  const expectedDueScheduleType = getExpectedDueScheduleType(input.paymentFrequency);
  const dueScheduleType = expectedDueScheduleType ?? input.dueScheduleType;

  return {
    ...input,
    dueScheduleType,
    dueDayOfMonth: dueScheduleType === LiabilityDueScheduleType.MonthlyDay ? input.dueDayOfMonth : undefined,
    dueWeekday:
      dueScheduleType === LiabilityDueScheduleType.WeeklyWeekday ||
      dueScheduleType === LiabilityDueScheduleType.BiweeklyWeekdayAnchor
        ? input.dueWeekday
        : undefined,
    anchorDate:
      dueScheduleType === LiabilityDueScheduleType.WeeklyWeekday ||
      dueScheduleType === LiabilityDueScheduleType.BiweeklyWeekdayAnchor
        ? input.anchorDate
        : undefined,
  };
}

class LiabilityProfileService {
  private static instance: LiabilityProfileService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = (databaseService as any).prisma;
  }

  public static getInstance(): LiabilityProfileService {
    if (!LiabilityProfileService.instance) {
      LiabilityProfileService.instance = new LiabilityProfileService();
    }
    return LiabilityProfileService.instance;
  }

  private async ensureLiabilityAccount(accountId: string, tx?: TransactionClient): Promise<void> {
    const prisma = tx || this.prisma;
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new Error("Account not found");
    }
    if (account.subtype !== AccountSubtype.Liability) {
      throw new Error("Liability profile is only supported for liability accounts");
    }
  }

  private validateTemplateFields(template: LiabilityTemplate, input: LiabilityProfileInput): void {
    assertDayOfMonth(input.statementClosingDay, "statementClosingDay");
    assertDayOfMonth(input.paymentDueDay, "paymentDueDay");
    assertDayOfMonth(input.dueDayOfMonth, "dueDayOfMonth");
    assertWeekday(input.dueWeekday, "dueWeekday");

    if (input.anchorDate) {
      const parsed = parseToStandardDate(input.anchorDate);
      if (!parsed) {
        throw new Error("anchorDate must be in YYYY-MM-DD format");
      }
    }

    if (input.minimumPaymentPercent !== undefined) {
      if (input.minimumPaymentPercent < 0 || input.minimumPaymentPercent > 1) {
        throw new Error("minimumPaymentPercent must be between 0 and 1");
      }
    }

    if (input.interestRate !== undefined) {
      if (input.interestRate < 0 || input.interestRate > 1) {
        throw new Error("interestRate must be between 0 and 1");
      }
    }

    if (template === LiabilityTemplate.CreditCard) {
      if (input.limitOrCeiling === undefined) throw new Error("limitOrCeiling is required for credit card");
      if (input.statementClosingDay === undefined) throw new Error("statementClosingDay is required for credit card");
      if (input.paymentDueDay === undefined) throw new Error("paymentDueDay is required for credit card");
      if (!input.minimumPaymentType) throw new Error("minimumPaymentType is required for credit card");

      if (
        input.minimumPaymentType === LiabilityMinimumPaymentType.Percent &&
        input.minimumPaymentPercent === undefined
      ) {
        throw new Error("minimumPaymentPercent is required when minimumPaymentType=percent");
      }
      if (
        input.minimumPaymentType === LiabilityMinimumPaymentType.Amount &&
        input.minimumPaymentAmount === undefined
      ) {
        throw new Error("minimumPaymentAmount is required when minimumPaymentType=amount");
      }
      if (
        input.minimumPaymentType === LiabilityMinimumPaymentType.Both &&
        (input.minimumPaymentPercent === undefined || input.minimumPaymentAmount === undefined)
      ) {
        throw new Error("minimumPaymentPercent and minimumPaymentAmount are required when minimumPaymentType=both");
      }
    }

    if (template === LiabilityTemplate.LoanMortgage) {
      if (input.interestRate === undefined) throw new Error("interestRate is required for loan/mortgage");
      if (input.scheduledPaymentAmount === undefined) throw new Error("scheduledPaymentAmount is required for loan/mortgage");
      if (!input.paymentFrequency) throw new Error("paymentFrequency is required for loan/mortgage");
      if (input.paymentDueDay === undefined) throw new Error("paymentDueDay is required for loan/mortgage");
      if (!input.repaymentMethod) throw new Error("repaymentMethod is required for loan/mortgage");
      if (!input.dueScheduleType) throw new Error("dueScheduleType is required for loan/mortgage");

      if (input.dueScheduleType === LiabilityDueScheduleType.MonthlyDay && input.dueDayOfMonth === undefined) {
        throw new Error("dueDayOfMonth is required for monthly due schedule");
      }
      if (
        (input.dueScheduleType === LiabilityDueScheduleType.WeeklyWeekday ||
          input.dueScheduleType === LiabilityDueScheduleType.BiweeklyWeekdayAnchor) &&
        (input.dueWeekday === undefined || !input.anchorDate)
      ) {
        throw new Error("dueWeekday and anchorDate are required for weekly/biweekly due schedule");
      }
    }

    if (template === LiabilityTemplate.PersonalDebt) {
      if (!input.counterpartyName?.trim()) {
        throw new Error("counterpartyName is required for personal debt");
      }
    }
  }

  private parseEffectiveDate(input: string | undefined): string {
    if (!input) return todayIsoDate();
    const parsed = parseToStandardDate(input);
    if (!parsed) {
      throw new Error("effectiveDate must be in YYYY-MM-DD format");
    }
    return parsed;
  }

  public async getLiabilityProfile(accountId: string, tx?: TransactionClient): Promise<any> {
    const prisma = tx || this.prisma;
    await this.ensureLiabilityAccount(accountId, tx);

    const profile = await prisma.liabilityProfile.findUnique({
      where: { accountId },
      include: {
        revolvingTerms: true,
        installmentTerms: true,
        counterparty: true,
      },
    });

    const rawBalance = await databaseService.getAccountBalance(accountId, tx);
    const currentAmountOwed = Math.max(0, Math.round(-rawBalance * 100) / 100);
    const hasPostedTransactions =
      (await prisma.journalLine.count({
        where: {
          accountId,
          entry: {
            OR: [{ entryType: null }, { entryType: { not: "opening-balance" } }],
          },
        },
      })) > 0;

    if (!profile) {
      const legacy = await creditCardService.getCurrentCreditCardProperties(accountId, tx);
      if (!legacy) {
        return null;
      }

      return {
        accountId,
        template: LiabilityTemplate.CreditCard,
        currentAmountOwed,
        effectiveDate: legacy.effectiveDate,
        limitOrCeiling: legacy.creditLimit,
        statementClosingDay: legacy.statementClosingDay,
        paymentDueDay: legacy.paymentDueDay,
        minimumPaymentType:
          legacy.minimumPaymentPercent !== undefined && legacy.minimumPaymentAmount !== undefined
            ? LiabilityMinimumPaymentType.Both
            : legacy.minimumPaymentPercent !== undefined
              ? LiabilityMinimumPaymentType.Percent
              : LiabilityMinimumPaymentType.Amount,
        minimumPaymentPercent: legacy.minimumPaymentPercent ?? null,
        minimumPaymentAmount: legacy.minimumPaymentAmount ?? null,
        interestRate: legacy.interestRate,
        hasPostedTransactions,
        source: "legacy-credit-card",
      };
    }

    return {
      id: profile.id,
      accountId,
      template: profile.template,
      meta: profile.meta ? JSON.parse(profile.meta) : null,
      currentAmountOwed,
      ...profile.revolvingTerms,
      ...profile.installmentTerms,
      dueScheduleType:
        getExpectedDueScheduleType(
          (profile.installmentTerms?.paymentFrequency as LiabilityPaymentFrequency | undefined) ?? undefined
        ) ?? null,
      counterpartyName: profile.counterparty?.counterpartyName ?? null,
      hasPostedTransactions,
      source: "liability-profile",
    };
  }

  public async upsertLiabilityProfile(accountId: string, input: LiabilityProfileInput, tx?: TransactionClient): Promise<any> {
    const prisma = tx || this.prisma;
    await this.ensureLiabilityAccount(accountId, tx);
    const normalizedInput = normalizeLoanScheduleInput(input);
    this.validateTemplateFields(normalizedInput.template, normalizedInput);

    if (!tx) {
      return this.prisma.$transaction((trx) => this.upsertLiabilityProfile(accountId, normalizedInput, trx));
    }

    const profile = await prisma.liabilityProfile.upsert({
      where: { accountId },
      create: {
        accountId,
        template: normalizedInput.template,
        meta: normalizedInput.meta ? JSON.stringify(normalizedInput.meta) : null,
      },
      update: {
        template: normalizedInput.template,
        meta: normalizedInput.meta ? JSON.stringify(normalizedInput.meta) : undefined,
      },
    });

    await prisma.liabilityRevolvingTerms.upsert({
      where: { profileId: profile.id },
      create: {
        profileId: profile.id,
        limitOrCeiling: normalizedInput.limitOrCeiling,
        statementClosingDay: normalizedInput.statementClosingDay,
        paymentDueDay: normalizedInput.paymentDueDay,
        minimumPaymentType: normalizedInput.minimumPaymentType,
        minimumPaymentPercent: normalizedInput.minimumPaymentPercent,
        minimumPaymentAmount: normalizedInput.minimumPaymentAmount,
      },
      update: {
        limitOrCeiling: normalizedInput.limitOrCeiling,
        statementClosingDay: normalizedInput.statementClosingDay,
        paymentDueDay: normalizedInput.paymentDueDay,
        minimumPaymentType: normalizedInput.minimumPaymentType,
        minimumPaymentPercent: normalizedInput.minimumPaymentPercent,
        minimumPaymentAmount: normalizedInput.minimumPaymentAmount,
      },
    });

    await prisma.liabilityInstallmentTerms.upsert({
      where: { profileId: profile.id },
      create: {
        profileId: profile.id,
        scheduledPaymentAmount: normalizedInput.scheduledPaymentAmount,
        paymentFrequency: normalizedInput.paymentFrequency,
        dueDayOfMonth: normalizedInput.dueDayOfMonth,
        dueWeekday: normalizedInput.dueWeekday,
        anchorDate: normalizedInput.anchorDate,
        paymentDueDay: normalizedInput.paymentDueDay,
        repaymentMethod: normalizedInput.repaymentMethod,
        originalPrincipal: normalizedInput.originalPrincipal,
      },
      update: {
        scheduledPaymentAmount: normalizedInput.scheduledPaymentAmount,
        paymentFrequency: normalizedInput.paymentFrequency,
        dueDayOfMonth: normalizedInput.dueDayOfMonth,
        dueWeekday: normalizedInput.dueWeekday,
        anchorDate: normalizedInput.anchorDate,
        paymentDueDay: normalizedInput.paymentDueDay,
        repaymentMethod: normalizedInput.repaymentMethod,
        originalPrincipal: normalizedInput.originalPrincipal,
      },
    });

    if (normalizedInput.counterpartyName?.trim()) {
      await prisma.liabilityCounterparty.upsert({
        where: { profileId: profile.id },
        create: {
          profileId: profile.id,
          counterpartyName: normalizedInput.counterpartyName.trim(),
        },
        update: {
          counterpartyName: normalizedInput.counterpartyName.trim(),
        },
      });
    }

    if (normalizedInput.currentAmountOwed !== undefined) {
      if (!normalizedInput.asOfDate) {
        throw new Error("asOfDate is required when currentAmountOwed is provided");
      }
      await databaseService.setOpeningBalance({
        accountId,
        displayAmount: normalizedInput.currentAmountOwed,
        asOfDate: normalizedInput.asOfDate,
      }, tx);
    }

    await this.createVersionSnapshot(accountId, {
      ...normalizedInput,
      template: normalizedInput.template,
      effectiveDate: this.parseEffectiveDate(normalizedInput.effectiveDate),
    }, tx);

    return this.getLiabilityProfile(accountId, tx);
  }

  public async createVersionSnapshot(accountId: string, input: LiabilityProfileInput, tx?: TransactionClient): Promise<any> {
    const prisma = tx || this.prisma;
    await this.ensureLiabilityAccount(accountId, tx);
    const normalizedInput = normalizeLoanScheduleInput(input);

    if (!tx) {
      return this.prisma.$transaction((trx) => this.createVersionSnapshot(accountId, normalizedInput, trx));
    }

    const profile = await prisma.liabilityProfile.findUnique({ where: { accountId } });
    if (!profile) {
      throw new Error("Liability profile not found");
    }

    const effectiveDate = this.parseEffectiveDate(normalizedInput.effectiveDate);

    const existing = await prisma.liabilityProfileVersion.findUnique({
      where: {
        profileId_effectiveDate: {
          profileId: profile.id,
          effectiveDate,
        },
      },
    });
    if (existing) {
      throw new Error("A version already exists for the provided effectiveDate");
    }

    return prisma.liabilityProfileVersion.create({
      data: {
        profileId: profile.id,
        effectiveDate,
        template: normalizedInput.template || profile.template,
        changeNote: normalizedInput.changeNote,
        counterpartyName: normalizedInput.counterpartyName,
        limitOrCeiling: normalizedInput.limitOrCeiling,
        statementClosingDay: normalizedInput.statementClosingDay,
        paymentDueDay: normalizedInput.paymentDueDay,
        minimumPaymentType: normalizedInput.minimumPaymentType,
        minimumPaymentPercent: normalizedInput.minimumPaymentPercent,
        minimumPaymentAmount: normalizedInput.minimumPaymentAmount,
        interestRate: normalizedInput.interestRate,
        scheduledPaymentAmount: normalizedInput.scheduledPaymentAmount,
        paymentFrequency: normalizedInput.paymentFrequency,
        dueDayOfMonth: normalizedInput.dueDayOfMonth,
        dueWeekday: normalizedInput.dueWeekday,
        anchorDate: normalizedInput.anchorDate,
        repaymentMethod: normalizedInput.repaymentMethod,
        originalPrincipal: normalizedInput.originalPrincipal,
      },
    });
  }

  public async convertTemplate(
    accountId: string,
    targetTemplate: LiabilityTemplate,
    input: Omit<LiabilityProfileInput, "template">,
    tx?: TransactionClient
  ): Promise<any> {
    return this.upsertLiabilityProfile(accountId, { ...input, template: targetTemplate }, tx);
  }

  public async getVersionHistory(accountId: string, tx?: TransactionClient): Promise<any[]> {
    const prisma = tx || this.prisma;
    await this.ensureLiabilityAccount(accountId, tx);
    const profile = await prisma.liabilityProfile.findUnique({ where: { accountId } });
    if (!profile) return [];

    return prisma.liabilityProfileVersion.findMany({
      where: { profileId: profile.id },
      orderBy: { effectiveDate: "desc" },
    });
  }

  public async getLiabilityMetrics(accountId: string, tx?: TransactionClient): Promise<any> {
    const profile = await this.getLiabilityProfile(accountId, tx);
    if (!profile) {
      return {
        accountId,
        currentAmountOwed: 0,
      };
    }

    const currentAmountOwed = profile.currentAmountOwed || 0;
    const limit = profile.limitOrCeiling;

    let availableCredit: number | null = null;
    let utilization: number | null = null;
    if (typeof limit === "number" && limit > 0) {
      availableCredit = Math.max(0, Math.round((limit - currentAmountOwed) * 100) / 100);
      utilization = Math.round(Math.min(100, (currentAmountOwed / limit) * 100) * 100) / 100;
    }

    let minimumPayment: number | null = null;
    if (profile.minimumPaymentType) {
      let minByPercent = 0;
      if (typeof profile.minimumPaymentPercent === "number") {
        minByPercent = currentAmountOwed * profile.minimumPaymentPercent;
      }
      let minByAmount = 0;
      if (typeof profile.minimumPaymentAmount === "number") {
        minByAmount = profile.minimumPaymentAmount;
      }
      minimumPayment = Math.round(Math.max(minByPercent, minByAmount) * 100) / 100;
    }

    return {
      accountId,
      template: profile.template,
      currentAmountOwed,
      availableCredit,
      utilization,
      minimumPayment,
      limitOrCeiling: limit ?? null,
    };
  }
}

export const liabilityProfileService = LiabilityProfileService.getInstance();
