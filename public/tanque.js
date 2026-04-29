function simularNivelTanque(porcentaje) {
    const liquid = document.getElementById('tankLiquid');
    const textPorcentaje = document.getElementById('txtPorcentaje');
    const textEstado = document.getElementById('txtEstado');
    
    // Detiene la funcion, si no hay elementos
    if(!liquid || !textPorcentaje || !textEstado) return;


    liquid.style.height = porcentaje + '%';
    textPorcentaje.innerHTML = porcentaje + '<span class="fs-5">%</span>';
    
    // Eliminacion de clases previas
    textPorcentaje.classList.remove('text-success', 'text-warning', 'text-danger');
    textEstado.classList.remove('text-success', 'text-warning', 'text-danger');
    liquid.classList.remove('bg-critico', 'bg-bajo', 'bg-optimo');

    // Asignacion de colores según el nivel
    if (porcentaje <= 20) {
        textPorcentaje.classList.add('text-danger');
        textEstado.classList.add('text-danger');
        textEstado.innerText = "¡Alerta Crítica!";
        liquid.classList.add('bg-critico'); 
    } else if (porcentaje <= 50) {
        textPorcentaje.classList.add('text-warning');
        textEstado.classList.add('text-warning');
        textEstado.innerText = "Nivel Bajo";
        liquid.classList.add('bg-bajo'); 
    } else {
        textPorcentaje.classList.add('text-success');
        textEstado.classList.add('text-success');
        textEstado.innerText = "Nivel Óptimo";
        liquid.classList.add('bg-optimo'); 
    }
}