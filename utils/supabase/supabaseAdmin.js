// utils/supabase/server.js

import { createClient } from '@supabase/supabase-js';

export function createServerComponentClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}
