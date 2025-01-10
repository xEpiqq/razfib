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
import AddManagerPayscaleModal from "./modals/AddManagerPayscaleModal";
import EditManagerPayscaleModal from "./modals/EditManagerPayscaleModal";
import ManagerOverridesModal from "./modals/ManagerOverridesModal";

export default function TabManagerPayscales({
  plans,
  managerPayscales,
  agents,
  agentManagers,
  supabase,
  onRefresh,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [overrideItem, setOverrideItem] = useState(null);

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Manager Payscales</h2>
        <Button onClick={() => setShowAdd(true)}>Add Manager Payscale</Button>
      </div>

      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Commissions</TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {managerPayscales.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.name}</TableCell>
              <TableCell>
                {p.manager_payscale_plan_commissions?.map((c) => (
                  <div key={c.id}>
                    Plan #{c.plan_id}: ${c.manager_commission_value} / UPG: $
                    {c.manager_upgrade_commission_value}
                  </div>
                ))}
              </TableCell>
              <TableCell className="space-x-2">
                <Button size="sm" onClick={() => setEditItem(p)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOverrideItem(p)}
                >
                  Overrides
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showAdd && (
        <AddManagerPayscaleModal
          plans={plans}
          supabase={supabase}
          onClose={() => {
            setShowAdd(false);
            onRefresh();
          }}
        />
      )}

      {editItem && (
        <EditManagerPayscaleModal
          payscale={editItem}
          plans={plans}
          supabase={supabase}
          onClose={() => {
            setEditItem(null);
            onRefresh();
          }}
        />
      )}

      {overrideItem && (
        <ManagerOverridesModal
          payscale={overrideItem}
          agents={agents}
          agentManagers={agentManagers}
          plans={plans}
          supabase={supabase}
          onClose={() => {
            setOverrideItem(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
