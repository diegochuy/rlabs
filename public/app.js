// CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = "https://toyhvsnagunxxtlettrq.supabase.co"; // Pon tu URL real
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRveWh2c25hZ3VueHh0bGV0dHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDc4MTksImV4cCI6MjEwNTMyMzgxOX0.e_HS5qmM7hOk9k41vBTuQbLtAOrXpakEk9m8-LAkf6Q";               // Pon tu Anon Key real

// Usamos 'supabaseClient' para evitar conflicto con la librería global del CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

// INICIALIZACIÓN
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) console.error("Error al obtener sesión:", error);
    
    if (session) {
      currentUser = session.user;
      await cargarPerfil();
    } else {
      mostrarVista("view-login");
    }
  } catch (err) {
    console.error("Error en inicialización:", err);
  }
});

// CONTROL DE VISTAS
function mostrarVista(vistaId) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(vistaId).classList.remove("hidden");
  
  if (vistaId !== "view-login") {
    document.getElementById("user-info").classList.remove("hidden");
  } else {
    document.getElementById("user-info").classList.add("hidden");
  }
}

// AUTENTICACIÓN
async function iniciarSesion(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert("Error al iniciar sesión: " + error.message);

    currentUser = data.user;
    await cargarPerfil();
  } catch (err) {
    alert("Ocurrió un error inesperado: " + err.message);
  }
}

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  mostrarVista("view-login");
}

async function cargarPerfil() {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error || !profile) {
    return alert("No se pudo cargar el perfil del usuario.");
  }

  currentProfile = profile;
  document.getElementById("user-display-name").innerText = profile.nombre_completo || profile.email;

  if (profile.rol === "estudiante") {
    mostrarVista("view-estudiante");
    await cargarCursosEstudiante();
    await cargarMisReservas();
  } else if (profile.rol === "admin") {
    mostrarVista("view-admin");
    await cargarCursosAdmin();
  } else if (profile.rol === "profesor") {
    mostrarVista("view-profesor");
    await cargarCursosProfesor();
  }
}

// --- FLUJO ESTUDIANTE ---
async function cargarCursosEstudiante() {
  const { data } = await supabaseClient
    .from("curso_estudiantes")
    .select("cursos(id, nombre, codigo)")
    .eq("usuario_id", currentUser.id);

  const select = document.getElementById("estudiante-cursos");
  select.innerHTML = "";
  if (!data || data.length === 0) {
    select.innerHTML = "<option>Sin cursos asignados</option>";
    return;
  }

  data.forEach(item => {
    if (item.cursos) {
      const opt = document.createElement("option");
      opt.value = item.cursos.id;
      opt.innerText = `${item.cursos.nombre} (${item.cursos.codigo})`;
      select.appendChild(opt);
    }
  });
  cargarMaquinasDelCurso();
}

async function cargarMaquinasDelCurso() {
  const cursoId = document.getElementById("estudiante-cursos").value;
  if (!cursoId) return;

  const { data: maquinas } = await supabaseClient
    .from("maquinas")
    .select("*")
    .eq("curso_id", cursoId)
    .eq("activa", true);

  const select = document.getElementById("estudiante-maquinas");
  select.innerHTML = "";
  if (maquinas) {
    maquinas.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.innerText = `RLAB ${m.numero_rlab}`;
      select.appendChild(opt);
    });
  }
}

async function crearReserva() {
  const cursoId = document.getElementById("estudiante-cursos").value;
  const maquinaId = document.getElementById("estudiante-maquinas").value;
  const fechaInicioInput = document.getElementById("reserva-fecha-inicio").value;
  const duracionHoras = parseInt(document.getElementById("reserva-duracion").value);

  if (!fechaInicioInput || !maquinaId) return alert("Complete todos los campos");

  const fechaInicio = new Date(fechaInicioInput);
  const fechaFin = new Date(fechaInicio.getTime() + duracionHoras * 60 * 60 * 1000);

  const { error } = await supabaseClient.from("reservas").insert({
    usuario_id: currentUser.id,
    curso_id: cursoId,
    maquina_id: maquinaId,
    fecha_inicio: fechaInicio.toISOString(),
    fecha_fin: fechaFin.toISOString()
  });

  if (error) {
    alert("No se pudo realizar la reserva. El horario o máquina seleccionada ya se encuentra reservada.");
  } else {
    alert("¡Reserva realizada con éxito!");
    cargarMisReservas();
  }
}

