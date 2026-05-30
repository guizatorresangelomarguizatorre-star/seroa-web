var database = window.database || firebase.database();

localStorage.removeItem('seroaHistorialSpo2');
localStorage.removeItem('seroaHistorialBpm');

var historialSpo2 = [];
var historialBpm = [];
var LIMITE_PUNTOS = 15;

var temporizadorDesconexionIndex;
var chartSpo2, chartBpm;

function clasificarLectura(spo2, bpm) {
    if (spo2 < 85 || bpm < 50 || bpm > 140) {
        return { nivel: 'Peligro', color: 'danger', accion: 'Válvula activada' };
    }
    if ((spo2 >= 85 && spo2 <= 89) || (bpm >= 50 && bpm <= 59) || (bpm >= 101 && bpm <= 140)) {
        return { nivel: 'Precaución', color: 'warning', accion: 'Monitoreo continuo' };
    }
    return { nivel: 'Normal', color: 'success', accion: 'Monitoreo continuo' };
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
            es_critico: lectura.color === 'danger' ? 1 : 0,
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
        } else if (estadoSensor === "CALIBRANDO" && !valoresValidos) {
            if (cartelEstado) cartelEstado.style.display = 'block';
            if (textoEstado) textoEstado.innerText = "Calibrando señal... Mantén el dedo inmóvil unos segundos.";
            if (valorSpo2) valorSpo2.innerText = "--";
            if (valorBpm) valorBpm.innerText = "--";
        } else if (estadoSensor === "ACTIVO" || valoresValidos) {
            mostrarDatosValidos(actualSpo2, actualBpm, presionBar, valvulaActiva, datos);
        }

        temporizadorDesconexionIndex = setTimeout(aplicarEstadoDesconectado, 15000);
    });
} else {
    console.error("El motor SeroaRealtime no cargó correctamente.");
}
