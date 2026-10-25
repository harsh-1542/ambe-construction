import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../src/db.js";
import { User, CompanySettings } from "../src/models/user.js";
import { Project } from "../src/models/project.js";
import { Transaction } from "../src/models/finance.js";
import { Supplier, SupplierBill } from "../src/models/supplier.js";
import { Worker, Attendance, WageSettlement } from "../src/models/people.js";
import { computeProjectFinancialsFromDocs } from "../src/calc/projectFinancials.js";
import { calcWagesForWorker } from "../src/calc/wages.js";
import { supplierOutstanding } from "../src/calc/dues.js";

// All money below is in paise (₹1 = 100)

let ownerId: string;

beforeAll(async () => {
  process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ambe_test";
  await connectDb();
  await Promise.all(
    mongoose.connection.collections && Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))
  );
  const user = await User.create({ name: "Test Owner", username: `owner-${Date.now()}`, passwordHash: "x" });
  await CompanySettings.create({ owner: user._id, companyName: "Test Con" });
  ownerId = String(user._id);
});

afterAll(async () => {
  await disconnectDb();
});

describe("project financials", () => {
  it("computes revised contract, outstanding, and costs without double-counting", async () => {
    const project = await Project.create({
      owner: ownerId,
      name: "Villa A",
      customerName: "Patel",
      type: "residential",
      status: "active",
      contractAmount: 5_000_000, // ₹50,000
      estimatedCost: 3_500_000,
      installments: [],
    });

    // extra work approved ₹5,000 + unapproved ₹10,000 (must be excluded)
    const { Variation } = await import("../src/models/project.js");
    await Variation.create({ owner: ownerId, project: project._id, description: "Extra grill", amount: 500_000, date: "2026-10-01", approved: true });
    await Variation.create({ owner: ownerId, project: project._id, description: "Rumour", amount: 1_000_000, date: "2026-10-02", approved: false });

    // payments ₹20,000 + ₹5,000
    await Transaction.create({ owner: ownerId, type: "customer_payment", project: project._id, amount: 2_000_000, date: "2026-10-05", method: "upi" });
    await Transaction.create({ owner: ownerId, type: "customer_payment", project: project._id, amount: 500_000, date: "2026-10-15", method: "cash" });

    // expenses ₹8,000, wage ₹1,000, advance ₹500
    await Transaction.create({ owner: ownerId, type: "expense", project: project._id, category: "material", amount: 800_000, date: "2026-10-06", method: "cash" });
    await Transaction.create({ owner: ownerId, type: "worker_wage", project: project._id, worker: new mongoose.Types.ObjectId(), amount: 100_000, date: "2026-10-07", method: "cash" });
    await Transaction.create({ owner: ownerId, type: "worker_advance", project: project._id, worker: new mongoose.Types.ObjectId(), amount: 50_000, date: "2026-10-07", method: "cash" });

    // a voided transaction must be ignored
    await Transaction.create({ owner: ownerId, type: "expense", project: project._id, category: "material", amount: 999_999, date: "2026-10-08", method: "cash", status: "void", voidReason: "mistake" });

    const p = (await Project.findById(project._id).lean())!;
    const fin = await computeProjectFinancialsFromDocs(p);

    expect(fin.originalContract).toBe(5_000_000);
    expect(fin.approvedVariations).toBe(500_000);
    expect(fin.revisedContract).toBe(5_500_000);
    expect(fin.paymentsReceived).toBe(2_500_000);
    expect(fin.customerOutstanding).toBe(3_000_000);
    expect(fin.expensesRecorded).toBe(950_000); // 800000 + 100000 + 50000, void excluded
    expect(fin.estimatedProfit).toBe(4_550_000);
    expect(fin.costOverrunVsEstimate).toBe(950_000 - 3_500_000);
  });

  it("allows negative outstanding when customer paid more than contract (advance)", async () => {
    const project = await Project.create({
      owner: ownerId,
      name: "Shop B",
      customerName: "Shah",
      type: "shop",
      status: "active",
      contractAmount: 1_000_000,
      installments: [],
    });
    await Transaction.create({ owner: ownerId, type: "customer_payment", project: project._id, amount: 1_500_000, date: "2026-10-01", method: "cash" });
    const p = (await Project.findById(project._id).lean())!;
    const fin = await computeProjectFinancialsFromDocs(p);
    expect(fin.customerOutstanding).toBe(-500_000);
  });
});

