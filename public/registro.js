// Registro diario de lecturas y estructura de datos biométricos
const database = window.database || firebase.database();

let latestRegistros = [];
let latestRegistrosFiltered = [];

function clasificarLectura(spo2, bpm) {
    const spo2Num = Number(spo2);
    const bpmNum = Number(bpm);
    // Obtener umbrales según paciente seleccionado (si existen)
    const pacienteMinStored = Number(localStorage.getItem('selectedPatientSpo2Min'));
    const tienePacienteMin = Number.isFinite(pacienteMinStored) && pacienteMinStored > 0;

    let dangerThreshold = 85;
    let precautionThreshold = 90;
    if (tienePacienteMin) {
        precautionThreshold = pacienteMinStored;
        dangerThreshold = Math.max(0, Math.round(pacienteMinStored - 5));
    }

    const rojo = (spo2Num < dangerThreshold) || bpmNum < 50 || bpmNum > 140;
    const naranja = (!rojo && (spo2Num < precautionThreshold || (bpmNum >= 50 && bpmNum <= 59) || (bpmNum >= 101 && bpmNum <= 140)));

    if (rojo) return { nivel: 'Peligro', color: 'danger', accion: 'Válvula de oxígeno activada' };
    if (naranja) return { nivel: 'Precaución', color: 'warning', accion: 'Monitoreo continuo' };
    return { nivel: 'Normal', color: 'success', accion: 'Monitoreo continuo' };
}

