// seguridad_head.js
// Si no hay sesión iniciada, lo mandamos a la guía
if (!localStorage.getItem('nombrePaciente')) {
    window.location.href = 'guia.html';
}