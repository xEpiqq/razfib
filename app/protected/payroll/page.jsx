"use client";

import React, { useState, useMemo, useRef } from "react";
import Papa from "papaparse";
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
import { createClient } from "@/utils/supabase/client";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";

export default function PayrollTab() {
  const supabase = useMemo(() => createClient(), []);

  //
  // ─────────────────────────────────────────────────────────────────────
  //  1) Normal Flow (three CSVs now):
  //     - new installs.csv
  //     - white glove.csv
  //     - migrations.csv
  // ─────────────────────────────────────────────────────────────────────
  //
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

  // Because we now have 3 CSVs, only show "Generate Normal Report" after all 3 are chosen
  const allThreeFilesAreSelected =
    fileNewInstalls && fileWhiteGlove && fileMigrations && report.length === 0;

  //
  // Step 1: Parse all three files, then generate the normal report
  //
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

                  // Upsert plans from both sets (new installs + migrations) + white glove
                  await upsertPlansFromCSV(newInstallsRows, whiteGloveRows);
                  await upsertPlansFromCSV(migrationsRows, whiteGloveRows);

                  // Map White Glove by "Order Number"
                  const wgMap = {};
                  whiteGloveRows.forEach((row) => {
                    if (row["Order Number"]) {
                      wgMap[row["Order Number"].trim()] = row;
                    }
                  });

                  // Match new installs => row["Order Id"]
                  const matchedNewInstalls = newInstallsRows
                    .filter((r) => r["Order Id"] && wgMap[r["Order Id"].trim()])
                    .map((r) => ({
                      ...r,
                      matchedWhiteGlove: wgMap[r["Order Id"].trim()],
                      isUpgrade: false, // not migrations
                    }));

                  // Match migrations => row["Order Id"]
                  const matchedMigrations = migrationsRows
                    .filter((r) => r["Order Id"] && wgMap[r["Order Id"].trim()])
                    .map((r) => ({
                      ...r,
                      matchedWhiteGlove: wgMap[r["Order Id"].trim()],
                      isUpgrade: true, // migrations => "upgrade" commissions
                    }));

                  const allMatched = [...matchedNewInstalls, ...matchedMigrations];

                  // Upsert agents from matched
                  await upsertAgentsFromMatches(allMatched);

                  // Generate final normal report using normal vs. upgrade logic
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

  //
  // ──────────────────────────────
  //  Upsert Plans
  // ──────────────────────────────
  //
  async function upsertPlansFromCSV(csvRows, whiteGloveRows) {
    const planMap = {};
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
    // Also gather from white glove "Internet Speed" if you need
    // (some folks do plan name from white glove, or skip if not needed)
    const wgPlanSet = new Set();
    for (const row of whiteGloveRows) {
      const speed = row["Internet Speed"]?.trim();
      if (speed) wgPlanSet.add(speed);
    }

    // Insert or update
    for (const planName of Object.keys(planMap)) {
      await supabase.from("plans").upsert(
        [{ name: planName, commission_amount: planMap[planName] }],
        { onConflict: "name" }
      );
    }
    for (const planName of wgPlanSet) {
      // If not already in planMap, just upsert with 0
      if (!planMap[planName]) {
        await supabase.from("plans").upsert([{ name: planName, commission_amount: 0 }], {
          onConflict: "name",
        });
      }
    }
  }

  //
  // ──────────────────────────────
  //  Upsert Agents
  // ──────────────────────────────
  //
  async function upsertAgentsFromMatches(matchedRows) {
    const agentsMap = {};
    for (const row of matchedRows) {
      const wg = row.matchedWhiteGlove;
      const agentInfo = wg["Agent Seller Information"]?.trim();
      if (agentInfo && agentsMap[agentInfo] === undefined) {
        // Example parse: "AgentName: Bob"
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

  //
  // ─────────────────────────────────────────────────────────────────────
  //  Insert white_glove_entries if not exist, then compute final payouts
  // ─────────────────────────────────────────────────────────────────────
  //
  async function insertNewWhiteGloveEntries(matchedRows) {
    const entries = matchedRows.map((r) => {
      const wg = r.matchedWhiteGlove;
      const installDateStr = r["Day Of"];
      const install_date = installDateStr ? new Date(installDateStr) : null;
      return {
        order_number: wg["Order Number"] || null,
        customer_name: wg["Customer Name"] || null,
        // etc. add as many columns as you need
        install_date,
        frontend_paid: false,
        backend_paid: false,
      };
    });
    await supabase.from("white_glove_entries").upsert(entries, {
      onConflict: "order_number",
    });
  }

  async function generateNormalReport(matchedRows) {
    // 1) upsert or insert normal white glove entries
    await insertNewWhiteGloveEntries(matchedRows);

    // 2) fetch references
    const { data: agents } = await supabase.from("agents").select("*");
    const { data: agentManagers } = await supabase.from("agent_managers").select("*");
    const { data: plans } = await supabase.from("plans").select("*");
    const { data: personalComm } = await supabase
      .from("personal_payscale_plan_commissions")
      .select("*");
    const { data: managerComm } = await supabase
      .from("manager_payscale_plan_commissions")
      .select("*");
    const { data: personalPayscales } = await supabase.from("personal_payscales").select("*");
    const { data: managerPayscales } = await supabase.from("manager_payscales").select("*");
    const { data: managerAgentComm } = await supabase
      .from("manager_agent_commissions")
      .select("*");
    const { data: wgeData } = await supabase.from("white_glove_entries").select("*");

    // build quick maps
    const wgeByOrder = {};
    (wgeData || []).forEach((w) => {
      if (w.order_number) wgeByOrder[w.order_number.trim()] = w;
    });
    const agentsByIdentifier = {};
    (agents || []).forEach((a) => {
      if (a.identifier) agentsByIdentifier[a.identifier.trim()] = a;
    });
    const plansByName = {};
    (plans || []).forEach((p) => {
      if (p.name) plansByName[p.name.trim()] = p;
    });

    // personal payscale => plan => { normal, upgrade }
    const personalMap = {};
    (personalComm || []).forEach((c) => {
      if (!personalMap[c.personal_payscale_id]) {
        personalMap[c.personal_payscale_id] = {};
      }
      personalMap[c.personal_payscale_id][c.plan_id] = {
        normal: c.rep_commission_value || 0,
        upgrade: c.rep_upgrade_commission_value || 0,
      };
    });

    // manager payscale => plan => { normal, upgrade }
    const managerMap = {};
    (managerComm || []).forEach((c) => {
      if (!managerMap[c.manager_payscale_id]) {
        managerMap[c.manager_payscale_id] = {};
      }
      managerMap[c.manager_payscale_id][c.plan_id] = {
        normal: c.manager_commission_value || 0,
        upgrade: c.manager_upgrade_commission_value || 0,
      };
    });

    // manager->agent override => plan => { normal, upgrade }
    const managerAgentOverride = {};
    (managerAgentComm || []).forEach((mac) => {
      if (!managerAgentOverride[mac.manager_id]) {
        managerAgentOverride[mac.manager_id] = {};
      }
      if (!managerAgentOverride[mac.manager_id][mac.agent_id]) {
        managerAgentOverride[mac.manager_id][mac.agent_id] = {};
      }
      managerAgentOverride[mac.manager_id][mac.agent_id][mac.plan_id] = {
        normal: mac.manager_commission_value || 0,
        upgrade: mac.manager_upgrade_commission_value || 0,
      };
    });

    // personal payscales by ID => read upfront/backend
    const personalPsById = {};
    (personalPayscales || []).forEach((p) => {
      personalPsById[p.id] = p;
    });

    // manager relationship
    const managerForAgent = {};
    (agentManagers || []).forEach((am) => {
      managerForAgent[am.agent_id] = am.manager_id;
    });

    // 3) Tally
    // first build a total record for every agent
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

      const agent = agentsByIdentifier[agentInfo];
      const plan = plansByName[speed];
      if (!agent || !plan) continue;

      // normal or upgrade payscale?
      const isUpgrade = row.isUpgrade === true; // if from migrations
      const psId = agent.personal_payscale_id;
      const planId = plan.id;

      // personal
      let personalVal = 0;
      if (psId && personalMap[psId] && personalMap[psId][planId]) {
        personalVal = isUpgrade
          ? personalMap[psId][planId].upgrade
          : personalMap[psId][planId].normal;
        totals[agent.id].accounts++;
        totals[agent.id].personalTotal += personalVal;
      }

      // manager
      const mgrId = managerForAgent[agent.id];
      let managerVal = 0;
      if (mgrId) {
        // check override first
        if (
          managerAgentOverride[mgrId] &&
          managerAgentOverride[mgrId][agent.id] &&
          managerAgentOverride[mgrId][agent.id][planId]
        ) {
          managerVal = isUpgrade
            ? managerAgentOverride[mgrId][agent.id][planId].upgrade
            : managerAgentOverride[mgrId][agent.id][planId].normal;
        } else {
          const managerAgent = agents.find((x) => x.id === mgrId);
          if (managerAgent && managerAgent.manager_payscale_id) {
            const mid = managerAgent.manager_payscale_id;
            if (managerMap[mid] && managerMap[mid][planId]) {
              managerVal = isUpgrade
                ? managerMap[mid][planId].upgrade
                : managerMap[mid][planId].normal;
            }
          }
        }
        totals[mgrId].managerTotal += managerVal;
      }

      // store details
      const wgeRow = wgeByOrder[wg["Order Number"]?.trim()] || {};
      totals[agent.id].details.push({
        white_glove_entry_id: wgeRow.id,
        personal_commission: personalVal,
        is_upgrade: isUpgrade,
      });
    }

    // build final
    const finalReport = Object.entries(totals)
      .filter(([_, data]) => data.accounts > 0)
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
    for (const line of finalReport) {
      detailMap[line.agentId] = line.details;
    }
    setReport(finalReport);
    setReportDetails(detailMap);
  }

  function toggleExpand(agentId) {
    setExpandedAgents((prev) => {
      const newSet = new Set(prev);
      newSet.has(agentId) ? newSet.delete(agentId) : newSet.add(agentId);
      return newSet;
    });
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

  //
  // ──────────────────────────────
  //  2) Fidium Flow
  //     (unchanged from your example)
  // ──────────────────────────────
  //
  const [fidiumFile, setFidiumFile] = useState(null);
  const fidiumFileRef = useRef(null);

  const [fidiumReport, setFidiumReport] = useState([]);
  const [fidiumDetails, setFidiumDetails] = useState({});
  const [expandedFidium, setExpandedFidium] = useState(new Set());
  const [fidiumBatchName, setFidiumBatchName] = useState("");

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
          await insertFidiumWhiteGloveEntries(fidiumRows);
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
      if (row["SALES_REP"]?.trim()) repSet.add(row["SALES_REP"].trim());
    });
    const { data: existing } = await supabase.from("fidium_salesmen").select("rep_name");
    const existingSet = new Set((existing || []).map((x) => x.rep_name));
    const newReps = [...repSet].filter((r) => !existingSet.has(r));
    if (newReps.length > 0) {
      await supabase
        .from("fidium_salesmen")
        .insert(newReps.map((r) => ({ rep_name: r })));
    }
  }

  async function insertFidiumWhiteGloveEntries(fidiumRows) {
    const entries = fidiumRows.map((row) => ({
      order_number: row["ORDER_NUMBER"]?.trim() || null,
      requested_services: row["REQUESTED_SERVICES"]?.trim() || null,
      sales_rep: row["SALES_REP"] || null,
      // etc...
      frontend_paid: false,
      backend_paid: false,
    }));
    await supabase
      .from("fidium_white_glove_entries")
      .upsert(entries, { onConflict: "order_number,requested_services" });
  }

  async function generateFidiumReport(fidiumRows) {
    // fetch references
    const { data: agents } = await supabase.from("agents").select("*");
    const { data: agentManagers } = await supabase.from("agent_managers").select("*");
    const { data: fPlans } = await supabase.from("fidium_plans").select("*");
    const { data: fpPsc } = await supabase
      .from("fidium_personal_payscale_plan_commissions")
      .select("*");
    const { data: fmPsc } = await supabase
      .from("fidium_manager_payscale_plan_commissions")
      .select("*");
    const { data: fwgAll } = await supabase.from("fidium_white_glove_entries").select("*");

    // build combos
    const fwgByCombo = {};
    (fwgAll || []).forEach((fwg) => {
      const key = `${fwg.order_number}||${(fwg.requested_services || "").trim()}`;
      fwgByCombo[key] = fwg;
    });

    const agentByFidiumId = {};
    (agents || []).forEach((a) => {
      if (a.fidium_identifier) {
        agentByFidiumId[a.fidium_identifier.trim()] = a;
      }
    });
    const fPlanByName = {};
    (fPlans || []).forEach((p) => {
      if (p.name) fPlanByName[p.name.trim()] = p;
    });

    const fidPersonalMap = {};
    (fpPsc || []).forEach((c) => {
      if (!fidPersonalMap[c.fidium_personal_payscale_id]) {
        fidPersonalMap[c.fidium_personal_payscale_id] = {};
      }
      fidPersonalMap[c.fidium_personal_payscale_id][c.fidium_plan_id] =
        c.rep_commission_value || 0;
    });
    const fidManagerMap = {};
    (fmPsc || []).forEach((c) => {
      if (!fidManagerMap[c.fidium_manager_payscale_id]) {
        fidManagerMap[c.fidium_manager_payscale_id] = {};
      }
      fidManagerMap[c.fidium_manager_payscale_id][c.fidium_plan_id] =
        c.manager_commission_value || 0;
    });

    const { data: fidPers } = await supabase.from("fidium_personal_payscales").select("*");
    const { data: fidMgr } = await supabase.from("fidium_manager_payscales").select("*");
    const personalPsById = {};
    (fidPers || []).forEach((p) => {
      personalPsById[p.id] = p;
    });
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
        if (a.fidium_personal_payscale_id && personalPsById[a.fidium_personal_payscale_id]) {
          const psObj = personalPsById[a.fidium_personal_payscale_id];
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

      const rawPlan = row["REQUESTED_SERVICES"]?.trim();
      if (!rawPlan) continue;
      const plan = fPlanByName[rawPlan];
      if (!plan) continue;

      // personal
      let personalVal = 0;
      if (
        agent.fidium_personal_payscale_id &&
        fidPersonalMap[agent.fidium_personal_payscale_id] &&
        fidPersonalMap[agent.fidium_personal_payscale_id][plan.id] !== undefined
      ) {
        personalVal = fidPersonalMap[agent.fidium_personal_payscale_id][plan.id];
        totals[agent.id].accounts++;
        totals[agent.id].personalTotal += personalVal;
      }

      // manager
      let managerVal = 0;
      const mgrId = managerFor[agent.id];
      if (mgrId) {
        const managerAgent = agents.find((x) => x.id === mgrId);
        if (managerAgent && managerAgent.fidium_manager_payscale_id) {
          const mid = managerAgent.fidium_manager_payscale_id;
          if (fidManagerMap[mid] && fidManagerMap[mid][plan.id] !== undefined) {
            managerVal = fidManagerMap[mid][plan.id];
          }
          totals[mgrId].managerTotal += managerVal;
        }
      }

      // details
      const orderNum = row["ORDER_NUMBER"]?.trim();
      const svc = row["REQUESTED_SERVICES"]?.trim();
      const comboKey = `${orderNum}||${svc}`;
      const fwgRow = fwgByCombo[comboKey];
      totals[agent.id].details.push({
        fidium_white_glove_id: fwgRow?.id,
        personal_commission: personalVal,
      });
    }

    // finalize
    const finalReport = Object.entries(totals)
      .filter(([_, data]) => data.accounts > 0)
      .map(([agentId, data]) => {
        const personalTotal = data.personalTotal;
        const managerTotal = data.managerTotal;
        const grandTotal = personalTotal + managerTotal;
        const upfrontValue = personalTotal * (data.upfront_percentage / 100);
        const backendValue = personalTotal * (data.backend_percentage / 100);
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

  //
  // ──────────────────────────────
  //  JSX Rendering
  // ──────────────────────────────
  //
  return (
    <div className="p-6 space-y-6 font-sans text-gray-900">
      <h2 className="text-2xl font-bold">Payroll Report Generator (Normal + Fidium)</h2>

      {/* Hidden file inputs */}
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
      <input
        type="file"
        ref={fidiumFileRef}
        className="hidden"
        onChange={(e) => setFidiumFile(e.target.files[0])}
      />

      {/* Normal CSVs */}
      <h3 className="text-lg font-semibold mt-4">1) Normal CSVs (3 required)</h3>
      <div className="flex items-center space-x-4 mb-4">
        <Button onClick={handleNewInstallsClick}>New Installs CSV</Button>
        {fileNewInstalls && (
          <span className="text-sm text-gray-600">{fileNewInstalls.name}</span>
        )}
        <Button onClick={handleWhiteGloveClick}>White Glove CSV</Button>
        {fileWhiteGlove && (
          <span className="text-sm text-gray-600">{fileWhiteGlove.name}</span>
        )}
        <Button onClick={handleMigrationsClick}>Migrations CSV</Button>
        {fileMigrations && (
          <span className="text-sm text-gray-600">{fileMigrations.name}</span>
        )}
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

      <hr className="my-6" />

      {/* Fidium CSV */}
      <h3 className="text-lg font-semibold">2) Fidium CSV</h3>
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
                                    <TableCell>${d.personal_commission.toFixed(2)}</TableCell>
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
