<<<<<<< HEAD
// ============================================================
// tanque.js — Estado del Tanque de Oxígeno
// Máquina de estados: sin_dispositivo → sin_tanque → activo
// Vinculación BLE embebida + Auto-calibración + Calibración manual
// ============================================================

const FLUJO_PROMEDIO_LPM = 2;
const VOLUMEN_MAX_L       = 680;
const MAX_BAR_DEFAULT     = 12.0;
=======
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
>>>>>>> b6f9fe4290168a1168ee7ad6c61725c745ee9a0a

// ─── Estado de la página ────────────────────────────────────
let maxPsiBaselineLocal = 0;
let _baselineTimer      = null;
let _hayDispositivo     = false;  // true una vez que se confirma dispositivo vinculado

<<<<<<< HEAD
// ============================================================
// MÁQUINA DE ESTADOS DE LA UI
// ============================================================

function mostrarEstado(estado) {
    // estados: 'sin_dispositivo' | 'sin_tanque' | 'auto_calibrando' | 'activo'
    const secSinDisp   = document.getElementById('seccionSinDispositivo');
    const bannerSinTnq = document.getElementById('sinTanqueBanner');
    const tankArea     = document.getElementById('tankArea');
    const btnCalibPpal = document.getElementById('btnCalibracionAbierta');
    const btnCalibRow  = document.getElementById('btnCalibracionRowSecundario');

    if (secSinDisp)   secSinDisp.classList.toggle('d-none', estado !== 'sin_dispositivo');
    if (bannerSinTnq) bannerSinTnq.classList.toggle('visible', estado === 'sin_tanque');
    if (btnCalibPpal) btnCalibPpal.classList.toggle('d-none', estado === 'sin_dispositivo');
    if (btnCalibRow)  btnCalibRow.classList.toggle('d-none', estado === 'sin_dispositivo');

    // Greying visual: aplica directamente por JS (evita problemas de herencia CSS)
    const esSinDisp = estado === 'sin_dispositivo';
    const opac = esSinDisp ? '0.35' : '';
    const greyFlt = esSinDisp ? 'grayscale(70%)' : '';

    if (tankArea) { tankArea.style.opacity = opac; tankArea.style.filter = greyFlt; }

    ['txtPorcentaje','txtEstado','txtAlerta','calibBadge',
     'tankPresionBar','tankPresionPsi','tankTiempo','tankEstadoVal','tankEstadoSub']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.opacity = opac; });

    // Si no hay dispositivo, resetear textos del tanque
    if (esSinDisp) {
        const txtPct    = document.getElementById('txtPorcentaje');
        const txtEstado = document.getElementById('txtEstado');
        const txtAlerta = document.getElementById('txtAlerta');
        if (txtPct)    txtPct.innerHTML = '--<span class="fs-5">%</span>';
        if (txtEstado) { txtEstado.textContent = 'Sin dispositivo'; txtEstado.className = 'fw-bold mb-1 text-secondary'; }
        if (txtAlerta) txtAlerta.textContent = 'Vincula tu dispositivo Seroa para ver datos';
    }

    if (estado === 'auto_calibrando') mostrarAutoCalibrandoUI();
}

// ─── Verifica si el paciente tiene dispositivo vinculado ────
async function verificarDispositivoVinculado() {
    const patientId = localStorage.getItem('selectedPatientId');
    if (!patientId) {
        mostrarEstado('sin_dispositivo');
        return;
    }
    try {
        const resp = await fetch(`/api/pacientes/${encodeURIComponent(patientId)}/dispositivo`);
        if (!resp.ok) { mostrarEstado('sin_dispositivo'); return; }
        const data = await resp.json();
        _hayDispositivo = !!(data && data.vinculado);
        if (!_hayDispositivo) {
            mostrarEstado('sin_dispositivo');
        }
        // Si sí hay dispositivo, la UI se actualiza cuando llegan datos de Firebase
    } catch (e) {
        console.warn('No se pudo verificar dispositivo:', e);
        mostrarEstado('sin_dispositivo');
    }
}

// ============================================================
// VISUAL DEL CILINDRO
// ============================================================

