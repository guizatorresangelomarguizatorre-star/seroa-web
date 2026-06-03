// ============================================================
// tanque.js — Lógica de Estado del Tanque de Oxígeno
// Firebase real-time + Calibración dinámica + Detección vacío
// ============================================================

const FLUJO_PROMEDIO_LPM = 2;      // litros/min de referencia para tiempo restante
const VOLUMEN_MAX_L       = 680;   // litros estándar a 150 bar (referencia médica)
const MAX_BAR_DEFAULT     = 12.0;  // máximo sin calibración

// ─── Estado local ───────────────────────────────────────────
let maxPsiBaselineLocal = 0;        // 0 = sin calibrar

// ─── Actualiza el cilindro CSS con un porcentaje dado ────────
function actualizarCilindro(porcentaje, presionBar, estadoTanqueStr) {
    const cylFill      = document.getElementById('cylFill');
    const txtPct       = document.getElementById('txtPorcentaje');
    const txtEstado    = document.getElementById('txtEstado');
    const txtAlerta    = document.getElementById('txtAlerta');
    const pBar         = document.getElementById('tankPresionBar');
    const pPsi         = document.getElementById('tankPresionPsi');
    const tiempoElem   = document.getElementById('tankTiempo');
    const estadoVal    = document.getElementById('tankEstadoVal');
    const estadoSub    = document.getElementById('tankEstadoSub');

    if (!cylFill || !txtPct) return;

    const pct = Math.min(100, Math.max(0, Math.round(porcentaje)));

    // Altura del líquido
    cylFill.style.height = pct + '%';

    // Color según nivel
    cylFill.classList.remove('fill-optimo', 'fill-bajo', 'fill-critico');
    txtPct.classList.remove('text-success', 'text-warning', 'text-danger');
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
        if (txtEstado) { txtEstado.textContent = 'Nivel Óptimo'; txtEstado.className = 'fw-bold mb-1'; txtEstado.style.color = 'var(--color-seroa-teal)'; }
        if (txtAlerta) { txtAlerta.textContent = 'Suministro estable'; txtAlerta.className = 'small text-muted mb-3'; }
    }

    txtPct.innerHTML = pct + '<span class="fs-5">%</span>';

    // Presión
    if (pBar) pBar.textContent = presionBar != null ? presionBar.toFixed(2) + ' bar' : '--';
    if (pPsi) {
        const psi = presionBar != null ? Math.round(presionBar * 14.5038) : null;
        pPsi.textContent = psi != null ? psi + ' PSI' : '-- PSI';
    }

    // Tiempo restante estimado (litros totales proporcionales al nivel)
    if (tiempoElem) {
        if (presionBar != null && presionBar > 0.3) {
            const litrosDisp = (pct / 100) * VOLUMEN_MAX_L;
            const minutos = Math.round(litrosDisp / FLUJO_PROMEDIO_LPM);
            const horas = Math.floor(minutos / 60);
            const mins  = minutos % 60;
            tiempoElem.textContent = horas > 0 ? `${horas}h ${mins}m` : `${mins} min`;
        } else {
            tiempoElem.textContent = 'Sin gas';
        }
    }

    // Estado del tanque
    if (estadoVal) {
        const estadoMap = {
            'TANQUE_OK':   { texto: 'Operativo',       color: 'var(--color-seroa-teal)', sub: 'Presión adecuada' },
            'TANQUE_BAJO': { texto: 'Bajo',             color: '#ff9800',                sub: 'Presión insuficiente' },
            'SIN_PRESION': { texto: 'Sin Presión',      color: '#dc3545',                sub: 'Verifique conexión' },
            'ACTIVO':      { texto: 'Activo',           color: 'var(--color-seroa-teal)', sub: 'Sistema en línea' },
            'CALIBRANDO':  { texto: 'Calibrando',       color: '#888',                   sub: 'Espere...' },
        };
        const info = estadoMap[estadoTanqueStr] || { texto: estadoTanqueStr || '--', color: '#888', sub: '--' };
        estadoVal.textContent = info.texto;
        estadoVal.style.color = info.color;
        if (estadoSub) estadoSub.textContent = info.sub;
    }
}

// ─── Detecta tanque vacío y alterna secciones ────────────────
function manejarTanqueVacio(presionBar) {
    const alerta    = document.getElementById('alertaTanqueVacio');
    const contenido = document.getElementById('tankMainContent');
    if (!alerta || !contenido) return;

    const estaVacio = (presionBar == null || presionBar <= 0.3);
    alerta.classList.toggle('d-none', !estaVacio);
    contenido.classList.toggle('d-none', estaVacio);
}

