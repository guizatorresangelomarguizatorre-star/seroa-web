var database = window.database || firebase.database();

localStorage.removeItem('seroaHistorialSpo2');
localStorage.removeItem('seroaHistorialBpm');

var historialSpo2 = [];
var historialBpm = [];
var LIMITE_PUNTOS = 15;

var temporizadorDesconexionIndex;
var chartSpo2, chartBpm;
var fechaDiagramaActual = new Date().toLocaleDateString();

function clasificarLectura(spo2, bpm) {
    const pacienteMin = Number(localStorage.getItem('selectedPatientSpo2Min'));
    const spo2Min = (Number.isFinite(pacienteMin) && pacienteMin > 0) ? pacienteMin : 90;
    if (spo2 < spo2Min || bpm < 50 || bpm > 140) {
        return { nivel: 'Peligro', color: 'danger', accion: 'Válvula activada' };
    }
    if (spo2 <= (spo2Min + 4) || (bpm >= 50 && bpm <= 59) || (bpm >= 101 && bpm <= 140)) {
        return { nivel: 'Precaución', color: 'warning', accion: 'Monitoreo continuo' };
    }
    return { nivel: 'Normal', color: 'success', accion: 'Monitoreo continuo' };
}

async function _obtenerBase64Logo(src) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => { canvas.width = img.width; canvas.height = img.height; ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL('image/png')); };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

