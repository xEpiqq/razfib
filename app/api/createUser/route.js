import { NextResponse } from 'next/server';
import { createServerComponentClient } from '../../../utils/supabase/supabaseAdmin';

export async function POST(request) {
  const supabaseAdmin = createServerComponentClient();

  try {
    const { newUser } = await request.json();

    // Create user with the Admin API and auto-confirm
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: newUser.email,
      password: 'rasmussenoperations123', // Consider generating or handling a secure password in production
      email_confirm: true,
      user_metadata: {
        name: newUser.name,
      },
    });

    if (userError) {
      console.error('Error creating user:', userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    const userId = userData.user.id;

    // Insert into profiles table
    const { error: profileError } = await supabaseAdmin.from('profiles').insert([
      {
        id: userId,
        name: newUser.name,
        email: newUser.email,
        is_manager: newUser.is_manager,
        personal_payscale_id: newUser.personal_payscale_id || null,
        manager_payscale_id: newUser.is_manager ? newUser.manager_payscale_id || null : null,
        created_at: new Date().toISOString(),
      },
    ]);

    if (profileError) {
      console.error('Error adding user profile:', profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // If new user is a manager and we have assignedUsers
    if (newUser.is_manager && newUser.assignedUsers.length > 0) {
      const managerRelations = newUser.assignedUsers.map((assignedUserId) => ({
        user_id: assignedUserId,
        manager_id: userId,
        created_at: new Date().toISOString(),
      }));

      const { error: relationError } = await supabaseAdmin
        .from('user_managers')
        .insert(managerRelations);

      if (relationError) {
        console.error('Error assigning users to manager:', relationError);
        return NextResponse.json({ error: relationError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ message: 'User created successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Unexpected error occurred' }, { status: 500 });
  }
}
