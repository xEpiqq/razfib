"use client";

import React, { useState, useRef } from "react";
import Papa from "papaparse";
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
import { Input } from "@/components/input";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";

/**
 * Safely parse a US-format date string ("MM/DD/YY" or "MM/DD/YYYY").
 */
function parseUSDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.split("/").map((p) => p.trim());
  if (parts.length === 3) {
    let mm = parseInt(parts[0], 10);
    let dd = parseInt(parts[1], 10);
    let yy = parseInt(parts[2], 10);
    if (!isNaN(mm) && !isNaN(dd) && !isNaN(yy)) {
      if (yy < 50) yy += 2000;
      else if (yy < 100) yy += 1900;
      const parsed = new Date(yy, mm - 1, dd);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Insert or update Fidium White Glove rows into "fidium_white_glove_entries" table.
 */
async function insertFidiumWhiteGloveEntries(supabase, fidiumRows) {
  const entries = fidiumRows.map((row) => ({
    sales_partner: row["SALES_PARTNER"] || null,
    dsi_dealer_type: row["DSI_DEALER_TYPE"] || null,
    sale_format: row["SALE_FORMAT"] || null,
    sales_rep: row["SALES_REP"] || null,
    submission_date: parseUSDate(row["SUBMISSION_DATE"]),
    customer_name: row["CUSTOMER_NAME"] || null,
    service_address: row["SERVICE_ADDRESS"] || null,
    city: row["CITY"] || null,
    state: row["STATE"] || null,
    zip: row["ZIP"] || null,
    order_type: row["ORDER_TYPE"] || null,
    requested_services: row["REQUESTED_SERVICES"] || null,
    status_change_date: parseUSDate(row["STATUS_CHANGE_DATE"]),
    sales_status: row["SALES_STATUS"] || null,
    install_status: row["INSTALL_STATUS"] || null,
    order_number: row["ORDER_NUMBER"] || null,
    install_date: parseUSDate(row["INSTALL_DATE"]),
    amount: row["Amount"] ? parseFloat(row["Amount"]) : null,
    frontend_paid: false,
    backend_paid: false,
  }));

  // Upsert by (order_number, requested_services)
  await supabase
    .from("fidium_white_glove_entries")
    .upsert(entries, { onConflict: "order_number,requested_services" });
}

/**
 * Manager override for (manager, agent, fidium_plan),
 * then date-range override inside fidium_manager_agent_commission_date_ranges.
 */
async function getFidiumManagerOverride({
  supabase,
  managerId,
  agentId,
  planId,
  submissionDate,
}) {
  if (!managerId || !agentId || !planId) return null;

  const { data: overrideRows } = await supabase
    .from("fidium_manager_agent_commissions")
    .select("id, manager_commission_value")
    .eq("manager_id", managerId)
    .eq("agent_id", agentId)
    .eq("fidium_plan_id", planId);

  if (!overrideRows || overrideRows.length === 0) return null;
  const override = overrideRows[0];
  const baseVal = override.manager_commission_value;

  const { data: rangeRows } = await supabase
    .from("fidium_manager_agent_commission_date_ranges")
    .select("*")
    .eq("fidium_manager_agent_commission_id", override.id)
    .eq("fidium_plan_id", planId);

  if (!rangeRows || rangeRows.length === 0) return baseVal;

  const subDate = submissionDate instanceof Date ? submissionDate : parseUSDate(submissionDate);
  if (!subDate) return baseVal;

  let matchedRange = null;
  for (const rr of rangeRows) {
    const start = new Date(rr.start_date);
    const end = rr.end_date ? new Date(rr.end_date) : null;
    if (subDate >= start && (!end || subDate <= end)) {
      if (!matchedRange) matchedRange = rr;
      else if (new Date(rr.start_date) > new Date(matchedRange.start_date)) {
        matchedRange = rr;
      }
    }
  }
  return matchedRange ? matchedRange.manager_commission_value : baseVal;
}

/**
 * Fidium personal payscale => check date ranges.
 */
async function getFidiumPersonalCommission({
  supabase,
  fidiumPersonalPayscaleId,
  fidiumPlanId,
  submissionDate,
}) {
  if (!fidiumPersonalPayscaleId || !fidiumPlanId) return 0;

  const { data: drs } = await supabase
    .from("fidium_personal_payscale_date_ranges")
    .select("*, fidium_personal_payscale_date_range_plan_commissions(*)")
    .eq("fidium_personal_payscale_id", fidiumPersonalPayscaleId);

  if (!drs || drs.length === 0) {
    // fallback to base
    const { data: baseComm } = await supabase
      .from("fidium_personal_payscale_plan_commissions")
      .select("*")
      .eq("fidium_personal_payscale_id", fidiumPersonalPayscaleId)
      .eq("fidium_plan_id", fidiumPlanId)
      .single();
    return baseComm?.rep_commission_value || 0;
  }

  const subDate =
    submissionDate instanceof Date ? submissionDate : parseUSDate(submissionDate);
  if (!subDate) {
    // fallback
    const { data: baseComm } = await supabase
      .from("fidium_personal_payscale_plan_commissions")
      .select("*")
      .eq("fidium_personal_payscale_id", fidiumPersonalPayscaleId)
      .eq("fidium_plan_id", fidiumPlanId)
      .single();
    return baseComm?.rep_commission_value || 0;
  }

  let matchedRange = null;
  for (const dr of drs) {
    const start = new Date(dr.start_date);
    const end = dr.end_date ? new Date(dr.end_date) : null;
    if (subDate >= start && (!end || subDate <= end)) {
      if (!matchedRange) matchedRange = dr;
      else if (new Date(dr.start_date) > new Date(matchedRange.start_date)) {
        matchedRange = dr;
      }
    }
  }
  if (matchedRange) {
    const pc = matchedRange.fidium_personal_payscale_date_range_plan_commissions.find(
      (x) => x.fidium_plan_id === fidiumPlanId
    );
    return pc?.rep_commission_value || 0;
  }

  // no match => base
  const { data: fallbackComm } = await supabase
    .from("fidium_personal_payscale_plan_commissions")
    .select("*")
    .eq("fidium_personal_payscale_id", fidiumPersonalPayscaleId)
    .eq("fidium_plan_id", fidiumPlanId)
    .single();
  return fallbackComm?.rep_commission_value || 0;
}

/**
 * Fidium manager payscale => check date ranges.
 */
async function getFidiumManagerCommission({
  supabase,
  fidiumManagerPayscaleId,
  fidiumPlanId,
  submissionDate,
}) {
  if (!fidiumManagerPayscaleId || !fidiumPlanId) return 0;

  const { data: drs } = await supabase
    .from("fidium_manager_payscale_date_ranges")
    .select("*, fidium_manager_payscale_date_range_plan_commissions(*)")
    .eq("fidium_manager_payscale_id", fidiumManagerPayscaleId);

  if (!drs || drs.length === 0) {
    // fallback
    const { data: baseComm } = await supabase
      .from("fidium_manager_payscale_plan_commissions")
      .select("*")
      .eq("fidium_manager_payscale_id", fidiumManagerPayscaleId)
      .eq("fidium_plan_id", fidiumPlanId)
      .single();
    return baseComm?.manager_commission_value || 0;
  }

  const subDate =
    submissionDate instanceof Date ? submissionDate : parseUSDate(submissionDate);
  if (!subDate) {
    const { data: baseComm } = await supabase
      .from("fidium_manager_payscale_plan_commissions")
      .select("*")
      .eq("fidium_manager_payscale_id", fidiumManagerPayscaleId)
      .eq("fidium_plan_id", fidiumPlanId)
      .single();
    return baseComm?.manager_commission_value || 0;
  }

  let matchedRange = null;
  for (const dr of drs) {
    const start = new Date(dr.start_date);
    const end = dr.end_date ? new Date(dr.end_date) : null;
    if (subDate >= start && (!end || subDate <= end)) {
      if (!matchedRange) matchedRange = dr;
      else if (new Date(dr.start_date) > new Date(matchedRange.start_date)) {
        matchedRange = dr;
      }
    }
  }
  if (matchedRange) {
    const pc = matchedRange.fidium_manager_payscale_date_range_plan_commissions.find(
      (x) => x.fidium_plan_id === fidiumPlanId
    );
    return pc?.manager_commission_value || 0;
  }

  // no match => base
  const { data: fallbackComm } = await supabase
    .from("fidium_manager_payscale_plan_commissions")
    .select("*")
    .eq("fidium_manager_payscale_id", fidiumManagerPayscaleId)
    .eq("fidium_plan_id", fidiumPlanId)
    .single();
  return fallbackComm?.manager_commission_value || 0;
}

export default function FidiumFlow({ supabase }) {
  const [fidiumFile, setFidiumFile] = useState(null);
  const fidiumFileRef = useRef(null);

  const [fidiumReport, setFidiumReport] = useState([]);
  const [fidiumDetails, setFidiumDetails] = useState({});
  const [expandedFidium, setExpandedFidium] = useState(new Set());
  const [fidiumBatchName, setFidiumBatchName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFidiumFileClick = () => fidiumFileRef.current.click();

  function toggleFidiumExpand(agentId) {
    setExpandedFidium((prev) => {
      const newSet = new Set(prev);
      newSet.has(agentId) ? newSet.delete(agentId) : newSet.add(agentId);
      return newSet;
    });
  }

  async function parseFidiumFile() {
    if (!fidiumFile) {
      alert("Please select a Fidium CSV file.");
      return;
    }
    setLoading(true);

    Papa.parse(fidiumFile, {
      header: true,
      complete: async (res) => {
        try {
          const fidiumRows = res.data || [];
          await upsertFidiumPlans(fidiumRows);
          await upsertFidiumSalesmen(fidiumRows);
          // Actually insert into fidium_white_glove_entries
          await insertFidiumWhiteGloveEntries(supabase, fidiumRows);
          // Now compute the final Fidium payroll
          await generateFidiumReport(fidiumRows);
        } catch (err) {
          console.error("Error processing Fidium CSV:", err);
          alert("Error processing Fidium CSV");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function upsertFidiumPlans(fidiumRows) {
    const planSet = new Set();
    fidiumRows.forEach((row) => {
      const planRaw = row["REQUESTED_SERVICES"]?.trim();
      if (planRaw) planSet.add(planRaw);
    });
    for (const planName of planSet) {
      await supabase
        .from("fidium_plans")
        .upsert([{ name: planName, commission_amount: 0 }], { onConflict: "name" });
    }
  }

  async function upsertFidiumSalesmen(fidiumRows) {
    const repSet = new Set();
    fidiumRows.forEach((row) => {
      if (row["SALES_REP"]?.trim()) {
        repSet.add(row["SALES_REP"].trim());
      }
    });
    const { data: existing } = await supabase.from("fidium_salesmen").select("rep_name");
    const existingSet = new Set((existing || []).map((x) => x.rep_name));
    const newReps = [...repSet].filter((r) => !existingSet.has(r));
    if (newReps.length > 0) {
      await supabase.from("fidium_salesmen").insert(newReps.map((r) => ({ rep_name: r })));
    }
  }

  /**
   * Build the final Fidium commission report
   */
  async function generateFidiumReport(fidiumRows) {
    const { data: agents } = await supabase.from("agents").select("*");
    const { data: agentManagers } = await supabase.from("agent_managers").select("*");
    const { data: fPlans } = await supabase.from("fidium_plans").select("*");
    const { data: fwgAll } = await supabase.from("fidium_white_glove_entries").select("*");
    const { data: fidPers } = await supabase.from("fidium_personal_payscales").select("*");
    const { data: fidMgr } = await supabase.from("fidium_manager_payscales").select("*");

    // build a map (orderNum||requested_services) -> fidium white glove row
    const fwgByCombo = {};
    (fwgAll || []).forEach((fwg) => {
      const key = `${fwg.order_number}||${(fwg.requested_services || "").trim()}`;
      fwgByCombo[key] = fwg;
    });

    // agent's Fidium ID -> agent
    const agentByFidiumId = {};
    (agents || []).forEach((a) => {
      if (a.fidium_identifier) {
        agentByFidiumId[a.fidium_identifier.trim()] = a;
      }
    });

    // plan name -> plan object
    const fPlanByName = {};
    (fPlans || []).forEach((p) => {
      if (p.name) {
        fPlanByName[p.name.trim()] = p;
      }
    });

    // manager relationship
    const managerFor = {};
    (agentManagers || []).forEach((am) => {
      managerFor[am.agent_id] = am.manager_id;
    });

    // build totals
    const totals = {};
    (agents || []).forEach((a) => {
      if (a.fidium_identifier) {
        let up = 0,
          bp = 0;
        if (
          a.fidium_personal_payscale_id &&
          fidPers.find((x) => x.id === a.fidium_personal_payscale_id)
        ) {
          const psObj = fidPers.find((x) => x.id === a.fidium_personal_payscale_id);
          up = parseFloat(psObj.upfront_percentage) || 0;
          bp = parseFloat(psObj.backend_percentage) || 0;
        }
        totals[a.id] = {
          name: a.name || a.identifier,
          accounts: 0,
          personalTotal: 0,
          managerTotal: 0,
          upfront_percentage: up,
          backend_percentage: bp,
          details: [],
        };
      }
    });

    for (const row of fidiumRows) {
      const rep = row["SALES_REP"]?.trim();
      if (!rep) continue;
      const agent = agentByFidiumId[rep];
      if (!agent) continue;

      const planName = row["REQUESTED_SERVICES"]?.trim();
      if (!planName) continue;
      const plan = fPlanByName[planName];
      if (!plan) continue;

      // combine key
      const orderNum = row["ORDER_NUMBER"]?.trim() || "";
      const svc = row["REQUESTED_SERVICES"]?.trim() || "";
      const comboKey = `${orderNum}||${svc}`;
      const fwgRow = fwgByCombo[comboKey];

      const submissionDate = parseUSDate(row["SUBMISSION_DATE"]) || null;

      // personal commission
      let personalVal = 0;
      if (agent.fidium_personal_payscale_id) {
        personalVal = await getFidiumPersonalCommission({
          supabase,
          fidiumPersonalPayscaleId: agent.fidium_personal_payscale_id,
          fidiumPlanId: plan.id,
          submissionDate,
        });
        totals[agent.id].accounts++;
        totals[agent.id].personalTotal += personalVal;
      }

      // manager
      let managerVal = 0;
      const mgrId = managerFor[agent.id];
      if (mgrId) {
        const { data: managerAgent } = await supabase
          .from("agents")
          .select("*")
          .eq("id", mgrId)
          .maybeSingle();
        if (managerAgent) {
          // override
          const overrideVal = await getFidiumManagerOverride({
            supabase,
            managerId: mgrId,
            agentId: agent.id,
            planId: plan.id,
            submissionDate,
          });
          if (overrideVal !== null) {
            managerVal = overrideVal;
          } else if (managerAgent.fidium_manager_payscale_id) {
            // fallback
            managerVal = await getFidiumManagerCommission({
              supabase,
              fidiumManagerPayscaleId: managerAgent.fidium_manager_payscale_id,
              fidiumPlanId: plan.id,
              submissionDate,
            });
          }
          if (!totals[mgrId]) {
            totals[mgrId] = {
              name: managerAgent.name || managerAgent.identifier,
              accounts: 0,
              personalTotal: 0,
              managerTotal: 0,
              upfront_percentage: 0,
              backend_percentage: 0,
              details: [],
            };
          }
          totals[mgrId].managerTotal += managerVal;
        }
      }

      // detail
      totals[agent.id].details.push({
        fidium_white_glove_id: fwgRow?.id,
        personal_commission: personalVal,
      });
    }

    // convert to array
    const finalReport = Object.entries(totals)
      .filter(([_, data]) => data.accounts > 0 || data.managerTotal > 0)
      .map(([agentId, data]) => {
        const { personalTotal, managerTotal, upfront_percentage, backend_percentage } = data;
        const grandTotal = personalTotal + managerTotal;
        const upfrontValue = personalTotal * (upfront_percentage / 100);
        const backendValue = personalTotal * (backend_percentage / 100);
        return {
          agentId,
          name: data.name,
          accounts: data.accounts,
          personalTotal,
          managerTotal,
          grandTotal,
          upfront_percentage,
          backend_percentage,
          upfrontValue,
          backendValue,
          details: data.details,
        };
      });

    const detailMap = {};
    for (const line of finalReport) {
      detailMap[line.agentId] = line.details;
    }
    setFidiumReport(finalReport);
    setFidiumDetails(detailMap);
  }

  async function saveFidiumReport() {
    if (fidiumReport.length === 0) return;
    if (!fidiumBatchName.trim()) {
      alert("Please provide a Fidium batch name.");
      return;
    }
    const { data: batchData, error: batchErr } = await supabase
      .from("payroll_report_batches")
      .insert([{ batch_name: fidiumBatchName }])
      .select("*")
      .single();
    if (batchErr) {
      console.error("Error creating Fidium batch:", batchErr);
      return;
    }
    const batch_id = batchData.id;
    const rows = fidiumReport.map((r) => ({
      agent_id: r.agentId,
      name: r.name,
      accounts: r.accounts,
      personal_total: r.personalTotal,
      manager_total: r.managerTotal,
      grand_total: r.grandTotal,
      upfront_percentage: r.upfront_percentage,
      backend_percentage: r.backend_percentage,
      upfront_value: r.upfrontValue,
      backend_value: r.backendValue,
      batch_id,
      frontend_is_paid: false,
      backend_is_paid: false,
      report_type: "fidium",
      details: r.details,
    }));
    const { error } = await supabase.from("payroll_reports").insert(rows);
    if (error) {
      console.error("Error saving Fidium report:", error);
      alert("Error saving Fidium report");
    } else {
      alert("Fidium report saved successfully!");
      setFidiumBatchName("");
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">2) Fidium CSV</h3>

      <input
        type="file"
        ref={fidiumFileRef}
        className="hidden"
        onChange={(e) => setFidiumFile(e.target.files[0])}
      />

      <div className="flex items-center space-x-4 mb-4">
        <Button onClick={handleFidiumFileClick}>Fidium CSV</Button>
        {fidiumFile && <span className="text-sm text-gray-600">{fidiumFile.name}</span>}
      </div>

      {fidiumFile && fidiumReport.length === 0 && (
        <Button onClick={parseFidiumFile} disabled={loading}>
          {loading ? "Processing..." : "Generate Fidium Report"}
        </Button>
      )}

      {fidiumReport.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
            <h3 className="text-lg font-bold">Fidium Report</h3>
            <div className="flex items-center space-x-2 mt-2 sm:mt-0">
              <Input
                placeholder="Fidium Batch Name"
                value={fidiumBatchName}
                onChange={(e) => setFidiumBatchName(e.target.value)}
              />
              <Button onClick={saveFidiumReport}>Save Fidium Report</Button>
            </div>
          </div>

          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader />
                <TableHeader>Name</TableHeader>
                <TableHeader># Accounts</TableHeader>
                <TableHeader>Personal Total</TableHeader>
                <TableHeader>Manager Total</TableHeader>
                <TableHeader>Upfront</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {fidiumReport.map((fr) => {
                const isExpanded = expandedFidium.has(fr.agentId);
                return (
                  <React.Fragment key={fr.agentId}>
                    <TableRow>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="plain"
                          onClick={() => toggleFidiumExpand(fr.agentId)}
                        >
                          {isExpanded ? (
                            <ChevronUpIcon className="h-5 w-5" />
                          ) : (
                            <ChevronDownIcon className="h-5 w-5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{fr.name}</TableCell>
                      <TableCell>{fr.accounts}</TableCell>
                      <TableCell>${fr.personalTotal.toFixed(2)}</TableCell>
                      <TableCell>
                        {fr.managerTotal > 0 ? `$${fr.managerTotal.toFixed(2)}` : "N/A"}
                      </TableCell>
                      <TableCell>
                        {fr.upfrontValue !== null
                          ? `$${fr.upfrontValue.toFixed(2)} (${fr.upfront_percentage}%)`
                          : "N/A"}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-gray-50">
                          <div className="p-4">
                            <h4 className="font-bold mb-2">Fidium Details</h4>
                            <Table striped>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Fidium WG ID</TableHeader>
                                  <TableHeader>Personal Commission</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {(fidiumDetails[fr.agentId] || []).map((d, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell>{d.fidium_white_glove_id}</TableCell>
                                    <TableCell>
                                      ${d.personal_commission.toFixed(2)}
                                    </TableCell>
                                  </TableRow>
                                ))}
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
      )}
    </div>
  );
}
