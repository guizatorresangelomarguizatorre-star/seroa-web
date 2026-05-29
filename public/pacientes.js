document.addEventListener('DOMContentLoaded', () => {
    const pacienteActualBadge = document.getElementById('pacienteActualBadge');
    const pacienteActualLabel = document.getElementById('pacienteActualLabel');
    const userId = localStorage.getItem('userId');
    const userName = localStorage.getItem('nombrePaciente');
    const formNuevoPaciente = document.getElementById('formNuevoPaciente');
    const mensajePaciente = document.getElementById('mensajePaciente');
    const pacientesCardsContainer = document.getElementById('pacientesCardsContainer');
    const modalCompartir = new bootstrap.Modal(document.getElementById('modalSharePaciente'));
    const qrShareImage = document.getElementById('shareQrImage');
    const shareLinkInput = document.getElementById('shareLinkInput');
    const sharePatientName = document.getElementById('sharePatientName');

    const selectedPatientId = localStorage.getItem('selectedPatientId');
    const selectedPatientName = localStorage.getItem('selectedPatientName');
    const selectedPatientRole = localStorage.getItem('selectedPatientRole');

    function actualizarPacienteActualUI() {
        const nombre = localStorage.getItem('selectedPatientName') || userName || 'Sin selección';
        const rol = localStorage.getItem('selectedPatientRole') || '---';
        const display = `${nombre} | ${rol}`;
        const badgeText = `<i class="bi bi-person-fill text-teal me-1"></i> Paciente Actual: <strong>${display}</strong>`;

        if (pacienteActualBadge) pacienteActualBadge.innerHTML = badgeText;
        if (pacienteActualLabel) pacienteActualLabel.textContent = display;
    }

    function mostrarMensaje(texto, tipo = 'danger') {
        if (!mensajePaciente) return;
        mensajePaciente.className = `alert alert-${tipo}`;
        mensajePaciente.textContent = texto;
        mensajePaciente.classList.remove('d-none');
    }

    function ocultarMensaje() {
        if (!mensajePaciente) return;
        mensajePaciente.classList.add('d-none');
    }

    function crearCardPaciente(paciente) {
        const estado = paciente.rango_spo2_min >= 90 ? 'Estable' : paciente.rango_spo2_min >= 80 ? 'Revisar' : 'Crítico';
        const estadoClass = paciente.rango_spo2_min >= 90 ? 'bg-success' : paciente.rango_spo2_min >= 80 ? 'bg-warning text-dark' : 'bg-danger';
        const initials = paciente.nombre.split(' ').slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
        const esSeleccionado = (localStorage.getItem('selectedPatientId') || '') === String(paciente.id_paciente);
        const permisoBadge = paciente.tipo_permiso === 'Administrador' ? 'bg-teal text-white' : paciente.tipo_permiso === 'Doctor' ? 'bg-primary text-white' : 'bg-secondary text-white';

        return `
            <div class="col-md-6 col-lg-4">
                <div class="card patient-card shadow-sm border-0 h-100 ${esSeleccionado ? 'border-success' : ''}">
                    <div class="card-body d-flex flex-column">
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
                        <div class="mb-3">
                            <span class="badge ${permisoBadge} rounded-pill mb-2">${paciente.tipo_permiso}</span>
                            <div class="d-flex justify-content-between text-center mt-3 pt-3 border-top">
                                <div>
                                    <small class="text-muted d-block" style="font-size: 0.75rem;">Peso</small>
                                    <span class="fw-bold text-dark">${paciente.peso_kg} kg</span>
                                </div>
                                <div>
                                    <small class="text-muted d-block" style="font-size: 0.75rem;">Edad</small>
                                    <span class="fw-bold text-dark">${paciente.edad}</span>
                                </div>
                                <div>
                                    <small class="text-muted d-block" style="font-size: 0.75rem;">Sexo</small>
                                    <span class="fw-bold text-dark">${paciente.sexo}</span>
                                </div>
                            </div>
                        </div>
                        <div class="mt-auto">
                            <small class="text-muted">Padecimiento</small>
                            <p class="mb-2">${paciente.padecimiento}</p>
                            <small class="text-muted">Rango SpO₂</small>
                            <p class="mb-3">${paciente.rango_spo2_min}% - ${paciente.rango_spo2_max}%</p>
                            <div class="d-flex gap-2 flex-wrap">
                                <button class="btn btn-sm btn-outline-teal rounded-pill flex-grow-1" data-action="select" data-id="${paciente.id_paciente}" data-name="${encodeURIComponent(paciente.nombre)}" data-role="${paciente.tipo_permiso}" data-peso="${paciente.peso_kg}" data-edad="${paciente.edad}" data-sexo="${paciente.sexo}" data-padecimiento="${encodeURIComponent(paciente.padecimiento)}" data-spo2min="${paciente.rango_spo2_min}" data-spo2max="${paciente.rango_spo2_max}">
                                    ${esSeleccionado ? 'Seleccionado' : 'Seleccionar'}
                                </button>
                                ${paciente.tipo_permiso !== 'Invitado' ? `<button class="btn btn-sm btn-teal text-white rounded-pill flex-grow-1" data-action="share" data-id="${paciente.id_paciente}" data-name="${encodeURIComponent(paciente.nombre)}">Compartir</button>` : ''}
                            </div>
                        </div>
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
            const response = await fetch(`/api/pacientes?id_usuario=${encodeURIComponent(userId)}`);
            const data = await response.json();

            if (!response.ok) {
                mostrarMensaje(data.error || 'Error al cargar los pacientes.');
                return;
            }

            if (Array.isArray(data) && data.length === 0 && selectedPatientId) {
                const fallbackResponse = await fetch(`/api/pacientes?id_usuario=${encodeURIComponent(userId)}&id_paciente=${encodeURIComponent(selectedPatientId)}`);
                const fallbackData = await fallbackResponse.json();
                if (fallbackResponse.ok && Array.isArray(fallbackData) && fallbackData.length > 0) {
                    const fallbackPaciente = fallbackData[0];
                    localStorage.setItem('selectedPatientRole', fallbackPaciente.tipo_permiso || 'Invitado');
                    mostrarPacientes(fallbackData);
                    ocultarMensaje();
                    return;
                }
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

    function dispararAlertaIntrusiva(nombrePaciente, callback) {
        // 1. Crear el overlay si no existe en el DOM
        let overlay = document.getElementById('alertaCambioContexto');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'alertaCambioContexto';
            overlay.className = 'overlay-intrusivo-seroa';
            overlay.innerHTML = `
                <div class="overlay-content-card">
                    <div class="spinner-seroa"></div>
                    <h5 class="text-uppercase text-white fw-bold mb-1" style="letter-spacing: 2px;">Contexto Clínico Actualizado</h5>
                    <p class="text-light fw-light mb-3">Redirigiendo controles y permisos al expediente de:</p>
                    <h2 class="fw-bold" style="color: #66bb6a;" id="nombrePacienteOverlay"></h2>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        // 2. Inyectar el nombre y mostrar
        document.getElementById('nombrePacienteOverlay').textContent = nombrePaciente;
        overlay.classList.add('activo');

        // 3. Esperar 2.2 segundos para que el usuario lea, y luego ejecutar recarga
        setTimeout(() => {
            overlay.classList.remove('activo');
            setTimeout(callback, 300); // Esperar a que termine la animación de opacidad
        }, 2200);
    }

    function seleccionarPaciente(pacienteId, nombre, rol, detalles = {}) {
        localStorage.setItem('selectedPatientId', pacienteId);
        localStorage.setItem('selectedPatientName', decodeURIComponent(nombre));
        localStorage.setItem('selectedPatientRole', rol);

        if (detalles.peso) localStorage.setItem('selectedPatientPeso', detalles.peso);
        if (detalles.edad) localStorage.setItem('selectedPatientEdad', detalles.edad);
        if (detalles.sexo) localStorage.setItem('selectedPatientSexo', detalles.sexo);
        if (detalles.padecimiento) localStorage.setItem('selectedPatientPadecimiento', decodeURIComponent(detalles.padecimiento));
        if (detalles.spo2min) localStorage.setItem('selectedPatientSpo2Min', detalles.spo2min);
        if (detalles.spo2max) localStorage.setItem('selectedPatientSpo2Max', detalles.spo2max);

        localStorage.setItem('pacienteActivoSeroa', decodeURIComponent(nombre));

        // En lugar de mostrar un Toast y quedarse en la página, bloqueamos y recargamos
        dispararAlertaIntrusiva(decodeURIComponent(nombre), () => {
            // La recarga automática fuerza a todas las validaciones de UI y Base de Datos a sincronizarse
            window.location.reload();
        });
    }
    async function generarLinkInvitado(pacienteId, nombre) {
        if (!userId) return mostrarMensaje('No se encontró el ID de usuario. Vuelve a iniciar sesión.');

        try {
            const response = await fetch('/api/pacientes/compartir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_paciente: pacienteId, id_usuario: parseInt(userId, 10) })
            });
            const data = await response.json();

            if (!response.ok) {
                mostrarMensaje(data.error || 'No se pudo generar el enlace de invitado.');
                return;
            }

            const url = `${window.location.origin}/invitado.html?acceso=${data.id_acceso}`;
            shareLinkInput.value = url;
            qrShareImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
            sharePatientName.textContent = decodeURIComponent(nombre);
            modalCompartir.show();
        } catch (error) {
            mostrarMensaje('Error de conexión al generar el enlace.');
            console.error(error);
        }
    }

    pacientesCardsContainer?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const pacienteId = button.dataset.id;
        const nombre = button.dataset.name;
        const rol = button.dataset.role || 'Administrador';

        if (action === 'select') {
            const detalles = {
                peso: button.dataset.peso,
                edad: button.dataset.edad,
                sexo: button.dataset.sexo,
                padecimiento: button.dataset.padecimiento,
                spo2min: button.dataset.spo2min,
                spo2max: button.dataset.spo2max
            };
            seleccionarPaciente(pacienteId, nombre, rol, detalles);
        }

        if (action === 'share') {
            generarLinkInvitado(pacienteId, nombre);
        }
    });

    shareLinkInput?.addEventListener('click', () => {
        shareLinkInput.select();
    });

    if (formNuevoPaciente) {
        formNuevoPaciente.addEventListener('submit', guardarPaciente);
    }

    actualizarPacienteActualUI();
    cargarPacientes();
});