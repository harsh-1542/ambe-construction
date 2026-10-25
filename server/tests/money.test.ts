import { describe, it, expect } from "vitest";
import { rupeesToPaise, formatINR, addDays, isValidDateStr, monthStartIST } from "../src/calc/money.js";

describe("money helpers", () => {
  it("converts rupee strings and numbers to paise", () => {
    expect(rupeesToPaise("100")).toBe(10000);
    expect(rupeesToPaise("₹1,250.50")).toBe(125050);
    expect(rupeesToPaise(99.99)).toBe(9999);
    expect(rupeesToPaise(0.01)).toBe(1);
    expect(rupeesToPaise(" 12,34,567 ")).toBe(123456700);
  });

  it("rejects invalid amounts", () => {
    expect(() => rupeesToPaise("abc")).toThrow();
    expect(() => rupeesToPaise("")).toThrow();
  });

  it("formats Indian-grouped rupees", () => {
    expect(formatINR(123456789)).toBe("₹12,34,567");
    expect(formatINR(100)).toBe("₹1");
    expect(formatINR(150)).toBe("₹1");
    expect(formatINR(150, { decimals: true })).toBe("₹1.50");
    expect(formatINR(-5000)).toBe("-₹50");
    expect(formatINR(5000, { sign: true })).toBe("+₹50");
    // lakh/crore grouping checks
    expect(formatINR(25000000)).toBe("₹2,50,000");
    expect(formatINR(1250000000)).toBe("₹1,25,00,00" + "0");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("validates date strings", () => {
    expect(isValidDateStr("2026-10-24")).toBe(true);
    expect(isValidDateStr("2026-13-01")).toBe(false);
    expect(isValidDateStr("24-10-2026")).toBe(false);
  });

  it("month start is the 1st", () => {
    expect(monthStartIST()).toMatch(/-01$/);
  });
});