async function cargarMisReservas() {
  const { data: reservas } = await supabaseClient
    .from("reservas")
    .select("*, maquinas(numero_rlab, anydesk_id, anydesk_password), cursos(nombre)")
    .eq("usuario_id", currentUser.id)
    .order("fecha_inicio", { ascending: true });

  const contenedor = document.getElementById("lista-mis-reservas");
  contenedor.innerHTML = "";

  const ahora = new Date();

  if (reservas) {
    reservas.forEach(r => {
      const inicio = new Date(r.fecha_inicio);
      const fin = new Date(r.fecha_fin);
      const esActiva = ahora >= inicio && ahora <= fin;

      const div = document.createElement("div");
      div.className = `reserva-card ${esActiva ? "active-now" : ""}`;
      div.innerHTML = `
        <h4>${r.cursos?.nombre || 'Curso'} - RLAB ${r.maquinas?.numero_rlab}</h4>
        <p><strong>Inicio:</strong> ${inicio.toLocaleString()}</p>
        <p><strong>Fin:</strong> ${fin.toLocaleString()}</p>
        ${esActiva ? `<button onclick="conectarAnydesk('${r.maquinas?.anydesk_id}', '${r.maquinas?.anydesk_password}')" class="btn-connect">CONECTAR AHORA</button>` : `<p class="small-text">Inactiva</p>`}
      `;
      contenedor.appendChild(div);
    });
  }
}

// CONEXIÓN ANYDESK
async function conectarAnydesk(id, password) {
  try {
    await navigator.clipboard.writeText(password);
    alert("¡Contraseña de AnyDesk copiada al portapapeles! Abriendo AnyDesk...");
  } catch (err) {
    alert(`Contraseña de AnyDesk: ${password}\nCopiela manualmente.`);
  }
  window.location.href = `anydesk://${id.replace(/\s+/g, '')}`;
}

// --- FLUJO ADMINISTRADOR ---
function cambiarTabAdmin(tabId) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(tabId).classList.remove("hidden");
  event.target.classList.add("active");
}

async function cargarCursosAdmin() {
  const { data: cursos } = await supabaseClient.from("cursos").select("*");
  const selects = ["maquina-curso-select", "asignar-curso-select", "csv-curso-select", "csv-curso-eliminar-select", "historial-curso-select"];
  
  if (cursos) {
    selects.forEach(sId => {
      const el = document.getElementById(sId);
      if (!el) return;
      el.innerHTML = "";
      cursos.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.innerText = `${c.nombre} (${c.codigo})`;
        el.appendChild(opt);
      });
    });
  }
}

async function guardarCurso(e) {
  e.preventDefault();
  const nombre = document.getElementById("curso-nombre").value;
  const codigo = document.getElementById("curso-codigo").value;

  const { error } = await supabaseClient.from("cursos").insert({ nombre, codigo });
  if (error) alert("Error guardando curso: " + error.message);
  else { alert("Curso creado correctamente"); cargarCursosAdmin(); }
}

async function guardarMaquina(e) {
  e.preventDefault();
  const curso_id = document.getElementById("maquina-curso-select").value;
  const numero_rlab = parseInt(document.getElementById("maquina-numero").value);
  const anydesk_id = document.getElementById("maquina-anydesk-id").value;
  const anydesk_password = document.getElementById("maquina-anydesk-pass").value;

  const { error } = await supabaseClient.from("maquinas").upsert({
    curso_id, numero_rlab, anydesk_id, anydesk_password, activa: true
  }, { onConflict: 'curso_id,numero_rlab' });

  if (error) alert("Error guardando RLAB: " + error.message);
  else alert("RLAB configurado correctamente");
}

async function crearUsuarioAdmin(e) {
  e.preventDefault();
  const payload = {
    email: document.getElementById("user-email").value,
    password: document.getElementById("user-password").value,
    nombre_completo: document.getElementById("user-nombre").value,
    rol: document.getElementById("user-rol").value
  };

  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "CREATE_USER", payload })
  });
  const data = await res.json();
  if (data.error) alert("Error: " + data.error);
  else alert("Usuario creado exitosamente");
}

