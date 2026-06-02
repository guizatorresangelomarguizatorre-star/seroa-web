-- =====================================================
-- ESTADÍSTICAS Y MONITOREO DE SEROA EN PRODUCCIÓN
-- =====================================================

-- Ejecuta este script periódicamente para monitorear la salud del sistema

-- 1. REGISTROS GUARDADOS EN ÚLTIMAS 24 HORAS
SELECT 
    DATE(fecha_hora) AS fecha,
    COUNT(*) AS registros_guardados,
    COUNT(DISTINCT id_paciente) AS pacientes_activos,
    AVG(saturacion_oxigeno) AS spo2_promedio,
    AVG(ritmo_cardiaco) AS bpm_promedio,
    SUM(CASE WHEN es_critico = 2 THEN 1 ELSE 0 END) AS eventos_peligro,
    SUM(CASE WHEN es_critico = 1 THEN 1 ELSE 0 END) AS eventos_precaucion
FROM registros_biomedicos
WHERE fecha_hora >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY DATE(fecha_hora)
ORDER BY fecha DESC;

-- 2. ALERTAS GENERADAS (ÚLTIMAS 24 HORAS)
SELECT 
    tipo_alerta,
    COUNT(*) AS cantidad,
    COUNT(DISTINCT id_paciente) AS pacientes_afectados
FROM alertas
WHERE fecha_alerta >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY tipo_alerta;

-- 3. PACIENTES CON MÁS ACTIVIDAD
SELECT 
    p.id_paciente,
    p.nombre,
    COUNT(r.id_registro) AS registros_últimas_24h,
    COUNT(DISTINCT DATE(r.fecha_hora)) AS días_activos,
    AVG(r.saturacion_oxigeno) AS spo2_promedio,
    AVG(r.ritmo_cardiaco) AS bpm_promedio
FROM pacientes p
LEFT JOIN registros_biomedicos r ON p.id_paciente = r.id_paciente 
    AND r.fecha_hora >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY p.id_paciente
HAVING registros_últimas_24h > 0
ORDER BY registros_últimas_24h DESC;

-- 4. TAMAÑO DE BASE DE DATOS (ESTIMADO)
SELECT 
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS tamaño_mb
FROM information_schema.TABLES
WHERE table_schema = DATABASE();

-- 5. REGISTROS QUE SERÁN ELIMINADOS EN LA PRÓXIMA LIMPIEZA (30 DÍAS)
SELECT 
    'registros_biomedicos' AS tabla,
    COUNT(*) AS cantidad_a_eliminar,
    MIN(fecha_hora) AS fecha_más_antigua
FROM registros_biomedicos
WHERE fecha_hora < DATE_SUB(NOW(), INTERVAL 30 DAY)
UNION ALL
SELECT 
    'notas_clinicas' AS tabla,
    COUNT(*) AS cantidad_a_eliminar,
    MIN(fecha_registro) AS fecha_más_antigua
FROM notas_clinicas
WHERE fecha_registro < DATE_SUB(NOW(), INTERVAL 30 DAY)
UNION ALL
SELECT 
    'alertas' AS tabla,
    COUNT(*) AS cantidad_a_eliminar,
    MIN(fecha_alerta) AS fecha_más_antigua
FROM alertas
WHERE fecha_alerta < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- =====================================================
-- RESUMEN EJECUTIVO
-- =====================================================
SELECT 
    (SELECT COUNT(*) FROM registros_biomedicos) AS total_registros,
    (SELECT COUNT(*) FROM alertas) AS total_alertas,
    (SELECT COUNT(*) FROM notas_clinicas) AS total_notas,
    (SELECT COUNT(DISTINCT id_paciente) FROM registros_biomedicos) AS pacientes_monitorados,
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS tamaño_db_mb
FROM information_schema.TABLES
WHERE table_schema = DATABASE();
