// seguridad_head.js
const paginaActual = window.location.pathname.split('/').pop() || 'index.html';
const tieneSesion = localStorage.getItem('userId') !== null;

// 1. Si NO tiene sesión y no está en rutas públicas, expulsarlo a la guía
if (!tieneSesion && !['login.html', 'guia.html', 'invitado.html'].includes(paginaActual)) {
    window.location.href = 'guia.html';
}

// 2. Si SÍ tiene sesión y está intentando ver la pantalla de visitante casual, redirigir al Dashboard principal
if (tieneSesion && paginaActual === 'invitado.html') {
    window.location.href = 'index.html';
}