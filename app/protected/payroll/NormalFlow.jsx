"use client";

import React, { useState, useRef } from "react";
import Papa from "papaparse";
import { createClient } from "@/utils/supabase/client";
import "tailwindcss/tailwind.css";
import { Button } from "@/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { Input } from "@/components/input";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";

/**
 * Safely parse a US-format date string ("MM/DD/YY" or "MM/DD/YYYY").
 * If "YY" < 50 => assume 20YY, if "YY" in [50..99] => assume 19YY.
 * Otherwise, fallback to built-in Date parsing.
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
 * Insert or update the matched White Glove rows, mapping from CSV headers 
 * to columns in `white_glove_entries`, for matched new installs/migrations only.
 */
async function upsertMatchedWhiteGloveEntries(supabase, matchedWgRows) {
  const entries = matchedWgRows.map((row) => ({
    customer_name: row["Customer Name"] || null,
    customer_street_address: row["Customer Street Address"] || null,
    customer_city: row["Customer City (Zipcode as of 7/26/2024)"] || null,
    customer_state: row["Customer State"] || null,
    ban: row["BAN"] || null,
    order_number: row["Order Number"] || null,
    order_status: row["Order Status"] || null,
    order_submission_date: parseUSDate(row["Order Submission Date"]),
    original_due_date: parseUSDate(row["Original Due Date"]),
    updated_due_date: parseUSDate(row["Updated Due Date"]),
    order_completed_cancelled: row["Order Completed/Cancelled"] || null,
    customer_cbr: row["Customer CBR"] || null,
    partner_name: row["Partner Name"] || null,
    partner_sales_code: row["Partner Sales Code"] || null,
    audit_status: row["Audit Status"] || null,
    audit_closed: row["Audit Closed no longer on form as of 11/22/2024"] || null,
    who_cancelled_the_order: row["Who Cancelled the Order"] || null,
    did_you_intervene_on_the_order: row["Did you intervene on the order"] || null,
    notes: row["Notes"] || null,
    item_type: row["Item Type"] || null,
    path: row["Path"] || null,
    due_date_helper: row["Due Date Helper"] || null,
    migrating_from_legacy:
      row[
        "Is the customer Migrating from Legacy Services? (7/26/2024 DSL means yes blank field means No)"
      ] || null,
    legacy_or_brspd_fiber: row["Legacy or BRSPD Fiber?"] || null,
    cancellation_reason: row["Cancellation Reason"] || null,
    voice_qty: row["Voice_Qty"] ? parseInt(row["Voice_Qty"], 10) : null,
    hsi_qty: row["HSI_Qty"] ? parseInt(row["HSI_Qty"], 10) : null,
    internet_speed: row["Internet Speed"] || null,
    agent_seller_information: row["Agent Seller Information"] || null,
    modified_due_date: parseUSDate(row["Modified Due Date"]),
    modified_month: row["Modified Month"] ? parseInt(row["Modified Month"], 10) : null,
    month_issued: row["Month Issued"] ? parseInt(row["Month Issued"], 10) : null,
    year_issued: row["Year Issued"] ? parseInt(row["Year Issued"], 10) : null,
    month_completed: row["Month Completed"] ? parseInt(row["Month Completed"], 10) : null,
    year_completed: row["Year Completed"] ? parseInt(row["Year Completed"], 10) : null,
    month_due: row["Month Due"] ? parseInt(row["Month Due"], 10) : null,
    year_due: row["Year Due"] ? parseInt(row["Year Due"], 10) : null,
  }));
  // Upsert by order_number
  await supabase.from("white_glove_entries").upsert(entries, { onConflict: "order_number" });
}

/**
 * manager->agent->plan override (if any), then check date-range overrides.
 * Return override commission if matched, else the base override (or null if none).
 */
