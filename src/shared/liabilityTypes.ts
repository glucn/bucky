export enum LiabilityTemplate {
  CreditCard = "credit_card",
  LoanMortgage = "loan_mortgage",
  PersonalDebt = "personal_debt",
  Blank = "blank",
}

export enum LiabilityMinimumPaymentType {
  Percent = "percent",
  Amount = "amount",
  Both = "both",
}

export enum LiabilityPaymentFrequency {
  Weekly = "weekly",
  Biweekly = "biweekly",
  Monthly = "monthly",
}

export enum LiabilityDueScheduleType {
  MonthlyDay = "monthly_day",
  WeeklyWeekday = "weekly_weekday",
  BiweeklyWeekdayAnchor = "biweekly_weekday_anchor",
}

export enum LiabilityRepaymentMethod {
  FixedPayment = "fixed_payment",
  FixedPrincipal = "fixed_principal",
  ManualFixedPayment = "manual_fixed_payment",
}

export type LiabilityDueSchedule = {
  dueScheduleType: LiabilityDueScheduleType;
  dueDayOfMonth?: number;
  dueWeekday?: number;
  anchorDate?: string;
};

export type LiabilityVersionSnapshot = {
  template: LiabilityTemplate;
  effectiveDate: string;
  changeNote?: string | null;
  counterpartyName?: string | null;
  limitOrCeiling?: number | null;
  statementClosingDay?: number | null;
  paymentDueDay?: number | null;
  minimumPaymentType?: LiabilityMinimumPaymentType | null;
  minimumPaymentPercent?: number | null;
  minimumPaymentAmount?: number | null;
  interestRate?: number | null;
  scheduledPaymentAmount?: number | null;
  paymentFrequency?: LiabilityPaymentFrequency | null;
  dueScheduleType?: LiabilityDueScheduleType | null;
  dueDayOfMonth?: number | null;
  dueWeekday?: number | null;
  anchorDate?: string | null;
  repaymentMethod?: LiabilityRepaymentMethod | null;
  originalPrincipal?: number | null;
};
