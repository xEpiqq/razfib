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
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
  DropdownDivider,
} from "@/components/dropdown";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/20/solid";

function isOverdue(install_date) {
  if (!install_date) return false;
  const now = new Date();
  return (now - new Date(install_date)) / (1000 * 60 * 60 * 24) > 90;
}

function getOverdueDays(install_date) {
  const now = new Date();
  return Math.floor((now - new Date(install_date)) / (1000 * 60 * 60 * 24));
}

async function computeBatchOverdueCountsBackend(supabase, batches) {
  const newOverdueCounts = {};
  for (const batch of batches) {
    const { data: linesData } = await supabase
      .from("payroll_reports")
      .select("details,report_type,backend_is_paid")
      .eq("batch_id", batch.id);

    if (!linesData || linesData.length === 0) {
      newOverdueCounts[batch.id] = 0;
      continue;
    }

    const allWgeIds = [];
    const allFwgIds = [];
    linesData.forEach((line) => {
      if (Array.isArray(line.details)) {
        for (const d of line.details) {
          if (d.white_glove_entry_id) allWgeIds.push(d.white_glove_entry_id);
          if (d.fidium_white_glove_id) allFwgIds.push(d.fidium_white_glove_id);
        }
      }
    });

    let overdueCount = 0;
    if (allWgeIds.length > 0) {
      const { data: wgeData } = await supabase
        .from("white_glove_entries")
        .select("install_date,backend_paid")
        .in("id", allWgeIds);
      (wgeData || []).forEach((w) => {
        if (!w.backend_paid && isOverdue(w.install_date)) overdueCount++;
      });
    }
    if (allFwgIds.length > 0) {
      const { data: fwgData } = await supabase
        .from("fidium_white_glove_entries")
        .select("install_date,backend_paid")
        .in("id", allFwgIds);
      (fwgData || []).forEach((f) => {
        if (!f.backend_paid && isOverdue(f.install_date)) overdueCount++;
      });
    }

    newOverdueCounts[batch.id] = overdueCount;
  }
  return newOverdueCounts;
}

