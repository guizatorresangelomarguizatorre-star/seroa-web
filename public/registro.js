// Registro diario de lecturas y estructura de datos biométricos
const database = window.database || firebase.database();

let latestRegistros = [];
let latestRegistrosFiltered = [];

function clasificarLectura(spo2, bpm) {
    const spo2Num = Number(spo2);
    const bpmNum = Number(bpm);
    const pacienteMinStored = Number(localStorage.getItem('selectedPatientSpo2Min'));
    const spo2Min = (Number.isFinite(pacienteMinStored) && pacienteMinStored > 0) ? pacienteMinStored : 90;

    // Peligro: por debajo del mínimo absoluto del paciente
    // Precaución: zona de alerta [min, min+4]
    // Normal: spo2 >= min+5
    const rojo = (spo2Num < spo2Min) || bpmNum < 50 || bpmNum > 140;
    const naranja = (!rojo && (spo2Num <= (spo2Min + 4) || (bpmNum >= 50 && bpmNum <= 59) || (bpmNum >= 101 && bpmNum <= 140)));

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

// ==========================================
// === CONEXIÓN A MYSQL PARA NOTAS CLÍNICAS ===
// ==========================================

async function cargarNotasBackend(idPaciente) {
    if (!idPaciente) return;
    try {
        const respuesta = await fetch(`/api/notas?id_paciente=${idPaciente}`);
        const notas = await respuesta.json();
        renderNotas(notas);
    } catch (error) {
        console.error("Error al cargar notas desde MySQL:", error);
        document.getElementById('listaNotasDiarias').innerHTML = `<div class="text-danger text-center py-3">Error al conectar con la base de datos.</div>`;
    }
}

async function guardarNotaBackend(idPaciente, textoNota) {
    try {
        const respuesta = await fetch('/api/notas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id_paciente: Number(idPaciente), 
                cuerpo_nota: textoNota 
            })
        });
        
        if (!respuesta.ok) throw new Error("Error en el servidor");
        return await respuesta.json();
    } catch (error) {
        console.error("Error guardando nota:", error);
        throw error;
    }
}

function renderNotas(notas) {
    const listaNotas = document.getElementById('listaNotasDiarias');
    if (!listaNotas) return;

    if (!notas || notas.length === 0) {
        listaNotas.innerHTML = `<div class="text-center text-muted py-5">Aún no hay notas guardadas para este paciente.</div>`;
        return;
    }

    listaNotas.innerHTML = notas.map(nota => `
        <div class="rd-nota-item">
            <div class="rd-nota-avatar"><i class="bi bi-person-fill"></i></div>
            <div class="rd-nota-content">
                <div class="rd-nota-time"><i class="bi bi-clock-history me-1"></i>${formatoFecha(nota.fecha_registro)}</div>
                <div class="rd-nota-text">${nota.cuerpo_nota}</div>
            </div>
        </div>
    `).join('');
}

// ===============================================
// === LÓGICA DE RENDERS E HISTORIAL BIOMÉDRICO ===
// ===============================================

