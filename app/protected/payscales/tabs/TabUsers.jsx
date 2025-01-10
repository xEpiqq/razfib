"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import {
  Table,
  TableHead,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/table";
import AddAgentModal from "./modals/AddAgentModal";
import EditAgentModal from "./modals/EditAgentModal";

export default function TabUsers({
  agents,
  agentManagers,
  personalPayscales,
  managerPayscales,
  fidiumPersonalPayscales,
  fidiumManagerPayscales,
  fidiumSalesmen,
  supabase,
  onRefresh,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editAgent, setEditAgent] = useState(null);

  function getAssignedAgentsForManager(managerId) {
    const assignedIds = agentManagers
      .filter((am) => am.manager_id === managerId)
      .map((am) => am.agent_id);
    return agents.filter((a) => assignedIds.includes(a.id));
  }

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Users</h2>
        <Button onClick={() => setShowAdd(true)}>Add User</Button>
      </div>

      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Identifier</TableHeader>
            <TableHeader>Fidium ID</TableHeader>
            <TableHeader>Personal Payscale</TableHeader>
            <TableHeader>Manager Payscale</TableHeader>
            <TableHeader>Fidium Personal</TableHeader>
            <TableHeader>Fidium Manager</TableHeader>
            <TableHeader>Is Manager</TableHeader>
            <TableHeader>Assigned Agents</TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {agents.map((agent) => {
            const assigned = getAssignedAgentsForManager(agent.id);
            const personal = personalPayscales.find((x) => x.id === agent.personal_payscale_id);
            const manager = managerPayscales.find((x) => x.id === agent.manager_payscale_id);
            const fidPers = fidiumPersonalPayscales.find((x) => x.id === agent.fidium_personal_payscale_id);
            const fidMgr = fidiumManagerPayscales.find((x) => x.id === agent.fidium_manager_payscale_id);

            return (
              <TableRow key={agent.id}>
                <TableCell>{agent.name}</TableCell>
                <TableCell>{agent.identifier}</TableCell>
                <TableCell>{agent.fidium_identifier || ""}</TableCell>
                <TableCell>{personal?.name || "N/A"}</TableCell>
                <TableCell>{agent.is_manager ? manager?.name || "N/A" : "N/A"}</TableCell>
                <TableCell>{fidPers?.name || "N/A"}</TableCell>
                <TableCell>{agent.is_manager ? fidMgr?.name || "N/A" : "N/A"}</TableCell>
                <TableCell>{agent.is_manager ? "Yes" : "No"}</TableCell>
                <TableCell>
                  {assigned.length > 0
                    ? assigned.map((a) => a.name || a.identifier).join(", ")
                    : "—"}
                </TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => setEditAgent(agent)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {showAdd && (
        <AddAgentModal
          supabase={supabase}
          personalPayscales={personalPayscales}
          managerPayscales={managerPayscales}
          fidiumPersonalPayscales={fidiumPersonalPayscales}
          fidiumManagerPayscales={fidiumManagerPayscales}
          onClose={() => {
            setShowAdd(false);
            onRefresh();
          }}
        />
      )}

      {editAgent && (
        <EditAgentModal
          agent={editAgent}
          supabase={supabase}
          allAgents={agents}
          agentManagers={agentManagers}
          personalPayscales={personalPayscales}
          managerPayscales={managerPayscales}
          fidiumPersonalPayscales={fidiumPersonalPayscales}
          fidiumManagerPayscales={fidiumManagerPayscales}
          fidiumSalesmen={fidiumSalesmen}
          onClose={() => {
            setEditAgent(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