function actualizarCilindro(porcentaje, presionBar, estadoTanqueStr, tiempoRestanteMin) {
    const cylFill    = document.getElementById('cylFill');
    const txtPct     = document.getElementById('txtPorcentaje');
    const txtEstado  = document.getElementById('txtEstado');
    const txtAlerta  = document.getElementById('txtAlerta');
    const pBar       = document.getElementById('tankPresionBar');
    const pPsi       = document.getElementById('tankPresionPsi');
    const tiempoElem = document.getElementById('tankTiempo');
    const estadoVal  = document.getElementById('tankEstadoVal');
    const estadoSub  = document.getElementById('tankEstadoSub');

    if (!cylFill || !txtPct) return;

    const pct = Math.min(100, Math.max(0, Math.round(porcentaje)));

    // Altura del líquido
    cylFill.style.height = pct + '%';

    // Color según nivel
    cylFill.classList.remove('fill-optimo', 'fill-bajo', 'fill-critico');
    txtPct.removeAttribute('style');

    if (pct <= 20) {
        cylFill.classList.add('fill-critico');
        txtPct.style.cssText = 'font-size:3.5rem;color:#dc3545;';
        if (txtEstado) { txtEstado.textContent = '¡Nivel Crítico!'; txtEstado.className = 'fw-bold mb-1 text-danger'; }
        if (txtAlerta) { txtAlerta.textContent = 'RIESGO — Recarga inmediata necesaria'; txtAlerta.className = 'small fw-bold text-danger mb-3'; }
    } else if (pct <= 50) {
        cylFill.classList.add('fill-bajo');
        txtPct.style.cssText = 'font-size:3.5rem;color:#ff9800;';
        if (txtEstado) { txtEstado.textContent = 'Nivel Bajo'; txtEstado.className = 'fw-bold mb-1 text-warning'; }
        if (txtAlerta) { txtAlerta.textContent = 'Atención — Programar recarga pronto'; txtAlerta.className = 'small text-warning mb-3'; }
    } else {
        cylFill.classList.add('fill-optimo');
        txtPct.style.cssText = 'font-size:3.5rem;color:var(--color-seroa-teal);';
        if (txtEstado) {
            txtEstado.textContent = 'Nivel Óptimo';
            txtEstado.className = 'fw-bold mb-1';
            txtEstado.style.color = 'var(--color-seroa-teal)';
        }
        if (txtAlerta) { txtAlerta.textContent = 'Suministro estable'; txtAlerta.className = 'small text-muted mb-3'; }
=======
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
>>>>>>> b6f9fe4290168a1168ee7ad6c61725c745ee9a0a
    }
}

function calcularPorcentaje(presionActual, presionMax) {
    if (!presionMax || presionMax <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((presionActual / presionMax) * 100)));
}

<<<<<<< HEAD
    // Alertas sonoras
    if (window.SeroaNotif) window.SeroaNotif.alertarTanque(pct);

    // Presión en bar y PSI
    if (pBar) pBar.textContent = presionBar != null ? presionBar.toFixed(2) + ' bar' : '--';
    if (pPsi) {
        const psi = presionBar != null ? Math.round(presionBar * 14.5038) : null;
        pPsi.textContent = psi != null ? psi + ' PSI' : '-- PSI';
    }

    // Tiempo restante: prioriza el valor calculado por el ESP32
    if (tiempoElem) {
        let minutos = null;
        if (tiempoRestanteMin != null && Number.isFinite(tiempoRestanteMin) && tiempoRestanteMin >= 0) {
            minutos = tiempoRestanteMin;
        } else if (presionBar != null && presionBar > 0.3) {
            minutos = Math.round((pct / 100) * VOLUMEN_MAX_L / FLUJO_PROMEDIO_LPM);
        }
        if (minutos != null) {
            const h = Math.floor(minutos / 60), m = minutos % 60;
            tiempoElem.textContent = h > 0 ? `${h}h ${m}m` : `${m} min`;
        } else {
            tiempoElem.textContent = 'Sin gas';
        }
    }

    // Tarjeta estado
    if (estadoVal) {
        const map = {
            'TANQUE_OK':   { texto: 'Operativo',    color: 'var(--color-seroa-teal)', sub: 'Presión adecuada' },
            'TANQUE_BAJO': { texto: 'Bajo',          color: '#ff9800',                sub: 'Presión insuficiente' },
            'SIN_PRESION': { texto: 'Sin Presión',   color: '#dc3545',                sub: 'Verifique conexión' },
            'ACTIVO':      { texto: 'Activo',        color: 'var(--color-seroa-teal)', sub: 'Sistema en línea' },
            'CALIBRANDO':  { texto: 'Calibrando...', color: '#888',                   sub: 'Espere...' },
        };
        const info = map[estadoTanqueStr] || { texto: estadoTanqueStr || '--', color: '#888', sub: '--' };
        estadoVal.textContent = info.texto;
        estadoVal.style.color = info.color;
        if (estadoSub) estadoSub.textContent = info.sub;
    }
}