describe("worker wages", () => {
  it("calculates earned wages, subtracts settlements and advances without double-counting", async () => {
    const worker = await Worker.create({ owner: ownerId, name: "Ramesh", wageType: "daily", wageRate: 80_000, openingWagesDue: 20_000 }); // ₹800/day, ₹200 opening

    // Oct 1-10: 6 present, 2 half, 1 absent, 1 paid leave + ₹100 extra once
    const mk = (date: string, status: string, extra = 0) =>
      Attendance.create({ owner: ownerId, worker: worker._id, date, status, ...(extra ? { extraAmount: extra } : {}) });
    await mk("2026-10-01", "present");
    await mk("2026-10-02", "present");
    await mk("2026-10-03", "present");
    await mk("2026-10-04", "present");
    await mk("2026-10-05", "present");
    await mk("2026-10-06", "present");
    await mk("2026-10-07", "half");
    await mk("2026-10-08", "half");
    await mk("2026-10-09", "absent");
    await mk("2026-10-10", "paid_leave");
    await mk("2026-10-11", "present", 10_000);

    // earned (daily): 7 present + 1 paid leave = 8 paid days * 800 = 6400, + 2 half * 400 = 800, + 100 extra = 7300
    // opening 200 → gross due before settlements = 7500
    // advance given ₹1,000 → outstanding 1000
    await Transaction.create({ owner: ownerId, type: "worker_advance", worker: worker._id, amount: 100_000, date: "2026-10-05", method: "cash" });

    const before = await calcWagesForWorker(String(worker._id), ownerId, "2026-10-01", "2026-10-11");
    expect(before!.earnedWages).toBe(730_000);
    expect(before!.openingDue).toBe(20_000);
    expect(before!.settlementsPaid).toBe(0);
    expect(before!.advancesOutstanding).toBe(100_000);
    expect(before!.netWagesDue).toBe(650_000); // 7300 + 200 - 0 - 1000

    // settle Oct 1-11: grossSettled 7500, advance recovered 1000, paid 6500
    const settlement = await WageSettlement.create({
      owner: ownerId,
      worker: worker._id,
      from: "2026-10-01",
      to: "2026-10-11",
      grossSettled: 750_000,
      advanceDeducted: 100_000,
      amountPaid: 650_000,
      includesOpeningDue: true,
    });
    await Transaction.create({ owner: ownerId, type: "worker_wage", worker: worker._id, settlement: settlement._id, amount: 650_000, date: "2026-10-12", method: "cash" });

    const after = await calcWagesForWorker(String(worker._id), ownerId, "2026-10-01", "2026-10-11");
    expect(after!.settlementsPaid).toBe(750_000);
    expect(after!.advancesOutstanding).toBe(0);
    expect(after!.netWagesDue).toBe(0);

    // new work after settlement adds only new wages
    await mk("2026-10-13", "present");
    const later = await calcWagesForWorker(String(worker._id), ownerId, "2026-10-12", "2026-10-13");
    // window Oct 12-13: 1 present day = 800; settlements overlap Oct 12 (1 of 11 days → 6700/11≈609 rounded)
    expect(later!.earnedWages).toBe(80_000);
  });

  it("prevents negative wages going below advances", async () => {
    const worker = await Worker.create({ owner: ownerId, name: "Suresh", wageType: "daily", wageRate: 50_000 });
    await Transaction.create({ owner: ownerId, type: "worker_advance", worker: worker._id, amount: 200_000, date: "2026-10-01", method: "cash" });
    const calc = await calcWagesForWorker(String(worker._id), ownerId, "2026-10-01", "2026-10-02");
    expect(calc!.netWagesDue).toBe(-200_000);
  });
});

describe("supplier outstanding", () => {
  it("bills minus payments, partial payments correct", async () => {
    const supplier = await Supplier.create({ owner: ownerId, name: "Steel Mart" });
    const bill1 = await SupplierBill.create({
      owner: ownerId,
      supplier: supplier._id,
      billDate: "2026-10-01",
      description: "Steel rods",
      items: [],
      subtotal: 2_000_000,
      tax: 0,
      total: 2_000_000,
      amountPaid: 0,
    });
    const bill2 = await SupplierBill.create({
      owner: ownerId,
      supplier: supplier._id,
      billDate: "2026-10-05",
      description: "Cement",
      items: [],
      subtotal: 800_000,
      tax: 0,
      total: 800_000,
      amountPaid: 0,
    });

    await Transaction.create({
      owner: ownerId,
      type: "supplier_payment",
      supplier: supplier._id,
      amount: 600_000,
      date: "2026-10-06",
      method: "cash",
      billAllocations: [{ bill: bill1._id, amount: 600_000 }],
    });
    await SupplierBill.updateOne({ _id: bill1._id }, { $inc: { amountPaid: 600_000 } });

    expect(await supplierOutstanding(String(supplier._id), ownerId)).toBe(2_200_000); // 2800000 - 600000

    // voiding the payment restores outstanding
    const tx = (await Transaction.findOne({ owner: ownerId, type: "supplier_payment" }))!;
    tx.status = "void";
    tx.voidReason = "test";
    await tx.save();
    await SupplierBill.updateOne({ _id: bill1._id }, { $inc: { amountPaid: -600_000 } });
    expect(await supplierOutstanding(String(supplier._id), ownerId)).toBe(2_800_000);
  });
});
