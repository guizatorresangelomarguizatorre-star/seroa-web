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
        <div class="card border-0 shadow-sm mb-3 border-start border-4 border-success">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <small class="text-muted fw-bold"><i class="bi bi-clock-history me-1"></i>${formatoFecha(nota.fecha_registro)}</small>
                    </div>
                </div>
                <p class="mb-0 text-dark">${nota.cuerpo_nota}</p>
            </div>
        </div>
    `).join('');
}

// ===============================================
// === LÓGICA DE RENDERS E HISTORIAL BIOMÉDRICO ===
// ===============================================

function renderRegistrosFirebase(registros) {
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
        const nivel = registro.nivel_alerta || registro.nivel || (registro.es_critico === 2 ? 'Peligro' : (registro.es_critico === 1 ? 'Precaución' : 'Normal'));
        const clasificacion = nivel === 'Peligro' ? { color: 'danger', nivel } : nivel === 'Precaución' ? { color: 'warning', nivel } : { color: 'success', nivel };
        const accion = registro.accion_sistema || registro.accion || (nivel === 'Peligro' ? 'Válvula de emergencia activada' : 'Monitoreo continuo');
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
        if (tipo && tipo !== 'todos' && nivel !== tipo) return false;
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
        await fetch('/api/registros', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registro)
        });
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
            const dateObj = new Date(f.fecha_guardada + 'T12:00:00'); 
            const fechaTexto = dateObj.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            return `
            <div class="col-md-4">
                <div class="card border-0 shadow-sm rounded-4 h-100 border-start border-4 border-secondary">
                    <div class="card-body d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-0 fw-bold text-secondary text-capitalize small">${fechaTexto}</h6>
                            <small class="text-muted"><i class="bi bi-file-earmark-pdf me-1"></i>Reporte Diario</small>
                        </div>
                        <button class="btn btn-outline-secondary btn-sm rounded-circle shadow-sm" onclick="descargarPDFHistorico('${f.fecha_guardada}', '${fechaTexto}')" title="Descargar PDF">
                            <i class="bi bi-download"></i>
                        </button>
                    </div>
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
    
    try {
        const res = await fetch(`/api/reporte-dia?id_paciente=${idPaciente}&fecha=${fechaISO}`);
        const dataDia = await res.json();

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });

        // Header
        doc.setFontSize(18);
        doc.text(`Reporte Médico Histórico — Seroa`, 40, 48);
        doc.setFontSize(10);
        doc.text(`Fecha del registro: ${fechaTexto}`, 40, 66);
        doc.text(`Generado el: ${new Date().toLocaleString('es-MX')}`, 40, 80);

        doc.setFontSize(12);
        doc.text(`Paciente: ${pacienteNombre}`, 40, 110);

        let currentY = 130;

        // Tabla de Registros del día solicitado
        doc.setFontSize(11);
        doc.text('Lecturas Biométricas del Día:', 40, currentY);
        
        const rowsRegistros = dataDia.registros.map(r => [
            (new Date(r.fecha_hora)).toLocaleTimeString('es-MX'), 
            `${r.saturacion_oxigeno}%`, 
            `${r.ritmo_cardiaco} bpm`, 
            r.es_critico === 2 ? 'Peligro' : (r.es_critico === 1 ? 'Precaución' : 'Normal')
        ]);

        if (rowsRegistros.length > 0) {
            doc.autoTable({
                startY: currentY + 10,
                head: [['Hora', 'SpO2', 'BPM', 'Estado']],
                body: rowsRegistros,
                styles: { fontSize: 9 }
            });
            currentY = doc.lastAutoTable.finalY + 25;
        } else {
            currentY += 20;
            doc.setFontSize(9);
            doc.text('No hubo lecturas biométricas este día.', 40, currentY);
            currentY += 25;
        }

        // Tabla de Notas de ese día
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
        } else {
            currentY += 20;
            doc.setFontSize(9);
            doc.text('No se escribieron notas clínicas este día.', 40, currentY);
        }

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

    suscribirRegistrosRTDB(pacienteId);
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
    const rows = (source || []).slice(0, 500).map((r, index) => [
        (index + 1).toString(), 
        (new Date(r.fecha_hora)).toLocaleString('es-MX'), 
        `${r.saturacion_oxigeno}%`, 
        `${r.ritmo_cardiaco} bpm`, 
        r.nivel_alerta || r.nivel || '-', 
        r.accion_sistema || r.accion || '-', 
        r.usuario_turno || '-'
    ]);
    
    // Agregar título de la tabla
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Promediado por horas', 40, infoY + 10);
    doc.setFont('helvetica', 'normal');
    
    doc.autoTable({
        startY: infoY + 25,
        head: [['#', 'Fecha y Hora', 'SpO2', 'BPM', 'Nivel', 'Acción', 'Usuario']],
        body: rows,
        styles: { fontSize: 9 }
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
    const peligroUmbral = Math.max(0, Math.round(pacienteMin - 5));
    const normalTexto = `${pacienteMin}% a 100%`;
    const precaucionTexto = `${peligroUmbral}% a ${Math.max(pacienteMin - 1, peligroUmbral)}%`;
    const peligroTexto = `< ${peligroUmbral}%`;

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