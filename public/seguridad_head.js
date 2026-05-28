// seguridad_head.js
const paginaActual = window.location.pathname.split('/').pop() || 'index.html';
const tieneSesion = localStorage.getItem('userId') !== null;

// ¡LA SOLUCIÓN! Rescatar el código de invitación de la URL antes de la redirección
const params = new URLSearchParams(window.location.search);
if (params.has('acceso')) {
    localStorage.setItem('pendingAccessId', params.get('acceso'));
}

if (!tieneSesion && !['login.html', 'guia.html', 'invitado.html'].includes(paginaActual)) {
    window.location.href = 'guia.html';
}

if (tieneSesion && paginaActual === 'invitado.html') {
    window.location.href = 'index.html';
}