// ─── UI "Auto-calibrando" ────────────────────────────────────
function mostrarAutoCalibrandoUI() {
    const txtEstado = document.getElementById('txtEstado');
    const txtAlerta = document.getElementById('txtAlerta');
    const estadoVal = document.getElementById('tankEstadoVal');
    const estadoSub = document.getElementById('tankEstadoSub');
    if (txtEstado) { txtEstado.textContent = 'Auto-calibrando...'; txtEstado.style.color = '#888'; txtEstado.className = 'fw-bold mb-1 text-secondary'; }
    if (txtAlerta) { txtAlerta.textContent = 'Estableciendo nivel 100% con la primera medida del tanque'; txtAlerta.className = 'small text-muted mb-3'; }
    if (estadoVal) { estadoVal.textContent = 'Calibrando'; estadoVal.style.color = '#888'; }
    if (estadoSub) estadoSub.textContent = 'Primer arranque — no mover el dispositivo';
}

// ─── Banner sin tanque (no oculta el contenido principal) ──
function manejarTanqueVacio(presionBar) {
    const vacio = (presionBar == null || presionBar <= 0.3);
    if (vacio) {
        mostrarEstado('sin_tanque');
    }
    // Si hay presión, el estado se maneja en suscribirDatosFirebase según los datos
}

// ─── Badge de calibración ────────────────────────────────────
function actualizarBadgeCalib(tieneBaseline, valorBar) {
    const badge   = document.getElementById('calibBadge');
    const infoDiv = document.getElementById('calibracionActualInfo');
    const infoTxt = document.getElementById('calibracionTexto');
    if (!badge) return;
    if (tieneBaseline && valorBar > 0) {
        badge.className = 'calib-badge mx-auto';
        badge.innerHTML = `<i class="bi bi-check-circle-fill"></i>Calibrado: ${valorBar.toFixed(1)} bar = 100%`;
        if (infoDiv) infoDiv.classList.remove('d-none');
        if (infoTxt) infoTxt.textContent = `Presión máxima: ${valorBar.toFixed(2)} bar (${Math.round(valorBar * 14.5038)} PSI). El nivel se calcula sobre esta referencia.`;
    } else {
        badge.className = 'calib-badge sin-calibrar mx-auto';
        badge.innerHTML = '<i class="bi bi-exclamation-circle"></i>Sin calibración base';
        if (infoDiv) infoDiv.classList.add('d-none');
    }
}

// ─── Polling periódico: detecta auto-calibración del ESP32 ──
function iniciarPollingBaseline() {
    if (maxPsiBaselineLocal > 0 || _baselineTimer !== null) return;
    _baselineTimer = setInterval(async () => {
        await cargarBaselineApi();
        if (maxPsiBaselineLocal > 0) {
            clearInterval(_baselineTimer);
            _baselineTimer = null;
            actualizarBadgeCalib(true, maxPsiBaselineLocal);
            if (window.mostrarToast) {
                window.mostrarToast(
                    `Calibración automática completada: ${maxPsiBaselineLocal.toFixed(2)} bar = 100%`,
                    'success', 5000
                );
            }
        }
    }, 4000);
}

