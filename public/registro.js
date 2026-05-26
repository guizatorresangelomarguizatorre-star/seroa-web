// Registro diario de lecturas y estructura de datos biométricos
const firebaseConfig = {
    apiKey: "AIzaSyD8GcNrjousLrlNSKXcNrjl0gjAYuXvTMQ",
    authDomain: "seroa-e8606.firebaseapp.com",
    databaseURL: "https://seroa-e8606-default-rtdb.firebaseio.com",
    projectId: "seroa-e8606",
    storageBucket: "seroa-e8606.firebasestorage.app",
    messagingSenderId: "985506819702",
    appId: "1:985506819702:web:407215da36321f9084b957"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

function clasificarLectura(spo2, bpm) {
    const rojo = spo2 < 85 || bpm < 50 || bpm > 140;
    const naranja = (!rojo && (spo2 >= 85 && spo2 <= 89 || bpm >= 50 && bpm <= 59 || bpm >= 101 && bpm <= 140));
    if (rojo) return { nivel: 'Peligro', color: 'danger' };
    if (naranja) return { nivel: 'Precaución', color: 'warning' };
    return { nivel: 'Normal', color: 'success' };
}

function formatoFecha(fecha) {
    const dt = new Date(fecha);
    return dt.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function obtenerNotasGuardadas(idPaciente) {
    if (!idPaciente) return [];
    const notas = localStorage.getItem(`seroaNotasPaciente_${idPaciente}`);
    return notas ? JSON.parse(notas) : [];
}

function guardarNotaLocal(idPaciente, nota) {
    if (!idPaciente) return;
    const notasPrevias = obtenerNotasGuardadas(idPaciente);
    notasPrevias.unshift(nota);
    localStorage.setItem(`seroaNotasPaciente_${idPaciente}`, JSON.stringify(notasPrevias.slice(0, 20)));
}

function renderNotas(notas) {
    const listaNotas = document.getElementById('listaNotasDiarias');
    if (!listaNotas) return;

    if (!notas || notas.length === 0) {
        listaNotas.innerHTML = `<div class="text-center text-muted py-5">Aún no hay notas guardadas para este paciente.</div>`;
        return;
    }

    listaNotas.innerHTML = notas.map(nota => `
        <div class="card border-0 shadow-sm mb-3">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <strong>${nota.hora}</strong>
                        <p class="mb-0 text-muted small">${nota.fecha}</p>
                    </div>
                </div>
                <p class="mb-0">${nota.texto}</p>
            </div>
        </div>
    `).join('');
}

function renderRegistrosFirebase(registros) {
    const tablaRegistros = document.getElementById('tablaRegistros');
    if (!tablaRegistros) return;

    if (!registros || registros.length === 0) {
        tablaRegistros.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No hay registros biométricos disponibles para este paciente.</td></tr>`;
        return;
    }

    tablaRegistros.innerHTML = registros.map(registro => {
        const clasificacion = clasificarLectura(registro.saturacion_oxigeno, registro.ritmo_cardiaco);
        const accion = registro.accion_sistema || 'Monitoreo continuo';
        return `
            <tr class="table-${clasificacion.color}">
                <td>${formatoFecha(registro.fecha_hora)}</td>
                <td>${registro.saturacion_oxigeno}%</td>
                <td>${registro.ritmo_cardiaco} bpm</td>
                <td>${clasificacion.nivel}</td>
                <td>${accion}</td>
                <td>${registro.usuario_turno || 'Usuario anónimo'}</td>
            </tr>
        `;
    }).join('');
}

function suscribirRegistrosRTDB(idPaciente) {
    if (!idPaciente) return;
    const path = `registros_biomedicos/${idPaciente}`;
    database.ref(path).limitToLast(50).on('value', snapshot => {
        const datos = snapshot.val();
        const registros = datos ? Object.values(datos).sort((a,b)=> new Date(b.fecha_hora) - new Date(a.fecha_hora)) : [];
        renderRegistrosFirebase(registros);
    });
}

async function iniciarRegistroDiario() {
    const userId = localStorage.getItem('userId');
    const pacienteId = localStorage.getItem('selectedPatientId');
    const pacienteNombre = localStorage.getItem('selectedPatientName') || 'Sin selección';
    const pacienteBadge = document.getElementById('pacienteActualLabel');
    const titulo = document.getElementById('registroPacienteNombre');
    const btnDescargar = document.getElementById('btnDescargarPDF');
    const formNotas = document.getElementById('formNotas');

    if (pacienteBadge) pacienteBadge.textContent = pacienteNombre;
    if (titulo) titulo.textContent = pacienteNombre;

    if (btnDescargar) {
        btnDescargar.addEventListener('click', () => window.print());
    }

    if (formNotas) {
        formNotas.addEventListener('submit', (event) => {
            event.preventDefault();
            const hora = document.getElementById('notaHora').value;
            const texto = document.getElementById('notaTexto').value.trim();
            if (!texto || !hora) return;
            const nota = {
                fecha: new Date().toLocaleDateString('es-MX'),
                hora,
                texto
            };
            guardarNotaLocal(pacienteId, nota);
            renderNotas(obtenerNotasGuardadas(pacienteId));
            formNotas.reset();
        });
    }

    renderNotas(obtenerNotasGuardadas(pacienteId));
    suscribirRegistrosRTDB(pacienteId);
}

document.addEventListener('DOMContentLoaded', iniciarRegistroDiario);
