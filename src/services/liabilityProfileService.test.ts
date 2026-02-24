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
});