async function getManagerOverrideCommission({
  supabase,
  managerId,
  agentId,
  planId,
  submissionDate,
  isUpgrade,
}) {
  if (!managerId || !agentId || !planId) return null;

  const { data: overrideRows } = await supabase
    .from("manager_agent_commissions")
    .select("id, manager_commission_value, manager_upgrade_commission_value")
    .eq("manager_id", managerId)
    .eq("agent_id", agentId)
    .eq("plan_id", planId);

  if (!overrideRows || overrideRows.length === 0) return null;
  const override = overrideRows[0];
  const baseVal = isUpgrade
    ? override.manager_upgrade_commission_value
    : override.manager_commission_value;

  const { data: rangeRows } = await supabase
    .from("manager_agent_commission_date_ranges")
    .select("*")
    .eq("manager_agent_commission_id", override.id)
    .eq("plan_id", planId);

  if (!rangeRows || rangeRows.length === 0) return baseVal;

  const subDate = submissionDate instanceof Date ? submissionDate : parseUSDate(submissionDate);
  if (!subDate) return baseVal; // fallback if no valid date

  let matchedRange = null;
  for (const rr of rangeRows) {
    const start = new Date(rr.start_date);
    const end = rr.end_date ? new Date(rr.end_date) : null;
    if (subDate >= start && (!end || subDate <= end)) {
      // pick the latest start
      if (!matchedRange) matchedRange = rr;
      else if (new Date(rr.start_date) > new Date(matchedRange.start_date)) {
        matchedRange = rr;
      }
    }
  }
  if (matchedRange) {
    return isUpgrade
      ? matchedRange.manager_upgrade_commission_value
      : matchedRange.manager_commission_value;
  }
  return baseVal;
}

/**
 * personal payscale commission => check date ranges
 */
async function getPersonalCommission({
  personalPayscaleId,
  planId,
  isUpgrade,
  submissionDate,
  supabase,
}) {
  if (!personalPayscaleId || !planId) return 0;

  const { data: dateRanges } = await supabase
    .from("personal_payscale_date_ranges")
    .select("*, personal_payscale_date_range_plan_commissions(*)")
    .eq("personal_payscale_id", personalPayscaleId);

  if (!dateRanges || dateRanges.length === 0) {
    // fallback to base plan commission
    const { data: baseComm } = await supabase
      .from("personal_payscale_plan_commissions")
      .select("*")
      .eq("personal_payscale_id", personalPayscaleId)
      .eq("plan_id", planId)
      .single();
    if (!baseComm) return 0;
    return isUpgrade
      ? baseComm.rep_upgrade_commission_value
      : baseComm.rep_commission_value;
  }

  const subDate = submissionDate instanceof Date ? submissionDate : parseUSDate(submissionDate);
  if (!subDate) {
    // fallback if no valid date
    const { data: baseComm } = await supabase
      .from("personal_payscale_plan_commissions")
      .select("*")
      .eq("personal_payscale_id", personalPayscaleId)
      .eq("plan_id", planId)
      .single();
    if (!baseComm) return 0;
    return isUpgrade
      ? baseComm.rep_upgrade_commission_value
      : baseComm.rep_commission_value;
  }

  let matchedRange = null;
  for (const dr of dateRanges) {
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
    const pc = matchedRange.personal_payscale_date_range_plan_commissions.find(
      (x) => x.plan_id === planId
    );
    if (!pc) return 0;
    return isUpgrade ? pc.rep_upgrade_commission_value : pc.rep_commission_value;
  }

  // no match => base
  const { data: fallbackComm } = await supabase
    .from("personal_payscale_plan_commissions")
    .select("*")
    .eq("personal_payscale_id", personalPayscaleId)
    .eq("plan_id", planId)
    .single();
  if (!fallbackComm) return 0;
  return isUpgrade
    ? fallbackComm.rep_upgrade_commission_value
    : fallbackComm.rep_commission_value;
}

/**
 * manager payscale => check date ranges
 */
