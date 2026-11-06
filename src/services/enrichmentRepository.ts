import { databaseService } from "./database";
import { Prisma } from "@prisma/client";
import { securityMarketData } from "./securityMarketData";
import { parseSecurityIdentity } from "../shared/securityMarket";

type SecurityKey = {
  ticker: string;
  market: string;
};

type FxKey = {
  sourceCurrency: string;
  targetCurrency: string;
};

class EnrichmentRepository {
  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  async upsertSecurityMetadataFillMissing(input: {
    ticker: string;
    market: string;
    displayName: string | null;
    assetType: string | null;
    quoteCurrency: string | null;
  }) {
    const key = parseSecurityIdentity({ ticker: input.ticker, market: input.market });
    return databaseService.prismaClient.$transaction(async (tx) => {
      const existing = await tx.securityMetadata.findUnique({ where: { ticker_market: key } });
      if (!existing) return tx.securityMetadata.create({ data: { ...input, ...key, lastFetchedAt: new Date() } });
      if (existing.quoteCurrency && input.quoteCurrency && existing.quoteCurrency !== input.quoteCurrency) {
        throw new Error("Stored market quote currency conflicts with the provider");
      }
      return tx.securityMetadata.update({ where: { ticker_market: key }, data: {
        displayName: existing.displayName ?? input.displayName,
        assetType: existing.assetType ?? input.assetType,
        quoteCurrency: existing.quoteCurrency ?? input.quoteCurrency,
        lastFetchedAt: new Date(),
      } });
    });
  }

  async insertMissingSecurityDailyPrices(
    key: SecurityKey,
    points: Array<{ marketDate: string; close: number }>
  ) {
    if (points.length === 0) {
      return;
    }

    await securityMarketData.write({ identity: key, points: points.map((point) => ({ date: point.marketDate, price: point.close })), mode: "fill", source: "provider" });
  }

  async insertMissingFxDailyRates(
    key: FxKey,
    points: Array<{ marketDate: string; rate: number }>
  ) {
    if (points.length === 0) {
      return;
    }

    for (const point of points) {
      try {
        await databaseService.prismaClient.fxDailyRate.create({
          data: {
            sourceCurrency: key.sourceCurrency,
            targetCurrency: key.targetCurrency,
            marketDate: point.marketDate,
            rate: point.rate,
            fetchedAt: new Date(),
          },
        });
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }
      }
    }
  }

  async getLatestSecurityPriceDate(key: SecurityKey): Promise<string | null> {
    const latest = await databaseService.prismaClient.securityDailyPrice.findFirst({
      where: {
        ticker: key.ticker,
        market: key.market,
        source: "provider",
        marketDate: { lte: new Date().toISOString().slice(0, 10) },
      },
      orderBy: {
        marketDate: "desc",
      },
      select: {
        marketDate: true,
      },
    });

    return latest?.marketDate ?? null;
  }

  async getLatestFxRateDate(key: FxKey): Promise<string | null> {
    const latest = await databaseService.prismaClient.fxDailyRate.findFirst({
      where: {
        sourceCurrency: key.sourceCurrency,
        targetCurrency: key.targetCurrency,
      },
      orderBy: {
        marketDate: "desc",
      },
      select: {
        marketDate: true,
      },
    });

    return latest?.marketDate ?? null;
  }

  async getCategoryFreshness(): Promise<{
    metadata: Date | null;
    prices: Date | null;
    fx: Date | null;
  }> {
    const [metadata, prices, fx] = await Promise.all([
      databaseService.prismaClient.securityMetadata.aggregate({
        _max: { lastFetchedAt: true },
      }),
      databaseService.prismaClient.securityDailyPrice.aggregate({
        _max: { fetchedAt: true },
      }),
      databaseService.prismaClient.fxDailyRate.aggregate({
        _max: { fetchedAt: true },
      }),
    ]);

    return {
      metadata: metadata._max.lastFetchedAt,
      prices: prices._max.fetchedAt,
      fx: fx._max.fetchedAt,
    };
  }
}

export const enrichmentRepository = new EnrichmentRepository();
