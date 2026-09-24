import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // 1. Obtener la URL y sanitizarla (elimina /rest/v1 y barras al final si existen)
  let rawUrl = process.env.SUPABASE_URL || "https://toyhvsnagunxxtlettrq.supabase.co";
  const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'Falta la variable SUPABASE_SERVICE_ROLE_KEY en Vercel' });
  }

  // 2. Inicializar el cliente Admin con Service Role Key
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { action, payload } = req.body;

  try {
    // CREAR USUARIO INDIVIDUAL
    if (action === 'CREATE_USER') {
      const { email, password, nombre_completo, rol } = payload;
      
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre_completo, rol }
      });

      if (userError) throw userError;

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userData.user.id,
          email,
          nombre_completo,
          rol
        });

      if (profileError) throw profileError;

      return res.status(200).json({ success: true, user: userData.user });
    }

    // CARGA MASIVA CSV (AGREGAR ALUMNOS)
    if (action === 'BATCH_CREATE_STUDENTS') {
      //alert(`ya en BATCH_CREATE_STUDENTS`);
      const { students, curso_id } = payload;
      let agregados = "alumnos creados:\n";
      let addedCount = 0;

      for (const student of students) {
        if (!student.email){
          continue;
        } 

        let userId = null;

        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
          email: student.email,
          password: student.password || 'RLabs2026!',
          email_confirm: true,
          user_metadata: { nombre_completo: student.nombre_completo || student.email, rol: 'estudiante' }
        });

        if (userError) {
          agregados += `UserError : ${student.email}.\n`;
          //throw userError; //probando
          continue; // Continuar con el siguiente estudiante si hay un error al crear el usuario
        } else{
          agregados += `Creado > ${student.email}.\n`;
        }

        /* if (userData?.user) {
          userId = userData.user.id;
        } else if (userError) {
          // Si el usuario ya existe en Auth, obtenemos su ID
          const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
          const found = existingUsers?.users?.find(u => u.email === student.email);
          if (found) userId = found.id;
        } */



        /* if (userId) {
          await supabaseAdmin.from('profiles').upsert({
            id: userId,
            email: student.email,
            nombre_completo: student.nombre_completo || student.email,
            rol: 'Estudiante'
          });

          
          await supabaseAdmin.from('curso_estudiantes').upsert({
            curso_id,
            usuario_id: userId
          });

          agregados += `Agregado a curso > ${curso_id}.\n\n`;
          addedCount++;
        } */
        
        /* if (profileError) throw profileError;// probando */
       const { error: profileError } =await supabaseAdmin.from('profiles').upsert({
            id: userData.user.id,
            email: student.email,
            nombre_completo: student.nombre_completo || student.email,
            rol: 'estudiante'
          });

          if (profileError) {
            agregados += `ProfileError : ${student.email}.\n`;
            //throw profileError;// probando
            continue; // Continuar con el siguiente estudiante si hay un error al crear el perfil
          }else{
            agregados += `-----Agregado > ${student.email}.\n`;
            
          } 

           /* await supabaseAdmin.from('curso_estudiantes').upsert({
            curso_id,
            usuario_id: userId
          }); */

          addedCount++;
      }

      return res.status(200).json({ success: true, added: `${agregados} \n\n cantidad Operados: ${addedCount}` });
    }

    // CARGA MASIVA CSV (ELIMINAR ALUMNOS)
    if (action === 'BATCH_REMOVE_STUDENTS') {
      const { emails, curso_id } = payload;
      let removedCount = 0;

      for (const email of emails) {
        if (!email) continue;
        
        const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('email', email).single();
        if (profile) {
          await supabaseAdmin.from('curso_estudiantes').delete().eq('curso_id', curso_id).eq('usuario_id', profile.id);
          removedCount++;
        }
      }

      return res.status(200).json({ success: true, removedCount });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}