// Configuración general
const commonOptions = {
    chart: { type: 'area', height: 250, toolbar: { show: false }, foreColor: '#555' },
    fill: { 
        type: 'gradient', 
        gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } 
    },
    dataLabels: { enabled: false },
    grid: { borderColor: '#e0e0e0', strokeDashArray: 4 }, 
    xaxis: { tooltip: { enabled: false } }
};

// Gráfica Principal de SpO2
const spo2Options = {
    ...commonOptions,
    colors: ['#66bb6a'], 
    stroke: { curve: 'smooth', width: 3 },
    series: [{ name: "SpO2", data: [96, 96, 97, 99, 98, 97, 99, 98] }],
    xaxis: { categories: ['10:00', '10:10', '10:20', '10:30', '10:40', '10:50', '11:00', '11:10'] },
    yaxis: { min: 80, max: 100 }
};

if(document.querySelector("#spo2Chart")) {
    new ApexCharts(document.querySelector("#spo2Chart"), spo2Options).render();
}

// Gráfica Principal de Ritmo Cardíaco
const bpmOptions = {
    ...commonOptions,
    colors: ['#3b8b88'], 
    stroke: { curve: 'straight', width: 2 }, 
    series: [{ name: "BPM", data: [60, 62, 58, 65, 80, 62, 60, 61] }],
    xaxis: { categories: ['10:00', '10:10', '10:20', '10:30', '10:40', '10:50', '11:00', '11:10'] },
    yaxis: { min: 40, max: 120 }
};

if(document.querySelector("#bpmChart")) {
    new ApexCharts(document.querySelector("#bpmChart"), bpmOptions).render();
}

// Mini-Gráficas (Sparklines)
const sparklineOptions = {
    chart: { type: 'line', width: 100, height: 35, sparkline: { enabled: true } },
    stroke: { curve: 'smooth', width: 2 },
    colors: ['#ffffff'],
    tooltip: { fixed: { enabled: false }, x: { show: false }, y: { title: { formatter: function () { return '' } } }, marker: { show: false } }
};

if(document.querySelector("#miniChartSpo2")) {
    new ApexCharts(document.querySelector("#miniChartSpo2"), { 
        ...sparklineOptions, 
        series: [{ data: [96, 97, 99, 98, 99] }] 
    }).render();
}

if(document.querySelector("#miniChartBpm")) {
    new ApexCharts(document.querySelector("#miniChartBpm"), { 
        ...sparklineOptions, 
        stroke: { curve: 'straight', width: 2 }, 
        series: [{ data: [60, 65, 59, 62, 60] }] 
    }).render();
}