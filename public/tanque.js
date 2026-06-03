// Estado global de calibración
let presionMaxima = null;       // bar – referencia del 100%
let idDispositivoCalib = null;
let calibTimeout = null;
let calibListenerRef = null;

// ======================================================
// VISUALIZACIÓN DEL TANQUE
// ======================================================

function simularNivelTanque(porcentaje) {
    const liquid = document.getElementById('tankLiquid');
    const textPorcentaje = document.getElementById('txtPorcentaje');
    const textEstado = document.getElementById('txtEstado');
    const indicador = document.getElementById('tankAlertMode');
    if (!liquid || !textPorcentaje || !textEstado) return;

// ─── Estado local ───────────────────────────────────────────
let maxPsiBaselineLocal = 0;        // 0 = sin calibrar

    textPorcentaje.classList.remove('text-success', 'text-warning', 'text-danger', 'text-muted');
    textEstado.classList.remove('text-success', 'text-warning', 'text-danger', 'text-muted');
    liquid.classList.remove('bg-critico', 'bg-bajo', 'bg-optimo');

    if (porcentaje <= 20) {
        textPorcentaje.classList.add('text-danger');
        textEstado.classList.add('text-danger');
        textEstado.innerText = '¡Alerta Crítica!';
        liquid.classList.add('bg-critico');
        if (indicador) indicador.textContent = 'RIESGO MÁXIMO';
    } else if (porcentaje <= 50) {
        textPorcentaje.classList.add('text-warning');
        textEstado.classList.add('text-warning');
        textEstado.innerText = 'Nivel Bajo';
        liquid.classList.add('bg-bajo');
        if (indicador) indicador.textContent = 'Atención requerida';
    } else {
        textPorcentaje.classList.add('text-success');
        textEstado.classList.add('text-success');
        textEstado.innerText = 'Nivel Óptimo';
        liquid.classList.add('bg-optimo');
        if (indicador) indicador.textContent = 'Suministro estable';
    }
}

function calcularPorcentaje(presionActual, presionMax) {
    if (!presionMax || presionMax <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((presionActual / presionMax) * 100)));
}

function actualizarDatosTanque(datos) {
    if (!datos) return;

    const presionBar = datos.presionBar || 0;
    const estadoEsp = datos.estadoTanque || '';

    // Presión en PSI
    const psi = Math.round(presionBar * 14.5038);
    const elPSI = document.getElementById('txtPresionPSI');
    const elBar = document.getElementById('txtPresionBar');
    if (elPSI) elPSI.textContent = psi;
    if (elBar) elBar.textContent = `${presionBar.toFixed(2)} bar`;

    // Estado del tanque
    const estadoMap = {
        SIN_PRESION: 'Vacío',
        TANQUE_BAJO: 'Nivel Bajo',
        TANQUE_OK: 'Normal',
        SIN_SENSOR: 'Sin sensor'
    };
    const subMap = {
        SIN_PRESION: 'Reemplazar urgente',
        TANQUE_BAJO: 'Solicitar reemplazo',
        TANQUE_OK: 'Suministro normal',
        SIN_SENSOR: 'Revisar dispositivo'
    };
    const elEstadoTanque = document.getElementById('txtEstadoTanque');
    const elSub = document.getElementById('txtSubestado');
    if (elEstadoTanque) elEstadoTanque.textContent = estadoMap[estadoEsp] || '--';
    if (elSub) elSub.textContent = subMap[estadoEsp] || '--';

    // Porcentaje y nivel visual (requiere calibración)
    if (presionMaxima && presionMaxima > 0) {
        const porcentaje = calcularPorcentaje(presionBar, presionMaxima);
        simularNivelTanque(porcentaje);
    }
}

function mostrarEstadoConCalibracion() {
    document.getElementById('sinCalibracion')?.classList.add('d-none');
    document.getElementById('conCalibracion')?.classList.remove('d-none');
    document.getElementById('infoCalibTanque')?.classList.remove('d-none');
    document.getElementById('msgSinCalibracion')?.classList.add('d-none');
}

// ======================================================
// CARGA DE CALIBRACIÓN DESDE FIREBASE
// ======================================================

