const database = window.database || firebase.database();

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

        actualizarTrackRango(paciente.rango_spo2_min, paciente.rango_spo2_max);
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
    window.SeroaRealtime.subscribe((datos) => {
        if (!datos) return;
        const spo2 = Number(datos.spo2);
        const bpm = Number(datos.bpm);
        
        // Solo actualizar lectura si hay valores válidos
        if (Number.isFinite(spo2) && Number.isFinite(bpm) && spo2 > 0 && bpm > 0) {
            actualizarPanelLectura({ spo2, bpm });
        }

        // Actualizar estado de válvula basado en valvulaActiva (enviado por Arduino)
        const valvulaAbierta = datos.valvulaActiva === true || datos.valvulaActiva === 1;
        const card = document.getElementById('estadoSistemaCard');
        const titulo = document.getElementById('estadoSistemaTitulo');
        const texto = document.getElementById('estadoSistemaTexto');
        const indicador = document.getElementById('indicadorValvula');
        const icon = document.getElementById('iconValvula');

        if (valvulaAbierta) {
            if (card) { card.classList.remove('bg-light'); card.classList.add('bg-teal', 'text-white'); }
            if (titulo) { titulo.textContent = 'SUMINISTRANDO'; titulo.classList.remove('text-secondary'); titulo.classList.add('text-white'); }
            if (texto) { texto.textContent = 'Válvula Proporcional Abierta'; texto.classList.remove('text-secondary'); texto.classList.add('text-white'); }
            if (indicador) { indicador.classList.remove('inactiva'); indicador.classList.add('activa'); }
            if (icon) { icon.classList.remove('d-none'); icon.classList.add('bi-wind'); }
        } else {
            if (card) { card.classList.remove('bg-teal', 'text-white'); card.classList.add('bg-light'); }
            if (titulo) { titulo.textContent = 'NO SUMINISTRANDO'; titulo.classList.remove('text-white'); titulo.classList.add('text-secondary'); }
            if (texto) { texto.textContent = 'Válvula Cerrada'; texto.classList.remove('text-white'); texto.classList.add('text-secondary'); }
            if (indicador) { indicador.classList.remove('activa'); indicador.classList.add('inactiva'); }
            if (icon) { icon.classList.add('d-none'); }
        }

    });
}

// Actualiza el track visual y las etiquetas del rango SpO2
function actualizarTrackRango(min, max) {
    const SCALE_MIN = 80, SCALE_MAX = 100, RANGE = SCALE_MAX - SCALE_MIN;
    const minPct = Math.max(0, Math.min(100, ((min - SCALE_MIN) / RANGE) * 100));
    const maxPct = Math.max(0, Math.min(100, ((max - SCALE_MIN) / RANGE) * 100));

    const trackActive  = document.getElementById('rangoTrackActive');
    const markerMin    = document.getElementById('rangoMarkerMin');
    const markerMax    = document.getElementById('rangoMarkerMax');
    const displayMin   = document.getElementById('rangoDisplayMin');
    const displayMax   = document.getElementById('rangoDisplayMax');
    const panelActual  = document.getElementById('panelRangoActual');
    const infoMin      = document.getElementById('rangoInfoMin');
    const infoMax      = document.getElementById('rangoInfoMax');

    if (trackActive) { trackActive.style.left = minPct + '%'; trackActive.style.width = (maxPct - minPct) + '%'; }
    if (markerMin)   markerMin.style.left  = minPct + '%';
    if (markerMax)   markerMax.style.left  = maxPct + '%';
    if (displayMin)  displayMin.textContent = min + '%';
    if (displayMax)  displayMax.textContent = max + '%';
    if (panelActual) panelActual.textContent = `${min}% – ${max}%`;
    if (infoMin)     infoMin.textContent = min;
    if (infoMax)     infoMax.textContent = max;
}

function iniciarDosificacion() {
    cargarConfigDosificacion();
    suscribirLecturas();
    const form = document.getElementById('formDosificacion');
    form?.addEventListener('submit', guardarRangos);

    // Preview en vivo mientras el usuario escribe
    const inMin = document.getElementById('rangoSpo2Min');
    const inMax = document.getElementById('rangoSpo2Max');
    const onInput = () => {
        const min = parseInt(inMin?.value, 10);
        const max = parseInt(inMax?.value, 10);
        if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
            actualizarTrackRango(min, max);
        }
    };
    inMin?.addEventListener('input', onInput);
    inMax?.addEventListener('input', onInput);

    // Cargar promedio de la última hora
    cargarPromedioHora();
    // Recalcular cada 60 segundos
    setInterval(cargarPromedioHora, 60000);
}

async function cargarPromedioHora() {
    const patientId = localStorage.getItem('selectedPatientId');
    if (!patientId) return;
    try {
        const resp = await fetch(`/api/registros?id_paciente=${encodeURIComponent(patientId)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const ahora = Date.now();
        const unaHora = 60 * 60 * 1000;
        const últimos = (data || []).filter(r => {
            const fecha = new Date(r.ultima_actualizacion || r.fecha_hora || r.fecha_registro || null);
            return fecha && (ahora - fecha.getTime()) <= unaHora;
        });
        const valores = últimos.map(r => Number(r.saturacion_oxigeno || r.spo2 || r.saturacion || 0)).filter(v => Number.isFinite(v) && v > 0);
        const promedio = valores.length ? Math.round(valores.reduce((a,b)=>a+b,0)/valores.length) : 0;
        const elem = document.getElementById('promedioHoraSpo2');
        if (elem) elem.textContent = `${promedio === 0 ? '--' : promedio}%`;

        // Actualizar progress bar
        const progressBar = document.getElementById('promedioProgressBar');
        if (progressBar && promedio > 0) {
            progressBar.style.width = `${Math.min(promedio, 100)}%`;
            progressBar.setAttribute('aria-valuenow', promedio);
        }
    } catch (e) {
        console.error('Error cargando promedio hora:', e);
    }
}

document.addEventListener('DOMContentLoaded', iniciarDosificacion);
