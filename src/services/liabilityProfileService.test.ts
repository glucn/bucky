import { beforeEach, describe, expect, it } from "vitest";
import { databaseService } from "./database";
import { liabilityProfileService } from "./liabilityProfileService";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import {
  LiabilityDueScheduleType,
  LiabilityMinimumPaymentType,
  LiabilityPaymentFrequency,
  LiabilityRepaymentMethod,
  LiabilityTemplate,
} from "../shared/liabilityTypes";

function localTodayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

describe("LiabilityProfileService", () => {
  beforeEach(async () => {
    await databaseService.resetAllData();
  });

  async function createLiabilityAccount(name = "Test Liability") {
    return databaseService.createAccount({
      name,
      type: AccountType.User,
      subtype: AccountSubtype.Liability,
      currency: "USD",
    });
  }

  it("enforces required fields for credit card template", async () => {
    const account = await createLiabilityAccount();

    await expect(
      liabilityProfileService.upsertLiabilityProfile(account.id, {
        template: LiabilityTemplate.CreditCard,
      })
    ).rejects.toThrow("limitOrCeiling is required");
  });

  it("creates profile and metrics for credit card liability", async () => {
    const account = await createLiabilityAccount("Visa");

    await liabilityProfileService.upsertLiabilityProfile(account.id, {
      template: LiabilityTemplate.CreditCard,
      currentAmountOwed: 1200,
      asOfDate: "2026-02-01",
      limitOrCeiling: 5000,
      statementClosingDay: 20,
      paymentDueDay: 5,
      minimumPaymentType: LiabilityMinimumPaymentType.Percent,
      minimumPaymentPercent: 0.02,
      effectiveDate: "2026-02-01",
    });

    const metrics = await liabilityProfileService.getLiabilityMetrics(account.id);
    expect(metrics.currentAmountOwed).toBe(1200);
    expect(metrics.availableCredit).toBe(3800);
    expect(metrics.utilization).toBe(24);
    expect(metrics.minimumPayment).toBe(24);
  });

  it("rejects duplicate effective date versions", async () => {
    const account = await createLiabilityAccount("Mortgage");

    await liabilityProfileService.upsertLiabilityProfile(account.id, {
      template: LiabilityTemplate.LoanMortgage,
      currentAmountOwed: 200000,
      asOfDate: "2026-01-01",
      interestRate: 0.05,
      scheduledPaymentAmount: 1500,
      paymentFrequency: LiabilityPaymentFrequency.Monthly,
      paymentDueDay: 1,
      dueScheduleType: LiabilityDueScheduleType.MonthlyDay,
      dueDayOfMonth: 1,
      repaymentMethod: LiabilityRepaymentMethod.FixedPayment,
      effectiveDate: "2026-01-01",
    });

    await expect(
      liabilityProfileService.createVersionSnapshot(account.id, {
        template: LiabilityTemplate.LoanMortgage,
        interestRate: 0.049,
        effectiveDate: "2026-01-01",
      })
    ).rejects.toThrow("already exists");
  });

  it("stores backdated and newer versions in descending effective date order", async () => {
    const account = await createLiabilityAccount("Loan");

    await liabilityProfileService.upsertLiabilityProfile(account.id, {
      template: LiabilityTemplate.LoanMortgage,
      currentAmountOwed: 10000,
      asOfDate: "2026-03-01",
      interestRate: 0.08,
      scheduledPaymentAmount: 300,
      paymentFrequency: LiabilityPaymentFrequency.Monthly,
      paymentDueDay: 10,
      dueScheduleType: LiabilityDueScheduleType.MonthlyDay,
      dueDayOfMonth: 10,
      repaymentMethod: LiabilityRepaymentMethod.FixedPayment,
      effectiveDate: "2026-03-01",
    });

    await liabilityProfileService.createVersionSnapshot(account.id, {
      template: LiabilityTemplate.LoanMortgage,
      interestRate: 0.07,
      effectiveDate: "2026-05-01",
    });
    await liabilityProfileService.createVersionSnapshot(account.id, {
      template: LiabilityTemplate.LoanMortgage,
      interestRate: 0.075,
      effectiveDate: "2026-04-01",
    });

    const history = await liabilityProfileService.getVersionHistory(account.id);
    expect(history.map((h) => h.effectiveDate)).toEqual(["2026-05-01", "2026-04-01", "2026-03-01"]);
  });

  it("blocks conversion when target template required fields are missing", async () => {
    const account = await createLiabilityAccount("Generic Liability");

    await liabilityProfileService.upsertLiabilityProfile(account.id, {
      template: LiabilityTemplate.Blank,
      currentAmountOwed: 500,
      asOfDate: "2026-02-01",
      effectiveDate: "2026-02-01",
    });

    await expect(
      liabilityProfileService.convertTemplate(account.id, LiabilityTemplate.PersonalDebt, {
        effectiveDate: "2026-02-05",
      })
    ).rejects.toThrow("counterpartyName is required");
  });

  it("requires weekday and anchor date for weekly/biweekly due schedules", async () => {
    const account = await createLiabilityAccount("Weekly Loan");

    await expect(
      liabilityProfileService.upsertLiabilityProfile(account.id, {
        template: LiabilityTemplate.LoanMortgage,
        currentAmountOwed: 22000,
        asOfDate: "2026-02-01",
        interestRate: 0.05,
        scheduledPaymentAmount: 500,
        paymentFrequency: LiabilityPaymentFrequency.Weekly,
        paymentDueDay: 5,
        dueScheduleType: LiabilityDueScheduleType.WeeklyWeekday,
        repaymentMethod: LiabilityRepaymentMethod.FixedPayment,
        effectiveDate: "2026-02-01",
      })
    ).rejects.toThrow("dueWeekday and anchorDate are required");
  });

  it("derives loan due schedule from payment frequency", async () => {
    const account = await createLiabilityAccount("Derived Loan");

    await liabilityProfileService.upsertLiabilityProfile(account.id, {
      template: LiabilityTemplate.LoanMortgage,
      currentAmountOwed: 22000,
      asOfDate: "2026-02-01",
      interestRate: 0.05,
      scheduledPaymentAmount: 500,
      paymentFrequency: LiabilityPaymentFrequency.Monthly,
      paymentDueDay: 5,
      dueScheduleType: LiabilityDueScheduleType.WeeklyWeekday,
      dueDayOfMonth: 10,
      repaymentMethod: LiabilityRepaymentMethod.FixedPayment,
      effectiveDate: "2026-02-01",
    });

    const profile = await liabilityProfileService.getLiabilityProfile(account.id);
    expect(profile.paymentFrequency).toBe(LiabilityPaymentFrequency.Monthly);
    expect(profile.dueScheduleType).toBe(LiabilityDueScheduleType.MonthlyDay);
    expect(profile.dueDayOfMonth).toBe(10);
    expect(profile.dueWeekday).toBeNull();
    expect(profile.anchorDate).toBeNull();
  });

  it("uses today when effective date is omitted for version snapshots", async () => {
    const account = await createLiabilityAccount("Auto Date");

    await liabilityProfileService.upsertLiabilityProfile(account.id, {
      template: LiabilityTemplate.PersonalDebt,
      counterpartyName: "Alex",
      currentAmountOwed: 900,
      asOfDate: "2026-02-01",
      effectiveDate: "2026-02-01",
    });

    await liabilityProfileService.createVersionSnapshot(account.id, {
      template: LiabilityTemplate.PersonalDebt,
      counterpartyName: "Alex",
      changeNote: "No effective date supplied",
    });

    const history = await liabilityProfileService.getVersionHistory(account.id);
    expect(history[0].effectiveDate).toBe(localTodayIsoDate());
  });

  it("preserves hidden terms across template conversion", async () => {
    const account = await createLiabilityAccount("Template Conversion");

    await liabilityProfileService.upsertLiabilityProfile(account.id, {
      template: LiabilityTemplate.CreditCard,
      currentAmountOwed: 800,
      asOfDate: "2026-02-01",
      limitOrCeiling: 4000,
      statementClosingDay: 22,
      paymentDueDay: 8,
      minimumPaymentType: LiabilityMinimumPaymentType.Percent,
      minimumPaymentPercent: 0.03,
      effectiveDate: "2026-02-01",
    });

    await liabilityProfileService.convertTemplate(account.id, LiabilityTemplate.PersonalDebt, {
      counterpartyName: "Casey",
      effectiveDate: "2026-03-01",
    });

    const profile = await liabilityProfileService.getLiabilityProfile(account.id);
    expect(profile.template).toBe(LiabilityTemplate.PersonalDebt);
    expect(profile.limitOrCeiling).toBe(4000);
    expect(profile.minimumPaymentPercent).toBe(0.03);
  });

  it("reports posted transaction state for liability profile", async () => {
    const account = await createLiabilityAccount("Txn Flag");
    const offset = await databaseService.createAccount({
      name: "Offset Asset",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD",
    });

    await liabilityProfileService.upsertLiabilityProfile(account.id, {
      template: LiabilityTemplate.PersonalDebt,
      counterpartyName: "Jordan",
      currentAmountOwed: 100,
      asOfDate: "2026-02-01",
      effectiveDate: "2026-02-01",
    });

    const before = await liabilityProfileService.getLiabilityProfile(account.id);
    expect(before.hasPostedTransactions).toBe(false);

    await databaseService.createJournalEntry({
      date: "2026-02-10",
      description: "Liability transaction",
      fromAccountId: offset.id,
      toAccountId: account.id,
      amount: 25,
    });

    const after = await liabilityProfileService.getLiabilityProfile(account.id);
    expect(after.hasPostedTransactions).toBe(true);
  });
});
