// 1. CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyD8GcNrjousLrlNSKXcNrjl0gjAYuXvTMQ",
    authDomain: "seroa-e8606.firebaseapp.com",
    // OJO: Para la página web SÍ se necesita poner https:// (es distinto al código del ESP32)
    databaseURL: "https://seroa-e8606-default-rtdb.firebaseio.com",
    projectId: "seroa-e8606",
    storageBucket: "seroa-e8606.firebasestorage.app",
    messagingSenderId: "985506819702",
    appId: "1:985506819702:web:407215da36321f9084b957"
};

// Inicializamos Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 2. RECUPERAR LA MEMORIA (Buscamos si hay datos guardados de antes)
let historialSpo2 = JSON.parse(localStorage.getItem('seroaHistorialSpo2')) || [];
let historialBpm = JSON.parse(localStorage.getItem('seroaHistorialBpm')) || [];
let categoriasTiempo = JSON.parse(localStorage.getItem('seroaCategoriasTiempo')) || [];

// Límite de puntos en la gráfica para que no se apelmace y se vea limpia
const LIMITE_PUNTOS = 15;

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
    tooltip: { x: { format: 'HH:mm:ss' } }
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
    historialSpo2 = []; historialBpm = [];
    localStorage.removeItem('seroaHistorialSpo2'); localStorage.removeItem('seroaHistorialBpm');
}

// === 4. EL MOTOR DE TIEMPO REAL CON "WATCHDOG TIMER" ===

let temporizadorSensor;
const cartelEstado = document.getElementById('estadoSensorOverlay');
const textoEstado = document.getElementById('textoEstadoSensor');

// Esta función se activa sola si el ESP32 deja de mandar datos
function mostrarAvisoCalibracion() {
    cartelEstado.style.display = 'block';
    // El texto exacto que solicitaste
    textoEstado.innerText = "Por favor coloca tu dedo, el sensor tardará unos segundos en realizar la calibración, en un instante te brindaremos tus datos.";
}

// Al entrar a la página, mostramos el aviso por defecto
mostrarAvisoCalibracion();

database.ref('Seroa/Actual').on('value', (snapshot) => {
    const datos = snapshot.val();
    
    if (datos) {
        // 1. ¡LLEGÓ UN DATO! Detenemos el temporizador para que el cartel no aparezca
        clearTimeout(temporizadorSensor);
        
        // 2. Ocultamos el cartel porque la señal es estable
        cartelEstado.style.display = 'none';

        // 3. Actualizamos los números en pantalla (tus datos reales y estables)
        const actualSpo2 = datos.spo2;
        const actualBpm = datos.bpm;
        document.getElementById('spo2Valor').innerText = actualSpo2;
        document.getElementById('bpmValor').innerText = actualBpm;

        // 4. Actualizamos las gráficas limpiamente
        const ahora = new Date().getTime(); 
        historialSpo2.push({ x: ahora, y: actualSpo2 });
        historialBpm.push({ x: ahora, y: actualBpm });

        if (historialSpo2.length > LIMITE_PUNTOS) {
            historialSpo2.shift(); historialBpm.shift();
        }

        localStorage.setItem('seroaHistorialSpo2', JSON.stringify(historialSpo2));
        localStorage.setItem('seroaHistorialBpm', JSON.stringify(historialBpm));

        if(chartSpo2) chartSpo2.updateSeries([{ data: historialSpo2 }]);
        if(chartBpm) chartBpm.updateSeries([{ data: historialBpm }]);
        
        const alerta = document.getElementById('alertaGlobalSeroa');
        if (actualSpo2 < 90 && alerta) alerta.classList.remove('d-none');

        // 5. Reiniciamos el temporizador. 
        // Si pasan 3 segundos y el ESP32 no manda nada (porque quitaste el dedo o se movió),
        // la función mostrarAvisoCalibracion se ejecutará sola.
        temporizadorSensor = setTimeout(mostrarAvisoCalibracion, 3000);
    }
});