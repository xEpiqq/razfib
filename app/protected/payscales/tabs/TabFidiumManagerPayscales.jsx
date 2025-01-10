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
import AddFidiumManagerModal from "./modals/AddFidiumManagerModal";
import EditFidiumManagerModal from "./modals/EditFidiumManagerModal";
import FidiumManagerOverridesModal from "./modals/FidiumManagerOverridesModal";

export default function TabFidiumManagerPayscales({
  fidiumPlans,
  fidiumManagerPayscales,
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
        <h2 className="text-2xl font-bold">Fidium Manager Payscales</h2>
        <Button onClick={() => setShowAdd(true)}>Add Fidium Manager</Button>
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
          {fidiumManagerPayscales.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.name}</TableCell>
              <TableCell>
                {p.manager_payscale_plan_commissions?.map((c) => (
                  <div key={c.id}>
                    Plan #{c.fidium_plan_id}: ${c.manager_commission_value}
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
        <AddFidiumManagerModal
          fidiumPlans={fidiumPlans}
          supabase={supabase}
          onClose={() => {
            setShowAdd(false);
            onRefresh();
          }}
        />
      )}

      {editItem && (
        <EditFidiumManagerModal
          payscale={editItem}
          fidiumPlans={fidiumPlans}
          supabase={supabase}
          onClose={() => {
            setEditItem(null);
            onRefresh();
          }}
        />
      )}

      {overrideItem && (
        <FidiumManagerOverridesModal
          payscale={overrideItem}
          agents={agents}
          agentManagers={agentManagers}
          fidiumPlans={fidiumPlans}
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