function formatoFecha(fecha) {
    const dt = new Date(fecha);
    return dt.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function generarIdRegistro() {
    const tiempo = Date.now().toString(36).toUpperCase();
    const aleatorio = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `R-${tiempo}-${aleatorio}`;
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
    const regs = registros || [];
    if (!regs.length) {
        tablaRegistros.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No hay registros biométricos disponibles para este paciente.</td></tr>`;
        return;
    }

    // Apply current filters if present
    const filtered = applyCurrentFilters(regs);
    latestRegistrosFiltered = filtered;

    tablaRegistros.innerHTML = filtered.map(registro => {
        const nivel = registro.nivel_alerta || registro.nivel || (registro.es_critico === 2 ? 'Peligro' : (registro.es_critico === 1 ? 'Precaución' : 'Normal'));
        const clasificacion = nivel === 'Peligro' ? { color: 'danger', nivel } : nivel === 'Precaución' ? { color: 'warning', nivel } : { color: 'success', nivel };
        const accion = registro.accion_sistema || registro.accion || (nivel === 'Peligro' ? 'Válvula de emergencia activada' : 'Monitoreo continuo');

        // Determine tipo: si el registro tiene campo "resumen_hora" o si su metadata indica que es agregado
        const tipo = registro.tipo_registro || (registro.resumen_hora ? 'Resumen por Hora' : (nivel === 'Normal' ? 'Resumen por Hora (Normal)' : 'Incidente Crítico'));

        const badgeClass = nivel === 'Peligro' ? 'badge bg-danger' : nivel === 'Precaución' ? 'badge bg-warning text-dark' : 'badge bg-success';

        return `
            <tr class="table-${clasificacion.color}">
                <td>${formatoFecha(registro.fecha_hora)}</td>
                <td>${registro.saturacion_oxigeno}%</td>
                <td>${registro.ritmo_cardiaco} bpm</td>
                <td><span class="${badgeClass}">${clasificacion.nivel}</span></td>
                <td>${accion}</td>
                <td>${registro.usuario_turno || 'Usuario anónimo'}</td>
                <td><small class="text-muted">${tipo}</small></td>
            </tr>
        `;
    }).join('');
}

function suscribirRegistrosRTDB(idPaciente) {
    if (!idPaciente) return;
    const path = `registros_biomedicos/${idPaciente}`;
    database.ref(path).limitToLast(200).on('value', snapshot => {
        const datos = snapshot.val();
        const registros = datos ? Object.values(datos).sort((a,b)=> new Date(b.fecha_hora) - new Date(a.fecha_hora)) : [];
        latestRegistros = registros;
        renderRegistrosFirebase(registros);
        actualizarResumenDiario(registros);
    });
}

function applyCurrentFilters(regs) {
    const inicio = document.getElementById('filterFechaInicio')?.value;
    const fin = document.getElementById('filterFechaFin')?.value;
    const tipo = document.getElementById('filterTipoAlerta')?.value || 'todos';

    return regs.filter(r => {
        const fecha = new Date(r.fecha_hora);
        if (inicio) {
            const di = new Date(inicio + 'T00:00:00');
            if (fecha < di) return false;
        }
        if (fin) {
            const df = new Date(fin + 'T23:59:59');
            if (fecha > df) return false;
        }

        const nivel = (r.nivel_alerta || r.nivel || (r.es_critico === 2 ? 'Peligro' : (r.es_critico === 1 ? 'Precaución' : 'Normal')));
        if (tipo && tipo !== 'todos') {
            if (nivel !== tipo) return false;
        }

        return true;
    });
}

function initRegistroFilters() {
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', (e) => {
        e.preventDefault();
        renderRegistrosFirebase(latestRegistros);
    });
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (document.getElementById('filterFechaInicio')) document.getElementById('filterFechaInicio').value = '';
        if (document.getElementById('filterFechaFin')) document.getElementById('filterFechaFin').value = '';
        if (document.getElementById('filterTipoAlerta')) document.getElementById('filterTipoAlerta').value = 'todos';
        renderRegistrosFirebase(latestRegistros);
    });
}

// Guarda un registro estructurado en RTDB y lo envía al servidor backend
async function guardarRegistroEstructurado(lectura) {
    const pacienteId = localStorage.getItem('selectedPatientId');
    if (!pacienteId) return console.warn('No hay paciente seleccionado. Registro no guardado.');

    const idRegistro = generarIdRegistro();
    const ref = database.ref(`registros_biomedicos/${pacienteId}/${idRegistro}`);

    const usuarioTurno = localStorage.getItem('nombrePaciente') || 'Usuario anónimo';

    const registro = {
        id_registro: idRegistro,
        fecha_hora: new Date().toISOString(),
        fecha_hora_display: formatoFecha(new Date()),
        paciente: localStorage.getItem('selectedPatientName') || 'Sin selección',
        saturacion_oxigeno: Number(lectura.spo2),
        ritmo_cardiaco: Number(lectura.bpm),
        nivel_alerta: lectura.nivel,
        accion_sistema: lectura.accion,
        usuario_turno: usuarioTurno
    };

    try {
        await ref.set(registro);
    } catch (err) {
        console.error('Error guardando en RTDB:', err);
    }

    // Enviar al backend también
    try {
        await fetch('/api/registros', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registro)
        });
    } catch (err) {
        console.error('Error enviando registro al servidor:', err);
    }
}

// Suscribir a lecturas en tiempo real (Seroa/Actual) y guardar cada entrada
function suscribirLecturasRT(leerGuardar = true) {
    window.SeroaRealtime.subscribe((datos) => {
        if (!datos || datos.estado !== 'ACTIVO') return;

        const spo2 = Number(datos.spo2);
        const bpm = Number(datos.bpm);
        if (!Number.isFinite(spo2) || !Number.isFinite(bpm) || spo2 <= 0 || bpm <= 0) return;

        const clas = clasificarLectura(spo2, bpm);
        const lectura = { spo2, bpm, nivel: clas.nivel, accion: clas.accion };

        if (leerGuardar) guardarRegistroEstructurado(lectura);
    });
}

function actualizarResumenDiario(registros) {
    const hoy = new Date();
    const registrosHoy = (registros || []).filter(r => r.fecha_hora && window.esHoy(r.fecha_hora));
    const cardSpO2 = document.getElementById('valorPromedioSpO2');
    const cardBpm = document.getElementById('valorPromedioBpm');
    const cardValvula = document.getElementById('valorActivaciones');

    if (!registrosHoy.length) {
        if (cardSpO2) cardSpO2.textContent = '--';
        if (cardBpm) cardBpm.textContent = '--';
        if (cardValvula) cardValvula.textContent = '0 veces';
        return;
    }

    const registrosValidos = registrosHoy.filter(r => Number.isFinite(Number(r.saturacion_oxigeno)) && Number.isFinite(Number(r.ritmo_cardiaco)));
    const totalSpO2 = registrosValidos.reduce((sum, r) => sum + Number(r.saturacion_oxigeno), 0);
    const totalBpm = registrosValidos.reduce((sum, r) => sum + Number(r.ritmo_cardiaco), 0);
    const promedioSpO2 = registrosValidos.length ? Math.round(totalSpO2 / registrosValidos.length) : '--';
    const promedioBpm = registrosValidos.length ? Math.round(totalBpm / registrosValidos.length) : '--';
    const activaciones = registrosHoy.filter(r => {
        return (r.accion_sistema || '').toString().toLowerCase().includes('válvula') || (r.nivel_alerta === 'Peligro') || (r.nivel === 'Peligro');
    }).length;

    if (cardSpO2) cardSpO2.textContent = promedioSpO2 === '--' ? '--' : `${promedioSpO2}%`;
    if (cardBpm) cardBpm.textContent = promedioBpm === '--' ? '--' : `${promedioBpm} bpm`;
    if (cardValvula) cardValvula.textContent = `${activaciones} ${activaciones === 1 ? 'vez' : 'veces'}`;
}

async function iniciarRegistroDiario() {
    const userId = localStorage.getItem('userId');
    const pacienteId = localStorage.getItem('selectedPatientId');
    const pacienteNombre = localStorage.getItem('selectedPatientName') || 'Sin selección';
    // Buscamos el badge de paciente tanto por id como por data attribute global
    const pacienteBadge = document.getElementById('pacienteActualLabel') || document.querySelector('[data-paciente-actual]');
    const titulo = document.getElementById('registroPacienteNombre');
    const btnDescargar = document.getElementById('btnDescargarPDF');
    const formNotas = document.getElementById('formNotas');

    if (pacienteBadge) {
        // si contiene un <strong>, actualizar su texto; si no, escribir el HTML completo
        const strong = pacienteBadge.querySelector ? pacienteBadge.querySelector('strong') : null;
        if (strong) strong.textContent = pacienteNombre;
        else pacienteBadge.innerHTML = `<i class="bi bi-person-fill text-teal me-1"></i> Paciente Actual: <strong>${pacienteNombre}</strong>`;
    }
    if (titulo) titulo.textContent = pacienteNombre;

    if (btnDescargar) {
        btnDescargar.addEventListener('click', generarPDF);
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
    // Suscribimos además al flujo principal de lecturas para guardar eventos en RTDB
    suscribirLecturasRT(true);
    // Inicializar filtros de la UI
    initRegistroFilters();

    // Resaltar títulos en la pestaña Registro Diario (color Verde Seroa)
    try {
        const style = document.createElement('style');
        style.innerHTML = `
            body .container h5, body .container h4, body .container h3 { color: var(--color-seroa-teal) !important; font-weight: 700 !important; }
        `;
        document.head.appendChild(style);
    } catch (e) { console.warn('No se pudo inyectar estilos de resaltado:', e); }
}

// ---------- Generar PDF de reporte médico ----------
async function obtenerImagenBase64(url) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function generarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const logoUrl = 'img/logo-icono.png';
    let logoData = null;
    try { logoData = await obtenerImagenBase64(logoUrl); } catch (e) { console.warn('No se pudo cargar logo para PDF', e); }

    // Header
    if (logoData) doc.addImage(logoData, 'PNG', 40, 30, 60, 60);
    doc.setFontSize(18);
    doc.text('Reporte Médico — Monitor Seroa', 120, 48);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 120, 66);

    const paciente = localStorage.getItem('selectedPatientName') || 'Sin selección';
    const usuario = localStorage.getItem('nombrePaciente') || 'Usuario anónimo';
    doc.setFontSize(12);
    doc.text(`Paciente: ${paciente}`, 40, 110);
    doc.text(`Usuario en turno: ${usuario}`, 40, 130);

    // Información adicional del paciente (si está disponible)
    const pacienteEdad = localStorage.getItem('selectedPatientEdad');
    const pacientePeso = localStorage.getItem('selectedPatientPeso');
    const pacienteSexo = localStorage.getItem('selectedPatientSexo');
    const pacientePadecimiento = localStorage.getItem('selectedPatientPadecimiento');
    const pacienteSpo2Min = Number(localStorage.getItem('selectedPatientSpo2Min'));
    const pacienteSpo2Max = Number(localStorage.getItem('selectedPatientSpo2Max'));

    let infoY = 150;
    doc.setFontSize(11);
    if (pacienteEdad || pacientePeso || pacienteSexo || pacientePadecimiento) {
        doc.text('Datos del Paciente:', 40, infoY);
        infoY += 14;
        if (pacienteEdad) doc.text(`Edad: ${pacienteEdad}`, 50, infoY);
        if (pacientePeso) doc.text(`Peso: ${pacientePeso} kg`, 200, infoY);
        infoY += 14;
        if (pacienteSexo) doc.text(`Sexo: ${pacienteSexo}`, 50, infoY);
        if (pacientePadecimiento) doc.text(`Padecimiento: ${pacientePadecimiento}`, 200, infoY);
        infoY += 18;
        if (Number.isFinite(pacienteSpo2Min) && Number.isFinite(pacienteSpo2Max)) {
            doc.text(`Rango SpO2 configurado: ${pacienteSpo2Min}% - ${pacienteSpo2Max}%`, 50, infoY);
            infoY += 18;
        }
    }

    // Tabla de registros recientes (usar los filtrados si el usuario aplicó filtros)
    const source = (latestRegistrosFiltered && latestRegistrosFiltered.length) ? latestRegistrosFiltered : latestRegistros;
    const rows = (source || []).slice(0, 500).map(r => [r.id_registro || '-', (new Date(r.fecha_hora)).toLocaleString('es-MX'), `${r.saturacion_oxigeno}%`, `${r.ritmo_cardiaco} bpm`, r.nivel_alerta || r.nivel || '-', r.accion_sistema || r.accion || '-', r.usuario_turno || '-']);
    doc.autoTable({
        startY: 160,
        head: [['ID', 'Fecha y Hora', 'SpO2', 'BPM', 'Nivel', 'Acción', 'Usuario']],
        body: rows,
        styles: { fontSize: 9 }
    });

    // Insertar gráficas si existen instancias de ApexCharts en la página (intento seguro)
    try {
        const spo2Chart = window.spo2Chart || window.chartSpo2 || window.chartSPO2;
        const bpmChart = window.chartBpm || window.bpmChart || window.chartBPM;
        let yOffset = 160;
        if (spo2Chart && typeof spo2Chart.dataURI === 'function') {
            const data = await spo2Chart.dataURI();
            if (data && data.imgURI) {
                doc.addPage();
                doc.addImage(data.imgURI, 'PNG', 40, 40, doc.internal.pageSize.width - 80, 180);
            }
        }
        if (bpmChart && typeof bpmChart.dataURI === 'function') {
            const data2 = await bpmChart.dataURI();
            if (data2 && data2.imgURI) {
                doc.addImage(data2.imgURI, 'PNG', 40, 240, doc.internal.pageSize.width - 80, 180);
            }
        }
    } catch (e) {
        console.warn('No fue posible incrustar las gráficas en el PDF:', e);
    }

    // Tabla de umbrales críticos (adaptada al paciente si aplica)
    const afterTableY = doc.previousAutoTable ? doc.previousAutoTable.finalY + 20 : (doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 :  doc.internal.pageSize.height - 200);
    doc.setFontSize(11);
    doc.text('Tabla de Umbrales Críticos', 40, afterTableY);

    const pacienteMin = Number.isFinite(pacienteSpo2Min) && pacienteSpo2Min > 0 ? pacienteSpo2Min : 90;
    const peligroUmbral = Math.max(0, Math.round(pacienteMin - 5));
    const normalTexto = `${pacienteMin}% a 100%`;
    const precaucionTexto = `${peligroUmbral}% a ${Math.max(pacienteMin - 1, peligroUmbral)}%`;
    const peligroTexto = `< ${peligroUmbral}%`;

    doc.autoTable({
        startY: afterTableY + 8,
        head: [['Estado', 'SpO2', 'BPM', 'Significado']],
        body: [
            ['Normal', normalTexto, '60 a 100', 'Valores estables. Monitoreo silencioso.'],
            ['Precaución', precaucionTexto, '50-59 o 101-140', 'Signos inestables. Atención y monitoreo continuo.'],
            ['Peligro', peligroTexto, '<50 o >140', 'Hipoxemia severa o crisis. Activar alertas y válvula.']
        ],
        styles: { fontSize: 10 }
    });

    doc.save(`Reporte_Seroa_${paciente.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`);
}

document.addEventListener('DOMContentLoaded', iniciarRegistroDiario);
