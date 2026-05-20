// 1. CONFIGURACIÓN DE FIREBASE (Usa las llaves del Paso 1)
const firebaseConfig = {
    apiKey: "AIzaSyD8GcNRjouSlrlNSKXcNrjl0gjAYuXvTMQ",
    authDomain: "seroa-e8606.firebaseapp.com",
    databaseURL: "https://console.firebase.google.com/u/0/project/seroa-e8606/database/seroa-e8606-default-rtdb/data/~2F",
    projectId: "seroa-e8606",
    storageBucket: "seroa-e8606.firebasestorage.app",
    messagingSenderId: "985506819702",
    appId: "1:985506819702:web:407215da36321f9084b957"
};

// Inicializamos Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Arreglos para guardar el historial de la gráfica (últimas 10 lecturas)
let historialSpo2 = [90, 90, 90, 90, 90, 90, 90, 90, 90, 90];
let historialBpm = [60, 60, 60, 60, 60, 60, 60, 60, 60, 60];
let categoriasTiempo = ['','','','','','','','','',''];

// 2. CONFIGURACIÓN DE LAS GRÁFICAS (Igual de bonitas, pero dinámicas)
const commonOptions = {
    chart: { type: 'area', height: 250, toolbar: { show: false }, foreColor: '#555', animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 1000 } } },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#e0e0e0', strokeDashArray: 4 }, 
    xaxis: { range: 10 } // Mostrar solo los últimos 10 puntos
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

// 3. EL MOTOR DE TIEMPO REAL
// Nos quedamos escuchando el "Pizarrón" de Firebase
database.ref('Seroa/Actual').on('value', (snapshot) => {
    const datos = snapshot.val();
    
    if (datos) {
        // Obtenemos los valores que mandó el ESP32
        const actualSpo2 = datos.spo2;
        const actualBpm = datos.bpm;

        // Actualizamos los números grandotes en el HTML
        document.getElementById('spo2Valor').innerText = actualSpo2;
        document.getElementById('bpmValor').innerText = actualBpm;

        // Generamos la hora actual para la gráfica
        const ahora = new Date();
        const horaTexto = ahora.getHours() + ':' + (ahora.getMinutes() < 10 ? '0' : '') + ahora.getMinutes() + ':' + (ahora.getSeconds() < 10 ? '0' : '') + ahora.getSeconds();

        // Recorremos el historial y agregamos el dato nuevo
        historialSpo2.push(actualSpo2);
        historialBpm.push(actualBpm);
        categoriasTiempo.push(horaTexto);

        // Actualizamos las gráficas en pantalla
        if(chartSpo2) {
            chartSpo2.updateSeries([{ data: historialSpo2 }]);
            chartSpo2.updateOptions({ xaxis: { categories: categoriasTiempo } });
        }
        if(chartBpm) {
            chartBpm.updateSeries([{ data: historialBpm }]);
            chartBpm.updateOptions({ xaxis: { categories: categoriasTiempo } });
        }
        
        // Disparador de Alerta Crítica Visual (Si baja de 90%)
        const alertaGlobal = document.getElementById('alertaGlobalSeroa');
        if (actualSpo2 < 90 && alertaGlobal.classList.contains('d-none')) {
            alertaGlobal.classList.remove('d-none');
            // Aquí puedes conectar el sonido de la alarma
        }
    }
});