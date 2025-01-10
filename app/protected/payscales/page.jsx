"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Tab } from "@headlessui/react";
import TabUsers from "./tabs/TabUsers";
import TabPlans from "./tabs/TabPlans";
import TabPersonalPayscales from "./tabs/TabPersonalPayscales";
import TabManagerPayscales from "./tabs/TabManagerPayscales";
import TabFidiumPersonalPayscales from "./tabs/TabFidiumPersonalPayscales";
import TabFidiumManagerPayscales from "./tabs/TabFidiumManagerPayscales";

export default function PayscalesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);

  // Main data store
  const [plans, setPlans] = useState([]);
  const [fidiumPlans, setFidiumPlans] = useState([]);
  const [agents, setAgents] = useState([]);
  const [agentManagers, setAgentManagers] = useState([]);
  const [personalPayscales, setPersonalPayscales] = useState([]);
  const [managerPayscales, setManagerPayscales] = useState([]);
  const [fidiumPersonalPayscales, setFidiumPersonalPayscales] = useState([]);
  const [fidiumManagerPayscales, setFidiumManagerPayscales] = useState([]);
  const [fidiumSalesmen, setFidiumSalesmen] = useState([]);

  useEffect(() => {
    fetchAllData().finally(() => setLoading(false));
  }, []);

  async function fetchAllData() {
    await Promise.all([
      fetchPlans(),
      fetchFidiumPlans(),
      fetchAgents(),
      fetchAgentManagers(),
      fetchPersonalPayscales(),
      fetchManagerPayscales(),
      fetchFidiumPersonalPayscales(),
      fetchFidiumManagerPayscales(),
      fetchFidiumSalesmen(),
    ]);
  }

  async function fetchPlans() {
    const { data } = await supabase.from("plans").select("*").order("id");
    setPlans(data || []);
  }

  async function fetchFidiumPlans() {
    const { data } = await supabase.from("fidium_plans").select("*").order("id");
    setFidiumPlans(data || []);
  }

  async function fetchAgents() {
    const { data } = await supabase.from("agents").select("*").order("id");
    setAgents(data || []);
  }

  async function fetchAgentManagers() {
    const { data } = await supabase.from("agent_managers").select("*");
    setAgentManagers(data || []);
  }

  async function fetchPersonalPayscales() {
    const { data: payscales } = await supabase
      .from("personal_payscales")
      .select("*")
      .order("id");
    const { data: commissions } = await supabase
      .from("personal_payscale_plan_commissions")
      .select("*");

    setPersonalPayscales(
      (payscales || []).map((p) => ({
        ...p,
        personal_payscale_plan_commissions: (commissions || []).filter(
          (c) => c.personal_payscale_id === p.id
        ),
      }))
    );
  }

  async function fetchManagerPayscales() {
    const { data: payscales } = await supabase
      .from("manager_payscales")
      .select("*")
      .order("id");
    const { data: commissions } = await supabase
      .from("manager_payscale_plan_commissions")
      .select("*");

    setManagerPayscales(
      (payscales || []).map((p) => ({
        ...p,
        manager_payscale_plan_commissions: (commissions || []).filter(
          (c) => c.manager_payscale_id === p.id
        ),
      }))
    );
  }

  async function fetchFidiumPersonalPayscales() {
    const { data: payscales } = await supabase
      .from("fidium_personal_payscales")
      .select("*")
      .order("id");
    const { data: commissions } = await supabase
      .from("fidium_personal_payscale_plan_commissions")
      .select("*");

    setFidiumPersonalPayscales(
      (payscales || []).map((p) => ({
        ...p,
        personal_payscale_plan_commissions: (commissions || []).filter(
          (c) => c.fidium_personal_payscale_id === p.id
        ),
      }))
    );
  }

  async function fetchFidiumManagerPayscales() {
    const { data: payscales } = await supabase
      .from("fidium_manager_payscales")
      .select("*")
      .order("id");
    const { data: commissions } = await supabase
      .from("fidium_manager_payscale_plan_commissions")
      .select("*");

    setFidiumManagerPayscales(
      (payscales || []).map((p) => ({
        ...p,
        manager_payscale_plan_commissions: (commissions || []).filter(
          (c) => c.fidium_manager_payscale_id === p.id
        ),
      }))
    );
  }

  async function fetchFidiumSalesmen() {
    const { data } = await supabase.from("fidium_salesmen").select("*");
    setFidiumSalesmen(data || []);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div>LOADING...</div>
      </div>
    );
  }

  const tabs = [
    "Users",
    "Plans",
    "Personal Payscales",
    "Manager Payscales",
    "Fidium Personal",
    "Fidium Manager",
  ];

  return (
    <div className="p-4">
      <Tab.Group>
        <Tab.List className="flex space-x-4 border-b mb-4">
          {tabs.map((label) => (
            <Tab
              key={label}
              className={({ selected }) =>
                selected
                  ? "px-4 py-2 font-semibold text-blue-500 border-b-2 border-blue-500"
                  : "px-4 py-2 text-gray-700 hover:text-blue-500"
              }
            >
              {label}
            </Tab>
          ))}
        </Tab.List>

        <Tab.Panels>
          {/* 1) USERS */}
          <Tab.Panel>
            <TabUsers
              agents={agents}
              agentManagers={agentManagers}
              personalPayscales={personalPayscales}
              managerPayscales={managerPayscales}
              fidiumPersonalPayscales={fidiumPersonalPayscales}
              fidiumManagerPayscales={fidiumManagerPayscales}
              fidiumSalesmen={fidiumSalesmen}
              supabase={supabase}
              onRefresh={fetchAllData}
            />
          </Tab.Panel>

          {/* 2) PLANS */}
          <Tab.Panel>
            <TabPlans plans={plans} supabase={supabase} onRefresh={fetchPlans} />
          </Tab.Panel>

          {/* 3) PERSONAL PAY */}
          <Tab.Panel>
            <TabPersonalPayscales
              plans={plans}
              personalPayscales={personalPayscales}
              supabase={supabase}
              onRefresh={fetchPersonalPayscales}
            />
          </Tab.Panel>

          {/* 4) MANAGER PAY */}
          <Tab.Panel>
            <TabManagerPayscales
              plans={plans}
              managerPayscales={managerPayscales}
              agents={agents}
              agentManagers={agentManagers}
              supabase={supabase}
              onRefresh={fetchManagerPayscales}
            />
          </Tab.Panel>

          {/* 5) FIDIUM PERSONAL */}
          <Tab.Panel>
            <TabFidiumPersonalPayscales
              fidiumPlans={fidiumPlans}
              fidiumPersonalPayscales={fidiumPersonalPayscales}
              supabase={supabase}
              onRefresh={fetchFidiumPersonalPayscales}
            />
          </Tab.Panel>

          {/* 6) FIDIUM MANAGER */}
          <Tab.Panel>
            <TabFidiumManagerPayscales
              fidiumPlans={fidiumPlans}
              fidiumManagerPayscales={fidiumManagerPayscales}
              agents={agents}
              agentManagers={agentManagers}
              supabase={supabase}
              onRefresh={fetchFidiumManagerPayscales}
            />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
