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
import AddPlanModal from "./modals/AddPlanModal";

export default function TabPlans({ plans, supabase, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Plans</h2>
          <p className="text-sm text-gray-400">
            (Plan name must match the White Glove CSV)
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>Add Plan</Button>
      </div>

      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader>Plan Name</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {plans.map((plan) => (
            <TableRow key={plan.id}>
              <TableCell>{plan.name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showAdd && (
        <AddPlanModal
          supabase={supabase}
          onClose={() => {
            setShowAdd(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
