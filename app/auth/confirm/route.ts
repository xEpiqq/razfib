import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (token_hash && type) {
    const supabase = await createClient();

    // Verify OTP
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      // Get user information
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (user && !userError) {
        const email = user.email;
        const userId = user.id;
        console.log('User Email:', email);

        // Create entry in profiles table
        const { error: profileError } = await supabase.from('profiles').insert({
          user_id: userId,
          first_name: '',
          last_name: '',
          email: email,
          phone: null,
          org_name: null,
          profile_pic: null,
          plan_started: null,
          tokens_used: '0',
          tokens_total: '0',
          plan: null,
        });

        if (profileError) {
          console.error('Error creating profile:', profileError.message);
          redirect('/error');
        }

        // Redirect user to specified redirect URL or root of app
        redirect(next);
      }
    }
  }

  // Redirect the user to an error page with some instructions
  redirect('/error');
}
