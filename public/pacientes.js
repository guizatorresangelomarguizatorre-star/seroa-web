document.addEventListener('DOMContentLoaded', () => {
    const pacienteActualBadge = document.getElementById('pacienteActualBadge');
    const userId = localStorage.getItem('userId');
    const userName = localStorage.getItem('nombrePaciente');

    if (pacienteActualBadge && userName) {
        pacienteActualBadge.innerHTML = `<i class="bi bi-person-fill text-teal me-1"></i> Paciente Actual: <strong>${userName}</strong>`;
    }

    const formNuevoPaciente = document.getElementById('formNuevoPaciente');
    const mensajePaciente = document.getElementById('mensajePaciente');
    const pacientesCardsContainer = document.getElementById('pacientesCardsContainer');

    async function mostrarMensaje(texto, tipo = 'danger') {
        if (!mensajePaciente) return;
        mensajePaciente.className = `alert alert-${tipo}`;
        mensajePaciente.textContent = texto;
        mensajePaciente.classList.remove('d-none');
    }

    async function ocultarMensaje() {
        if (!mensajePaciente) return;
        mensajePaciente.classList.add('d-none');
    }

    function crearCardPaciente(paciente) {
        const estado = paciente.rango_spo2_min >= 90 ? 'Estable' : paciente.rango_spo2_min >= 80 ? 'Revisar' : 'Crítico';
        const estadoClass = paciente.rango_spo2_min >= 90 ? 'bg-success' : paciente.rango_spo2_min >= 80 ? 'bg-warning text-dark' : 'bg-danger';
        const initials = paciente.nombre.split(' ').slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');

        return `
            <div class="col-md-6 col-lg-4">
                <div class="card patient-card shadow-sm border-0 h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <div class="d-flex align-items-center">
                                <div class="avatar-circle bg-teal text-white fw-bold me-3">${initials}</div>
                                <div>
                                    <h6 class="mb-0 fw-bold text-dark">${paciente.nombre}</h6>
                                    <small class="text-muted">ID: ${paciente.id_paciente}</small>
                                </div>
                            </div>
                            <span class="badge rounded-pill fw-normal ${estadoClass}">${estado}</span>
                        </div>
                        <div class="row text-center mt-3 pt-3 border-top">
                            <div class="col-4">
                                <small class="text-muted d-block" style="font-size: 0.75rem;">Peso</small>
                                <span class="fw-bold text-dark">${paciente.peso_kg} kg</span>
                            </div>
                            <div class="col-4">
                                <small class="text-muted d-block" style="font-size: 0.75rem;">Edad</small>
                                <span class="fw-bold text-dark">${paciente.edad}</span>
                            </div>
                            <div class="col-4">
                                <small class="text-muted d-block" style="font-size: 0.75rem;">Sexo</small>
                                <span class="fw-bold text-dark">${paciente.sexo}</span>
                            </div>
                        </div>
                        <div class="mt-3">
                            <small class="text-muted">Padecimiento</small>
                            <p class="mb-2">${paciente.padecimiento}</p>
                            <small class="text-muted">Rango SpO₂</small>
                            <p class="mb-0">${paciente.rango_spo2_min}% - ${paciente.rango_spo2_max}%</p>
                        </div>
                    </div>
                    <div class="card-footer bg-transparent border-0 text-center pb-3 pt-0">
                        <button type="button" class="btn btn-outline-teal w-100 btn-sm rounded-pill" disabled>Monitorear</button>
                    </div>
                </div>
            </div>
        `;
    }

    function mostrarPacientes(pacientes = []) {
        if (!pacientesCardsContainer) return;

        if (pacientes.length === 0) {
            pacientesCardsContainer.innerHTML = `
                <div class="col-12">
                    <div class="card shadow-sm border-0 py-5">
                        <div class="card-body text-center text-muted">
                            <i class="bi bi-person-lines-fill fs-1 mb-3 text-teal"></i>
                            <h5 class="fw-bold">Aún no tienes pacientes registrados</h5>
                            <p class="mb-0">Haz clic en <strong>Agregar</strong> para registrar al primer paciente de tu sistema.</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        pacientesCardsContainer.innerHTML = pacientes.map(crearCardPaciente).join('');
    }

    async function cargarPacientes() {
        if (!userId) {
            mostrarMensaje('No se encontró el ID del usuario. Vuelve a iniciar sesión.');
            return;
        }

        try {
            const response = await fetch(`/api/pacientes?id_creador=${encodeURIComponent(userId)}`);
            const data = await response.json();

            if (!response.ok) {
                mostrarMensaje(data.error || 'Error al cargar los pacientes.');
                return;
            }

            mostrarPacientes(data);
            ocultarMensaje();
        } catch (error) {
            mostrarMensaje('No se pudo conectar con el servidor para cargar pacientes.');
            console.error(error);
        }
    }

    async function guardarPaciente(event) {
        event.preventDefault();
        if (!userId) {
            mostrarMensaje('No se encontró el ID de usuario. Vuelve a iniciar sesión.');
            return;
        }

        const paciente = {
            nombre: document.getElementById('pacienteNombre').value.trim(),
            peso_kg: parseFloat(document.getElementById('pacientePeso').value),
            edad: parseInt(document.getElementById('pacienteEdad').value, 10),
            sexo: document.getElementById('pacienteSexo').value,
            padecimiento: document.getElementById('pacientePadecimiento').value.trim(),
            rango_spo2_min: parseInt(document.getElementById('pacienteSpo2Min').value, 10),
            rango_spo2_max: parseInt(document.getElementById('pacienteSpo2Max').value, 10),
            id_creador: parseInt(userId, 10)
        };

        if (!paciente.nombre || !paciente.peso_kg || !paciente.edad || !paciente.sexo || !paciente.padecimiento || isNaN(paciente.rango_spo2_min) || isNaN(paciente.rango_spo2_max)) {
            mostrarMensaje('Completa todos los campos correctamente antes de guardar.');
            return;
        }

        if (paciente.rango_spo2_min > paciente.rango_spo2_max) {
            mostrarMensaje('El rango SpO₂ mínimo no puede ser mayor que el máximo.');
            return;
        }

        try {
            const response = await fetch('/api/pacientes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paciente)
            });
            const data = await response.json();

            if (!response.ok) {
                mostrarMensaje(data.error || 'No se pudo guardar el paciente.');
                return;
            }

            await cargarPacientes();
            ocultarMensaje();
            formNuevoPaciente.reset();

            const modalEl = document.getElementById('modalNuevoPaciente');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            alert('Paciente guardado satisfactoriamente.');
        } catch (error) {
            mostrarMensaje('Error de conexión al guardar el paciente.');
            console.error(error);
        }
    }

    if (formNuevoPaciente) {
        formNuevoPaciente.addEventListener('submit', guardarPaciente);
    }

    cargarPacientes();
});