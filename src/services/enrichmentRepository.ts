import { databaseService } from "./database";
import { Prisma } from "@prisma/client";

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
    const existing = await databaseService.prismaClient.securityMetadata.findUnique({
      where: {
        ticker_market: {
          ticker: input.ticker,
          market: input.market,
        },
      },
    });

    if (!existing) {
      return databaseService.prismaClient.securityMetadata.create({
        data: {
          ...input,
          lastFetchedAt: new Date(),
        },
      });
    }

    return databaseService.prismaClient.securityMetadata.update({
      where: {
        ticker_market: {
          ticker: input.ticker,
          market: input.market,
        },
      },
      data: {
        displayName: existing.displayName ?? input.displayName,
        assetType: existing.assetType ?? input.assetType,
        quoteCurrency: existing.quoteCurrency ?? input.quoteCurrency,
        lastFetchedAt: new Date(),
      },
    });
  }

  async insertMissingSecurityDailyPrices(
    key: SecurityKey,
    points: Array<{ marketDate: string; close: number }>
  ) {
    if (points.length === 0) {
      return;
    }

    for (const point of points) {
      try {
        await databaseService.prismaClient.securityDailyPrice.create({
          data: {
            ticker: key.ticker,
            market: key.market,
            marketDate: point.marketDate,
            close: point.close,
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
