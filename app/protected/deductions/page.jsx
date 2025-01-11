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
  const [reports, setReports] = useState([]); // lines from payroll_reports
  const [agentMap, setAgentMap] = useState({});
  const [deductions, setDeductions] = useState([]);

  // Edit-only modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deductionData, setDeductionData] = useState({
    id: "",
    payroll_report_id: "",
    agent_id: "",
    type: "deduction",
    reason: "",
    amount: "",
  });

  useEffect(() => {
    fetchAgents();
    fetchReports();
    fetchDeductions();
  }, []);

  async function fetchAgents() {
    const { data } = await supabase.from("agents").select("*");
    if (!data) {
      setAgentMap({});
      return;
    }
    const map = {};
    data.forEach((ag) => {
      map[ag.id] = ag;
    });
    setAgentMap(map);
  }

  async function fetchReports() {
    // We'll load lines, plus the joined batch_name from payroll_report_batches
    const { data } = await supabase
      .from("payroll_reports")
      .select("id, agent_id, name, batch_id, payroll_report_batches(batch_name)")
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

  // We keep only the Edit functionality; no adding new from here.
  function openEditModal(ded) {
    setIsEditing(true);
    setDeductionData({
      id: ded.id,
      payroll_report_id: ded.payroll_report_id || "",
      agent_id: ded.agent_id || "",
      type: ded.type,
      reason: ded.reason || "",
      amount: ded.amount.toString() || "",
    });
    setIsModalOpen(true);
  }

  async function saveDeduction() {
    const payload = {
      payroll_report_id: deductionData.payroll_report_id || null,
      agent_id: deductionData.agent_id || null,
      type: deductionData.type,
      reason: deductionData.reason || "",
      amount: parseFloat(deductionData.amount) || 0,
    };

    if (isEditing && deductionData.id) {
      await supabase
        .from("deductions_reimbursements")
        .update(payload)
        .eq("id", deductionData.id);
    }
    // no else => cannot create new here

    setIsModalOpen(false);
    fetchDeductions();
  }

  async function handleDelete(id) {
    const confirmMsg = "Are you sure you want to delete this item?";
    if (!window.confirm(confirmMsg)) return;
    await supabase.from("deductions_reimbursements").delete().eq("id", id);
    fetchDeductions();
  }

  // For the disabled logic: if isEditing => these fields are shown but disabled.
  const selectedLine = reports.find((r) => r.id === deductionData.payroll_report_id);

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Deductions / Reimbursements</h1>
        {/* No "Add Entry" button => no new creation from here */}
      </div>

      <Table striped>
        <TableHead>
          <TableRow>
            {/* We'll show the batch_name for the "Report" column, not the line name. */}
            <TableHeader>Report (Batch Name)</TableHeader>
            <TableHeader>Agent Name</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Reason</TableHeader>
            <TableHeader>Amount</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {deductions.map((ded) => {
            const r = reports.find((rep) => rep.id === ded.payroll_report_id);
            const batchLabel = r?.payroll_report_batches?.batch_name || "—";
            const agentObj = agentMap[ded.agent_id];
            const agentName = agentObj
              ? agentObj.name || agentObj.identifier || ded.agent_id
              : ded.agent_id || "—";

            return (
              <TableRow key={ded.id}>
                <TableCell>{batchLabel}</TableCell>
                <TableCell>{agentName}</TableCell>
                <TableCell>{ded.type}</TableCell>
                <TableCell>{ded.reason || "-"}</TableCell>
                <TableCell>{"$" + (parseFloat(ded.amount) || 0).toFixed(2)}</TableCell>
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

      {/* Edit-only Modal */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} size="xl">
        <DialogTitle>
          {isEditing ? "Edit Entry" : ""}
        </DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Pick Report (Batch)</Label>
            <Select
              value={deductionData.payroll_report_id}
              onChange={(e) =>
                setDeductionData({ ...deductionData, payroll_report_id: e.target.value })
              }
              disabled={isEditing} // Freeze if editing
            >
              <option value="">(None)</option>
              {reports.map((r) => {
                const b = r.payroll_report_batches?.batch_name || "Unnamed Batch";
                return (
                  <option key={r.id} value={r.id}>
                    {b}
                  </option>
                );
              })}
            </Select>
          </Field>

          <Field className="mb-4">
            <Label>Pick Agent (Name)</Label>
            <Select
              value={deductionData.agent_id}
              onChange={(e) => setDeductionData({ ...deductionData, agent_id: e.target.value })}
              disabled={isEditing} // Freeze if editing
            >
              <option value="">(None)</option>
              {selectedLine && selectedLine.agent_id && (
                <option value={selectedLine.agent_id}>
                  {agentMap[selectedLine.agent_id]
                    ? agentMap[selectedLine.agent_id].name ||
                      agentMap[selectedLine.agent_id].identifier ||
                      selectedLine.agent_id
                    : selectedLine.agent_id}
                </option>
              )}
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
          <Button onClick={saveDeduction}>Save</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