// ─── Firebase real-time ──────────────────────────────────────
function suscribirDatosFirebase() {
    if (!window.SeroaRealtime) return;
=======
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
>>>>>>> b6f9fe4290168a1168ee7ad6c61725c745ee9a0a

        presionMaxima = calib.presionMaxima;
        mostrarEstadoConCalibracion();

<<<<<<< HEAD
        // ESP32 en auto-calibración (primer arranque)
        if (datos.calibracion_pendiente === true) {
            mostrarEstado('auto_calibrando');
            iniciarPollingBaseline();
            return;
        }

        // Error de calibración notificado por el ESP32
        if (_calibEscuchandoError && datos.calibracion_error === true) {
            _calibMostrarError(
                'No se detectó presión en el tanque. Asegúrese de que el cilindro esté ' +
                'conectado al regulador y la válvula completamente abierta.'
            );
            return;
        }

        const presionBar        = Number(datos.presionBar != null ? datos.presionBar : -1);
        const estadoTanque      = datos.estadoTanque || '--';
        const tiempoRestanteMin = datos.tiempoRestanteMinutos != null
                                  ? Number(datos.tiempoRestanteMinutos) : null;

        if (presionBar < 0) return; // aún no hay lecturas

        // Recibimos datos del ESP32 → hay dispositivo vinculado
        _hayDispositivo = true;
        document.getElementById('seccionSinDispositivo')?.classList.add('d-none');

        if (presionBar <= 0.3) {
            manejarTanqueVacio(presionBar);
            return;
        }

        // Hay presión → ocultar banner "sin tanque"
        const banner = document.getElementById('sinTanqueBanner');
        if (banner) banner.classList.remove('visible');

        // Calcular porcentaje
        let porcentaje;
        if (datos.porcentajeTanque != null && Number.isFinite(Number(datos.porcentajeTanque))) {
            porcentaje = Number(datos.porcentajeTanque);
            if (maxPsiBaselineLocal <= 0 && porcentaje > 0 && presionBar > 0) {
                cargarBaselineApi().catch(() => {
                    if (maxPsiBaselineLocal <= 0) {
                        maxPsiBaselineLocal = presionBar / (porcentaje / 100);
                    }
                });
            }
        } else {
            const ref = maxPsiBaselineLocal > 0 ? maxPsiBaselineLocal : MAX_BAR_DEFAULT;
            porcentaje = Math.min(100, (presionBar / ref) * 100);
        }

        actualizarCilindro(porcentaje, presionBar, estadoTanque, tiempoRestanteMin);

        const tieneBaseline = maxPsiBaselineLocal > 0;
        actualizarBadgeCalib(tieneBaseline, tieneBaseline ? maxPsiBaselineLocal : 0);
        if (!tieneBaseline) iniciarPollingBaseline();
    });
}

