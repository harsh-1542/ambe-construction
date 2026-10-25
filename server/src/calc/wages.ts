import { Types } from "mongoose";
import { Worker, Attendance, WageSettlement, IWorker, IAttendance } from "../models/people.js";

export interface WageCalc {
  workerId: string;
  presentDays: number;
  halfDays: number;
  paidLeaveDays: number;
  extraAmount: number; // overtime/extra, paise
  earnedWages: number; // paise
  openingDue: number; // paise
  settlementsPaid: number; // gross wages already settled in this window
  advancesOutstanding: number; // paise
  netWagesDue: number; // paise; what you still owe the worker
  advanceBalAfterSettlement: number;
}

/**
 * Wage arithmetic for one worker over [from, to] (inclusive, YYYY-MM-DD).
 *
 * Rules:
 * - Daily-rate workers: present = full day at rate (or day's rateOverride), half = half rate.
 * - Weekly/monthly workers: earned = pro-rated share of attendance in the window
 *   (window days / 7 of weekly rate, window days / 30 of monthly rate) × attendance fraction.
 * - Paid leave counts as an earned day for daily workers.
 * - Settlements are matched to the window by their [from..to] overlap ratio; simpler and
 *   more predictable: any settlement whose range intersects the window subtracts
 *   grossSettled scaled by overlap. Overlapping settlements would double count — the API
 *   prevents creating settlements with overlapping ranges for the same worker.
 * - Advances outstanding are subtracted from wages due (money already given).
 */
export async function calcWagesForWorker(workerId: string, ownerId: string, from: string, to: string): Promise<WageCalc | null> {
  const worker = (await Worker.findOne({ _id: workerId, owner: ownerId }).lean()) as IWorker | null;
  if (!worker) return null;

  const [attendance, settlements, advanceAgg] = await Promise.all([
    Attendance.find({ owner: ownerId, worker: workerId, date: { $gte: from, $lte: to } }).lean(),
    WageSettlement.find({ owner: ownerId, worker: workerId, status: { $ne: "void" }, from: { $lte: to }, to: { $gte: from } }).lean(),
    // advances given minus advances recovered in settlements
    advanceBalance(workerId, ownerId),
  ]);

  let presentDays = 0;
  let halfDays = 0;
  let paidLeaveDays = 0;
  let extraAmount = 0;

  for (const a of attendance as (IAttendance & { _id: Types.ObjectId })[]) {
    if (a.status === "present") presentDays += 1;
    else if (a.status === "half") halfDays += 1;
    else if (a.status === "paid_leave") paidLeaveDays += 1;
    extraAmount += a.extraAmount ?? 0;
  }

  const windowDays = daysBetweenInclusive(from, to);
  const rate = worker.wageRate;
  let earnedWages = 0;

  if (worker.wageType === "daily") {
    const base = presentDays + paidLeaveDays;
    earnedWages = base * rate + halfDays * Math.round(rate / 2) + extraAmount;
  } else if (worker.wageType === "weekly") {
    const weeklyFraction = windowDays / 7;
    earnedWages = Math.round(weeklyFraction * rate * attendanceFraction(presentDays, halfDays, paidLeaveDays)) + extraAmount;
  } else {
    const monthlyFraction = windowDays / 30;
    earnedWages = Math.round(monthlyFraction * rate * attendanceFraction(presentDays, halfDays, paidLeaveDays)) + extraAmount;
  }

  // subtract settlements that overlap this window (scaled by overlap proportion)
  let settlementsPaid = 0;
  for (const s of settlements) {
    const overlapStart = s.from > from ? s.from : from;
    const overlapEnd = s.to < to ? s.to : to;
    if (overlapStart > overlapEnd) continue;
    const overlap = daysBetweenInclusive(overlapStart, overlapEnd);
    const ratio = overlap / daysBetweenInclusive(s.from, s.to);
    settlementsPaid += Math.round(s.grossSettled * ratio);
  }

  const openingDue = worker.openingWagesDue ?? 0;
  const advancesOutstanding = advanceAgg;
  const grossDue = earnedWages + openingDue - settlementsPaid;
  const netWagesDue = grossDue - advancesOutstanding;

  return {
    workerId: String(worker._id),
    presentDays,
    halfDays,
    paidLeaveDays,
    extraAmount,
    earnedWages,
    openingDue,
    settlementsPaid,
    advancesOutstanding,
    netWagesDue,
    advanceBalAfterSettlement: advancesOutstanding,
  };
}

function attendanceFraction(present: number, half: number, paidLeave: number): number {
  return (present + paidLeave + half * 0.5) / Math.max(1, present + paidLeave + half); // fraction of attended days actually worked
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(from + "T12:00:00Z").getTime();
  const b = new Date(to + "T12:00:00Z").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

/** Net advance balance = advances given (active tx) − advances recovered via settlements. */
export async function advanceBalance(workerId: string, ownerId: string): Promise<number> {
  const { Transaction } = await import("../models/finance.js");
  const [givenAgg, recoveredAgg] = await Promise.all([
    Transaction.aggregate<{ total: number }>([
      { $match: { owner: new Types.ObjectId(ownerId), worker: new Types.ObjectId(workerId), type: "worker_advance", status: "active" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    WageSettlement.aggregate<{ total: number }>([
      { $match: { owner: new Types.ObjectId(ownerId), worker: new Types.ObjectId(workerId), status: "active" } },
      { $group: { _id: null, total: { $sum: "$advanceDeducted" } } },
    ]),
  ]);
  return (givenAgg[0]?.total ?? 0) - (recoveredAgg[0]?.total ?? 0);
}
