export type RevisionSummary = { id: string; reason: string; createdAt: string };
export type RevisionEvent = {
  id: string; date: string; kind: string; currency: string; quantityAfter: number; basisAfter: number; cashAmount: number;
  realizedGain: number | null;
  journals: Array<{ id: string; description: string | null; lines: Array<{ id: string; account: string; amount: number; currency: string }> }>;
};
export type RevisionDetail = RevisionSummary & {
  action: "Correction" | "Insertion" | "Void";
  changes: Array<{ before: RevisionEvent | null; after: RevisionEvent | null }>;
};