// ─── API: Baseline ───────────────────────────────────────────
async function cargarBaselineApi() {
    const patientId = localStorage.getItem('selectedPatientId');
    if (!patientId) return;
    try {
        const resp = await fetch(`/api/tanques/calibracion/paciente/${encodeURIComponent(patientId)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.calibrado && data.max_psi_baseline > 0) {
            maxPsiBaselineLocal = data.max_psi_baseline;
            actualizarBadgeCalib(true, maxPsiBaselineLocal);
        }
    } catch (e) {
        console.warn('No se pudo cargar el baseline:', e);
    }
}

// ─── API: Último registro de BD (fallback) ───────────────────
async function cargarUltimoRegistroTanque() {
    const patientId = localStorage.getItem('selectedPatientId');
    if (!patientId) return;
    try {
        const resp = await fetch(`/api/tanques?id_paciente=${encodeURIComponent(patientId)}`);
        if (!resp.ok) return;
        const registros = await resp.json();
        if (!registros.length) return;

        const r = registros[0];
        const presionBar = parseFloat(r.presion_actual || 0);
        const porcentaje = parseFloat(r.porcentaje || 0);
        const estadoStr  = presionBar <= 0.3 ? 'SIN_PRESION'
                         : porcentaje < 20   ? 'TANQUE_BAJO' : 'TANQUE_OK';
        const tiempoMin  = r.tiempo_restante_minutos != null ? parseInt(r.tiempo_restante_minutos) : null;

        if (presionBar > 0.3) {
            _hayDispositivo = true;
            document.getElementById('seccionSinDispositivo')?.classList.add('d-none');
            const banner = document.getElementById('sinTanqueBanner');
            if (banner) banner.classList.remove('visible');
            actualizarCilindro(porcentaje, presionBar, estadoStr, tiempoMin);
            actualizarBadgeCalib(maxPsiBaselineLocal > 0, maxPsiBaselineLocal);
        }
    } catch (e) {
        console.warn('Error leyendo registro de tanque desde BD:', e);
=======
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
>>>>>>> b6f9fe4290168a1168ee7ad6c61725c745ee9a0a
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

// ─── Paciente badge ──────────────────────────────────────────
function inicializarPaciente() {
    const nombre = localStorage.getItem('selectedPatientName');
    const badge  = document.querySelector('[data-paciente-actual] strong');
    if (badge && nombre) badge.textContent = nombre;
}

// ============================================================
// MODAL DE CALIBRACIÓN MANUAL
// ============================================================

let _calibPollInterval  = null;
let _calibEscuchandoError = false;

function _calibSetPaneles(p1, p2, calibrando, exito, error) {
    document.getElementById('calPaso1')?.classList.toggle('d-none', !p1);
    document.getElementById('calPaso2')?.classList.toggle('d-none', !p2);
    document.getElementById('calCalibrando')?.classList.toggle('d-none', !calibrando);
    document.getElementById('calExito')?.classList.toggle('d-none', !exito);
    document.getElementById('calError')?.classList.toggle('d-none', !error);
}
function _calibSetPasos(d1, d2, d3, l12, l23) {
    document.getElementById('stepDot1')?.setAttribute('class',  'step-dot ' + d1);
    document.getElementById('stepDot2')?.setAttribute('class',  'step-dot ' + d2);
    document.getElementById('stepDot3')?.setAttribute('class',  'step-dot ' + d3);
    document.getElementById('stepLine12')?.setAttribute('class','step-line ' + l12);
    document.getElementById('stepLine23')?.setAttribute('class','step-line ' + l23);
}
function _calibCerrarBtn(v) {
    document.getElementById('btnCerrarModalCalib')?.classList.toggle('d-none', !v);
}
function _calibDetenerPoll() {
    if (_calibPollInterval) { clearInterval(_calibPollInterval); _calibPollInterval = null; }
    _calibEscuchandoError = false;
}

function calibIrPaso1() {
    _calibDetenerPoll();
    _calibSetPaneles(true,false,false,false,false);
    _calibSetPasos('active','','','','');
    _calibCerrarBtn(true);
}
function calibIrPaso2() {
    _calibSetPaneles(false,true,false,false,false);
    _calibSetPasos('done','active','','done','');
    _calibCerrarBtn(true);
}
function calibReset() { setTimeout(calibIrPaso1, 300); }

function _calibMostrarExito(baseline) {
    _calibDetenerPoll();
    if (_baselineTimer) { clearInterval(_baselineTimer); _baselineTimer = null; }
    const psi = Math.round(baseline * 14.5038);
    const el  = document.getElementById('calExitoBaseline');
    if (el) el.textContent =
        `Presión máxima registrada: ${baseline.toFixed(2)} bar (${psi} PSI). Este valor es ahora el 100% de referencia.`;
    maxPsiBaselineLocal = baseline;
    actualizarBadgeCalib(true, baseline);
    _calibSetPaneles(false,false,false,true,false);
    _calibCerrarBtn(true);
    _calibSetPasos('done','done','done','done','done');
}

function _calibMostrarError(msg) {
    _calibDetenerPoll();
    const el = document.getElementById('calErrorMsg');
    if (el) el.textContent = msg;
    _calibSetPaneles(false,false,false,false,true);
    _calibCerrarBtn(true);
}

async function calibrarTanque() {
    const patientId = localStorage.getItem('selectedPatientId');
    if (!patientId) {
        _calibMostrarError('No hay paciente seleccionado. Ve a Pacientes y selecciona uno primero.');
        return;
    }

    let fechaAntes = null;
    try {
        const r = await fetch(`/api/tanques/calibracion/paciente/${encodeURIComponent(patientId)}`);
        if (r.ok) { const d = await r.json(); if (d.calibrado) fechaAntes = d.fecha; }
    } catch (_) {}

    _calibSetPaneles(false,false,true,false,false);
    _calibCerrarBtn(false);
    _calibSetPasos('done','done','active','done','done');

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

    _calibEscuchandoError = true;

    // Timeout 20 s (ESP32 tarda 5 s en muestrear + latencia)
    const TIMEOUT_MS = 20000;
    const inicio = Date.now();

    _calibPollInterval = setInterval(async () => {
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
            const esNuevo = !fechaAntes || new Date(d.fecha) > new Date(fechaAntes);
            if (esNuevo) _calibMostrarExito(d.max_psi_baseline);
        } catch (_) {}
    }, 2000);
}

// ============================================================
// DOMContentLoaded
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarPaciente();

    // Verificar si el paciente tiene un dispositivo vinculado
    verificarDispositivoVinculado().then(() => {
        // Cargar baseline si hay dispositivo
        if (_hayDispositivo) cargarBaselineApi();
    });

    // Suscribir a Firebase (datos en tiempo real)
    suscribirDatosFirebase();

    // Fallback: último registro de BD
    cargarUltimoRegistroTanque();

    // Resetear modal de calibración al cerrarse
    document.getElementById('modalCalibracion')?.addEventListener('hidden.bs.modal', calibReset);
});
