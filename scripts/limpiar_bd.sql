-- =====================================================
-- SCRIPT DE LIMPIEZA PARA BORRAR DATOS DE PRUEBA
-- =====================================================

-- 1. TRUNCATE la tabla de alertas y reinicia el ID
TRUNCATE TABLE alertas;
ALTER TABLE alertas AUTO_INCREMENT = 1;

-- 2. TRUNCATE la tabla de registros biométricos y reinicia el ID
TRUNCATE TABLE registros_biomedicos;
ALTER TABLE registros_biomedicos AUTO_INCREMENT = 1;

-- 3. (OPCIONAL) Si quieres vaciar TODAS las notas también:
-- TRUNCATE TABLE notas_clinicas;
-- ALTER TABLE notas_clinicas AUTO_INCREMENT = 1;

-- =====================================================
-- Confirmación
-- =====================================================
SELECT 'Limpieza completada. Bases de datos listas para producción.' AS mensaje;
SELECT COUNT(*) AS total_alertas FROM alertas;
SELECT COUNT(*) AS total_registros FROM registros_biomedicos;
