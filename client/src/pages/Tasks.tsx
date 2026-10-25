import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, CalendarClock } from "lucide-react";
import { useApi } from "../lib/hooks";
import { post, del } from "../lib/api";
import { fmtDate, relativeDay, todayStr } from "../lib/format";
import { Card, PageHeader, Tabs, Loading, EmptyState, Badge, Button, Modal } from "../components/ui";
import { TaskForm } from "../components/forms";

export default function Tasks() {
  const [filter, setFilter] = useState("today");
  const [newOpen, setNewOpen] = useState(false);
  const { data, loading, reload } = useApi(`/api/tasks?when=${filter}&status=${filter === "done" ? "done" : ""}`);

  const tasks: any[] = data?.tasks || [];

  async function complete(id: string) {
    await post(`/api/tasks/${id}/complete`);
    reload();
  }
  async function reopen(id: string) {
    await post(`/api/tasks/${id}/reopen`);
    reload();
  }
  async function remove(id: string) {
    if (confirm("Delete this task? This cannot be undone.")) {
      await del(`/api/tasks/${id}`);
      reload();
    }
  }
  async function snooze(id: string) {
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    await post(`/api/tasks/${id}/reschedule`, { dueDate: tomorrow });
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Tasks & Reminders"
        sub="Your follow-ups — calls, visits, payments"
        action={
          <Button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-2">
            <Plus size={16} /> Add task
          </Button>
        }
      />

      <Tabs
        tabs={[
          { id: "today", label: "Today" },
          { id: "overdue", label: "Overdue" },
          { id: "upcoming", label: "Upcoming" },
          { id: "done", label: "Completed" },
        ]}
        active={filter}
        onChange={setFilter}
      />

      <div className="mt-4">
        {loading ? (
          <Loading />
        ) : tasks.length === 0 ? (
          <EmptyState title={filter === "done" ? "Nothing completed yet" : "Nothing due here"} body={filter === "today" ? "Tasks due today appear here." : undefined} />
        ) : (
          <div className="space-y-3">
            {tasks.map((t) => {
              const overdue = t.status !== "done" && t.dueDate < todayStr();
              return (
                <Card key={t._id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[15px] font-medium ${t.status === "done" ? "text-ink-mute line-through" : "text-ink"}`}>{t.title}</span>
                      {t.priority === "high" && t.status !== "done" && <Badge tone="red">High</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-mute">
                      <span className={`inline-flex items-center gap-1 ${overdue ? "font-semibold text-red-700" : ""}`}>
                        <CalendarClock size={12} /> {relativeDay(t.dueDate)}
                      </span>
                      {t.project && (
                        <Link to={`/projects/${t.project._id}`} className="text-brand-700">
                          {t.project.name}
                        </Link>
                      )}
                      {t.notes && <span>{t.notes}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row">
                    {t.status !== "done" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => snooze(t._id)}>
                          +1 day
                        </Button>
                        <Button size="sm" onClick={() => complete(t._id)}>
                          Done
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => reopen(t._id)}>
                        Reopen
                      </Button>
                    )}
                    <button onClick={() => remove(t._id)} className="px-2 py-1 text-xs text-ink-mute hover:text-red-700">
                      Delete
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Add task or reminder">
        <TaskForm
          onSaved={() => {
            setNewOpen(false);
            reload();
          }}
          onCancel={() => setNewOpen(false)}
        />
      </Modal>
    </div>
  );
}
