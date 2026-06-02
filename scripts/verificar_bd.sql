 -- =====================================================
-- VERIFICACIÓN Y CREACIÓN DE TABLA ALERTAS
-- =====================================================

-- 1. Verificar si la tabla alertas ya existe
-- Si no existe, crearla:

CREATE TABLE IF NOT EXISTS alertas (
    id_alerta INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT NOT NULL,
    id_registro VARCHAR(100),
    tipo_alerta VARCHAR(50),  -- 'Peligro' o 'Precaución'
    descripcion TEXT,
    fecha_alerta DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_paciente (id_paciente),
    INDEX idx_fecha (fecha_alerta),
    FOREIGN KEY (id_paciente) REFERENCES pacientes(id_paciente) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Verificar que registros_biomedicos tiene índice en fecha_hora para limpiar rápido
ALTER TABLE registros_biomedicos ADD INDEX IF NOT EXISTS idx_fecha_hora (fecha_hora);
ALTER TABLE registros_biomedicos ADD INDEX IF NOT EXISTS idx_paciente (id_paciente);

-- 3. Verificar que notas_clinicas tiene índice en fecha_registro
ALTER TABLE notas_clinicas ADD INDEX IF NOT EXISTS idx_fecha_registro (fecha_registro);
ALTER TABLE notas_clinicas ADD INDEX IF NOT EXISTS idx_paciente (id_paciente);

-- 4. Ver estadísticas actuales de tablas
SELECT 
    'registros_biomedicos' AS tabla,
    COUNT(*) AS cantidad,
    MIN(fecha_hora) AS fecha_mas_antigua,
    MAX(fecha_hora) AS fecha_mas_reciente
FROM registros_biomedicos
UNION ALL
SELECT 
    'notas_clinicas' AS tabla,
    COUNT(*) AS cantidad,
    MIN(fecha_registro) AS fecha_mas_antigua,
    MAX(fecha_registro) AS fecha_mas_reciente
FROM notas_clinicas
UNION ALL
SELECT 
    'alertas' AS tabla,
    COUNT(*) AS cantidad,
    MIN(fecha_alerta) AS fecha_mas_antigua,
    MAX(fecha_alerta) AS fecha_mas_reciente
FROM alertas;

-- =====================================================
-- Confirmación
-- =====================================================
SELECT 'Verificación completada. Sistema listo para producción.' AS estado;
