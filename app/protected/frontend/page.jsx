"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";
import { Checkbox } from "@/components/checkbox";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/20/solid";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
  DropdownDivider,
} from "@/components/dropdown";
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Select } from "@/components/select";
import { Input } from "@/components/input";

/**
 * Overdue if install_date is older than 90 days from now.
 */
function isOverdue(install_date) {
  if (!install_date) return false;
  const now = new Date();
  return (now - new Date(install_date)) / (1000 * 60 * 60 * 24) > 90;
}

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [batches, setBatches] = useState([]);
  const [batchPaidMap, setBatchPaidMap] = useState({});
  const [selectedBatchId, setSelectedBatchId] = useState(null);

  const [reportLines, setReportLines] = useState([]);
  const [expandedAgents, setExpandedAgents] = useState(new Set());
  const [loading, setLoading] = useState(false);

  const [wgeMap, setWgeMap] = useState({});
  const [fwgMap, setFwgMap] = useState({});

  // lineId => array of D/R
  const [lineDedMap, setLineDedMap] = useState({});

  // We'll store a map of agent_id => agent object for name display if needed
  const [agentMap, setAgentMap] = useState({});

  // The modal for "Attach Deduction / Reimbursement" - now only "Create New" portion
  const [showAttachModal, setShowAttachModal] = useState(false);

  // For creating a new D/R
  const [newDed, setNewDed] = useState({
    payroll_report_id: "",
    agent_id: "",
    type: "deduction",
    reason: "",
    amount: "",
  });
  const [selectedReportLine, setSelectedReportLine] = useState(null);

  useEffect(() => {
    fetchAgents();
    fetchBatches();
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

  async function fetchBatches() {
    setLoading(true);
    const { data: batchData, error } = await supabase
      .from("payroll_report_batches")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching batches:", error);
      setLoading(false);
      return;
    }
    if (!batchData) {
      setLoading(false);
      return;
    }
    const newBatchPaidMap = {};
    for (const batch of batchData) {
      const { data: reportsData } = await supabase
        .from("payroll_reports")
        .select("frontend_is_paid")
        .eq("batch_id", batch.id);
      if (reportsData && reportsData.length > 0) {
        const total = reportsData.length;
        const paidCount = reportsData.filter((r) => r.frontend_is_paid).length;
        const pct = ((paidCount / total) * 100).toFixed(2);
        newBatchPaidMap[batch.id] = { paidPercentage: parseFloat(pct) };
      } else {
        newBatchPaidMap[batch.id] = { paidPercentage: 0 };
      }
    }
    setBatches(batchData);
    setBatchPaidMap(newBatchPaidMap);
    setLoading(false);
  }

  async function loadBatchDetails(batch_id) {
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_reports")
      .select("*")
      .eq("batch_id", batch_id);
    if (error || !data) {
      setLoading(false);
      return;
    }
    data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    // Grab all relevant WGE / FWG
    const wIds = [];
    const fIds = [];
    for (const line of data) {
      if (Array.isArray(line.details)) {
        for (const d of line.details) {
          if (d.white_glove_entry_id) wIds.push(d.white_glove_entry_id);
          if (d.fidium_white_glove_id) fIds.push(d.fidium_white_glove_id);
        }
      }
    }

    let wMap = {};
    if (wIds.length > 0) {
      const { data: wgeData } = await supabase
        .from("white_glove_entries")
        .select("*")
        .in("id", wIds);
      (wgeData || []).forEach((w) => {
        wMap[w.id] = w;
      });
    }

    let fMap = {};
    if (fIds.length > 0) {
      const { data: fwgData } = await supabase
        .from("fidium_white_glove_entries")
        .select("*")
        .in("id", fIds);
      (fwgData || []).forEach((f) => {
        fMap[f.id] = f;
      });
    }

    // Auto-check if line is fully paid
    for (const line of data) {
      const lineAccs = Array.isArray(line.details) ? line.details : [];
      const allPaid =
        lineAccs.length > 0 &&
        lineAccs.every((acc) => {
          if (acc.white_glove_entry_id) return wMap[acc.white_glove_entry_id]?.frontend_paid;
          if (acc.fidium_white_glove_id) return fMap[acc.fidium_white_glove_id]?.frontend_paid;
          return true;
        });
      if (allPaid && !line.frontend_is_paid) {
        line.frontend_is_paid = true;
        supabase
          .from("payroll_reports")
          .update({ frontend_is_paid: true })
          .eq("id", line.id);
      }
    }

    setReportLines(data);
    setWgeMap(wMap);
    setFwgMap(fMap);
    setExpandedAgents(new Set());
    setLoading(false);

    // load D/R for these lines
    const lineIds = data.map((l) => l.id);
    await loadDedsForLines(lineIds);
  }

  async function loadDedsForLines(lineIds) {
    if (!lineIds || lineIds.length === 0) {
      setLineDedMap({});
      return;
    }
    const { data: dedData } = await supabase
      .from("deductions_reimbursements")
      .select("*")
      .in("payroll_report_id", lineIds);

    let map = {};
    if (dedData && dedData.length > 0) {
      for (const d of dedData) {
        if (!map[d.payroll_report_id]) {
          map[d.payroll_report_id] = [];
        }
        map[d.payroll_report_id].push(d);
      }
    }
    setLineDedMap(map);
  }

  function enterBatch(batch_id) {
    setSelectedBatchId(batch_id);
    loadBatchDetails(batch_id);
  }

  async function goBack() {
    setSelectedBatchId(null);
    setReportLines([]);
    setWgeMap({});
    setFwgMap({});
    setLineDedMap({});
    await fetchBatches();
  }

  async function togglePaid(line) {
    const newPaidValue = !line.frontend_is_paid;
    const { data: updatedLineData } = await supabase
      .from("payroll_reports")
      .update({ frontend_is_paid: newPaidValue })
      .eq("id", line.id)
      .select("*");
    if (!updatedLineData) return;

    const updatedLine = updatedLineData[0];
    const lineAccs = Array.isArray(updatedLine.details) ? updatedLine.details : [];
    const wIds = lineAccs
      .filter((d) => d.white_glove_entry_id)
      .map((d) => d.white_glove_entry_id);
    const fIds = lineAccs
      .filter((d) => d.fidium_white_glove_id)
      .map((d) => d.fidium_white_glove_id);

    if (wIds.length > 0) {
      await supabase
        .from("white_glove_entries")
        .update({ frontend_paid: newPaidValue })
        .in("id", wIds);
      const newMap = { ...wgeMap };
      wIds.forEach((id) => {
        if (newMap[id]) newMap[id].frontend_paid = newPaidValue;
      });
      setWgeMap(newMap);
    }

    if (fIds.length > 0) {
      await supabase
        .from("fidium_white_glove_entries")
        .update({ frontend_paid: newPaidValue })
        .in("id", fIds);
      const newMap = { ...fwgMap };
      fIds.forEach((id) => {
        if (newMap[id]) newMap[id].frontend_paid = newPaidValue;
      });
      setFwgMap(newMap);
    }

    // Mark line D/R as completed if newly paid
    if (newPaidValue) {
      await supabase
        .from("deductions_reimbursements")
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("payroll_report_id", updatedLine.id)
        .eq("is_completed", false);
    }

    setReportLines((prev) =>
      prev.map((r) => (r.id === line.id ? updatedLine : r))
    );

    if (selectedBatchId) {
      loadDedsForLines(reportLines.map((l) => l.id));
    }
  }

  function toggleAgentExpand(line) {
    setExpandedAgents((prev) => {
      const newSet = new Set(prev);
      newSet.has(line.id) ? newSet.delete(line.id) : newSet.add(line.id);
      return newSet;
    });
  }

  async function toggleAccountPaid(line, type, entryId) {
    const newPaidValue =
      type === "white"
        ? !wgeMap[entryId]?.frontend_paid
        : !fwgMap[entryId]?.frontend_paid;

    if (type === "white") {
      await supabase
        .from("white_glove_entries")
        .update({ frontend_paid: newPaidValue })
        .eq("id", entryId);
      setWgeMap((prev) => ({
        ...prev,
        [entryId]: { ...prev[entryId], frontend_paid: newPaidValue },
      }));
    } else {
      await supabase
        .from("fidium_white_glove_entries")
        .update({ frontend_paid: newPaidValue })
        .eq("id", entryId);
      setFwgMap((prev) => ({
        ...prev,
        [entryId]: { ...prev[entryId], frontend_paid: newPaidValue },
      }));
    }

    const lineAccs = Array.isArray(line.details) ? line.details : [];
    const allPaid = lineAccs.every((acc) => {
      if (acc.white_glove_entry_id && wgeMap[acc.white_glove_entry_id]) {
        return (
          wgeMap[acc.white_glove_entry_id].frontend_paid === true ||
          (acc.white_glove_entry_id === entryId && newPaidValue)
        );
      }
      if (acc.fidium_white_glove_id && fwgMap[acc.fidium_white_glove_id]) {
        return (
          fwgMap[acc.fidium_white_glove_id].frontend_paid === true ||
          (acc.fidium_white_glove_id === entryId && newPaidValue)
        );
      }
      return true;
    });

    const currentlyPaid = line.frontend_is_paid;
    if (allPaid && !currentlyPaid) {
      await supabase
        .from("payroll_reports")
        .update({ frontend_is_paid: true })
        .eq("id", line.id);
      await supabase
        .from("deductions_reimbursements")
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("payroll_report_id", line.id)
        .eq("is_completed", false);

      setReportLines((prev) =>
        prev.map((r) => (r.id === line.id ? { ...r, frontend_is_paid: true } : r))
      );
      if (selectedBatchId) {
        loadDedsForLines(reportLines.map((l) => l.id));
      }
    } else if (!allPaid && currentlyPaid) {
      await supabase
        .from("payroll_reports")
        .update({ frontend_is_paid: false })
        .eq("id", line.id);
      setReportLines((prev) =>
        prev.map((r) => (r.id === line.id ? { ...r, frontend_is_paid: false } : r))
      );
    }
  }

  function getPaidPercentage() {
    if (reportLines.length === 0) return "0";
    const paidCount = reportLines.filter((r) => r.frontend_is_paid).length;
    return ((paidCount / reportLines.length) * 100).toFixed(2);
  }

  async function renameBatch(batch) {
    const newName = window.prompt("New batch name?", batch.batch_name);
    if (newName && newName.trim()) {
      await supabase
        .from("payroll_report_batches")
        .update({ batch_name: newName.trim() })
        .eq("id", batch.id);
      fetchBatches();
    }
  }

  async function deleteBatch(batch) {
    if (confirm(`Delete batch ${batch.batch_name}?`)) {
      await supabase.from("payroll_reports").delete().eq("batch_id", batch.id);
      await supabase.from("payroll_report_batches").delete().eq("id", batch.id);
      fetchBatches();
    }
  }

  // Only "Create New" in the modal. We remove the "Attach Existing" UI entirely.
  function openAttachModal() {
    setShowAttachModal(true);
    setNewDed({
      payroll_report_id: "",
      agent_id: "",
      type: "deduction",
      reason: "",
      amount: "",
    });
    setSelectedReportLine(null);
  }

  function handleReportChange(lineId) {
    setNewDed((prev) => ({ ...prev, payroll_report_id: lineId, agent_id: "" }));
    const foundLine = reportLines.find((l) => l.id === lineId);
    setSelectedReportLine(foundLine || null);
  }

  async function createNewDed() {
    const amt = parseFloat(newDed.amount) || 0;
    if (!newDed.payroll_report_id || !newDed.agent_id || amt === 0) return;

    const payload = {
      agent_id: newDed.agent_id,
      payroll_report_id: newDed.payroll_report_id,
      type: newDed.type,
      reason: newDed.reason || "",
      amount: amt,
      is_completed: false,
    };
    await supabase.from("deductions_reimbursements").insert([payload]);
    setNewDed({
      payroll_report_id: "",
      agent_id: "",
      type: "deduction",
      reason: "",
      amount: "",
    });
    setSelectedReportLine(null);
    loadDedsForLines(reportLines.map((l) => l.id));
  }

  if (!selectedBatchId) {
    return (
      <div className="p-6 space-y-6 font-sans text-gray-900">
        <h2 className="text-2xl font-bold text-center">
          Saved Payroll Batches (Frontend)
        </h2>
        {loading && <div>Loading...</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {batches.map((b) => {
            const info = batchPaidMap[b.id] || { paidPercentage: 0 };
            const pct = info.paidPercentage;
            return (
              <div
                key={b.id}
                className="border rounded flex flex-col items-center cursor-pointer relative"
                onClick={() => enterBatch(b.id)}
                style={{
                  background: `linear-gradient(to right, #22c55e ${pct}%, #e5e7eb ${pct}%)`,
                }}
              >
                <div className="absolute top-2 left-2 bg-white bg-opacity-90 text-gray-800 text-sm font-bold px-2 py-1 rounded">
                  {pct}% Paid Out
                </div>
                <div
                  className="absolute top-2 right-2 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Dropdown>
                    <DropdownButton as="div" className="cursor-pointer flex items-center">
                      <EllipsisVerticalIcon className="h-5 w-5 text-gray-500" />
                    </DropdownButton>
                    <DropdownMenu className="min-w-32" anchor="bottom end">
                      <DropdownItem onClick={() => renameBatch(b)}>Rename</DropdownItem>
                      <DropdownDivider />
                      <DropdownItem onClick={() => deleteBatch(b)}>Delete</DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
                <div
                  className="w-full py-6 flex flex-col items-center"
                  style={{ pointerEvents: "none" }}
                >
                  <span className="text-lg font-semibold">{b.batch_name}</span>
                  <div className="text-sm text-gray-700">
                    Created: {new Date(b.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const paidPctNumber = parseFloat(getPaidPercentage());

  return (
    <div className="p-6 space-y-6 font-sans text-gray-900">
      <div className="flex items-center justify-between">
        <Button onClick={goBack}>Back to Batches</Button>
        <Button onClick={openAttachModal}>Attach Deduction / Reimbursement</Button>
      </div>

      <h3 className="text-lg font-bold mt-4">Batch Details (Frontend)</h3>
      <div className="flex items-center space-x-4 mb-4">
        <div>Total lines: {reportLines.length}</div>
        <div>{getPaidPercentage()}% paid out</div>
      </div>
      <div className="w-full bg-gray-200 h-2 rounded">
        <div
          className="bg-green-500 h-2 rounded"
          style={{ width: `${paidPctNumber}%` }}
        />
      </div>
      {loading && <div>Loading...</div>}

      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader />
            <TableHeader>Paid?</TableHeader>
            <TableHeader>Name</TableHeader>
            <TableHeader># Accounts</TableHeader>
            <TableHeader>Personal Total</TableHeader>
            <TableHeader>Manager Total</TableHeader>
            <TableHeader>Upfront</TableHeader>
            <TableHeader>Deductions/Reimb</TableHeader>
            <TableHeader>Net</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {reportLines.map((line) => {
            const isExpanded = expandedAgents.has(line.id);
            const personalTotal =
              typeof line.personal_total === "number" ? line.personal_total : 0;
            const personal80 = personalTotal * 0.8;
            const managerTotal =
              typeof line.manager_total === "number" && line.manager_total > 0
                ? line.manager_total
                : 0;

            const personalTotalDisplay =
              personalTotal > 0 ? `$${personalTotal.toFixed(2)}` : "N/A";
            const managerTotalDisplay =
              managerTotal > 0 ? `$${managerTotal.toFixed(2)}` : "N/A";

            const upfrontDisplay =
              line.upfront_value !== null && !isNaN(line.upfront_value)
                ? `$${line.upfront_value.toFixed(2)} (${line.upfront_percentage}%)`
                : "N/A";

            const lineDeds = lineDedMap[line.id] || [];
            let dedSum = 0;
            const dedStrings = lineDeds.map((d) => {
              const sign = d.type === "deduction" ? -1 : 1;
              const value = sign * (d.amount || 0);
              dedSum += value;
              const displayVal =
                (sign > 0 ? "+" : "-") + `$${Math.abs(d.amount).toFixed(2)}`;
              const colorClass = sign > 0 ? "text-green-600" : "text-red-600";
              return (
                <span key={d.id} className={colorClass}>
                  {displayVal}
                </span>
              );
            });

            const netVal = personal80 + dedSum;

            return (
              <React.Fragment key={line.id}>
                <TableRow className={line.frontend_is_paid ? "bg-green-100" : ""}>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="plain"
                      onClick={() => toggleAgentExpand(line)}
                    >
                      {isExpanded ? (
                        <ChevronUpIcon className="h-5 w-5" />
                      ) : (
                        <ChevronDownIcon className="h-5 w-5" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={line.frontend_is_paid}
                      onChange={() => togglePaid(line)}
                    />
                  </TableCell>
                  <TableCell>{line.name}</TableCell>
                  <TableCell>{line.accounts}</TableCell>
                  <TableCell>{personalTotalDisplay}</TableCell>
                  <TableCell>{managerTotalDisplay}</TableCell>
                  <TableCell>{upfrontDisplay}</TableCell>
                  <TableCell>
                    {dedStrings.length > 0 ? (
                      <div className="flex flex-col gap-1">{dedStrings}</div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>${netVal.toFixed(2)}</TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-gray-50">
                      <div className="p-4">
                        <h4 className="font-bold mb-2">Sales Details</h4>
                        <Table striped>
                          <TableHead>
                            <TableRow>
                              <TableHeader />
                              <TableHeader>Order #</TableHeader>
                              <TableHeader>Customer Name</TableHeader>
                              <TableHeader>Address</TableHeader>
                              <TableHeader>Plan</TableHeader>
                              <TableHeader>Install Date</TableHeader>
                              <TableHeader>Personal Comm</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(line.details || []).map((acc, idx) => {
                              if (acc.white_glove_entry_id) {
                                const w = wgeMap[acc.white_glove_entry_id];
                                if (!w) return null;
                                const comm = `$${(
                                  acc.personal_commission || 0
                                ).toFixed(2)}`;
                                const iDate = w.install_date
                                  ? new Date(w.install_date).toLocaleDateString()
                                  : "N/A";
                                const isPaid = w.frontend_paid;
                                return (
                                  <TableRow
                                    key={idx}
                                    className={isPaid ? "bg-green-50" : ""}
                                  >
                                    <TableCell>
                                      <Checkbox
                                        checked={isPaid}
                                        onChange={() =>
                                          toggleAccountPaid(line, "white", w.id)
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>{w.order_number}</TableCell>
                                    <TableCell>{w.customer_name}</TableCell>
                                    <TableCell>
                                      {(w.customer_street_address || "") +
                                        " " +
                                        (w.customer_city || "") +
                                        " " +
                                        (w.customer_state || "")}
                                    </TableCell>
                                    <TableCell>
                                      {w.internet_speed || "N/A"}
                                    </TableCell>
                                    <TableCell>{iDate}</TableCell>
                                    <TableCell>{comm}</TableCell>
                                  </TableRow>
                                );
                              } else if (acc.fidium_white_glove_id) {
                                const f = fwgMap[acc.fidium_white_glove_id];
                                if (!f) return null;
                                const comm = `$${(
                                  acc.personal_commission || 0
                                ).toFixed(2)}`;
                                const iDate = f.install_date
                                  ? new Date(f.install_date).toLocaleDateString()
                                  : "N/A";
                                const isPaid = f.frontend_paid;
                                return (
                                  <TableRow
                                    key={idx}
                                    className={isPaid ? "bg-green-50" : ""}
                                  >
                                    <TableCell>
                                      <Checkbox
                                        checked={isPaid}
                                        onChange={() =>
                                          toggleAccountPaid(line, "fidium", f.id)
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>{f.order_number}</TableCell>
                                    <TableCell>{f.customer_name}</TableCell>
                                    <TableCell>{f.service_address}</TableCell>
                                    <TableCell>
                                      {f.requested_services || "N/A"}
                                    </TableCell>
                                    <TableCell>{iDate}</TableCell>
                                    <TableCell>{comm}</TableCell>
                                  </TableRow>
                                );
                              } else {
                                return null;
                              }
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>

      {showAttachModal && (
        <Dialog open onClose={() => setShowAttachModal(false)} size="xl">
          <DialogTitle>Attach Deduction / Reimbursement</DialogTitle>
          <DialogBody>
            {/* Only "Create New" content now */}
            <div className="p-3 rounded">
              <h4 className="font-semibold mb-2">Create New</h4>
              <Field className="mb-2">
                <Label>Report (Line)</Label>
                <Select
                  value={newDed.payroll_report_id}
                  onChange={(e) => {
                    handleReportChange(e.target.value);
                  }}
                >
                  <option value="">(Select a line)</option>
                  {reportLines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field className="mb-2">
                <Label>Agent</Label>
                <Select
                  value={newDed.agent_id}
                  onChange={(e) =>
                    setNewDed((prev) => ({ ...prev, agent_id: e.target.value }))
                  }
                >
                  <option value="">(Select agent)</option>
                  {selectedReportLine && selectedReportLine.agent_id && (
                    <option value={selectedReportLine.agent_id}>
                      {agentMap[selectedReportLine.agent_id]
                        ? agentMap[selectedReportLine.agent_id].name ||
                          agentMap[selectedReportLine.agent_id].identifier ||
                          selectedReportLine.agent_id
                        : selectedReportLine.agent_id}
                    </option>
                  )}
                </Select>
              </Field>

              <Field className="mb-2">
                <Label>Type</Label>
                <Select
                  value={newDed.type}
                  onChange={(e) =>
                    setNewDed((prev) => ({ ...prev, type: e.target.value }))
                  }
                >
                  <option value="deduction">Deduction</option>
                  <option value="reimbursement">Reimbursement</option>
                </Select>
              </Field>

              <Field className="mb-2">
                <Label>Reason</Label>
                <Input
                  value={newDed.reason}
                  onChange={(e) =>
                    setNewDed((prev) => ({ ...prev, reason: e.target.value }))
                  }
                />
              </Field>

              <Field className="mb-4">
                <Label>Amount</Label>
                <Input
                  type="number"
                  value={newDed.amount}
                  onChange={(e) =>
                    setNewDed((prev) => ({ ...prev, amount: e.target.value }))
                  }
                />
              </Field>

              <Button onClick={createNewDed}>Create</Button>
            </div>
          </DialogBody>
          <DialogActions>
            <Button plain onClick={() => setShowAttachModal(false)}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}