function suscribirCalibracion() {
    const pacienteId = localStorage.getItem('selectedPatientId');
    if (!pacienteId || !window.database) return;

    window.database.ref(`Seroa/Pacientes/${pacienteId}/Calibracion`).on('value', snapshot => {
        const calib = snapshot.val();
        if (!calib || calib.estado !== 'listo' || !calib.presionMaxima) return;

        presionMaxima = calib.presionMaxima;
        mostrarEstadoConCalibracion();

        const elMax = document.getElementById('txtPresionMax');
        if (elMax) {
            elMax.textContent = `${presionMaxima.toFixed(2)} bar (${Math.round(presionMaxima * 14.5038)} PSI)`;
        }
        const elFecha = document.getElementById('txtFechaCalib');
        if (elFecha && calib.timestamp) {
            elFecha.textContent = new Date(calib.timestamp * 1000).toLocaleString('es-MX');
        }
    });
}

// ======================================================
// SUSCRIPCIÓN A DATOS EN TIEMPO REAL
// ======================================================

function iniciarSensadoTiempoReal() {
    window.SeroaRealtime.subscribe(datos => {
        if (datos) actualizarDatosTanque(datos);
    });
}

// ======================================================
// ASISTENTE DE CALIBRACIÓN (MODAL 3 PASOS)
// ======================================================