function renderRegistrosMySQL(registros) {
    const tablaRegistros = document.getElementById('tablaRegistros');
    if (!tablaRegistros) return;
    const regs = registros || [];
    if (!regs.length) {
        tablaRegistros.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No hay registros biométricos disponibles para este paciente.</td></tr>`;
        return;
    }

    const filtered = applyCurrentFilters(regs);
    latestRegistrosFiltered = filtered;

    tablaRegistros.innerHTML = filtered.map(registro => {
        const esCritico = Number(registro.es_critico);
        const nivel = esCritico === 2 ? 'Peligro' : (esCritico === 1 ? 'Precaución' : 'Normal');
        const badgeClass = esCritico === 2 ? 'badge bg-danger' : esCritico === 1 ? 'badge bg-warning text-dark' : 'badge bg-success';
        const accion = esCritico === 2 ? 'Válvula de oxígeno activada' : 'Monitoreo continuo';
        const tipo = 'Resumen por Hora';
        let rowStyle = '';
        if (esCritico === 2) {
            rowStyle = 'style="background-color: rgba(220, 53, 69, 0.15) !important;"';
        } else if (esCritico === 1) {
            rowStyle = 'style="background-color: rgba(255, 193, 7, 0.15) !important;"';
        }

        return `
            <tr ${rowStyle}>
                <td class="ps-4 fw-semibold" style="font-size:0.82rem;white-space:nowrap;">${formatoFecha(registro.fecha_hora)}</td>
                <td class="fw-bold">${registro.saturacion_oxigeno}%</td>
                <td class="fw-bold">${registro.ritmo_cardiaco} <small class="text-muted fw-normal">bpm</small></td>
                <td><span class="${badgeClass} rounded-pill px-2">${nivel}</span></td>
                <td style="font-size:0.82rem;">${accion}</td>
                <td style="font-size:0.82rem;">${localStorage.getItem('nombrePaciente') || 'Sistema Automático'}</td>
                <td><small class="text-muted">${tipo}</small></td>
            </tr>
        `;
    }).join('');
}

async function cargarRegistrosMySQL(idPaciente) {
    if (!idPaciente) return;
    try {
        const respuesta = await fetch(`/api/registros?id_paciente=${idPaciente}`);
        const registros = await respuesta.json();
        latestRegistros = registros || [];
        renderRegistrosMySQL(latestRegistros);
        actualizarResumenDiario(latestRegistros);
    } catch (error) {
        console.error('Error cargando registros desde MySQL:', error);
    }
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
        if (tipo && tipo !== 'todos' && nivel !== tipo) return false;
        return true;
    });
}

function initRegistroFilters() {
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', (e) => {
        e.preventDefault();
        renderRegistrosMySQL(latestRegistros);
    });
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (document.getElementById('filterFechaInicio')) document.getElementById('filterFechaInicio').value = '';
        if (document.getElementById('filterFechaFin')) document.getElementById('filterFechaFin').value = '';
        if (document.getElementById('filterTipoAlerta')) document.getElementById('filterTipoAlerta').value = 'todos';
        renderRegistrosMySQL(latestRegistros);
    });
}

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

    try { await ref.set(registro); } catch (err) { console.error('Error guardando en RTDB:', err); }

    try {
        const respuesta = await fetch('/api/registros', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registro)
        });
        const resultado = await respuesta.json();
        if (resultado.estado === 'guardado' || resultado.estado === 'nuevo intervalo') {
            await cargarRegistrosMySQL(pacienteId);
        }
    } catch (err) { console.error('Error enviando registro al servidor:', err); }
}

function suscribirLecturasRT(leerGuardar = true) {
    window.SeroaRealtime.subscribe((datos) => {
        if (!datos || datos.estado !== 'ACTIVO') return;
        const spo2 = Number(datos.spo2);
        const bpm = Number(datos.bpm);
        if (!Number.isFinite(spo2) || !Number.isFinite(bpm) || spo2 <= 0 || bpm <= 0) return;

        const clas = clasificarLectura(spo2, bpm);
        const lectura = { spo2, bpm, nivel: clas.nivel, accion: clas.accion };
        
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

// ==========================================
// === CONTROLADOR DE HISTORIAL DE REPORTES ===
// ==========================================

async function cargarHistorialFechas(idPaciente) {
    if (!idPaciente) return;
    try {
        const res = await fetch(`/api/historial-fechas?id_paciente=${idPaciente}`);
        const fechas = await res.json();
        const container = document.getElementById('listaHistorialReportes');
        
        if (!container) return;
        if (fechas.length === 0) {
            container.innerHTML = '<div class="col-12"><p class="text-muted text-center py-3">No hay reportes de días anteriores guardados en el último mes.</p></div>';
            return;
        }

        container.innerHTML = fechas.map(f => {
            const isoDate = String(f.fecha_guardada).substring(0, 10);
            const dateObj = new Date(isoDate + 'T12:00:00');
            const fechaTexto = dateObj.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            return `
            <div class="col-sm-6 col-md-4">
                <div class="rd-hist-card">
                    <div class="rd-hist-icon"><i class="bi bi-file-earmark-pdf-fill"></i></div>
                    <div class="flex-fill min-width-0">
                        <div class="fw-bold text-capitalize" style="font-size:0.82rem; color:#2c3e50;">${fechaTexto}</div>
                        <div style="font-size:0.72rem; color:#aaa;">Reporte diario PDF</div>
                    </div>
                    <button class="rd-hist-btn" onclick="descargarPDFHistorico('${f.fecha_guardada}', '${fechaTexto}')">
                        <i class="bi bi-download me-1"></i>PDF
                    </button>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        console.error("Error cargando historial de fechas:", e);
    }
}

