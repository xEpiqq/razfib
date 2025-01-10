"use client";

import React, { useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import NormalFlow from "./NormalFlow";
import FidiumFlow from "./FidiumFlow";

export default function PayrollTab() {
  // Create supabase client once, pass down to flows
  const supabase = useMemo(() => createClient(), []);

  return (
    <div className="p-6 space-y-6 font-sans text-gray-900">
      <h2 className="text-2xl font-bold">Payroll Report Generator (Normal + Fidium)</h2>

      {/* Normal Flow Component */}
      <NormalFlow supabase={supabase} />

      <hr className="my-6" />

      {/* Fidium Flow Component */}
      <FidiumFlow supabase={supabase} />
    </div>
  );
}