async function asignarAlumnoCurso(e) {
  e.preventDefault();
  const email = document.getElementById("asignar-alumno-email").value;
  const curso_id = document.getElementById("asignar-curso-select").value;

  const { data: profile } = await supabaseClient.from("profiles").select("id").eq("email", email).single();
  if (!profile) return alert("Alumno no encontrado con ese correo");

  const { error } = await supabaseClient.from("curso_estudiantes").insert({ curso_id, usuario_id: profile.id });
  if (error) alert("Error asignando alumno: " + error.message);
  else alert("Alumno asignado al curso exitosamente");
}

// CSV BATCH
async function procesarCSVAgregar() {
  const fileInput = document.getElementById("csv-file-agregar");
  const curso_id = document.getElementById("csv-curso-select").value;
  if (!fileInput.files[0]) return alert("Seleccione un archivo CSV");

  const text = await fileInput.files[0].text();
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  const students = lines.map(line => {
    const [email, password, nombre_completo] = line.split(",");
    return { email: email?.trim(), password: password?.trim(), nombre_completo: nombre_completo?.trim() };
  });

  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "BATCH_CREATE_STUDENTS", payload: { students, curso_id } })
  });
  const data = await res.json();
  alert(`Alumnos procesados e inscritos: ${data.added}`);
}

async function procesarCSVEliminar() {
  const fileInput = document.getElementById("csv-file-eliminar");
  const curso_id = document.getElementById("csv-curso-eliminar-select").value;
  if (!fileInput.files[0]) return alert("Seleccione un archivo CSV");

  const text = await fileInput.files[0].text();
  const emails = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "BATCH_REMOVE_STUDENTS", payload: { emails, curso_id } })
  });
  const data = await res.json();
  alert(`Alumnos removidos del curso: ${data.removedCount}`);
}

// HISTORIAL Y PROFESOR
async function cargarHistorial() {
  const curso_id = document.getElementById("historial-curso-select").value;
  const { data } = await supabaseClient
    .from("reservas")
    .select("*, profiles(nombre_completo, email), maquinas(numero_rlab)")
    .eq("curso_id", curso_id);

  const tbody = document.getElementById("tabla-historial-body");
  tbody.innerHTML = "";
  if (data) {
    data.forEach(r => {
      tbody.innerHTML += `
        <tr>
          <td>${r.profiles?.nombre_completo || r.profiles?.email}</td>
          <td>RLAB ${r.maquinas?.numero_rlab}</td>
          <td>${new Date(r.fecha_inicio).toLocaleString()}</td>
          <td>${new Date(r.fecha_fin).toLocaleString()}</td>
        </tr>
      `;
    });
  }
}

async function cargarCursosProfesor() {
  const { data: cursos } = await supabaseClient.from("cursos").select("*");
  const select = document.getElementById("profesor-curso-select");
  select.innerHTML = "";
  if (cursos) {
    cursos.forEach(c => {
      select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
  }
  cargarHistorialProfesor();
}

async function cargarHistorialProfesor() {
  const curso_id = document.getElementById("profesor-curso-select").value;
  const { data } = await supabaseClient
    .from("reservas")
    .select("*, profiles(nombre_completo), maquinas(numero_rlab)")
    .eq("curso_id", curso_id);

  const tbody = document.getElementById("tabla-profesor-body");
  tbody.innerHTML = "";
  if (data) {
    data.forEach(r => {
      tbody.innerHTML += `
        <tr>
          <td>${r.profiles?.nombre_completo}</td>
          <td>RLAB ${r.maquinas?.numero_rlab}</td>
          <td>${new Date(r.fecha_inicio).toLocaleString()}</td>
          <td>${new Date(r.fecha_fin).toLocaleString()}</td>
        </tr>
      `;
    });
  }
}

// PERFIL
function mostrarEditarPerfil() { document.getElementById("modal-perfil").classList.remove("hidden"); }
function cerrarModalPerfil() { document.getElementById("modal-perfil").classList.add("hidden"); }

async function guardarPerfil() {
  const nombre = document.getElementById("perfil-nombre").value;
  const pass = document.getElementById("perfil-pass").value;

  if (nombre) {
    await supabaseClient.from("profiles").update({ nombre_completo: nombre }).eq("id", currentUser.id);
  }
  if (pass) {
    await supabaseClient.auth.updateUser({ password: pass });
  }
  alert("Perfil actualizado correctamente");
  cerrarModalPerfil();
  cargarPerfil();
}