async function descargarPDFHistorico(fechaISO, fechaTexto) {
    const idPaciente = localStorage.getItem('selectedPatientId');
    const pacienteNombre = localStorage.getItem('selectedPatientName') || 'Paciente';
    const usuario = localStorage.getItem('nombrePaciente') || 'Usuario anónimo';
    const rolUsuario = localStorage.getItem('selectedPatientRole') || 'Invitado';

    try {
        const res = await fetch(`/api/reporte-dia?id_paciente=${idPaciente}&fecha=${fechaISO}`);
        const dataDia = await res.json();

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });

        const logoUrl = 'img/logo-icono.png';
        let logoData = null;
        try { logoData = await obtenerImagenBase64(logoUrl); } catch (e) { console.warn('No se pudo cargar logo para PDF', e); }

        // Header idéntico al reporte diario
        if (logoData) doc.addImage(logoData, 'PNG', 40, 30, 60, 60);
        doc.setFontSize(18);
        doc.text('Reporte Médico — Monitor Seroa', 120, 48);
        doc.setFontSize(10);
        doc.text(`Fecha del registro: ${fechaTexto}`, 120, 66);
        doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 120, 80);

        doc.setFontSize(12);
        doc.text(`Paciente: ${pacienteNombre}`, 40, 110);
        doc.text(`Usuario en turno: ${usuario} (Rol: ${rolUsuario})`, 40, 130);

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

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Promediado por horas', 40, infoY + 10);
        doc.setFont('helvetica', 'normal');

        const rows = dataDia.registros.map((r, index) => {
            const esCritico = Number(r.es_critico);
            const nivel = esCritico === 2 ? 'Peligro' : (esCritico === 1 ? 'Precaución' : 'Normal');
            const accion = esCritico === 2 ? 'Válvula de oxígeno activada' : 'Monitoreo continuo';
            return [
                (index + 1).toString(),
                (new Date(r.fecha_hora)).toLocaleString('es-MX'),
                `${r.saturacion_oxigeno}%`,
                `${r.ritmo_cardiaco} bpm`,
                nivel,
                accion,
                usuario
            ];
        });

        if (rows.length > 0) {
            doc.autoTable({
                startY: infoY + 25,
                head: [['#', 'Fecha y Hora', 'SpO2', 'BPM', 'Nivel', 'Acción', 'Usuario']],
                body: rows,
                styles: { fontSize: 9 },
                didParseCell: function(data) {
                    if (data.row.raw[4] === 'Peligro') {
                        data.cell.styles.fillColor = [255, 204, 204];
                    } else if (data.row.raw[4] === 'Precaución') {
                        data.cell.styles.fillColor = [255, 243, 205];
                    }
                }
            });
        } else {
            infoY += 35;
            doc.setFontSize(9);
            doc.text('No hubo lecturas biométricas este día.', 40, infoY);
        }

        let currentY = (rows.length > 0 ? doc.lastAutoTable.finalY : infoY) + 25;

        doc.setFontSize(11);
        doc.text('Notas del Cuidador:', 40, currentY);

        if (dataDia.notas.length > 0) {
            const rowsNotas = dataDia.notas.map(n => [
                (new Date(n.fecha_registro)).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                n.cuerpo_nota
            ]);
            doc.autoTable({
                startY: currentY + 10,
                head: [['Hora', 'Observación']],
                body: rowsNotas,
                styles: { fontSize: 9 },
                columnStyles: { 0: { cellWidth: 50 } }
            });
            currentY = doc.lastAutoTable.finalY + 25;
        } else {
            currentY += 20;
            doc.setFontSize(9);
            doc.text('No se escribieron notas clínicas este día.', 40, currentY);
            currentY += 25;
        }

        if (currentY > doc.internal.pageSize.height - 150) {
            doc.addPage();
            currentY = 40;
        }

        doc.setFontSize(11);
        doc.text('Tabla de Umbrales Críticos', 40, currentY);

        const pacienteMin = Number.isFinite(pacienteSpo2Min) && pacienteSpo2Min > 0 ? pacienteSpo2Min : 90;
        const normalTexto = `${pacienteMin + 5}% a 100%`;
        const precaucionTexto = `${pacienteMin}% a ${pacienteMin + 4}%`;
        const peligroTexto = `< ${pacienteMin}%`;

        doc.autoTable({
            startY: currentY + 10,
            head: [['Estado', 'SpO2', 'BPM', 'Significado']],
            body: [
                ['Normal', normalTexto, '60 a 100', 'Valores estables. Monitoreo silencioso.'],
                ['Precaución', precaucionTexto, '50-59 o 101-140', 'Signos inestables. Atención y monitoreo continuo.'],
                ['Peligro', peligroTexto, '<50 o >140', 'Hipoxemia severa o crisis. Activar alertas y válvula.']
            ],
            styles: { fontSize: 10 }
        });

        doc.save(`Reporte_Seroa_${pacienteNombre.replace(/\s+/g,'_')}_${fechaISO}.pdf`);

    } catch (e) {
        console.error("Error al generar PDF histórico:", e);
        alert("Hubo un error al intentar descargar el reporte histórico.");
    }
}