async function getManagerCommission({
  managerPayscaleId,
  planId,
  isUpgrade,
  submissionDate,
  supabase,
}) {
  if (!managerPayscaleId || !planId) return 0;

  const { data: dateRanges } = await supabase
    .from("manager_payscale_date_ranges")
    .select("*, manager_payscale_date_range_plan_commissions(*)")
    .eq("manager_payscale_id", managerPayscaleId);

  if (!dateRanges || dateRanges.length === 0) {
    // fallback to base
    const { data: baseComm } = await supabase
      .from("manager_payscale_plan_commissions")
      .select("*")
      .eq("manager_payscale_id", managerPayscaleId)
      .eq("plan_id", planId)
      .single();
    if (!baseComm) return 0;
    return isUpgrade
      ? baseComm.manager_upgrade_commission_value
      : baseComm.manager_commission_value;
  }

  const subDate = submissionDate instanceof Date ? submissionDate : parseUSDate(submissionDate);
  if (!subDate) {
    // fallback if no valid date
    const { data: baseComm } = await supabase
      .from("manager_payscale_plan_commissions")
      .select("*")
      .eq("manager_payscale_id", managerPayscaleId)
      .eq("plan_id", planId)
      .single();
    if (!baseComm) return 0;
    return isUpgrade
      ? baseComm.manager_upgrade_commission_value
      : baseComm.manager_commission_value;
  }

  let matchedRange = null;
  for (const dr of dateRanges) {
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
    const pc = matchedRange.manager_payscale_date_range_plan_commissions.find(
      (x) => x.plan_id === planId
    );
    if (!pc) return 0;
    return isUpgrade ? pc.manager_upgrade_commission_value : pc.manager_commission_value;
  }

  // fallback
  const { data: fallbackComm } = await supabase
    .from("manager_payscale_plan_commissions")
    .select("*")
    .eq("manager_payscale_id", managerPayscaleId)
    .eq("plan_id", planId)
    .single();
  if (!fallbackComm) return 0;
  return isUpgrade
    ? fallbackComm.manager_upgrade_commission_value
    : fallbackComm.manager_commission_value;
}

