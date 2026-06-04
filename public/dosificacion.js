const database = window.database || firebase.database();

// ── Umbrales alineados con LIMITE_SPO2_BAJO = 90 del firmware ──
function clasificarLectura(spo2, bpm) {
    if (spo2 < 90 || bpm < 50 || bpm > 140)
        return { nivel: 'Peligro', color: 'danger', mensaje: 'SpO2 crítico — válvula activada.' };
    if ((spo2 >= 90 && spo2 <= 94) || (bpm >= 50 && bpm <= 59) || (bpm >= 101 && bpm <= 140))
        return { nivel: 'Precaución', color: 'warning', mensaje: 'Monitoreo continuo recomendado.' };
    return { nivel: 'Normal', color: 'success', mensaje: 'Valores estables.' };
}

async function cargarConfigDosificacion() {
    const patientId       = localStorage.getItem('selectedPatientId');
    const patientName     = localStorage.getItem('selectedPatientName');
    const patientRole     = localStorage.getItem('selectedPatientRole') || 'Invitado';
    const badge           = document.getElementById('pacienteActualLabel');
    const nombrePaciente  = document.getElementById('dosificacionPacienteNombre');
    const rangoMinInput   = document.getElementById('rangoSpo2Min');
    const rangoMaxInput   = document.getElementById('rangoSpo2Max');
    const rolLabel        = document.getElementById('dosificacionRol');

    if (badge)          badge.textContent = patientName || 'Sin selección';
    if (nombrePaciente) nombrePaciente.textContent = patientName || 'Sin selección';
    if (rolLabel)       rolLabel.textContent = patientRole;

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

    const nombre       = localStorage.getItem('selectedPatientName');
    const rangoMin     = parseInt(document.getElementById('rangoSpo2Min').value, 10);
    const rangoMax     = parseInt(document.getElementById('rangoSpo2Max').value, 10);
    const peso         = parseFloat(document.getElementById('pacientePesoConfig')?.value || '0');
    const edad         = parseInt(document.getElementById('pacienteEdadConfig')?.value || '0', 10);
    const sexo         = document.getElementById('pacienteSexoConfig')?.value || 'Otro';
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
        mostrarToast?.('Rangos guardados correctamente.', 'success');
    } catch (error) {
        console.error(error);
        alert('Error guardando los rangos.');
    }
}

// Muestra SpO2 y BPM con su clasificación clínica
function actualizarPanelLectura(data) {
    const textoSpO2   = document.getElementById('valorSpo2Dosificacion');
    const textoBPM    = document.getElementById('valorBpmDosificacion');
    const textoRango  = document.getElementById('dosificacionNivel');
    const textoAccion = document.getElementById('dosificacionAccion');

    if (!data || !textoSpO2 || !textoBPM || !textoRango || !textoAccion) return;

    textoSpO2.innerHTML = `${data.spo2}<span class="fs-5">%</span>`;
    textoBPM.innerHTML  = `${data.bpm}<span class="fs-5"> bpm</span>`;

    const cl = clasificarLectura(data.spo2, data.bpm);
    textoRango.textContent  = cl.nivel;
    textoAccion.textContent = cl.mensaje;
    textoRango.className    = `fw-bold text-${cl.color} small`;
}

// Resetea los displays cuando el firmware no entrega lectura válida
function resetearPanelLectura(estadoFirmware) {
    const textoSpO2   = document.getElementById('valorSpo2Dosificacion');
    const textoBPM    = document.getElementById('valorBpmDosificacion');
    const textoRango  = document.getElementById('dosificacionNivel');
    const textoAccion = document.getElementById('dosificacionAccion');

    const mensajes = {
        CALIBRANDO: { nivel: 'Calibrando…',  accion: 'Acumulando lecturas iniciales.' },
        SIN_DEDO:   { nivel: 'Sin dedo',      accion: 'Coloca el dedo en el sensor MAX30102.' },
        SIN_SENSOR: { nivel: 'Sin sensor',    accion: 'Sensor MAX30102 no detectado en el equipo.' },
    };
    const msg = mensajes[estadoFirmware] || { nivel: '--', accion: 'Sin señal del dispositivo.' };

    if (textoSpO2)   textoSpO2.innerHTML  = `--<span class="fs-5">%</span>`;
    if (textoBPM)    textoBPM.innerHTML   = `--<span class="fs-5"> bpm</span>`;
    if (textoRango)  { textoRango.textContent = msg.nivel;  textoRango.className = 'fw-bold text-secondary small'; }
    if (textoAccion) textoAccion.textContent = msg.accion;
}

