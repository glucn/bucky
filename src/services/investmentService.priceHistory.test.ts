import { describe, it, expect, beforeEach } from "vitest";
import { investmentService } from "./investmentService";
import { databaseService } from "./database";

describe("InvestmentService - Price History Management", () => {
  beforeEach(async () => {
    // Reset database before each test
    await databaseService.resetAllData();
  });

  describe("recordMarketPrice", () => {
    it("should record a market price for a security", async () => {
      const result = await investmentService.recordMarketPrice(
        "AAPL",
        150.50,
        "2024-01-15",
        "manual"
      );

      expect(result).toBeDefined();
      expect(result.tickerSymbol).toBe("AAPL");
      expect(result.price).toBe(150.50);
      expect(result.date).toBe("2024-01-15");
      expect(result.source).toBe("manual");
    });

    it("should update existing price for same ticker and date", async () => {
      // Record initial price
      await investmentService.recordMarketPrice("MSFT", 100, "2024-01-15");

      // Update price for same date
      const result = await investmentService.recordMarketPrice(
        "MSFT",
        105,
        "2024-01-15",
        "updated"
      );

      expect(result.price).toBe(105);
      expect(result.source).toBe("updated");

      // Verify only one record exists
      const history = await investmentService.getPriceHistory("MSFT");
      expect(history).toHaveLength(1);
      expect(history[0].price).toBe(105);
    });

    it("should allow different prices for different dates", async () => {
      await investmentService.recordMarketPrice("GOOGL", 100, "2024-01-15");
      await investmentService.recordMarketPrice("GOOGL", 105, "2024-01-16");
      await investmentService.recordMarketPrice("GOOGL", 103, "2024-01-17");

      const history = await investmentService.getPriceHistory("GOOGL");
      expect(history).toHaveLength(3);
    });

    it("should validate required fields", async () => {
      await expect(
        investmentService.recordMarketPrice("", 100, "2024-01-15")
      ).rejects.toThrow("Ticker symbol is required");

      await expect(
        investmentService.recordMarketPrice("AAPL", 0, "2024-01-15")
      ).rejects.toThrow("Price must be a positive number");

      await expect(
        investmentService.recordMarketPrice("AAPL", -50, "2024-01-15")
      ).rejects.toThrow("Price must be a positive number");

      await expect(
        investmentService.recordMarketPrice("AAPL", 100, "")
      ).rejects.toThrow("Date is required");
    });

    it("should handle source as optional", async () => {
      const result = await investmentService.recordMarketPrice(
        "TSLA",
        200,
        "2024-01-15"
      );

      expect(result.source).toBeNull();
    });
  });

  describe("getMarketPrice", () => {
    it("should return price for specific ticker and date", async () => {
      await investmentService.recordMarketPrice("AAPL", 150.50, "2024-01-15");

      const price = await investmentService.getMarketPrice("AAPL", "2024-01-15");

      expect(price).toBe(150.50);
    });

    it("should return null if price not found", async () => {
      const price = await investmentService.getMarketPrice("AAPL", "2024-01-15");

      expect(price).toBeNull();
    });

    it("should use last available prior daily value when exact date is missing", async () => {
      await investmentService.recordMarketPrice("MSFT", 100, "2024-01-15");

      const price = await investmentService.getMarketPrice("MSFT", "2024-01-16");

      expect(price).toBe(100);
    });

    it("should return null when no prior value exists", async () => {
      await investmentService.recordMarketPrice("MSFT", 100, "2024-01-15");

      const price = await investmentService.getMarketPrice("MSFT", "2024-01-14");

      expect(price).toBeNull();
    });

    it("should return null for wrong ticker", async () => {
      await investmentService.recordMarketPrice("GOOGL", 100, "2024-01-15");

      const price = await investmentService.getMarketPrice("AAPL", "2024-01-15");

      expect(price).toBeNull();
    });

    it("should validate required fields", async () => {
      await expect(
        investmentService.getMarketPrice("", "2024-01-15")
      ).rejects.toThrow("Ticker symbol is required");

      await expect(
        investmentService.getMarketPrice("AAPL", "")
      ).rejects.toThrow("Date is required");
    });
  });

  describe("getLatestMarketPrice", () => {
    it("should return most recent price for ticker", async () => {
      await investmentService.recordMarketPrice("AAPL", 100, "2024-01-15");
      await investmentService.recordMarketPrice("AAPL", 105, "2024-01-16");
      await investmentService.recordMarketPrice("AAPL", 103, "2024-01-17");

      const result = await investmentService.getLatestMarketPrice("AAPL");

      expect(result).toBeDefined();
      expect(result!.price).toBe(103);
      expect(result!.date).toBe("2024-01-17");
    });

    it("should return null if no prices exist", async () => {
      const result = await investmentService.getLatestMarketPrice("AAPL");

      expect(result).toBeNull();
    });

    it("should only return prices for specified ticker", async () => {
      await investmentService.recordMarketPrice("AAPL", 100, "2024-01-15");
      await investmentService.recordMarketPrice("MSFT", 200, "2024-01-16");

      const result = await investmentService.getLatestMarketPrice("AAPL");

      expect(result).toBeDefined();
      expect(result!.price).toBe(100);
      expect(result!.date).toBe("2024-01-15");
    });

    it("should validate required fields", async () => {
      await expect(
        investmentService.getLatestMarketPrice("")
      ).rejects.toThrow("Ticker symbol is required");
    });
  });

  describe("getPriceHistory", () => {
    beforeEach(async () => {
      // Set up test data
      await investmentService.recordMarketPrice("AAPL", 100, "2024-01-15");
      await investmentService.recordMarketPrice("AAPL", 105, "2024-01-16");
      await investmentService.recordMarketPrice("AAPL", 103, "2024-01-17");
      await investmentService.recordMarketPrice("AAPL", 108, "2024-01-18");
      await investmentService.recordMarketPrice("AAPL", 110, "2024-01-19");
    });

    it("should return all prices for ticker when no date range specified", async () => {
      const history = await investmentService.getPriceHistory("AAPL");

      expect(history).toHaveLength(5);
      expect(history[0].date).toBe("2024-01-15");
      expect(history[0].price).toBe(100);
      expect(history[4].date).toBe("2024-01-19");
      expect(history[4].price).toBe(110);
    });

    it("should filter by start date", async () => {
      const history = await investmentService.getPriceHistory("AAPL", "2024-01-17");

      expect(history).toHaveLength(3);
      expect(history[0].date).toBe("2024-01-17");
      expect(history[2].date).toBe("2024-01-19");
    });

    it("should filter by end date", async () => {
      const history = await investmentService.getPriceHistory("AAPL", undefined, "2024-01-17");

      expect(history).toHaveLength(3);
      expect(history[0].date).toBe("2024-01-15");
      expect(history[2].date).toBe("2024-01-17");
    });

    it("should filter by date range", async () => {
      const history = await investmentService.getPriceHistory(
        "AAPL",
        "2024-01-16",
        "2024-01-18"
      );

      expect(history).toHaveLength(3);
      expect(history[0].date).toBe("2024-01-16");
      expect(history[2].date).toBe("2024-01-18");
    });

    it("should return empty array if no prices in range", async () => {
      const history = await investmentService.getPriceHistory(
        "AAPL",
        "2024-02-01",
        "2024-02-28"
      );

      expect(history).toEqual([]);
    });

    it("should return prices in ascending date order", async () => {
      const history = await investmentService.getPriceHistory("AAPL");

      for (let i = 1; i < history.length; i++) {
        expect(history[i].date >= history[i - 1].date).toBe(true);
      }
    });

    it("should only return prices for specified ticker", async () => {
      await investmentService.recordMarketPrice("MSFT", 200, "2024-01-15");
      await investmentService.recordMarketPrice("MSFT", 205, "2024-01-16");

      const history = await investmentService.getPriceHistory("MSFT");

      expect(history).toHaveLength(2);
      expect(history[0].price).toBe(200);
      expect(history[1].price).toBe(205);
    });

    it("should include source in results", async () => {
      await investmentService.recordMarketPrice("TSLA", 300, "2024-01-15", "api");

      const history = await investmentService.getPriceHistory("TSLA");

      expect(history[0].source).toBe("api");
    });

    it("should validate required fields", async () => {
      await expect(
        investmentService.getPriceHistory("")
      ).rejects.toThrow("Ticker symbol is required");
    });
  });

  describe("importPriceHistory", () => {
    it("should import multiple price records", async () => {
      const prices = [
        { date: "2024-01-15", price: 100 },
        { date: "2024-01-16", price: 105 },
        { date: "2024-01-17", price: 103 },
      ];

      const count = await investmentService.importPriceHistory("AAPL", prices);

      expect(count).toBe(3);

      const history = await investmentService.getPriceHistory("AAPL");
      expect(history).toHaveLength(3);
    });

    it("should handle duplicates gracefully by updating", async () => {
      // Import initial prices
      await investmentService.importPriceHistory("MSFT", [
        { date: "2024-01-15", price: 100 },
        { date: "2024-01-16", price: 105 },
      ]);

      // Import again with overlapping dates
      const count = await investmentService.importPriceHistory("MSFT", [
        { date: "2024-01-16", price: 110 }, // Update existing
        { date: "2024-01-17", price: 108 }, // New
      ]);

      expect(count).toBe(2);

      const history = await investmentService.getPriceHistory("MSFT");
      expect(history).toHaveLength(3);
      
      // Verify the updated price
      const jan16 = history.find(h => h.date === "2024-01-16");
      expect(jan16!.price).toBe(110);
    });

    it("should set source to 'import' for imported prices", async () => {
      await investmentService.importPriceHistory("GOOGL", [
        { date: "2024-01-15", price: 100 },
      ]);

      const history = await investmentService.getPriceHistory("GOOGL");
      expect(history[0].source).toBe("import");
    });

    it("should validate required fields", async () => {
      await expect(
        investmentService.importPriceHistory("", [{ date: "2024-01-15", price: 100 }])
      ).rejects.toThrow("Ticker symbol is required");

      await expect(
        investmentService.importPriceHistory("AAPL", [])
      ).rejects.toThrow("Prices array is required and must not be empty");

      await expect(
        investmentService.importPriceHistory("AAPL", [{ date: "", price: 100 }])
      ).rejects.toThrow("Each price record must have a date");

      await expect(
        investmentService.importPriceHistory("AAPL", [{ date: "2024-01-15", price: 0 }])
      ).rejects.toThrow("Each price record must have a positive price");

      await expect(
        investmentService.importPriceHistory("AAPL", [{ date: "2024-01-15", price: -50 }])
      ).rejects.toThrow("Each price record must have a positive price");
    });

    it("should import large batch of prices", async () => {
      const prices = [];
      for (let i = 1; i <= 100; i++) {
        prices.push({
          date: `2024-01-${i.toString().padStart(2, '0')}`,
          price: 100 + i,
        });
      }

      const count = await investmentService.importPriceHistory("TSLA", prices);

      expect(count).toBe(100);

      const history = await investmentService.getPriceHistory("TSLA");
      expect(history).toHaveLength(100);
    });
  });
});
