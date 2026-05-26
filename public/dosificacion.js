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
    if (spo2 < 85 || bpm < 50 || bpm > 140) return { nivel: 'Peligro', color: 'danger', mensaje: 'Activa alertas y válvula de emergencia.' };
    if ((spo2 >= 85 && spo2 <= 89) || (bpm >= 50 && bpm <= 59) || (bpm >= 101 && bpm <= 140)) return { nivel: 'Precaución', color: 'warning', mensaje: 'Monitoreo continuo recomendado.' };
    return { nivel: 'Normal', color: 'success', mensaje: 'Valores estables.' };
}

async function cargarConfigDosificacion() {
    const patientId = localStorage.getItem('selectedPatientId');
    const patientName = localStorage.getItem('selectedPatientName');
    const patientRole = localStorage.getItem('selectedPatientRole') || 'Invitado';
    const badge = document.getElementById('pacienteActualLabel');
    const nombrePaciente = document.getElementById('dosificacionPacienteNombre');
    const rangoMinInput = document.getElementById('rangoSpo2Min');
    const rangoMaxInput = document.getElementById('rangoSpo2Max');
    const rolLabel = document.getElementById('dosificacionRol');

    if (badge) badge.textContent = patientName || 'Sin selección';
    if (nombrePaciente) nombrePaciente.textContent = patientName || 'Sin selección';
    if (rolLabel) rolLabel.textContent = patientRole;

    if (!patientId) return;

    try {
        const response = await fetch(`/api/pacientes?id_usuario=${encodeURIComponent(localStorage.getItem('userId'))}`);
        const data = await response.json();
        if (!response.ok) return;
        const paciente = data.find(item => String(item.id_paciente) === patientId);
        if (!paciente) return;

        if (rangoMinInput) rangoMinInput.value = paciente.rango_spo2_min;
        if (rangoMaxInput) rangoMaxInput.value = paciente.rango_spo2_max;

        document.getElementById('panelRangoActual').textContent = `${paciente.rango_spo2_min}% - ${paciente.rango_spo2_max}%`;
    } catch (error) {
        console.error('Error cargando paciente:', error);
    }
}

async function guardarRangos(event) {
    event.preventDefault();
    const patientId = localStorage.getItem('selectedPatientId');
    if (!patientId) return alert('Selecciona un paciente primero.');

    const nombre = localStorage.getItem('selectedPatientName');
    const rangoMin = parseInt(document.getElementById('rangoSpo2Min').value, 10);
    const rangoMax = parseInt(document.getElementById('rangoSpo2Max').value, 10);
    const peso = parseFloat(document.getElementById('pacientePesoConfig')?.value || '0');
    const edad = parseInt(document.getElementById('pacienteEdadConfig')?.value || '0', 10);
    const sexo = document.getElementById('pacienteSexoConfig')?.value || 'Otro';
    const padecimiento = document.getElementById('pacientePadecimientoConfig')?.value || '';

    if (rangoMin > rangoMax) return alert('El rango mínimo no puede ser mayor que el máximo.');

    try {
        const response = await fetch(`/api/pacientes/${patientId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre,
                peso_kg: peso,
                edad,
                sexo,
                padecimiento,
                rango_spo2_min: rangoMin,
                rango_spo2_max: rangoMax,
                id_usuario: parseInt(localStorage.getItem('userId'), 10)
            })
        });
        const result = await response.json();
        if (!response.ok) return alert(result.error || 'No se pudo actualizar el rango.');
        alert('Rangos guardados correctamente.');
    } catch (error) {
        console.error(error);
        alert('Error guardando los rangos.');
    }
}

function actualizarPanelLectura(data) {
    const textoRango = document.getElementById('dosificacionNivel');
    const textoAccion = document.getElementById('dosificacionAccion');
    const textoSpO2 = document.getElementById('valorSpo2Dosificacion');
    const textoBPM = document.getElementById('valorBpmDosificacion');

    if (!data || !textoSpO2 || !textoBPM || !textoRango || !textoAccion) return;

    textoSpO2.textContent = `${data.spo2}%`;
    textoBPM.textContent = `${data.bpm} bpm`;

    const clasificacion = clasificarLectura(data.spo2, data.bpm);
    textoRango.textContent = clasificacion.nivel;
    textoAccion.textContent = clasificacion.mensaje;
    textoRango.className = `fw-bold text-${clasificacion.color}`;
}

function suscribirLecturas() {
    database.ref('Seroa/Actual').on('value', (snapshot) => {
        const datos = snapshot.val();
        if (!datos) return;

        actualizarPanelLectura({
            spo2: datos.spo2 || 0,
            bpm: datos.bpm || 0
        });
    });
}

function iniciarDosificacion() {
    cargarConfigDosificacion();
    suscribirLecturas();
    const form = document.getElementById('formDosificacion');
    form?.addEventListener('submit', guardarRangos);
}

document.addEventListener('DOMContentLoaded', iniciarDosificacion);