function suscribirLecturas() {
    window.SeroaRealtime.subscribe((datos) => {

        // ── 1. PRESIÓN (presente en todos los estados del firmware) ──────────
        const presionElem = document.getElementById('valorPresionDosificacion');
        const iconPresion = document.getElementById('iconPresion');
        if (presionElem) {
            const presion = (datos && Number.isFinite(Number(datos.presionBar)))
                ? Number(datos.presionBar) : null;
            presionElem.textContent = presion !== null ? `${presion.toFixed(2)} bar` : '-- bar';
        }

        // ── 2. BADGE DE ESTADO DEL FIRMWARE ─────────────────────────────────
        const estadoFirmware = datos?.estado || null;
        const badgeEstado = document.getElementById('estadoFirmwareBadge');
        if (badgeEstado) {
            const colorMap = {
                ACTIVO:     'success',
                CALIBRANDO: 'warning',
                SIN_DEDO:   'secondary',
                SIN_SENSOR: 'danger',
            };
            const labelMap = {
                ACTIVO:     'ACTIVO',
                CALIBRANDO: 'CALIBRANDO',
                SIN_DEDO:   'SIN DEDO',
                SIN_SENSOR: 'SIN SENSOR',
            };
            badgeEstado.className   = `badge rounded-pill bg-${colorMap[estadoFirmware] || 'secondary'} mb-2`;
            badgeEstado.style.fontSize = '.68rem';
            badgeEstado.textContent = labelMap[estadoFirmware] || (datos ? 'DESCONOCIDO' : 'SIN SEÑAL');
        }

        // ── 3. PANEL LECTURA: solo cuando firmware reporta ACTIVO con valores ─
        const spo2 = datos ? Number(datos.spo2) : 0;
        const bpm  = datos ? Number(datos.bpm)  : 0;
        const lecturaActiva = (
            estadoFirmware === 'ACTIVO' &&
            Number.isFinite(spo2) && spo2 > 0 &&
            Number.isFinite(bpm)  && bpm  > 0
        );

        if (lecturaActiva) {
            actualizarPanelLectura({ spo2, bpm });
            // Alerta crítica cuando SpO2 cae bajo el mismo umbral del firmware (90)
            if (spo2 < 90) {
                mostrarAlertaSeroa?.();
            } else {
                ocultarAlertaSeroa?.();
            }
        } else {
            resetearPanelLectura(estadoFirmware);
            ocultarAlertaSeroa?.();
        }

        // ── 4. ESTADO VISUAL DE LA VÁLVULA ───────────────────────────────────
        const valvulaAbierta = datos?.valvulaActiva === true || datos?.valvulaActiva === 1;
        const card      = document.getElementById('estadoSistemaCard');
        const titulo    = document.getElementById('estadoSistemaTitulo');
        const texto     = document.getElementById('estadoSistemaTexto');
        const indicador = document.getElementById('indicadorValvula');
        const icon      = document.getElementById('iconValvula');

        if (valvulaAbierta) {
            card?.classList.remove('bg-light');
            card?.classList.add('bg-teal', 'text-white');
            if (titulo) { titulo.textContent = 'SUMINISTRANDO';          titulo.className = 'fw-bold text-white mb-1'; }
            if (texto)  { texto.textContent  = 'Válvula Proporcional Abierta'; texto.className = 'text-white small mb-2'; }
            if (indicador) { indicador.classList.remove('inactiva'); indicador.classList.add('activa'); }
            if (icon)   { icon.classList.remove('d-none'); icon.className = 'bi bi-wind fs-2'; }
            // Adaptar colores de presión e icono al fondo oscuro
            if (presionElem) presionElem.style.color = 'rgba(255,255,255,.9)';
            if (iconPresion)  iconPresion.style.color  = 'rgba(255,255,255,.7)';
            if (badgeEstado)  badgeEstado.style.color  = '#fff';
        } else {
            card?.classList.remove('bg-teal', 'text-white');
            card?.classList.add('bg-light');
            if (titulo) { titulo.textContent = 'NO SUMINISTRANDO'; titulo.className = 'fw-bold text-secondary mb-1'; }
            if (texto)  { texto.textContent  = 'Válvula Cerrada';  texto.className  = 'text-secondary small mb-2'; }
            if (indicador) { indicador.classList.remove('activa'); indicador.classList.add('inactiva'); }
            if (icon)   { icon.classList.add('d-none'); icon.className = 'bi bi-wind fs-2 d-none'; }
            // Restaurar colores teal
            if (presionElem) presionElem.style.color = 'var(--color-seroa-teal)';
            if (iconPresion)  iconPresion.style.color  = 'var(--color-seroa-teal)';
            if (badgeEstado)  badgeEstado.style.color  = '';
        }

        // ── 5. WATCHDOG DE CONEXIÓN ──────────────────────────────────────────
        if (datos) window.confirmarConexion?.();
    });
}