// ==========================================
// === INICIALIZADOR DE LA PÁGINA RESTRY ====
// ==========================================

async function iniciarRegistroDiario() {
    const userId = localStorage.getItem('userId');
    const pacienteId = localStorage.getItem('selectedPatientId');
    const pacienteNombre = localStorage.getItem('selectedPatientName') || 'Sin selección';
    
    const inputOculto = document.getElementById('inputIdPaciente');
    if(inputOculto) inputOculto.value = pacienteId;

    const pacienteBadge = document.getElementById('pacienteActualLabel') || document.querySelector('[data-paciente-actual]');
    const titulo = document.getElementById('registroPacienteNombre');
    const btnDescargar = document.getElementById('btnDescargarPDF');
    const formNotas = document.getElementById('formNotas');

    if (pacienteBadge) {
        const strong = pacienteBadge.querySelector ? pacienteBadge.querySelector('strong') : null;
        if (strong) strong.textContent = pacienteNombre;
        else pacienteBadge.innerHTML = `<i class="bi bi-person-fill text-teal me-1"></i> Paciente: <strong>${pacienteNombre}</strong>`;
    }
    if (titulo) titulo.textContent = pacienteNombre;

    if (btnDescargar) {
        btnDescargar.addEventListener('click', generarPDF);
    }

    if (formNotas) {
        formNotas.addEventListener('submit', async (event) => {
            event.preventDefault();
            
            const textoInput = document.getElementById('notaTexto').value.trim();
            const horaInput = document.getElementById('notaHora').value;
            const idActual = document.getElementById('inputIdPaciente').value;

            if (!textoInput || !idActual) return;

            const notaFinal = `[Hora indicada: ${horaInput}] ${textoInput}`;
            const btnSubmit = formNotas.querySelector('button[type="submit"]');
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

            try {
                await guardarNotaBackend(idActual, notaFinal);
                formNotas.reset();
                await cargarNotasBackend(idActual);
            } catch (error) {
                alert("Hubo un error al guardar la nota. Revisa tu conexión.");
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<i class="bi bi-send"></i> Guardar';
            }
        });
    }

    // Inicializaciones de Carga desde DB
    cargarNotasBackend(pacienteId);
    cargarHistorialFechas(pacienteId); // <- ¡Carga automática del historial de 30 días!

    cargarRegistrosMySQL(pacienteId);
    suscribirLecturasRT(true);
    initRegistroFilters();

    try {
        const style = document.createElement('style');
        style.innerHTML = `
            body .container h5, body .container h4, body .container h3 { color: var(--color-seroa-teal) !important; font-weight: 700 !important; }
        `;
        document.head.appendChild(style);
    } catch (e) { console.warn('No se pudo inyectar estilos de resaltado:', e); }
}

// Función auxiliar para convertir imagen a base64
async function obtenerImagenBase64(rutaImagen) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            resolve(dataUrl);
        };
        
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = rutaImagen;
    });
}

