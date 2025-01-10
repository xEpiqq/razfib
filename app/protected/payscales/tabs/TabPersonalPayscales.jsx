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
import AddPersonalPayscaleModal from "./modals/AddPersonalPayscaleModal";
import EditPersonalPayscaleModal from "./modals/EditPersonalPayscaleModal";

export default function TabPersonalPayscales({
  plans,
  personalPayscales,
  supabase,
  onRefresh,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Personal Payscales</h2>
        <Button onClick={() => setShowAdd(true)}>Add Personal Payscale</Button>
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
          {personalPayscales.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.name}</TableCell>
              <TableCell>{p.upfront_percentage}%</TableCell>
              <TableCell>{p.backend_percentage}%</TableCell>
              <TableCell>
                {p.personal_payscale_plan_commissions?.map((c) => (
                  <div key={c.id}>
                    Plan #{c.plan_id}: ${c.rep_commission_value} / UPG: $
                    {c.rep_upgrade_commission_value}
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
        <AddPersonalPayscaleModal
          plans={plans}
          supabase={supabase}
          onClose={() => {
            setShowAdd(false);
            onRefresh();
          }}
        />
      )}

      {editItem && (
        <EditPersonalPayscaleModal
          payscale={editItem}
          plans={plans}
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