// Actualiza el track visual y las etiquetas del rango SpO2
function actualizarTrackRango(min, max) {
    const SCALE_MIN = 80, SCALE_MAX = 100, RANGE = SCALE_MAX - SCALE_MIN;
    const minPct = Math.max(0, Math.min(100, ((min - SCALE_MIN) / RANGE) * 100));
    const maxPct = Math.max(0, Math.min(100, ((max - SCALE_MIN) / RANGE) * 100));

    const trackActive = document.getElementById('rangoTrackActive');
    const markerMin   = document.getElementById('rangoMarkerMin');
    const markerMax   = document.getElementById('rangoMarkerMax');
    const displayMin  = document.getElementById('rangoDisplayMin');
    const displayMax  = document.getElementById('rangoDisplayMax');
    const panelActual = document.getElementById('panelRangoActual');
    const infoMin     = document.getElementById('rangoInfoMin');
    const infoMax     = document.getElementById('rangoInfoMax');

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

    document.getElementById('formDosificacion')?.addEventListener('submit', guardarRangos);

    // Preview en vivo mientras el usuario ajusta los inputs
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

    // Promedio de la última hora al cargar y cada 60 s
    cargarPromedioHora();
    setInterval(cargarPromedioHora, 60000);
}

async function cargarPromedioHora() {
    const patientId = localStorage.getItem('selectedPatientId');
    if (!patientId) return;
    try {
        const resp = await fetch(`/api/registros?id_paciente=${encodeURIComponent(patientId)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const ahora   = Date.now();
        const unaHora = 60 * 60 * 1000;

        const últimos = (data || []).filter(r => {
            const fecha = new Date(r.ultima_actualizacion || r.fecha_hora || r.fecha_registro || null);
            return fecha && (ahora - fecha.getTime()) <= unaHora;
        });

        const valores  = últimos
            .map(r => Number(r.saturacion_oxigeno || r.spo2 || r.saturacion || 0))
            .filter(v => Number.isFinite(v) && v > 0);
        const promedio = valores.length
            ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length)
            : 0;

        const elem = document.getElementById('promedioHoraSpo2');
        if (elem) elem.innerHTML = `${promedio === 0 ? '--' : promedio}<span class="fs-5">%</span>`;

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
