// seguridad_head.js
// Si no hay sesión iniciada, lo mandamos a la guía
const paginaActual = window.location.pathname.split('/').pop();
if (!localStorage.getItem('nombrePaciente') && paginaActual !== 'invitado.html') {
    window.location.href = 'guia.html';
}