function setPaso(paso) {
    const bloques = { 1: 'calibPaso1', 2: 'calibPaso2', 3: 'calibPaso3', error: 'calibError' };
    Object.entries(bloques).forEach(([k, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('d-none', String(k) !== String(paso));
    });

    if (typeof paso !== 'number') return;

    for (let i = 1; i <= 3; i++) {
        const ind = document.getElementById(`step${i}-ind`);
        const line = document.getElementById(`step-line-${i}`);
        if (!ind) continue;
        ind.classList.remove('active', 'done');
        if (line) line.classList.remove('done');
        if (i < paso) { ind.classList.add('done'); if (line) line.classList.add('done'); }
        else if (i === paso) ind.classList.add('active');
    }

    if (paso === 3) {
        for (let i = 1; i <= 3; i++) {
            const ind = document.getElementById(`step${i}-ind`);
            const line = document.getElementById(`step-line-${i}`);
            if (ind) { ind.classList.add('done'); ind.classList.remove('active'); }
            if (line) line.classList.add('done');
        }
    }
}

function reiniciarCalibModal() {
    clearTimeout(calibTimeout);
    if (calibListenerRef) { try { calibListenerRef.off('value'); } catch (e) {} calibListenerRef = null; }
    const campo = document.getElementById('calibIdDispositivo');
    if (campo) campo.value = localStorage.getItem('selectedDeviceId') || '';
    setPaso(1);
}

async function iniciarCalibracion() {
    const idStr = document.getElementById('calibIdDispositivo')?.value.trim();
    if (!idStr || isNaN(parseInt(idStr, 10))) {
        mostrarToast('Ingresa un ID de dispositivo válido.', 'warning');
        return;
    }
    idDispositivoCalib = parseInt(idStr, 10);

    const pacienteId = localStorage.getItem('selectedPatientId');
    if (!pacienteId) {
        mostrarToast('No hay paciente seleccionado.', 'danger');
        return;
    }

    setPaso(2);
    document.getElementById('calibProgreso').textContent = '';

    try {
        // Marcar estado como esperando y enviar comando
        await window.database.ref(`Seroa/Pacientes/${pacienteId}/Calibracion/estado`).set('esperando');
        await window.database.ref(`Seroa/Pacientes/${pacienteId}/Comandos/calibrarTanque`).set(true);
    } catch (err) {
        console.error('Error enviando comando de calibración:', err);
        document.getElementById('calibErrorMsg').textContent = 'No se pudo enviar la señal. Verifica la conexión.';
        setPaso('error');
        return;
    }

    let resuelto = false;

    // Timeout de 15 segundos
    calibTimeout = setTimeout(() => {
        if (resuelto) return;
        resuelto = true;
        if (calibListenerRef) { calibListenerRef.off('value'); calibListenerRef = null; }
        document.getElementById('calibErrorMsg').textContent =
            'El dispositivo no respondió en el tiempo esperado. Verifica que esté encendido y conectado a WiFi.';
        setPaso('error');
    }, 15000);

    // Escuchar respuesta del ESP32
    calibListenerRef = window.database.ref(`Seroa/Pacientes/${pacienteId}/Calibracion`);
    calibListenerRef.on('value', snapshot => {
        if (resuelto) return;
        const calib = snapshot.val();

        if (calib && calib.estado === 'en_proceso') {
            document.getElementById('calibProgreso').textContent = 'Dispositivo midiendo presión...';
        }

        if (calib && calib.estado === 'listo' && calib.presionMaxima) {
            resuelto = true;
            clearTimeout(calibTimeout);
            calibListenerRef.off('value');
            calibListenerRef = null;

            const presionMaxBar = calib.presionMaxima;
            document.getElementById('calibResultBar').textContent = `${presionMaxBar.toFixed(2)} bar`;
            document.getElementById('calibResultPSI').textContent = `${Math.round(presionMaxBar * 14.5038)} PSI`;
            window._calibracionTemp = { presionMaxBar, idDispositivoCalib };
            setPaso(3);
        }
    });
}

async function guardarCalibracion() {
    const temp = window._calibracionTemp;
    if (!temp) return;

    try {
        const response = await fetch('/api/tanques', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_dispositivo: temp.idDispositivoCalib,
                presion_actual: temp.presionMaxBar,
                presion_maxima: temp.presionMaxBar,
                porcentaje: 100,
                tiempo_restante_minutos: 0,
                ultima_actualizacion: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const err = await response.json();
            mostrarToast(err.error || 'Error al guardar la calibración.', 'danger');
            return;
        }

        // Guardar ID de dispositivo para próxima apertura del modal
        localStorage.setItem('selectedDeviceId', String(temp.idDispositivoCalib));

        // El listener de calibración ya actualizará presionMaxima automáticamente
        window._calibracionTemp = null;

        const modal = bootstrap.Modal.getInstance(document.getElementById('modalCalibracion'));
        if (modal) modal.hide();

        mostrarToast('Tanque calibrado. Monitoreo en tiempo real iniciado.', 'success');
    } catch (err) {
        console.error('Error guardando calibración:', err);
        mostrarToast('Error de conexión al guardar.', 'danger');
    }
}

// ======================================================
// INICIALIZACIÓN
// ======================================================

function iniciarTanque() {
    // Pre-rellenar ID de dispositivo desde localStorage
    const campo = document.getElementById('calibIdDispositivo');
    if (campo) campo.value = localStorage.getItem('selectedDeviceId') || '';

    // Suscribirse a calibración y a datos en tiempo real
    suscribirCalibracion();
    iniciarSensadoTiempoReal();

    // Limpiar listeners al cerrar el modal
    document.getElementById('modalCalibracion')?.addEventListener('hidden.bs.modal', () => {
        reiniciarCalibModal();
    });
}

// ─── Inicializa nombre de paciente en la UI ──────────────────
function inicializarPaciente() {
    const nombre = localStorage.getItem('selectedPatientName');
    const badge  = document.querySelector('[data-paciente-actual] strong');
    if (badge && nombre) badge.textContent = nombre;
}

// ============================================================
// LÓGICA DEL MODAL DE CALIBRACIÓN
// ============================================================

let _calibPollInterval = null;  // referencia global al intervalo de polling
let _calibEscuchandoError = false;

// Helpers de UI del modal ─────────────────────────────────────
function _calibSetPaneles(paso1, paso2, calibrando, exito, error) {
    document.getElementById('calPaso1').classList.toggle('d-none', !paso1);
    document.getElementById('calPaso2').classList.toggle('d-none', !paso2);
    document.getElementById('calCalibrando').classList.toggle('d-none', !calibrando);
    document.getElementById('calExito').classList.toggle('d-none', !exito);
    document.getElementById('calError').classList.toggle('d-none', !error);
}
function _calibSetPasos(dot1, dot2, dot3, line12, line23) {
    document.getElementById('stepDot1').className  = 'step-dot ' + dot1;
    document.getElementById('stepDot2').className  = 'step-dot ' + dot2;
    document.getElementById('stepDot3').className  = 'step-dot ' + dot3;
    document.getElementById('stepLine12').className = 'step-line ' + line12;
    document.getElementById('stepLine23').className = 'step-line ' + line23;
}
function _calibCerrarBtn(visible) {
    document.getElementById('btnCerrarModalCalib').classList.toggle('d-none', !visible);
}
function _calibDetenerPoll() {
    if (_calibPollInterval) { clearInterval(_calibPollInterval); _calibPollInterval = null; }
    _calibEscuchandoError = false;
}

// Navegación de pasos ─────────────────────────────────────────
function calibIrPaso1() {
    _calibDetenerPoll();
    _calibSetPaneles(true, false, false, false, false);
    _calibSetPasos('active', '', '', '', '');
    _calibCerrarBtn(true);
}
function calibIrPaso2() {
    _calibSetPaneles(false, true, false, false, false);
    _calibSetPasos('done', 'active', '', 'done', '');
    _calibCerrarBtn(true);
}
function calibReset() { setTimeout(calibIrPaso1, 300); }

// Mostrar éxito con valor real ────────────────────────────────
function _calibMostrarExito(baseline) {
    _calibDetenerPoll();
    const psi = Math.round(baseline * 14.5038);
    const textoBaseline = document.getElementById('calExitoBaseline');
    if (textoBaseline) {
        textoBaseline.textContent =
            `Presión máxima registrada: ${baseline.toFixed(2)} bar (${psi} PSI). Este valor es ahora el 100% de referencia del tanque.`;
    }
    maxPsiBaselineLocal = baseline;
    actualizarBadgeCalib(true, baseline);
    _calibSetPaneles(false, false, false, true, false);
    _calibCerrarBtn(true);
    _calibSetPasos('done', 'done', 'done', 'done', 'done');
}

// Mostrar error ───────────────────────────────────────────────
function _calibMostrarError(msg) {
    _calibDetenerPoll();
    const elem = document.getElementById('calErrorMsg');
    if (elem) elem.textContent = msg;
    _calibSetPaneles(false, false, false, false, true);
    _calibCerrarBtn(true);
}

// Calibrar: envía señal + polling hasta recibir baseline real ─
async function calibrarTanque() {
    const patientId = localStorage.getItem('selectedPatientId');
    if (!patientId) {
        _calibMostrarError('No hay paciente seleccionado. Ve a Pacientes y selecciona uno primero.');
        return;
    }

    // Registrar baseline previo (para comparar la fecha después)
    let fechaAntes = null;
    try {
        const r = await fetch(`/api/tanques/calibracion/paciente/${encodeURIComponent(patientId)}`);
        if (r.ok) { const d = await r.json(); if (d.calibrado) fechaAntes = d.fecha; }
    } catch (_) {}

    // Mostrar "calibrando..."
    _calibSetPaneles(false, false, true, false, false);
    _calibCerrarBtn(false);
    _calibSetPasos('done', 'done', 'active', 'done', 'done');

    // Enviar señal al backend → Firebase → ESP32
    try {
        const resp = await fetch('/api/tanques/calibrar/iniciar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_paciente: parseInt(patientId, 10) })
        });
        if (!resp.ok) {
            const d = await resp.json();
            throw new Error(d.error || 'Error del servidor al enviar la señal.');
        }
    } catch (err) {
        _calibMostrarError(err.message);
        return;
    }

    // Activar escucha de error desde Firebase (via SeroaRealtime)
    _calibEscuchandoError = true;

    // Polling cada 2 s — timeout 18 s
    const TIMEOUT_MS = 18000;
    const inicio = Date.now();

    _calibPollInterval = setInterval(async () => {
        // Timeout
        if (Date.now() - inicio > TIMEOUT_MS) {
            _calibMostrarError(
                'El dispositivo no respondió a tiempo. Verifique que el dispositivo Seroa esté ' +
                'encendido, conectado al WiFi y que el tanque esté conectado con la válvula abierta.'
            );
            return;
        }
        try {
            const r = await fetch(`/api/tanques/calibracion/paciente/${encodeURIComponent(patientId)}`);
            if (!r.ok) return;
            const d = await r.json();
            if (!d.calibrado || !(d.max_psi_baseline > 0)) return;
            // Verificar que sea un registro NUEVO (posterior al inicio del proceso)
            const esNuevo = !fechaAntes || new Date(d.fecha) > new Date(fechaAntes);
            if (esNuevo) _calibMostrarExito(d.max_psi_baseline);
        } catch (_) {}
    }, 2000);
}

// ─── DOMContentLoaded ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    inicializarPaciente();
    cargarBaselineApi();
    suscribirDatosFirebase();
    // Cargar datos de BD como fallback inicial (antes de que llegue Firebase)
    cargarUltimoRegistroTanque();

    // Resetear modal al cerrarlo
    const modalEl = document.getElementById('modalCalibracion');
    if (modalEl) {
        modalEl.addEventListener('hidden.bs.modal', calibReset);
    }
});
