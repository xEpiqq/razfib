"use client";
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import "tailwindcss/tailwind.css";
import { Button } from "@/components/button";
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from "@/components/dialog";
import {
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/table";
import { Field, Label } from "@/components/fieldset";
import { Select } from "@/components/select";
import { Input } from "@/components/input";

export default function DeductionsReimbursementsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState([]);
  const [reports, setReports] = useState([]);
  const [deductions, setDeductions] = useState([]);

  // Main Add/Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deductionData, setDeductionData] = useState({
    id: "",
    agent_id: "",
    type: "deduction",
    reason: "",
    amount: "",
  });

  // "Mark Done" modal
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [completeDed, setCompleteDed] = useState(null);
  const [completeReportId, setCompleteReportId] = useState("");

  useEffect(() => {
    fetchAgents();
    fetchReports();
    fetchDeductions();
  }, []);

  async function fetchAgents() {
    const { data } = await supabase.from("agents").select("*");
    setAgents(data || []);
  }

  async function fetchReports() {
    // We fetch payroll_reports plus the joined batch_name from payroll_report_batches
    const { data } = await supabase
      .from("payroll_reports")
      .select("id, name, batch_id, payroll_report_batches(batch_name)")
      .order("created_at", { ascending: false });
    setReports(data || []);
  }

  async function fetchDeductions() {
    const { data } = await supabase
      .from("deductions_reimbursements")
      .select("*")
      .order("created_at", { ascending: false });
    setDeductions(data || []);
  }

  function openAddModal() {
    setIsEditing(false);
    setDeductionData({
      id: "",
      agent_id: "",
      type: "deduction",
      reason: "",
      amount: "",
    });
    setIsModalOpen(true);
  }

  function openEditModal(ded) {
    setIsEditing(true);
    setDeductionData({
      id: ded.id,
      agent_id: ded.agent_id,
      type: ded.type,
      reason: ded.reason || "",
      amount: ded.amount.toString() || "",
    });
    setIsModalOpen(true);
  }

  async function saveDeduction() {
    const payload = {
      agent_id: deductionData.agent_id,
      type: deductionData.type,
      reason: deductionData.reason || "",
      amount: parseFloat(deductionData.amount) || 0,
    };

    if (isEditing && deductionData.id) {
      // Update existing
      await supabase
        .from("deductions_reimbursements")
        .update(payload)
        .eq("id", deductionData.id);
    } else {
      // Insert new
      await supabase.from("deductions_reimbursements").insert([payload]);
    }

    setIsModalOpen(false);
    await fetchDeductions();
  }

  // Mark done or re-open
  function handleMarkDone(ded) {
    if (ded.is_completed) {
      // It's completed => re-open
      reopenDeduction(ded);
    } else {
      // It's open => ask them to pick a report
      setCompleteDed(ded);
      setCompleteReportId(ded.payroll_report_id || "");
      setIsCompleteModalOpen(true);
    }
  }

  async function reopenDeduction(ded) {
    await supabase
      .from("deductions_reimbursements")
      .update({
        is_completed: false,
        completed_at: null,
        payroll_report_id: null,
      })
      .eq("id", ded.id);
    fetchDeductions();
  }

  // user chooses which report => set is_completed = true
  async function completeDeduction() {
    if (!completeDed) return;
    await supabase
      .from("deductions_reimbursements")
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        payroll_report_id: completeReportId || null,
      })
      .eq("id", completeDed.id);

    setIsCompleteModalOpen(false);
    setCompleteDed(null);
    setCompleteReportId("");
    fetchDeductions();
  }

  // Delete an entry
  async function handleDelete(id) {
    const confirmMsg = "Are you sure you want to delete this deduction?";
    if (!window.confirm(confirmMsg)) return;
    await supabase
      .from("deductions_reimbursements")
      .delete()
      .eq("id", id);
    fetchDeductions();
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Deductions / Reimbursements</h1>
        <Button onClick={openAddModal}>Add Entry</Button>
      </div>

      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader>Agent</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Reason</TableHeader>
            <TableHeader>Amount</TableHeader>
            <TableHeader>Linked Report (Batch)</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {deductions.map((ded) => {
            const ag = agents.find((a) => a.id === ded.agent_id);
            const r = reports.find((rep) => rep.id === ded.payroll_report_id);
            // Show the batch name from payroll_report_batches
            const batchLabel = r?.payroll_report_batches?.batch_name || "—";
            return (
              <TableRow key={ded.id}>
                <TableCell>{ag?.name || ag?.identifier || "Unknown"}</TableCell>
                <TableCell>{ded.type}</TableCell>
                <TableCell>{ded.reason || "-"}</TableCell>
                <TableCell>
                  {"$" + (parseFloat(ded.amount) || 0).toFixed(2)}
                </TableCell>
                <TableCell>
                  {batchLabel}
                </TableCell>
                <TableCell>
                  {ded.is_completed ? (
                    <span className="text-green-600">Completed</span>
                  ) : (
                    <span className="text-red-600">Open</span>
                  )}
                </TableCell>
                <TableCell className="space-x-2">
                  <Button size="sm" onClick={() => openEditModal(ded)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMarkDone(ded)}
                  >
                    {ded.is_completed ? "Re-open" : "Mark Done"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(ded.id)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Add / Edit Modal */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} size="xl">
        <DialogTitle>
          {isEditing ? "Edit Entry" : "Add Deduction / Reimbursement"}
        </DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Agent</Label>
            <Select
              value={deductionData.agent_id}
              onChange={(e) =>
                setDeductionData({ ...deductionData, agent_id: e.target.value })
              }
            >
              <option value="">Select agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.identifier}
                </option>
              ))}
            </Select>
          </Field>

          <Field className="mb-4">
            <Label>Type</Label>
            <Select
              value={deductionData.type}
              onChange={(e) =>
                setDeductionData({ ...deductionData, type: e.target.value })
              }
            >
              <option value="deduction">Deduction</option>
              <option value="reimbursement">Reimbursement</option>
            </Select>
          </Field>

          <Field className="mb-4">
            <Label>Reason</Label>
            <Input
              type="text"
              value={deductionData.reason}
              onChange={(e) =>
                setDeductionData({ ...deductionData, reason: e.target.value })
              }
            />
          </Field>

          <Field className="mb-4">
            <Label>Amount</Label>
            <Input
              type="number"
              value={deductionData.amount}
              onChange={(e) =>
                setDeductionData({ ...deductionData, amount: e.target.value })
              }
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveDeduction}>{isEditing ? "Save" : "Add"}</Button>
        </DialogActions>
      </Dialog>

      {/* Mark Done Modal */}
      <Dialog
        open={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        size="md"
      >
        <DialogTitle>Complete Deduction</DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Select Report (Batch)</Label>
            <Select
              value={completeReportId}
              onChange={(e) => setCompleteReportId(e.target.value)}
            >
              <option value="">(None)</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {/* Show batch_name from the joined object */}
                  {r.payroll_report_batches?.batch_name || "Unnamed Batch"}
                </option>
              ))}
            </Select>
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsCompleteModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={completeDeduction}>Mark as Done</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
