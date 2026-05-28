// 1. CONFIGURACIÓN DE FIREBASE CENTRALIZADA EN global.js
const database = window.database || firebase.database();

// 2. LA OPCIÓN NUCLEAR: Limpiar memoria corrupta SIEMPRE al inicio
localStorage.removeItem('seroaHistorialSpo2');
localStorage.removeItem('seroaHistorialBpm');
let historialSpo2 = [];
let historialBpm = [];
const LIMITE_PUNTOS = 15;

function clasificarLectura(spo2, bpm) {
    if (spo2 < 85 || bpm < 50 || bpm > 140) return { nivel: 'Peligro', color: 'danger', accion: 'Válvula activada' };
    if ((spo2 >= 85 && spo2 <= 89) || (bpm >= 50 && bpm <= 59) || (bpm >= 101 && bpm <= 140)) return { nivel: 'Precaución', color: 'warning', accion: 'Monitoreo continuo' };
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

let temporizadorDesconexion;
let chartSpo2, chartBpm;

// 3. CONFIGURACIÓN DE LAS GRÁFICAS (CON TEXTO DE ESPERA FORZADO)
const commonOptions = {
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
        if(document.querySelector("#spo2Chart")) {
            chartSpo2 = new ApexCharts(document.querySelector("#spo2Chart"), { ...commonOptions, colors: ['#66bb6a'], series: [], yaxis: { min: 80, max: 100 } });
            chartSpo2.render();
        }

        if(document.querySelector("#bpmChart")) {
            chartBpm = new ApexCharts(document.querySelector("#bpmChart"), { ...commonOptions, colors: ['#3b8b88'], series: [], yaxis: { min: 40, max: 150 } });
            chartBpm.render();
        }
    } catch (e) {
        console.error("Crasheo evitado en las gráficas:", e);
    }
});

// 4. PROTOCOLO DE DESCONEXIÓN INMEDIATA
function aplicarEstadoDesconectado() {
    const luzConexion = document.getElementById('luz-conexion');
    const textoConexion = document.getElementById('texto-conexion');
    const cartelEstado = document.getElementById('estadoSensorOverlay');

    if (luzConexion && textoConexion) {
        luzConexion.style.backgroundColor = '#dc3545'; 
        luzConexion.style.boxShadow = '0 0 8px #dc3545';
        textoConexion.innerText = 'Dispositivo Seroa: Desconectado';
    }
    
    if (cartelEstado) cartelEstado.style.display = 'none';
    
    ['spo2Valor', 'bpmValor', 'presionValor', 'valvulaValor'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = '--';
    });
}

aplicarEstadoDesconectado();

