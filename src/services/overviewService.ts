import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { OverviewDashboardPayload } from "../shared/overview";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";

function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getRecentMonthKeys(asOfDate: string, count: number): string[] {
  const [year, month] = asOfDate.split("-").map((value) => Number(value));
  const result: string[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(year, month - 1 - index, 1);
    result.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  return result;
}

class OverviewService {
  private async getBalanceAsOfDate(accountId: string, asOfDate: string): Promise<number> {
    const lines = await databaseService.prismaClient.journalLine.findMany({
      where: {
        accountId,
        entry: {
          date: {
            lte: asOfDate,
          },
        },
      },
      select: { amount: true },
    });

    return round2(lines.reduce((sum, line) => sum + line.amount, 0));
  }

  public async getOverviewDashboard(asOfDate?: string): Promise<OverviewDashboardPayload> {
    const effectiveAsOfDate = asOfDate ?? getLocalDateString(new Date());

    const userAccounts = await databaseService.prismaClient.account.findMany({
      where: { type: AccountType.User },
      include: { investmentProperties: true },
      orderBy: { createdAt: "asc" },
    });

    const reportingCurrency = userAccounts[0]?.currency ?? "USD";
    let assetTotal = 0;
    let liabilityTotal = 0;

    for (const account of userAccounts) {
      let balance = await this.getBalanceAsOfDate(account.id, effectiveAsOfDate);

      if (account.investmentProperties) {
        const positionDetails = await investmentService.getPositionDetails(
          account.id,
          effectiveAsOfDate
        );
        balance = positionDetails.marketValue ?? positionDetails.costBasis;
      }

      if (account.subtype === AccountSubtype.Liability) {
        liabilityTotal += Math.abs(balance);
      } else {
        assetTotal += balance;
      }
    }

    return {
      asOfDate: effectiveAsOfDate,
      netWorth: {
        amount: round2(assetTotal - liabilityTotal),
        currency: reportingCurrency,
      },
      incomeExpenseTrend6m: {
        currency: reportingCurrency,
        months: getRecentMonthKeys(effectiveAsOfDate, 6).map((monthKey) => ({
          monthKey,
          income: 0,
          expense: 0,
        })),
      },
      investmentAllocation: {
        hasData: false,
        currency: reportingCurrency,
        total: 0,
        slices: [],
        emptyHintKey: "overview.investmentAllocation.empty",
      },
      metadata: {
        usedEstimatedFxRate: false,
        missingFxPairs: [],
      },
    };
  }
}

export const overviewService = new OverviewService();