// ---------- Generar PDF de reporte médico (Hoy) ----------
async function generarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const rolUsuario = localStorage.getItem('selectedPatientRole') || 'Invitado';
    const logoUrl = 'img/logo-icono.png';
    let logoData = null;
    try { logoData = await obtenerImagenBase64(logoUrl); } catch (e) { console.warn('No se pudo cargar logo para PDF', e); }

    // Header
    if (logoData) doc.addImage(logoData, 'PNG', 40, 30, 60, 60);
    doc.setFontSize(18);
    doc.text('Reporte Médico — Monitor Seroa', 120, 48);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 120, 66);

    const pacienteId = localStorage.getItem('selectedPatientId');
    const paciente = localStorage.getItem('selectedPatientName') || 'Sin selección';
    const usuario = localStorage.getItem('nombrePaciente') || 'Usuario anónimo';
    
    doc.setFontSize(12);
    doc.text(`Paciente: ${paciente}`, 40, 110);
    doc.text(`Usuario en turno: ${usuario} (Rol: ${rolUsuario})`, 40, 130);

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

    const source = (latestRegistrosFiltered && latestRegistrosFiltered.length) ? latestRegistrosFiltered : latestRegistros;
    const rows = (source || []).slice(0, 500).map((r, index) => {
        const esCritico = Number(r.es_critico);
        const nivel = esCritico === 2 ? 'Peligro' : (esCritico === 1 ? 'Precaución' : 'Normal');
        const accion = esCritico === 2 ? 'Válvula de oxígeno activada' : 'Monitoreo continuo';
        const usuario = localStorage.getItem('nombrePaciente') || 'Sistema Automático';
        return [
            (index + 1).toString(), 
            (new Date(r.fecha_hora)).toLocaleString('es-MX'), 
            `${r.saturacion_oxigeno}%`, 
            `${r.ritmo_cardiaco} bpm`, 
            nivel, 
            accion, 
            usuario
        ];
    });
    
    // Agregar título de la tabla
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Promediado por horas', 40, infoY + 10);
    doc.setFont('helvetica', 'normal');
    
    doc.autoTable({
        startY: infoY + 25,
        head: [['#', 'Fecha y Hora', 'SpO2', 'BPM', 'Nivel', 'Acción', 'Usuario']],
        body: rows,
        styles: { fontSize: 9 },
        didParseCell: function(data) {
            if (data.row.raw[4] === 'Peligro') {
                data.cell.styles.fillColor = [255, 204, 204]; // Rojo claro
            } else if (data.row.raw[4] === 'Precaución') {
                data.cell.styles.fillColor = [255, 243, 205]; // Amarillo claro
            }
        }
    });

    let currentY = doc.lastAutoTable.finalY + 25;

    let notasHoy = [];
    if (pacienteId) {
        try {
            const resp = await fetch(`/api/notas?id_paciente=${pacienteId}`);
            const todasLasNotas = await resp.json();
            const hoyStr = new Date().toLocaleDateString('es-MX');
            notasHoy = todasLasNotas.filter(n => new Date(n.fecha_registro).toLocaleDateString('es-MX') === hoyStr);
        } catch (e) { console.warn('Error al obtener notas para el PDF:', e); }
    }

    doc.setFontSize(11);
    doc.text('Notas del Cuidador (Día de hoy):', 40, currentY);

    if (notasHoy.length > 0) {
        const rowsNotas = notasHoy.map(n => {
            const fechaDate = new Date(n.fecha_registro);
            const horaStr = fechaDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            return [horaStr, n.cuerpo_nota];
        });

        doc.autoTable({
            startY: currentY + 10,
            head: [['Hora', 'Observación']],
            body: rowsNotas,
            styles: { fontSize: 9 },
            columnStyles: { 0: { cellWidth: 50 } }
        });
        currentY = doc.lastAutoTable.finalY + 25;
    } else {
        currentY += 15;
        doc.setFontSize(9);
        doc.text('No se registraron notas clínicas en el sistema el día de hoy.', 40, currentY);
        currentY += 25;
    }

    try {
        const spo2Chart = window.spo2Chart || window.chartSpo2 || window.chartSPO2;
        const bpmChart = window.chartBpm || window.bpmChart || window.chartBPM;
        
        if (spo2Chart && typeof spo2Chart.dataURI === 'function') {
            const data = await spo2Chart.dataURI();
            if (data && data.imgURI) {
                doc.addPage();
                doc.addImage(data.imgURI, 'PNG', 40, 40, doc.internal.pageSize.width - 80, 180);
                currentY = 240;
            }
        }
        if (bpmChart && typeof bpmChart.dataURI === 'function') {
            const data2 = await bpmChart.dataURI();
            if (data2 && data2.imgURI) {
                if (currentY > doc.internal.pageSize.height - 200) { doc.addPage(); currentY = 40; }
                doc.addImage(data2.imgURI, 'PNG', 40, currentY, doc.internal.pageSize.width - 80, 180);
                currentY += 200;
            }
        }
    } catch (e) { console.warn('No fue posible incrustar las gráficas en el PDF:', e); }

    if (currentY > doc.internal.pageSize.height - 150) {
        doc.addPage();
        currentY = 40;
    }

    doc.setFontSize(11);
    doc.text('Tabla de Umbrales Críticos', 40, currentY);

    const pacienteMin = Number.isFinite(pacienteSpo2Min) && pacienteSpo2Min > 0 ? pacienteSpo2Min : 90;
    const normalTexto = `${pacienteMin + 5}% a 100%`;
    const precaucionTexto = `${pacienteMin}% a ${pacienteMin + 4}%`;
    const peligroTexto = `< ${pacienteMin}%`;

    doc.autoTable({
        startY: currentY + 10,
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