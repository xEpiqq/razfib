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
import AddFidiumPersonalModal from "./modals/AddFidiumPersonalModal";
import EditFidiumPersonalModal from "./modals/EditFidiumPersonalModal";

export default function TabFidiumPersonalPayscales({
  fidiumPlans,
  fidiumPersonalPayscales,
  supabase,
  onRefresh,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Fidium Personal Payscales</h2>
        <Button onClick={() => setShowAdd(true)}>Add Fidium Personal</Button>
      </div>

      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Upfront (%)</TableHeader>
            <TableHeader>Backend (%)</TableHeader>
            <TableHeader>Commissions</TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {fidiumPersonalPayscales.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.name}</TableCell>
              <TableCell>{p.upfront_percentage}%</TableCell>
              <TableCell>{p.backend_percentage}%</TableCell>
              <TableCell>
                {p.personal_payscale_plan_commissions?.map((c) => (
                  <div key={c.id}>
                    Plan #{c.fidium_plan_id}: ${c.rep_commission_value}
                  </div>
                ))}
              </TableCell>
              <TableCell>
                <Button size="sm" onClick={() => setEditItem(p)}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showAdd && (
        <AddFidiumPersonalModal
          fidiumPlans={fidiumPlans}
          supabase={supabase}
          onClose={() => {
            setShowAdd(false);
            onRefresh();
          }}
        />
      )}

      {editItem && (
        <EditFidiumPersonalModal
          payscale={editItem}
          fidiumPlans={fidiumPlans}
          supabase={supabase}
          onClose={() => {
            setEditItem(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
