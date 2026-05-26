function simularNivelTanque(porcentaje) {
    const liquid = document.getElementById('tankLiquid');
    const textPorcentaje = document.getElementById('txtPorcentaje');
    const textEstado = document.getElementById('txtEstado');
    const indicador = document.getElementById('tankAlertMode');

    if (!liquid || !textPorcentaje || !textEstado) return;

    liquid.style.height = porcentaje + '%';
    textPorcentaje.innerHTML = porcentaje + '<span class="fs-5">%</span>';

    textPorcentaje.classList.remove('text-success', 'text-warning', 'text-danger');
    textEstado.classList.remove('text-success', 'text-warning', 'text-danger');
    liquid.classList.remove('bg-critico', 'bg-bajo', 'bg-optimo');

    if (porcentaje <= 20) {
        textPorcentaje.classList.add('text-danger');
        textEstado.classList.add('text-danger');
        textEstado.innerText = "¡Alerta Crítica!";
        liquid.classList.add('bg-critico');
        if (indicador) indicador.textContent = 'RIESGO MÁXIMO';
    } else if (porcentaje <= 50) {
        textPorcentaje.classList.add('text-warning');
        textEstado.classList.add('text-warning');
        textEstado.innerText = "Nivel Bajo";
        liquid.classList.add('bg-bajo');
        if (indicador) indicador.textContent = 'Atención requerida';
    } else {
        textPorcentaje.classList.add('text-success');
        textEstado.classList.add('text-success');
        textEstado.innerText = "Nivel Óptimo";
        liquid.classList.add('bg-optimo');
        if (indicador) indicador.textContent = 'Suministro estable';
    }
}

async function cargarTanques() {
    const listaTanques = document.getElementById('listaTanques');
    if (!listaTanques) return;

    try {
        const response = await fetch('/api/tanques');
        const tanques = await response.json();
        if (!response.ok) return;

        if (!tanques.length) {
            listaTanques.innerHTML = '<div class="text-center text-muted py-4">No hay tanques registrados aún.</div>';
            return;
        }

        listaTanques.innerHTML = tanques.map(tanque => `
            <div class="card border-0 shadow-sm mb-3">
                <div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-3">
                    <div>
                        <h6 class="fw-bold mb-1">Tanque #${tanque.id_tanque}</h6>
                        <p class="mb-1 text-muted">Dispositivo ID: ${tanque.id_dispositivo}</p>
                        <p class="mb-0 text-muted">Última actualización: ${new Date(tanque.ultima_actualizacion).toLocaleString('es-MX')}</p>
                    </div>
                    <div class="text-end">
                        <span class="d-block fw-bold fs-4">${tanque.porcentaje}%</span>
                        <small class="text-muted">${tanque.tiempo_restante_minutos} min restantes</small>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
    }
}

function calcularPorcentaje(presionActual, presionMaxima) {
    if (!presionMaxima || presionMaxima <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((presionActual / presionMaxima) * 100)));
}

async function registrarTanque(event) {
    event.preventDefault();
    const idDispositivo = document.getElementById('nuevoTanqueDispositivo').value.trim();
    const presionActual = parseFloat(document.getElementById('nuevoTanquePresion').value);
    const presionMaxima = parseFloat(document.getElementById('nuevoTanquePresionMax').value);
    const tiempoRestante = parseInt(document.getElementById('nuevoTanqueTiempo').value, 10);
    const porcentaje = calcularPorcentaje(presionActual, presionMaxima);

    if (!idDispositivo || isNaN(presionActual) || isNaN(presionMaxima) || isNaN(tiempoRestante)) {
        return alert('Completa todos los campos de calibración correctamente.');
    }

    try {
        const response = await fetch('/api/tanques', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_dispositivo: parseInt(idDispositivo, 10),
                presion_actual: presionActual,
                porcentaje,
                tiempo_restante_minutos: tiempoRestante,
                ultima_actualizacion: new Date().toISOString()
            })
        });
        const data = await response.json();
        if (!response.ok) {
            return alert(data.error || 'No se pudo registrar el tanque.');
        }

        alert('Tanque registrado con éxito.');
        document.getElementById('formNuevoTanque').reset();
        cargarTanques();
    } catch (error) {
        console.error(error);
        alert('Error al registrar el tanque.');
    }
}

function iniciarTanque() {
    document.getElementById('formNuevoTanque')?.addEventListener('submit', registrarTanque);
    cargarTanques();
}

document.addEventListener('DOMContentLoaded', iniciarTanque);