// 5. FUNCIÓN CENTRAL DE PROCESAMIENTO (Desacoplada)
const procesarDatosESP32 = (datos) => {
    const cartelEstado = document.getElementById('estadoSensorOverlay'); 
    const textoEstado = document.getElementById('textoEstadoSensor'); 
    const valorSpo2 = document.getElementById('spo2Valor');
    const valorBpm = document.getElementById('bpmValor');
    const valorPresion = document.getElementById('presionValor');
    const valorValvula = document.getElementById('valvulaValor');
    const luzConexion = document.getElementById('luz-conexion');
    const textoConexion = document.getElementById('texto-conexion');

    clearTimeout(temporizadorDesconexion); 
    
    if (luzConexion && textoConexion) {
        luzConexion.style.backgroundColor = '#28a745'; 
        luzConexion.style.boxShadow = '0 0 8px #28a745';
        textoConexion.innerText = 'Dispositivo Seroa: En Línea';
    }

    if (datos) {
        const estadoSensor = datos.estado;
        const actualSpo2 = Number(datos.spo2);
        const actualBpm = Number(datos.bpm);
        const presionBar = Number(datos.presionBar || 0);
        const valvulaActiva = datos.valvulaActiva === true || datos.valvula_estado === 'Abierta';

        if (valorPresion) valorPresion.innerText = presionBar.toFixed(2);

        if (valorValvula) {
            valorValvula.innerText = valvulaActiva ? 'Abierta' : 'Cerrada';
            valorValvula.className = valvulaActiva ? 'display-6 fw-bold text-success' : 'display-6 fw-bold text-secondary';
        }

        const valoresValidos = Number.isFinite(actualSpo2) && Number.isFinite(actualBpm) && actualSpo2 > 0 && actualBpm > 0;

        if (estadoSensor === "SIN_DEDO" || !valoresValidos) {
            if (cartelEstado) cartelEstado.style.display = 'block';
            if (textoEstado) textoEstado.innerText = "Por favor coloca tu dedo, el sensor tardará unos segundos en realizar la calibración.";
            if (valorSpo2) valorSpo2.innerText = "--";
            if (valorBpm) valorBpm.innerText = "--";
        } else if (estadoSensor === "CALIBRANDO") {
            if (cartelEstado) cartelEstado.style.display = 'block';
            if (textoEstado) textoEstado.innerText = "Calibrando señal... Mantén el dedo inmóvil unos segundos.";
            if (valorSpo2) valorSpo2.innerText = "--";
            if (valorBpm) valorBpm.innerText = "--";
        } else if (estadoSensor === "ACTIVO") {
            if (cartelEstado) cartelEstado.style.display = 'none';

            if (valorSpo2) valorSpo2.innerText = actualSpo2;
            if (valorBpm) valorBpm.innerText = actualBpm;

            const ahora = new Date().getTime();
            
            historialSpo2.push({ x: ahora, y: actualSpo2 });
            historialBpm.push({ x: ahora, y: actualBpm });

            if (historialSpo2.length > LIMITE_PUNTOS) {
                historialSpo2.shift();
                historialBpm.shift();
            }

            if(chartSpo2) chartSpo2.updateSeries([{ name: "SpO2", data: historialSpo2 }]);
            if(chartBpm) chartBpm.updateSeries([{ name: "BPM", data: historialBpm }]);

            const pacienteId = localStorage.getItem('selectedPatientId');
            
            if (pacienteId) {
                const idRegistro = window.generarIdRegistro ? window.generarIdRegistro() : Date.now().toString();
                const lectura = clasificarLectura(actualSpo2, actualBpm);
                
                const registro = {
                    id_paciente: parseInt(pacienteId, 10),
                    id_dispositivo: datos.dispositivoId || null,
                    saturacion_oxigeno: actualSpo2,
                    ritmo_cardiaco: actualBpm,
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

                const registroRef = database.ref(`registros_biomedicos/${pacienteId}/${idRegistro}`);
                registroRef.set(registro).catch(error => console.error('Error guardando en Firebase:', error));
                guardarRegistroBiometrico(registro);
            }

            const alerta = document.getElementById('alertaGlobalSeroa');
            if (actualSpo2 < 90 && alerta) alerta.classList.remove('d-none');
        }
    }

    temporizadorDesconexion = setTimeout(aplicarEstadoDesconectado, 10000); 
};

// 6. EL SUSCRIPTOR REAL
if (window.SeroaRealtime) {
    window.SeroaRealtime.subscribe(procesarDatosESP32);
}

// ========================================================
// 🧪 MODO SIMULADOR VIRTUAL (Para pruebas sin hardware físico)
// ========================================================
window.activarSimulador = function() {
    console.log("🚀 Iniciando conexión con ESP32 Fantasma...");
    let conteo = 0;
    
    // Fase 1: Simulamos que el paciente apenas pone el dedo
    procesarDatosESP32({ estado: "CALIBRANDO", spo2: 0, bpm: 0, presionBar: 2.8, valvulaActiva: false });
    
    // Fase 2: Arrancamos la telemetría real después de 3 segundos
    setTimeout(() => {
        setInterval(() => {
            conteo++;
            
            // Hacemos que de vez en cuando haya una pequeña caída de oxígeno para probar las gráficas
            const esCaida = (conteo % 10 === 0); 
            const spo2Simulado = esCaida ? Math.floor(Math.random() * (92 - 88 + 1)) + 88 : Math.floor(Math.random() * (100 - 95 + 1)) + 95; 
            const bpmSimulado = Math.floor(Math.random() * (85 - 65 + 1)) + 65;   
            const presionSimulada = (Math.random() * (3.0 - 2.8) + 2.8).toFixed(2); 
            
            procesarDatosESP32({
                estado: "ACTIVO",
                spo2: spo2Simulado,
                bpm: bpmSimulado,
                presionBar: presionSimulada,
                valvulaActiva: true,
                dispositivoId: "SIM-VIRTUAL-X1"
            });
        }, 2000); // 2 segundos, igual que el loop de tu microcontrolador
        console.log("✅ Telemetría establecida. Inyectando datos...");
    }, 3000);
};