async function generarPDFIndex() {
    const pacienteId = localStorage.getItem('selectedPatientId');
    const paciente = localStorage.getItem('selectedPatientName') || 'Sin selección';
    const usuario = localStorage.getItem('nombrePaciente') || 'Usuario anónimo';
    const rolUsuario = localStorage.getItem('selectedPatientRole') || 'Invitado';

    if (!pacienteId) { alert('Selecciona un paciente antes de generar el reporte.'); return; }

    try {
        const [resRegs, resNotas] = await Promise.all([
            fetch(`/api/registros?id_paciente=${pacienteId}`),
            fetch(`/api/notas?id_paciente=${pacienteId}`)
        ]);
        const registros = (await resRegs.json()) || [];
        const todasNotas = (await resNotas.json()) || [];

        const hoyStr = new Date().toLocaleDateString('es-MX');
        const notasHoy = todasNotas.filter(n => new Date(n.fecha_registro).toLocaleDateString('es-MX') === hoyStr);

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });

        const logoData = await _obtenerBase64Logo('img/logo-icono.png');
        if (logoData) doc.addImage(logoData, 'PNG', 40, 30, 60, 60);
        doc.setFontSize(18);
        doc.text('Reporte Médico — Monitor Seroa', 120, 48);
        doc.setFontSize(10);
        doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 120, 66);

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
            doc.text('Datos del Paciente:', 40, infoY); infoY += 14;
            if (pacienteEdad) doc.text(`Edad: ${pacienteEdad}`, 50, infoY);
            if (pacientePeso) doc.text(`Peso: ${pacientePeso} kg`, 200, infoY); infoY += 14;
            if (pacienteSexo) doc.text(`Sexo: ${pacienteSexo}`, 50, infoY);
            if (pacientePadecimiento) doc.text(`Padecimiento: ${pacientePadecimiento}`, 200, infoY); infoY += 18;
            if (Number.isFinite(pacienteSpo2Min) && Number.isFinite(pacienteSpo2Max)) {
                doc.text(`Rango SpO2 configurado: ${pacienteSpo2Min}% - ${pacienteSpo2Max}%`, 50, infoY); infoY += 18;
            }
        }

        doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text('Promediado por horas', 40, infoY + 10); doc.setFont('helvetica', 'normal');

        const rows = registros.map((r, i) => {
            const ec = Number(r.es_critico);
            const nivel = ec === 2 ? 'Peligro' : ec === 1 ? 'Precaución' : 'Normal';
            const accion = ec === 2 ? 'Válvula de oxígeno activada' : 'Monitoreo continuo';
            return [(i + 1).toString(), new Date(r.fecha_hora).toLocaleString('es-MX'), `${r.saturacion_oxigeno}%`, `${r.ritmo_cardiaco} bpm`, nivel, accion, usuario];
        });

        doc.autoTable({
            startY: infoY + 25,
            head: [['#', 'Fecha y Hora', 'SpO2', 'BPM', 'Nivel', 'Acción', 'Usuario']],
            body: rows,
            styles: { fontSize: 9 },
            didParseCell: (data) => {
                if (data.row.raw[4] === 'Peligro') data.cell.styles.fillColor = [255, 204, 204];
                else if (data.row.raw[4] === 'Precaución') data.cell.styles.fillColor = [255, 243, 205];
            }
        });

        let currentY = doc.lastAutoTable.finalY + 25;

        doc.setFontSize(11); doc.text('Notas del Cuidador (Día de hoy):', 40, currentY);
        if (notasHoy.length > 0) {
            doc.autoTable({
                startY: currentY + 10,
                head: [['Hora', 'Observación']],
                body: notasHoy.map(n => [new Date(n.fecha_registro).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }), n.cuerpo_nota]),
                styles: { fontSize: 9 }, columnStyles: { 0: { cellWidth: 50 } }
            });
            currentY = doc.lastAutoTable.finalY + 25;
        } else {
            currentY += 20; doc.setFontSize(9); doc.text('No se registraron notas clínicas el día de hoy.', 40, currentY); currentY += 25;
        }

        try {
            if (chartSpo2 && typeof chartSpo2.dataURI === 'function') {
                const d = await chartSpo2.dataURI();
                if (d && d.imgURI) { doc.addPage(); doc.addImage(d.imgURI, 'PNG', 40, 40, doc.internal.pageSize.width - 80, 180); currentY = 240; }
            }
            if (chartBpm && typeof chartBpm.dataURI === 'function') {
                const d2 = await chartBpm.dataURI();
                if (d2 && d2.imgURI) {
                    if (currentY > doc.internal.pageSize.height - 200) { doc.addPage(); currentY = 40; }
                    doc.addImage(d2.imgURI, 'PNG', 40, currentY, doc.internal.pageSize.width - 80, 180); currentY += 200;
                }
            }
        } catch (e) { console.warn('No se pudieron incrustar gráficas:', e); }

        if (currentY > doc.internal.pageSize.height - 150) { doc.addPage(); currentY = 40; }
        doc.setFontSize(11); doc.text('Tabla de Umbrales Críticos', 40, currentY);

        const pMin = Number.isFinite(pacienteSpo2Min) && pacienteSpo2Min > 0 ? pacienteSpo2Min : 90;
        doc.autoTable({
            startY: currentY + 10,
            head: [['Estado', 'SpO2', 'BPM', 'Significado']],
            body: [
                ['Normal', `${pMin + 5}% a 100%`, '60 a 100', 'Valores estables. Monitoreo silencioso.'],
                ['Precaución', `${pMin}% a ${pMin + 4}%`, '50-59 o 101-140', 'Signos inestables. Atención y monitoreo continuo.'],
                ['Peligro', `< ${pMin}%`, '<50 o >140', 'Hipoxemia severa o crisis. Activar alertas y válvula.']
            ],
            styles: { fontSize: 10 }
        });

        doc.save(`Reporte_Seroa_${paciente.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
        console.error('Error generando PDF desde inicio:', e);
        alert('Hubo un error al generar el reporte. Intenta nuevamente.');
    }
}

async function guardarRegistroBiometrico(registro) {
    try {
        await fetch('/api/registros', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registro)
        });
    } catch (error) {
        console.error('Error guardando registro:', error);
    }
}

var commonOptions = {
    chart: { type: 'area', height: 250, toolbar: { show: false }, animations: { enabled: true } },
    noData: {
        text: 'Esperando datos del dispositivo Seroa...',
        align: 'center',
        verticalAlign: 'middle',
        style: { color: '#3b8b88', fontSize: '16px', fontFamily: 'Arial, sans-serif' }
    },
    stroke: { curve: 'smooth', width: 3 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#e0e0e0', strokeDashArray: 4 },
    xaxis: { type: 'datetime', labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } }
};

document.addEventListener('DOMContentLoaded', () => {
    // Corrección 1: Conectar botón de reporte
    const btnPDF = document.getElementById('btnDescargarPDF');
    if (btnPDF) btnPDF.addEventListener('click', generarPDFIndex);

    // Corrección 3: Rangos dinámicos según paciente seleccionado
    const spo2Min = Number(localStorage.getItem('selectedPatientSpo2Min'));
    const spo2Max = Number(localStorage.getItem('selectedPatientSpo2Max'));
    const labelSpo2 = document.getElementById('rangoSpo2Label');
    const labelBpm = document.getElementById('rangoBpmLabel');
    if (labelSpo2) {
        if (Number.isFinite(spo2Min) && spo2Min > 0 && Number.isFinite(spo2Max) && spo2Max > 0) {
            labelSpo2.textContent = `Rango configurado: ${spo2Min}%–${spo2Max}%`;
        } else {
            labelSpo2.textContent = 'Sin paciente seleccionado';
        }
    }
    if (labelBpm) labelBpm.textContent = 'Normal: 60–100 BPM';

    try {
        if (document.querySelector("#spo2Chart")) {
            chartSpo2 = new ApexCharts(document.querySelector("#spo2Chart"), {
                ...commonOptions,
                colors: ['#66bb6a'],
                series: [],
                yaxis: { min: 80, max: 100 }
            });
            chartSpo2.render();
        }

        if (document.querySelector("#bpmChart")) {
            chartBpm = new ApexCharts(document.querySelector("#bpmChart"), {
                ...commonOptions,
                colors: ['#3b8b88'],
                series: [],
                yaxis: { min: 40, max: 150 }
            });
            chartBpm.render();
        }
    } catch (e) {
        console.error("Crasheo evitado en las gráficas:", e);
    }
});

function aplicarEstadoDesconectado() {
    var luzConexion = document.getElementById('luz-conexion');
    var textoConexion = document.getElementById('texto-conexion');
    var cartelEstado = document.getElementById('estadoSensorOverlay');

    if (luzConexion && textoConexion) {
        luzConexion.style.backgroundColor = '#dc3545';
        luzConexion.style.boxShadow = '0 0 8px #dc3545';
        textoConexion.innerText = 'Dispositivo Seroa: Desconectado';
    }

    if (cartelEstado) cartelEstado.style.display = 'none';

    ['spo2Valor', 'bpmValor', 'presionValor', 'valvulaValor'].forEach(id => {
        var el = document.getElementById(id);
        if (el) el.innerText = '--';
    });
}

function marcarEnLinea() {
    var luzConexion = document.getElementById('luz-conexion');
    var textoConexion = document.getElementById('texto-conexion');

    if (luzConexion && textoConexion) {
        luzConexion.style.backgroundColor = '#28a745';
        luzConexion.style.boxShadow = '0 0 8px #28a745';
        textoConexion.innerText = 'Dispositivo Seroa: En Línea';
    }
}

function mostrarDatosValidos(spo2, bpm, presionBar, valvulaActiva, datos) {
    var cartelEstado = document.getElementById('estadoSensorOverlay');
    var valorSpo2 = document.getElementById('spo2Valor');
    var valorBpm = document.getElementById('bpmValor');

    if (cartelEstado) cartelEstado.style.display = 'none';
    if (valorSpo2) valorSpo2.innerText = spo2;
    if (valorBpm) valorBpm.innerText = bpm;

    var ahora = new Date().getTime();
    var hoyLocal = new Date().toLocaleDateString();
    if (fechaDiagramaActual !== hoyLocal) {
        fechaDiagramaActual = hoyLocal;
        historialSpo2 = [];
        historialBpm = [];
        if (chartSpo2) chartSpo2.updateSeries([{ name: 'SpO2', data: [] }]);
        if (chartBpm) chartBpm.updateSeries([{ name: 'BPM', data: [] }]);
    }

    historialSpo2.push({ x: ahora, y: spo2 });
    historialBpm.push({ x: ahora, y: bpm });

    if (historialSpo2.length > LIMITE_PUNTOS) {
        historialSpo2.shift();
        historialBpm.shift();
    }

    if (chartSpo2) chartSpo2.updateSeries([{ name: "SpO2", data: historialSpo2 }]);
    if (chartBpm) chartBpm.updateSeries([{ name: "BPM", data: historialBpm }]);

    var pacienteId = localStorage.getItem('selectedPatientId');

    if (pacienteId) {
        var idRegistro = window.generarIdRegistro ? window.generarIdRegistro() : Date.now().toString();
        var lectura = clasificarLectura(spo2, bpm);

        var registro = {
            id_paciente: parseInt(pacienteId, 10),
            id_dispositivo: datos.dispositivoId || null,
            saturacion_oxigeno: spo2,
            ritmo_cardiaco: bpm,
            es_critico: lectura.color === 'danger' ? 2 : lectura.color === 'warning' ? 1 : 0,
            fecha_hora: new Date().toISOString(),
            nivel_alerta: lectura.nivel,
            accion_sistema: lectura.accion,
            usuario_turno: localStorage.getItem('nombrePaciente') || 'Sesión anónima',
            paciente: localStorage.getItem('selectedPatientName') || 'Sin selección',
            presion_bar: presionBar,
            valvula_estado: valvulaActiva ? 'Abierta' : 'Cerrada',
            id_registro: idRegistro
        };

        database.ref(`registros_biomedicos/${pacienteId}/${idRegistro}`)
            .set(registro)
            .catch(error => console.error('Error guardando en Firebase:', error));

        guardarRegistroBiometrico(registro);
    }

    var alerta = document.getElementById('alertaGlobalSeroa');
    if (spo2 < 90 && alerta) alerta.classList.remove('d-none');
}

aplicarEstadoDesconectado();

setInterval(function() {
    var hoy = new Date().toLocaleDateString();
    if (fechaDiagramaActual !== hoy) {
        fechaDiagramaActual = hoy;
        historialSpo2 = [];
        historialBpm = [];
        if (chartSpo2) chartSpo2.updateSeries([{ name: 'SpO2', data: [] }]);
        if (chartBpm) chartBpm.updateSeries([{ name: 'BPM', data: [] }]);
    }
}, 60000);

if (window.SeroaRealtime) {
    window.SeroaRealtime.subscribe((datos) => {
        console.log("INDEX RECIBIÓ:", datos);

        var cartelEstado = document.getElementById('estadoSensorOverlay');
        var textoEstado = document.getElementById('textoEstadoSensor');
        var valorSpo2 = document.getElementById('spo2Valor');
        var valorBpm = document.getElementById('bpmValor');
        var valorPresion = document.getElementById('presionValor');
        var valorValvula = document.getElementById('valvulaValor');

        clearTimeout(temporizadorDesconexionIndex);

        if (!datos) {
            aplicarEstadoDesconectado();
            return;
        }

        marcarEnLinea();

        var estadoSensor = datos.estado || 'SIN_DATOS';
        var actualSpo2 = Number(datos.spo2);
        var actualBpm = Number(datos.bpm);
        var presionBar = Number(datos.presionBar || 0);
        var valvulaActiva = datos.valvulaActiva === true || datos.valvula_estado === 'Abierta';

        if (valorPresion) {
            valorPresion.innerText = presionBar.toFixed(2) + " PSI";
        }

        if (valorValvula) {
            valorValvula.innerText = valvulaActiva ? 'Abierta' : 'Cerrada';
            valorValvula.className = valvulaActiva
                ? 'display-6 fw-bold text-success'
                : 'display-6 fw-bold text-secondary';
        }

        var valoresValidos =
            Number.isFinite(actualSpo2) &&
            Number.isFinite(actualBpm) &&
            actualSpo2 > 0 &&
            actualBpm > 0;

        if (estadoSensor === "SIN_DEDO") {
            if (cartelEstado) cartelEstado.style.display = 'block';
            if (textoEstado) textoEstado.innerText = "Por favor coloca tu dedo en el sensor.";
            if (valorSpo2) valorSpo2.innerText = "--";
            if (valorBpm) valorBpm.innerText = "--";
        } else if (estadoSensor === "CALIBRANDO") {
            if (cartelEstado) cartelEstado.style.display = 'block';
            if (textoEstado) textoEstado.innerText = "Calibrando señal... Mantén el dedo inmóvil unos segundos.";
            if (valorSpo2) valorSpo2.innerText = "--";
            if (valorBpm) valorBpm.innerText = "--";
        } else if (estadoSensor === "ACTIVO" && valoresValidos) {
            mostrarDatosValidos(actualSpo2, actualBpm, presionBar, valvulaActiva, datos);
        }

        temporizadorDesconexionIndex = setTimeout(aplicarEstadoDesconectado, 10000);
    });
} else {
    console.error("El motor SeroaRealtime no cargó correctamente.");
}