export default function NormalFlow({ supabase }) {
  const [fileNewInstalls, setFileNewInstalls] = useState(null);
  const [fileWhiteGlove, setFileWhiteGlove] = useState(null);
  const [fileMigrations, setFileMigrations] = useState(null);

  const refNewInstalls = useRef(null);
  const refWhiteGlove = useRef(null);
  const refMigrations = useRef(null);

  const [report, setReport] = useState([]);
  const [reportDetails, setReportDetails] = useState({});
  const [expandedAgents, setExpandedAgents] = useState(new Set());
  const [batchName, setBatchName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleNewInstallsClick = () => refNewInstalls.current.click();
  const handleWhiteGloveClick = () => refWhiteGlove.current.click();
  const handleMigrationsClick = () => refMigrations.current.click();

  const allThreeFilesAreSelected =
    fileNewInstalls && fileWhiteGlove && fileMigrations && report.length === 0;

  /**
   * Parse the 3 CSVs (new installs, white glove, migrations).
   * Insert only the matched White Glove rows.
   * Then do the rest of the logic for plans, agents, and final payroll report.
   */
  async function parseAllNormalFiles() {
    if (!fileNewInstalls || !fileWhiteGlove || !fileMigrations) {
      alert("Please select New Installs, White Glove, AND Migrations CSVs.");
      return;
    }
    setLoading(true);

    Papa.parse(fileNewInstalls, {
      header: true,
      complete: (resNew) => {
        Papa.parse(fileWhiteGlove, {
          header: true,
          complete: (resWg) => {
            Papa.parse(fileMigrations, {
              header: true,
              complete: async (resMig) => {
                try {
                  const newInstallsRows = resNew.data || [];
                  const whiteGloveRows = resWg.data || [];
                  const migrationsRows = resMig.data || [];

                  // Build a map of all white glove by order number
                  const wgMapAll = {};
                  whiteGloveRows.forEach((row) => {
                    if (row["Order Number"]) {
                      wgMapAll[row["Order Number"].trim()] = row;
                    }
                  });

                  // Match new installs
                  const matchedNewInstalls = newInstallsRows
                    .filter(
                      (r) =>
                        r["Order Id"] &&
                        wgMapAll[r["Order Id"].trim()] &&
                        wgMapAll[r["Order Id"].trim()] !== undefined
                    )
                    .map((r) => ({
                      ...r,
                      matchedWhiteGlove: wgMapAll[r["Order Id"].trim()],
                      isUpgrade: false,
                    }));

                  // Match migrations
                  const matchedMigrations = migrationsRows
                    .filter(
                      (r) =>
                        r["Order Id"] &&
                        wgMapAll[r["Order Id"].trim()] &&
                        wgMapAll[r["Order Id"].trim()] !== undefined
                    )
                    .map((r) => ({
                      ...r,
                      matchedWhiteGlove: wgMapAll[r["Order Id"].trim()],
                      isUpgrade: true,
                    }));

                  // Combine both sets
                  const allMatched = [...matchedNewInstalls, ...matchedMigrations];

                  // Unique White Glove rows from the matched sets
                  // so we only insert the matched WGs
                  const matchedWgSet = new Set();
                  for (const row of allMatched) {
                    matchedWgSet.add(row.matchedWhiteGlove);
                  }
                  const matchedWgRows = Array.from(matchedWgSet);

                  // Now upsert only the matched White Glove rows
                  await upsertMatchedWhiteGloveEntries(supabase, matchedWgRows);

                  // Then upsert plans
                  await upsertPlansFromCSV(newInstallsRows, matchedWgRows);
                  await upsertPlansFromCSV(migrationsRows, matchedWgRows);

                  // Then upsert agents
                  await upsertAgentsFromMatches(allMatched);

                  // Finally, generate the normal report
                  await generateNormalReport(allMatched);
                } catch (err) {
                  console.error("Error processing normal/migrations files:", err);
                  alert("Error processing normal/migrations files");
                } finally {
                  setLoading(false);
                }
              },
            });
          },
        });
      },
    });
  }

  /**
   * Insert or update plan names from CSV rows + matched White Glove
   */
  async function upsertPlansFromCSV(csvRows, matchedWgRows) {
    const planMap = {};

    // from new installs / migrations
    for (const row of csvRows) {
      const planName = row["Plan Name"]?.trim();
      const payoutStr = row["Payout"]?.replace("$", "").replace(",", "");
      if (planName && payoutStr) {
        const val = parseFloat(payoutStr);
        if (!isNaN(val)) {
          planMap[planName] = val;
        }
      }
    }

    // from matched White Glove
    const wgPlanSet = new Set();
    for (const row of matchedWgRows) {
      const speed = row["Internet Speed"]?.trim();
      if (speed) wgPlanSet.add(speed);
    }

    // Upsert discovered plan names
    for (const planName of Object.keys(planMap)) {
      await supabase
        .from("plans")
        .upsert([{ name: planName, commission_amount: planMap[planName] }], {
          onConflict: "name",
        });
    }
    for (const wgPlanName of wgPlanSet) {
      await supabase
        .from("plans")
        .upsert([{ name: wgPlanName, commission_amount: 0 }], {
          onConflict: "name",
        });
    }
  }

  /**
   * Insert or update agents from matched new installs + migrations
   */
  async function upsertAgentsFromMatches(matchedRows) {
    const agentsMap = {};
    for (const row of matchedRows) {
      const wg = row.matchedWhiteGlove;
      const agentInfo = wg["Agent Seller Information"]?.trim();
      if (agentInfo && agentsMap[agentInfo] === undefined) {
        const idx = agentInfo.indexOf(":");
        const name = idx >= 0 ? agentInfo.slice(idx + 1).trim() : agentInfo;
        agentsMap[agentInfo] = name;
      }
    }
    const toInsert = Object.entries(agentsMap).map(([identifier, name]) => ({
      identifier,
      name,
    }));
    for (const entry of toInsert) {
      await supabase.from("agents").upsert([entry], { onConflict: "identifier" });
    }
  }

  /**
   * Generate the final normal report
   */
  async function generateNormalReport(matchedRows) {
    const { data: agents } = await supabase.from("agents").select("*");
    const { data: agentManagers } = await supabase.from("agent_managers").select("*");
    const { data: plans } = await supabase.from("plans").select("*");
    const { data: wgeData } = await supabase.from("white_glove_entries").select("*");

    // personal payscales
    const personalPsById = {};
    const { data: personalPayscales } = await supabase
      .from("personal_payscales")
      .select("*");
    (personalPayscales || []).forEach((p) => {
      personalPsById[p.id] = p;
    });

    // manager for agent
    const managerForAgent = {};
    (agentManagers || []).forEach((am) => {
      managerForAgent[am.agent_id] = am.manager_id;
    });

    // wgeByOrder for reference
    const wgeByOrder = {};
    (wgeData || []).forEach((w) => {
      if (w.order_number) {
        wgeByOrder[w.order_number.trim()] = w;
      }
    });

    // init totals
    const totals = {};
    (agents || []).forEach((a) => {
      let up = null,
        bp = null;
      if (a.personal_payscale_id && personalPsById[a.personal_payscale_id]) {
        const ps = personalPsById[a.personal_payscale_id];
        up = parseFloat(ps.upfront_percentage);
        bp = parseFloat(ps.backend_percentage);
      }
      totals[a.id] = {
        name: a.name || a.identifier,
        accounts: 0,
        personalTotal: 0,
        managerTotal: 0,
        upfront_percentage: isNaN(up) ? null : up,
        backend_percentage: isNaN(bp) ? null : bp,
        details: [],
      };
    });

    for (const row of matchedRows) {
      const wg = row.matchedWhiteGlove;
      if (!wg) continue;
      const agentInfo = wg["Agent Seller Information"]?.trim();
      const speed = wg["Internet Speed"]?.trim();
      if (!agentInfo || !speed) continue;

      // find agent
      const agent = (agents || []).find(
        (a) => a.identifier && a.identifier.trim() === agentInfo
      );
      if (!agent) continue;

      // find plan
      const plan = (plans || []).find((p) => p.name && p.name.trim() === speed);
      if (!plan) continue;

      // is upgrade?
      const isUpgrade = row.isUpgrade === true;

      // parse "Order Submission Date"
      let submissionDate = null;
      const wgeRow = wgeByOrder[wg["Order Number"]?.trim()];
      if (wgeRow?.order_submission_date) {
        submissionDate = wgeRow.order_submission_date; // already stored as a date in DB
      }

      // personal
      let personalVal = 0;
      if (agent.personal_payscale_id) {
        personalVal = await getPersonalCommission({
          personalPayscaleId: agent.personal_payscale_id,
          planId: plan.id,
          isUpgrade,
          submissionDate,
          supabase,
        });
        totals[agent.id].accounts++;
        totals[agent.id].personalTotal += personalVal;
      }

      // manager
      let managerVal = 0;
      const mgrId = managerForAgent[agent.id];
      if (mgrId) {
        // override
        const overrideVal = await getManagerOverrideCommission({
          supabase,
          managerId: mgrId,
          agentId: agent.id,
          planId: plan.id,
          submissionDate,
          isUpgrade,
        });
        if (overrideVal !== null) {
          managerVal = overrideVal;
        } else {
          // fallback to manager's payscale
          const { data: managerAgent } = await supabase
            .from("agents")
            .select("*")
            .eq("id", mgrId)
            .maybeSingle();
          if (managerAgent && managerAgent.manager_payscale_id) {
            managerVal = await getManagerCommission({
              managerPayscaleId: managerAgent.manager_payscale_id,
              planId: plan.id,
              isUpgrade,
              submissionDate,
              supabase,
            });
          }
        }
        totals[mgrId].managerTotal += managerVal;
      }

      // record detail
      totals[agent.id].details.push({
        white_glove_entry_id: wgeRow?.id,
        personal_commission: personalVal,
        is_upgrade: isUpgrade,
      });
    }

    const finalReport = Object.entries(totals)
      .filter(([_, data]) => data.accounts > 0 || data.managerTotal > 0)
      .map(([agentId, data]) => {
        const personalTotal = data.personalTotal;
        const managerTotal = data.managerTotal;
        const grandTotal = personalTotal + managerTotal;
        let upfrontValue = null;
        if (data.upfront_percentage !== null && !isNaN(data.upfront_percentage)) {
          upfrontValue = personalTotal * (data.upfront_percentage / 100);
        }
        let backendValue = null;
        if (data.backend_percentage !== null && !isNaN(data.backend_percentage)) {
          backendValue = personalTotal * (data.backend_percentage / 100);
        }
        return {
          agentId,
          name: data.name,
          accounts: data.accounts,
          personalTotal,
          managerTotal,
          grandTotal,
          upfront_percentage: data.upfront_percentage,
          backend_percentage: data.backend_percentage,
          upfrontValue,
          backendValue,
          details: data.details,
        };
      });

    const detailMap = {};
    for (const item of finalReport) {
      detailMap[item.agentId] = item.details;
    }
    setReport(finalReport);
    setReportDetails(detailMap);
  }

  async function saveNormalReport() {
    if (report.length === 0) return;
    if (!batchName.trim()) {
      alert("Please provide a batch name.");
      return;
    }
    const { data: batchData, error: batchErr } = await supabase
      .from("payroll_report_batches")
      .insert([{ batch_name: batchName }])
      .select("*")
      .single();
    if (batchErr) {
      console.error("Error creating normal batch:", batchErr);
      return;
    }
    const batch_id = batchData.id;
    const rows = report.map((r) => ({
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
      report_type: "normal",
      details: r.details,
    }));
    const { error } = await supabase.from("payroll_reports").insert(rows);
    if (error) {
      console.error("Error saving normal report:", error);
      alert("Error saving normal report");
    } else {
      alert("Normal report saved successfully!");
      setBatchName("");
    }
  }

  function toggleExpand(agentId) {
    setExpandedAgents((prev) => {
      const newSet = new Set(prev);
      newSet.has(agentId) ? newSet.delete(agentId) : newSet.add(agentId);
      return newSet;
    });
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mt-4">1) Normal CSVs (3 required)</h3>

      <input
        type="file"
        ref={refNewInstalls}
        className="hidden"
        onChange={(e) => setFileNewInstalls(e.target.files[0])}
      />
      <input
        type="file"
        ref={refWhiteGlove}
        className="hidden"
        onChange={(e) => setFileWhiteGlove(e.target.files[0])}
      />
      <input
        type="file"
        ref={refMigrations}
        className="hidden"
        onChange={(e) => setFileMigrations(e.target.files[0])}
      />

      <div className="flex items-center space-x-4 mb-4">
        <Button onClick={handleNewInstallsClick}>New Installs CSV</Button>
        {fileNewInstalls && <span className="text-sm text-gray-600">{fileNewInstalls.name}</span>}

        <Button onClick={handleWhiteGloveClick}>White Glove CSV</Button>
        {fileWhiteGlove && <span className="text-sm text-gray-600">{fileWhiteGlove.name}</span>}

        <Button onClick={handleMigrationsClick}>Migrations CSV</Button>
        {fileMigrations && <span className="text-sm text-gray-600">{fileMigrations.name}</span>}
      </div>

      {allThreeFilesAreSelected && (
        <Button onClick={parseAllNormalFiles} disabled={loading}>
          {loading ? "Processing..." : "Generate Normal Report"}
        </Button>
      )}

      {report.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
            <h3 className="text-lg font-bold">Normal Payroll Report</h3>
            <div className="flex items-center space-x-2 mt-2 sm:mt-0">
              <Input
                placeholder="Batch Name"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
              />
              <Button onClick={saveNormalReport}>Save Report</Button>
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
              {report.map((r) => {
                const isExpanded = expandedAgents.has(r.agentId);
                return (
                  <React.Fragment key={r.agentId}>
                    <TableRow>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="plain"
                          onClick={() => toggleExpand(r.agentId)}
                        >
                          {isExpanded ? (
                            <ChevronUpIcon className="h-5 w-5" />
                          ) : (
                            <ChevronDownIcon className="h-5 w-5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.accounts}</TableCell>
                      <TableCell>${r.personalTotal.toFixed(2)}</TableCell>
                      <TableCell>
                        {r.managerTotal > 0 ? `$${r.managerTotal.toFixed(2)}` : "N/A"}
                      </TableCell>
                      <TableCell>
                        {r.upfrontValue !== null
                          ? `$${r.upfrontValue.toFixed(2)} (${r.upfront_percentage}%)`
                          : "N/A"}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-gray-50">
                          <div className="p-4">
                            <h4 className="font-bold mb-2">Sales Details</h4>
                            <Table striped>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>White Glove ID</TableHeader>
                                  <TableHeader>Personal Commission</TableHeader>
                                  <TableHeader>Is Upgrade?</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {reportDetails[r.agentId]?.map((d, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell>{d.white_glove_entry_id}</TableCell>
                                    <TableCell>${d.personal_commission.toFixed(2)}</TableCell>
                                    <TableCell>{d.is_upgrade ? "Yes" : "No"}</TableCell>
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
