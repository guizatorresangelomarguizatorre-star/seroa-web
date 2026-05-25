// 1. CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyD8GcNrjousLrlNSKXcNrjl0gjAYuXvTMQ",
    authDomain: "seroa-e8606.firebaseapp.com",
    databaseURL: "https://seroa-e8606-default-rtdb.firebaseio.com",
    projectId: "seroa-e8606",
    storageBucket: "seroa-e8606.firebasestorage.app",
    messagingSenderId: "985506819702",
    appId: "1:985506819702:web:407215da36321f9084b957"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 2. RECUPERAR LA MEMORIA
let historialSpo2 = JSON.parse(localStorage.getItem('seroaHistorialSpo2')) || [];
let historialBpm = JSON.parse(localStorage.getItem('seroaHistorialBpm')) || [];
let categoriasTiempo = JSON.parse(localStorage.getItem('seroaCategoriasTiempo')) || [];

const LIMITE_PUNTOS = 15;

// === VARIABLE PARA EL TEMPORIZADOR ===
let temporizadorDesconexion;

// 3. CONFIGURACIÓN DE LAS GRÁFICAS
const commonOptions = {
    chart: { type: 'area', height: 250, toolbar: { show: false }, foreColor: '#555', animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 500 } } },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#e0e0e0', strokeDashArray: 4 }, 
    xaxis: { 
        type: 'datetime',
        labels: { show: false }, 
        axisBorder: { show: false },
        axisTicks: { show: false }
    },
    tooltip: {
        x: {
            formatter: function(val) {
                if (!val) return "";
                const fecha = new Date(val);
                const horas = fecha.getHours().toString().padStart(2, '0');
                const minutos = fecha.getMinutes().toString().padStart(2, '0');
                const segundos = fecha.getSeconds().toString().padStart(2, '0');
                return `${horas}:${minutos}:${segundos}`;
            }
        }
    }
};

let chartSpo2, chartBpm;

if(document.querySelector("#spo2Chart")) {
    const spo2Options = { ...commonOptions, colors: ['#66bb6a'], stroke: { curve: 'smooth', width: 3 }, series: [{ name: "SpO2", data: historialSpo2 }], yaxis: { min: 80, max: 100 } };
    chartSpo2 = new ApexCharts(document.querySelector("#spo2Chart"), spo2Options);
    chartSpo2.render();
}

if(document.querySelector("#bpmChart")) {
    const bpmOptions = { ...commonOptions, colors: ['#3b8b88'], stroke: { curve: 'smooth', width: 3 }, series: [{ name: "BPM", data: historialBpm }], yaxis: { min: 40, max: 150 } };
    chartBpm = new ApexCharts(document.querySelector("#bpmChart"), bpmOptions);
    chartBpm.render();
}

if (historialSpo2.length > 0 && typeof historialSpo2[0] !== 'object') {
    historialSpo2 = [];
    historialBpm = [];
    localStorage.removeItem('seroaHistorialSpo2');
    localStorage.removeItem('seroaHistorialBpm');
}

// 4. EL MOTOR DE TIEMPO REAL CON INDICADOR LED
database.ref('Seroa/Actual').on('value', (snapshot) => {
    const datos = snapshot.val();
    
    const cartelEstado = document.getElementById('estadoSensorOverlay'); 
    const textoEstado = document.getElementById('textoEstadoSensor'); 
    const valorSpo2 = document.getElementById('spo2Valor');
    const valorBpm = document.getElementById('bpmValor');
    
    // Referencias al nuevo indicador LED
    const luzConexion = document.getElementById('luz-conexion');
    const textoConexion = document.getElementById('texto-conexion');

    // === SEÑAL RECIBIDA: Encendemos la luz verde ===
    clearTimeout(temporizadorDesconexion); 
    
    if (luzConexion && textoConexion) {
        luzConexion.style.backgroundColor = '#28a745'; // Verde
        luzConexion.style.boxShadow = '0 0 8px #28a745';
        textoConexion.innerText = 'Dispositivo Seroa: En Línea';
    }

    if (datos) {
        const estadoSensor = datos.estado; 

        if (estadoSensor === "SIN_DEDO") {
            if (cartelEstado) cartelEstado.style.display = 'block';
            if (textoEstado) textoEstado.innerText = "Por favor coloca tu dedo, el sensor tardará unos segundos en realizar la calibración, en un instante te brindaremos tus datos.";
            
            if (valorSpo2) valorSpo2.innerText = "--";
            if (valorBpm) valorBpm.innerText = "--";
            
        } else if (estadoSensor === "CALIBRANDO") {
            if (cartelEstado) cartelEstado.style.display = 'block';
            if (textoEstado) textoEstado.innerText = "Calibrando señal... Mantén el dedo inmóvil unos segundos.";
            
            if (valorSpo2 && (valorSpo2.innerText === "--" || valorSpo2.innerText === "")) {
                valorSpo2.innerText = "--";
                if (valorBpm) valorBpm.innerText = "--";
            }
            
        } else if (estadoSensor === "ACTIVO") {
            if (cartelEstado) cartelEstado.style.display = 'none';

            const actualSpo2 = datos.spo2;
            const actualBpm = datos.bpm;

            if (valorSpo2) valorSpo2.innerText = actualSpo2;
            if (valorBpm) valorBpm.innerText = actualBpm;

            const ahora = new Date().getTime(); 

            historialSpo2.push({ x: ahora, y: actualSpo2 });
            historialBpm.push({ x: ahora, y: actualBpm });

            if (historialSpo2.length > LIMITE_PUNTOS) {
                historialSpo2.shift();
                historialBpm.shift();
            }

            localStorage.setItem('seroaHistorialSpo2', JSON.stringify(historialSpo2));
            localStorage.setItem('seroaHistorialBpm', JSON.stringify(historialBpm));

            if(chartSpo2) chartSpo2.updateSeries([{ data: historialSpo2 }]);
            if(chartBpm) chartBpm.updateSeries([{ data: historialBpm }]);
            
            const alerta = document.getElementById('alertaGlobalSeroa');
            if (actualSpo2 < 90 && alerta) alerta.classList.remove('d-none');
        }
    }

    // === SE PERDIÓ LA SEÑAL: Encendemos la luz roja ===
    // Si pasan 10 segundos sin recibir datos, el ESP32 se desconectó
    temporizadorDesconexion = setTimeout(() => {
        
        // Cambiamos el LED a Rojo
        if (luzConexion && textoConexion) {
            luzConexion.style.backgroundColor = '#dc3545'; // Rojo
            luzConexion.style.boxShadow = '0 0 8px #dc3545';
            textoConexion.innerText = 'Dispositivo Seroa: Desconectado';
        }

        if (cartelEstado) cartelEstado.style.display = 'none';
        
        if (valorSpo2) valorSpo2.innerText = "--";
        if (valorBpm) valorBpm.innerText = "--";
        
    }, 10000); 

});