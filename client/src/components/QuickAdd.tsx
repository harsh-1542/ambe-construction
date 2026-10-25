import React, { useState } from "react";
import { Plus, IndianRupee, HandCoins, FileText, Truck, Users, CalendarCheck, ClipboardList, CheckSquare, StickyNote, LayoutList } from "lucide-react";
import { Modal } from "./ui";
import {
  ExpenseForm,
  CustomerPaymentForm,
  SupplierBillForm,
  PaySupplierForm,
  PayWorkerForm,
  WorkerAdvanceForm,
  AttendanceForm,
  SiteUpdateForm,
  TaskForm,
  NoteForm,
} from "./forms";

const ACTIONS = [
  { id: "expense", label: "Add Expense", icon: IndianRupee, cls: "text-red-700 bg-red-50" },
  { id: "customer_payment", label: "Customer Payment", icon: HandCoins, cls: "text-brand-700 bg-brand-50" },
  { id: "supplier_bill", label: "Supplier Bill", icon: FileText, cls: "text-blue-700 bg-blue-50" },
  { id: "pay_supplier", label: "Pay Supplier", icon: Truck, cls: "text-blue-700 bg-blue-50" },
  { id: "pay_worker", label: "Pay Worker", icon: Users, cls: "text-amber-700 bg-amber-50" },
  { id: "worker_advance", label: "Worker Advance", icon: HandCoins, cls: "text-amber-700 bg-amber-50" },
  { id: "attendance", label: "Mark Attendance", icon: CalendarCheck, cls: "text-brand-700 bg-brand-50" },
  { id: "site_update", label: "Site Update", icon: ClipboardList, cls: "text-stone-700 bg-stone-100" },
  { id: "task", label: "Task / Reminder", icon: CheckSquare, cls: "text-stone-700 bg-stone-100" },
  { id: "note", label: "Note", icon: StickyNote, cls: "text-stone-700 bg-stone-100" },
] as const;

const TITLES: Record<string, string> = {
  expense: "Add Expense",
  customer_payment: "Record Customer Payment",
  supplier_bill: "Record Supplier Bill",
  pay_supplier: "Pay Supplier",
  pay_worker: "Pay Worker",
  worker_advance: "Give Worker Advance",
  attendance: "Mark Attendance",
  site_update: "Add Site Update",
  task: "Add Task or Reminder",
  note: "Add Note",
};

export function QuickAdd({ open, onClose, action, defaultProject }: { open: boolean; onClose: () => void; action?: string; defaultProject?: string }) {
  const [selected, setSelected] = useState<string | null>(null);

  function pick(id: string) {
    setSelected(id);
  }

  function close() {
    setSelected(null);
    onClose();
  }

  function saved() {
    close();
    // refresh data on the current page
    window.dispatchEvent(new CustomEvent("ambe:refresh"));
  }

  if (open && !selected && !action) {
    return (
      <Modal open={open} onClose={close} title="What do you want to record?">
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => pick(a.id)}
              className="flex flex-col items-start gap-2 rounded-xl border border-stone-200 p-3 text-left hover:border-brand-500/60 hover:bg-stone-50"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.cls}`}>
                <a.icon size={18} />
              </span>
              <span className="text-sm font-medium text-ink">{a.label}</span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  const formAction = action || selected;
  const formProps = { onSaved: saved, onCancel: close, defaultProject };

  return (
    <Modal open={open} onClose={close} title={formAction ? TITLES[formAction] : ""} wide={formAction === "pay_worker"}>
      {formAction === "expense" && <ExpenseForm {...formProps} />}
      {formAction === "customer_payment" && <CustomerPaymentForm {...formProps} />}
      {formAction === "supplier_bill" && <SupplierBillForm {...formProps} />}
      {formAction === "pay_supplier" && <PaySupplierForm {...formProps} />}
      {formAction === "pay_worker" && <PayWorkerForm {...formProps} />}
      {formAction === "worker_advance" && <WorkerAdvanceForm {...formProps} />}
      {formAction === "attendance" && <AttendanceForm {...formProps} />}
      {formAction === "site_update" && <SiteUpdateForm {...formProps} />}
      {formAction === "task" && <TaskForm {...formProps} />}
      {formAction === "note" && <NoteForm {...formProps} />}
    </Modal>
  );
}

export { ACTIONS as QUICK_ADD_ACTIONS, LayoutList };