export default function BackendReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [batches, setBatches] = useState([]);
  const [batchOverdueCounts, setBatchOverdueCounts] = useState({});
  const [batchPaidMap, setBatchPaidMap] = useState({});
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [reportLines, setReportLines] = useState([]);
  const [expandedAgents, setExpandedAgents] = useState(new Set());
  const [wgeMap, setWgeMap] = useState({});
  const [fwgMap, setFwgMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBatches();
  }, []);

  async function fetchBatches() {
    setLoading(true);
    const { data: batchData } = await supabase
      .from("payroll_report_batches")
      .select("*")
      .order("created_at", { ascending: false });
    if (!batchData) {
      setLoading(false);
      return;
    }
    const overdueCounts = await computeBatchOverdueCountsBackend(
      supabase,
      batchData
    );
    const newBatchPaidMap = {};
    for (const batch of batchData) {
      const { data: reportsData } = await supabase
        .from("payroll_reports")
        .select("backend_is_paid")
        .eq("batch_id", batch.id);
      if (reportsData && reportsData.length > 0) {
        const total = reportsData.length;
        const paidCount = reportsData.filter((r) => r.backend_is_paid).length;
        const pct = ((paidCount / total) * 100).toFixed(2);
        newBatchPaidMap[batch.id] = { paidPercentage: parseFloat(pct) };
      } else {
        newBatchPaidMap[batch.id] = { paidPercentage: 0 };
      }
    }
    setBatches(batchData);
    setBatchOverdueCounts(overdueCounts);
    setBatchPaidMap(newBatchPaidMap);
    setLoading(false);
  }

  async function loadBatchDetails(batch_id) {
    setLoading(true);
    const { data: linesData } = await supabase
      .from("payroll_reports")
      .select("*")
      .eq("batch_id", batch_id);
    if (!linesData) {
      setLoading(false);
      return;
    }
    linesData.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const allWgeIds = [];
    const allFwgIds = [];
    for (const line of linesData) {
      if (Array.isArray(line.details)) {
        for (const d of line.details) {
          if (d.white_glove_entry_id) allWgeIds.push(d.white_glove_entry_id);
          if (d.fidium_white_glove_id) allFwgIds.push(d.fidium_white_glove_id);
        }
      }
    }

    let wgeById = {};
    if (allWgeIds.length > 0) {
      const { data: wgeData } = await supabase
        .from("white_glove_entries")
        .select("*")
        .in("id", allWgeIds);
      (wgeData || []).forEach((w) => {
        wgeById[w.id] = w;
      });
    }

    let fwgById = {};
    if (allFwgIds.length > 0) {
      const { data: fwgData } = await supabase
        .from("fidium_white_glove_entries")
        .select("*")
        .in("id", allFwgIds);
      (fwgData || []).forEach((f) => {
        fwgById[f.id] = f;
      });
    }

    // Auto-check if line is fully paid
    for (const line of linesData) {
      const lineAccs = Array.isArray(line.details) ? line.details : [];
      const allPaid =
        lineAccs.length > 0 &&
        lineAccs.every((acc) => {
          if (acc.white_glove_entry_id)
            return wgeById[acc.white_glove_entry_id]?.backend_paid;
          if (acc.fidium_white_glove_id)
            return fwgById[acc.fidium_white_glove_id]?.backend_paid;
          return true;
        });
      if (allPaid && !line.backend_is_paid) {
        line.backend_is_paid = true;
        supabase
          .from("payroll_reports")
          .update({ backend_is_paid: true })
          .eq("id", line.id);
      }
    }

    setReportLines(linesData);
    setWgeMap(wgeById);
    setFwgMap(fwgById);
    setLoading(false);
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
    await fetchBatches();
  }

  function toggleAgentExpand(line) {
    setExpandedAgents((prev) => {
      const newSet = new Set(prev);
      newSet.has(line.id) ? newSet.delete(line.id) : newSet.add(line.id);
      return newSet;
    });
  }

  async function togglePaid(line) {
    const newPaidValue = !line.backend_is_paid;
    const { data: updatedLineData } = await supabase
      .from("payroll_reports")
      .update({ backend_is_paid: newPaidValue })
      .eq("id", line.id)
      .select("*");
    if (!updatedLineData) return;

    const updatedLine = updatedLineData[0];
    const lineAccs = Array.isArray(updatedLine.details)
      ? updatedLine.details
      : [];
    const wIds = lineAccs
      .filter((d) => d.white_glove_entry_id)
      .map((d) => d.white_glove_entry_id);
    const fIds = lineAccs
      .filter((d) => d.fidium_white_glove_id)
      .map((d) => d.fidium_white_glove_id);

    if (wIds.length > 0) {
      await supabase
        .from("white_glove_entries")
        .update({ backend_paid: newPaidValue })
        .in("id", wIds);
      const newMap = { ...wgeMap };
      wIds.forEach((id) => {
        if (newMap[id]) newMap[id].backend_paid = newPaidValue;
      });
      setWgeMap(newMap);
    }
    if (fIds.length > 0) {
      await supabase
        .from("fidium_white_glove_entries")
        .update({ backend_paid: newPaidValue })
        .in("id", fIds);
      const newMap = { ...fwgMap };
      fIds.forEach((id) => {
        if (newMap[id]) newMap[id].backend_paid = newPaidValue;
      });
      setFwgMap(newMap);
    }

    setReportLines((prev) =>
      prev.map((r) => (r.id === line.id ? updatedLine : r))
    );
    if (newPaidValue) {
      setExpandedAgents((prev) => new Set([...prev, updatedLine.id]));
    }
  }

  async function toggleAccountPaid(line, type, entryId) {
    const newPaidValue =
      type === "white"
        ? !wgeMap[entryId]?.backend_paid
        : !fwgMap[entryId]?.backend_paid;

    if (type === "white") {
      await supabase
        .from("white_glove_entries")
        .update({ backend_paid: newPaidValue })
        .eq("id", entryId);
      setWgeMap((prev) => ({
        ...prev,
        [entryId]: { ...prev[entryId], backend_paid: newPaidValue },
      }));
    } else {
      await supabase
        .from("fidium_white_glove_entries")
        .update({ backend_paid: newPaidValue })
        .eq("id", entryId);
      setFwgMap((prev) => ({
        ...prev,
        [entryId]: { ...prev[entryId], backend_paid: newPaidValue },
      }));
    }

    const lineAccs = Array.isArray(line.details) ? line.details : [];
    const allPaid = lineAccs.every((acc) => {
      if (acc.white_glove_entry_id) {
        return (
          wgeMap[acc.white_glove_entry_id]?.backend_paid === true ||
          (acc.white_glove_entry_id === entryId && newPaidValue)
        );
      }
      if (acc.fidium_white_glove_id) {
        return (
          fwgMap[acc.fidium_white_glove_id]?.backend_paid === true ||
          (acc.fidium_white_glove_id === entryId && newPaidValue)
        );
      }
      return true;
    });
    if (allPaid && !line.backend_is_paid) {
      await supabase
        .from("payroll_reports")
        .update({ backend_is_paid: true })
        .eq("id", line.id);
      setReportLines((prev) =>
        prev.map((r) => (r.id === line.id ? { ...r, backend_is_paid: true } : r))
      );
    } else if (!allPaid && line.backend_is_paid) {
      await supabase
        .from("payroll_reports")
        .update({ backend_is_paid: false })
        .eq("id", line.id);
      setReportLines((prev) =>
        prev.map((r) => (r.id === line.id ? { ...r, backend_is_paid: false } : r))
      );
    }
  }

  function getPaidPercentage() {
    if (reportLines.length === 0) return "0";
    const paidCount = reportLines.filter((r) => r.backend_is_paid).length;
    return ((paidCount / reportLines.length) * 100).toFixed(2);
  }

  function lineHasOverdue(line) {
    const accs = Array.isArray(line.details) ? line.details : [];
    return accs.some((d) => {
      if (d.white_glove_entry_id) {
        const w = wgeMap[d.white_glove_entry_id];
        return w && !w.backend_paid && isOverdue(w.install_date);
      }
      if (d.fidium_white_glove_id) {
        const f = fwgMap[d.fidium_white_glove_id];
        return f && !f.backend_paid && isOverdue(f.install_date);
      }
      return false;
    });
  }

  function getMaxOverdueDaysForLine(line) {
    let maxDays = 0;
    const accs = Array.isArray(line.details) ? line.details : [];
    for (const d of accs) {
      if (d.white_glove_entry_id) {
        const w = wgeMap[d.white_glove_entry_id];
        if (w && !w.backend_paid) {
          const days = getOverdueDays(w.install_date);
          if (days > maxDays) maxDays = days;
        }
      } else if (d.fidium_white_glove_id) {
        const f = fwgMap[d.fidium_white_glove_id];
        if (f && !f.backend_paid) {
          const days = getOverdueDays(f.install_date);
          if (days > maxDays) maxDays = days;
        }
      }
    }
    return maxDays;
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

  if (!selectedBatchId) {
    return (
      <div className="p-6 space-y-6 font-sans text-gray-900">
        <h2 className="text-2xl font-bold text-center">
          Saved Payroll Batches (Backend)
        </h2>
        {loading && <div>Loading...</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {batches.map((b) => {
            const overdueCount = batchOverdueCounts[b.id] || 0;
            const paidInfo = batchPaidMap[b.id] || { paidPercentage: 0 };
            const pct = paidInfo.paidPercentage;
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
                {overdueCount > 0 && (
                  <span className="absolute top-2 right-12 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {overdueCount}
                  </span>
                )}
                <div
                  className="absolute top-2 right-2 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Dropdown>
                    <DropdownButton
                      as="div"
                      className="cursor-pointer flex items-center"
                    >
                      <EllipsisVerticalIcon className="h-5 w-5 text-gray-500" />
                    </DropdownButton>
                    <DropdownMenu className="min-w-32" anchor="bottom end">
                      <DropdownItem onClick={() => renameBatch(b)}>
                        Rename
                      </DropdownItem>
                      <DropdownDivider />
                      <DropdownItem onClick={() => deleteBatch(b)}>
                        Delete
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
                <div
                  className="w-full py-6 flex flex-col items-center"
                  style={{ pointerEvents: "none" }}
                >
                  <span className="text-lg font-semibold">
                    {b.batch_name}
                  </span>
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

  const paidPct = parseFloat(getPaidPercentage());

  return (
    <div className="p-6 space-y-6">
      <Button onClick={goBack}>Back to Batches</Button>
      <h3 className="text-lg font-bold mt-4">Batch Details (Backend)</h3>
      <div className="flex items-center space-x-4 mb-4">
        <div>Total lines: {reportLines.length}</div>
        <div>{getPaidPercentage()}% paid out</div>
      </div>
      <div className="w-full bg-gray-200 h-2 rounded">
        <div
          className="bg-green-500 h-2 rounded"
          style={{ width: `${paidPct}%` }}
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
            <TableHeader>Backend</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {reportLines.map((line) => {
            const isExpanded = expandedAgents.has(line.id);
            const personalTotalDisplay =
              typeof line.personal_total === "number"
                ? `$${line.personal_total.toFixed(2)}`
                : "N/A";
            const backendVal = line.backend_value || 0;
            const backendPerc = line.backend_percentage;
            const backendDisplay =
              backendPerc !== null && !isNaN(backendPerc)
                ? `$${backendVal.toFixed(2)} (${backendPerc}%)`
                : "N/A";
            const overdueLine = lineHasOverdue(line);
            let maxDays = overdueLine ? getMaxOverdueDaysForLine(line) : 0;
            if (overdueLine) maxDays = maxDays - 90;
            const lineStatus =
              overdueLine && !line.backend_is_paid
                ? `Overdue (${maxDays} days)`
                : line.backend_is_paid
                ? "Paid"
                : "Unpaid";
            const rowClass = line.backend_is_paid
              ? "bg-green-100"
              : overdueLine
              ? "bg-red-100"
              : "";

            return (
              <React.Fragment key={line.id}>
                <TableRow className={rowClass}>
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
                      checked={line.backend_is_paid}
                      onChange={() => togglePaid(line)}
                    />
                  </TableCell>
                  <TableCell>
                    {overdueLine ? (
                      <span className="text-red-700 font-bold">
                        {line.name}
                      </span>
                    ) : (
                      line.name
                    )}
                  </TableCell>
                  <TableCell>{line.accounts}</TableCell>
                  <TableCell>{personalTotalDisplay}</TableCell>
                  <TableCell>{backendDisplay}</TableCell>
                  <TableCell>{lineStatus}</TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-gray-50">
                      <div className="p-4">
                        <h4 className="font-bold mb-2">
                          Sales Details (Backend)
                        </h4>
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
                              <TableHeader>Status</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(line.details || []).map((acc, idx) => {
                              if (acc.white_glove_entry_id) {
                                const w = wgeMap[acc.white_glove_entry_id];
                                if (!w) return null;
                                const personalComm = `$${(
                                  acc.personal_commission || 0
                                ).toFixed(2)}`;
                                const installDate = w.install_date
                                  ? new Date(w.install_date).toLocaleDateString()
                                  : "N/A";
                                const isPaid = w.backend_paid;
                                let status = "Unpaid";
                                if (isPaid) {
                                  status = "Paid";
                                } else if (isOverdue(w.install_date)) {
                                  status = `Overdue (${
                                    getOverdueDays(w.install_date) - 90
                                  } days)`;
                                }
                                return (
                                  <TableRow
                                    key={idx}
                                    className={
                                      isPaid
                                        ? "bg-green-50"
                                        : status.startsWith("Overdue")
                                        ? "bg-red-50"
                                        : ""
                                    }
                                  >
                                    <TableCell>
                                      <Checkbox
                                        checked={isPaid}
                                        onChange={() =>
                                          toggleAccountPaid(
                                            line,
                                            "white",
                                            w.id
                                          )
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
                                    <TableCell>{installDate}</TableCell>
                                    <TableCell>{personalComm}</TableCell>
                                    <TableCell>{status}</TableCell>
                                  </TableRow>
                                );
                              } else if (acc.fidium_white_glove_id) {
                                const f = fwgMap[acc.fidium_white_glove_id];
                                if (!f) return null;
                                const personalComm = `$${(
                                  acc.personal_commission || 0
                                ).toFixed(2)}`;
                                const installDate = f.install_date
                                  ? new Date(f.install_date).toLocaleDateString()
                                  : "N/A";
                                const isPaid = f.backend_paid;
                                let status = "Unpaid";
                                if (isPaid) {
                                  status = "Paid";
                                } else if (isOverdue(f.install_date)) {
                                  status = `Overdue (${
                                    getOverdueDays(f.install_date) - 90
                                  } days)`;
                                }
                                return (
                                  <TableRow
                                    key={idx}
                                    className={
                                      isPaid
                                        ? "bg-green-50"
                                        : status.startsWith("Overdue")
                                        ? "bg-red-50"
                                        : ""
                                    }
                                  >
                                    <TableCell>
                                      <Checkbox
                                        checked={isPaid}
                                        onChange={() =>
                                          toggleAccountPaid(
                                            line,
                                            "fidium",
                                            f.id
                                          )
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>{f.order_number}</TableCell>
                                    <TableCell>{f.customer_name}</TableCell>
                                    <TableCell>
                                      {f.service_address}
                                    </TableCell>
                                    <TableCell>
                                      {f.requested_services || "N/A"}
                                    </TableCell>
                                    <TableCell>{installDate}</TableCell>
                                    <TableCell>{personalComm}</TableCell>
                                    <TableCell>{status}</TableCell>
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
    </div>
  );
}
