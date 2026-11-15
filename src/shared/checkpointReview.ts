export type CheckpointReview = {
  currency: string;
  journalBalance: number;
  statementBalance: number;
  adjustmentAmount: number;
  token: string;
};

export type CheckpointReconciliationReview = CheckpointReview & {
  previousAdjustmentAmount: number | null;
};
