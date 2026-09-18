import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { action, payload } = req.body;

  try {
    if (action === 'CREATE_USER') {
      const { email, password, nombre_completo, rol } = payload;
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre_completo, rol }
      });
      if (error) throw error;
      return res.status(200).json({ success: true, user: data.user });
    }

    if (action === 'BATCH_CREATE_STUDENTS') {
      // payload: { students: [{ email, password, nombre_completo }], curso_id }
      const results = [];
      for (const st of payload.students) {
        let userId;
        // Buscar si existe
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users.users.find(u => u.email === st.email);
        
        if (existing) {
          userId = existing.id;
        } else {
          const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: st.email,
            password: st.password || 'RLabs2026!',
            email_confirm: true,
            user_metadata: { nombre_completo: st.nombre_completo || st.email, rol: 'estudiante' }
          });
          if (createErr) continue;
          userId = newUser.user.id;
        }

        // Asignar al curso
        await supabaseAdmin.from('curso_estudiantes').upsert({
          curso_id: payload.curso_id,
          usuario_id: userId
        });
        results.push(st.email);
      }
      return res.status(200).json({ success: true, added: results.length });
    }

    if (action === 'REMOVE_STUDENT_FROM_COURSE') {
      const { usuario_id, curso_id } = payload;
      const { error } = await supabaseAdmin
        .from('curso_estudiantes')
        .delete()
        .eq('curso_id', curso_id)
        .eq('usuario_id', usuario_id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'BATCH_REMOVE_STUDENTS') {
      // payload: { emails: [array de emails], curso_id }
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const idsToRemove = users.users
        .filter(u => payload.emails.includes(u.email))
        .map(u => u.id);

      if (idsToRemove.length > 0) {
        await supabaseAdmin
          .from('curso_estudiantes')
          .delete()
          .eq('curso_id', payload.curso_id)
          .in('usuario_id', idsToRemove);
      }
      return res.status(200).json({ success: true, removedCount: idsToRemove.length });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}