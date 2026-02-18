import type { SecuritySearchCandidate } from "./enrichmentProviderRegistry";

export type SecurityResolutionOutcome =
  | {
      status: "auto_selected";
      selectedCandidate: SecuritySearchCandidate;
      candidates: [];
      warningMessage: null;
    }
  | {
      status: "manual_selection_required";
      selectedCandidate: null;
      candidates: SecuritySearchCandidate[];
      warningMessage: null;
    }
  | {
      status: "unresolved_allowed";
      selectedCandidate: null;
      candidates: [];
      warningMessage: string;
    };

const UNRESOLVED_WARNING =
  "Enrichment data may be unavailable for this security until it is resolved.";

export const resolveSecuritySelection = (
  candidates: SecuritySearchCandidate[]
): SecurityResolutionOutcome => {
  if (candidates.length === 1) {
    return {
      status: "auto_selected",
      selectedCandidate: candidates[0],
      candidates: [],
      warningMessage: null,
    };
  }

  if (candidates.length > 1) {
    return {
      status: "manual_selection_required",
      selectedCandidate: null,
      candidates,
      warningMessage: null,
    };
  }

  return {
    status: "unresolved_allowed",
    selectedCandidate: null,
    candidates: [],
    warningMessage: UNRESOLVED_WARNING,
  };
};