// ─── Actualiza badge de calibración ─────────────────────────
function actualizarBadgeCalib(tieneBaseline, valorBar) {
    const badge = document.getElementById('calibBadge');
    const infoDiv = document.getElementById('calibracionActualInfo');
    const infoTxt = document.getElementById('calibracionTexto');
    if (!badge) return;

    if (tieneBaseline && valorBar > 0) {
        badge.className = 'calib-badge mx-auto';
        badge.innerHTML = '<i class="bi bi-check-circle-fill"></i>Calibrado: ' + valorBar.toFixed(1) + ' bar = 100%';
        if (infoDiv) infoDiv.classList.remove('d-none');
        if (infoTxt) infoTxt.textContent = `Presión máxima registrada: ${valorBar.toFixed(2)} bar (${Math.round(valorBar * 14.5038)} PSI). El nivel se calcula sobre esta referencia.`;
    } else {
        badge.className = 'calib-badge sin-calibrar mx-auto';
        badge.innerHTML = '<i class="bi bi-exclamation-circle"></i>Sin calibración base';
        if (infoDiv) infoDiv.classList.add('d-none');
    }
}

// ─── Suscripción a Firebase via SeroaRealtime ────────────────
function suscribirDatosFirebase() {
    if (!window.SeroaRealtime) return;

    window.SeroaRealtime.subscribe((datos) => {
        if (!datos) return;

        // Detección de error de calibración desde ESP32 vía Firebase
        if (_calibEscuchandoError && datos.calibracion_error === true) {
            _calibMostrarError(
                'No se detectó presión en el tanque. Asegúrese de que el cilindro esté ' +
                'firmemente conectado al regulador y la válvula completamente abierta.'
            );
            return;
        }

        const presionBar  = Number(datos.presionBar != null ? datos.presionBar : -1);
        const estadoTanque = datos.estadoTanque || '--';

        // Si no hay presión válida, mostrar alerta vacío
        if (presionBar < 0) return; // aún no hay datos

        manejarTanqueVacio(presionBar);
        if (presionBar <= 0.3) return; // tanque vacío → solo mostrar alerta

        // Calcular porcentaje
        let porcentaje;
        if (datos.porcentajeTanque != null && Number.isFinite(Number(datos.porcentajeTanque))) {
            // El ESP32 ya calculó el porcentaje con su baseline
            porcentaje = Number(datos.porcentajeTanque);
            if (maxPsiBaselineLocal <= 0 && porcentaje > 0 && presionBar > 0) {
                maxPsiBaselineLocal = presionBar / (porcentaje / 100);
            }
        } else {
            // Sin calibración: usar MAX_BAR_DEFAULT
            const ref = maxPsiBaselineLocal > 0 ? maxPsiBaselineLocal : MAX_BAR_DEFAULT;
            porcentaje = Math.min(100, (presionBar / ref) * 100);
        }

        actualizarCilindro(porcentaje, presionBar, estadoTanque);

        // Badge de calibración
        const tieneBaseline = maxPsiBaselineLocal > 0;
        actualizarBadgeCalib(tieneBaseline, tieneBaseline ? maxPsiBaselineLocal : 0);
    });
}

// ─── Carga el baseline desde la API al iniciar ───────────────
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
        console.warn('No se pudo cargar el baseline de calibración:', e);
    }
}

// ─── Carga último registro de la tabla tanques (fallback cuando Firebase no responde) ──
async function cargarUltimoRegistroTanque() {
    const patientId = localStorage.getItem('selectedPatientId');
    if (!patientId) return;
    try {
        const resp = await fetch(`/api/tanques?id_paciente=${encodeURIComponent(patientId)}`);
        if (!resp.ok) return;
        const registros = await resp.json();
        if (!registros.length) return;

        const r = registros[0];
        const presionBar  = parseFloat(r.presion_actual || 0);
        const porcentaje  = parseFloat(r.porcentaje || 0);
        const estadoStr   = presionBar <= 0.3 ? 'SIN_PRESION'
                           : porcentaje < 20   ? 'TANQUE_BAJO' : 'TANQUE_OK';

        manejarTanqueVacio(presionBar);
        if (presionBar > 0.3) {
            actualizarCilindro(porcentaje, presionBar, estadoStr);
            actualizarBadgeCalib(maxPsiBaselineLocal > 0, maxPsiBaselineLocal);
        }
    } catch (e) {
        console.warn('Error leyendo registro de tanque desde BD:', e);
    }
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
