// components/Ini.jsx - Versión CON MODALES PARA AGREGAR EMPRENDIMIENTOS, PREMIOS, USUARIOS Y PROMOCIONES
import { useState, useEffect, useRef, useMemo } from 'react';
import io from 'socket.io-client';
import styles from "../../assets/css/adm/inicio.module.css";

// ✅ Usar rutas relativas - el proxy de Nginx manejará la redirección
const API_URL = ''; // Vacío para usar rutas relativas

// ============================================
// COMPONENTE DragDropLogo (Solo imagen para premios)
// ============================================
const DragDropLogo = ({ onImageSelect, currentImage, isPremio = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState(currentImage || null);
  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona un archivo de imagen válido');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no debe superar los 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
      onImageSelect(file);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={styles.dragDropContainer}>
      <div
        className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          className={styles.hiddenInput}
        />

        {preview ? (
          <div className={styles.previewContainer}>
            <img src={preview} alt="Preview" className={styles.previewImage} />
            <button
              type="button"
              className={styles.changeImageBtn}
              onClick={(e) => {
                e.stopPropagation();
                setPreview(null);
                onImageSelect(null);
              }}
            >
              Cambiar imagen
            </button>
          </div>
        ) : (
          <div className={styles.dropContent}>
            <span className={styles.dropIcon}>📁</span>
            <p className={styles.dropText}>
              <strong>Haz clic para seleccionar</strong> o arrastra y suelta una imagen
            </p>
            <p className={styles.dropHint}>PNG, JPG, GIF hasta 2MB</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE DragDropLogoConEmoji (Para emprendimientos)
// ============================================
const DragDropLogoConEmoji = ({ onImageSelect, onEmojiSelect, currentLogo, currentImage }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState(currentImage || null);
  const [selectedType, setSelectedType] = useState(currentImage ? 'image' : 'emoji');
  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona un archivo de imagen válido');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no debe superar los 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
      setSelectedType('image');
      onImageSelect(file);
      onEmojiSelect(null);
    };
    reader.readAsDataURL(file);
  };

  const handleEmojiSelect = (emoji) => {
    setSelectedType('emoji');
    setPreview(null);
    onEmojiSelect(emoji);
    onImageSelect(null);
  };

  const suggestedEmojis = [
    '☕', '🍔', '🍕', '🏪', '🏢', '🔧', '💇', '🏋️',
    '📚', '💊', '👗', '💻', '🎨', '🎭', '🏨', '✈️'
  ];

  return (
    <div >
      <div className={styles.logoTypeSelector}>
        <button
          type="button"
          className={`${styles.typeBtn} ${selectedType === 'emoji' ? styles.active : ''}`}
          onClick={() => setSelectedType('emoji')}
        >
          😀 Usar Emoji
        </button>
        <button
          type="button"
          className={`${styles.typeBtn} ${selectedType === 'image' ? styles.active : ''}`}
          onClick={() => setSelectedType('image')}
        >
          🖼️ Subir Imagen
        </button>
      </div>

      {selectedType === 'image' && (
        <div
          className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            className={styles.hiddenInput}
          />

          {preview ? (
            <div className={styles.previewContainer}>
              <img src={preview} alt="Logo preview" className={styles.previewImage} />
              <button
                type="button"
                className={styles.changeImageBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview(null);
                  onImageSelect(null);
                }}
              >
                Cambiar imagen
              </button>
            </div>
          ) : (
            <div className={styles.dropContent}>
              <span className={styles.dropIcon}>📁</span>
              <p className={styles.dropText}>
                <strong>Haz clic para seleccionar</strong> o arrastra y suelta una imagen
              </p>
              <p className={styles.dropHint}>PNG, JPG, GIF hasta 2MB</p>
            </div>
          )}
        </div>
      )}

      {selectedType === 'emoji' && (
        <div className={styles.emojiSelector}>
          <p className={styles.emojiTitle}>Selecciona un emoji para tu negocio:</p>
          <div className={styles.emojiGrid}>
            {suggestedEmojis.map(emoji => (
              <button
                key={emoji}
                type="button"
                className={`${styles.emojiBtn} ${currentLogo === emoji ? styles.selected : ''}`}
                onClick={() => handleEmojiSelect(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>

        </div>
      )}

      {(preview || currentLogo) && (
        <div className={styles.currentLogoPreview}>
          <p className={styles.previewTitle}>Vista previa del logo:</p>
          <div className={styles.logoPreviewBox}>
            {preview ? (
              <img src={preview} alt="Logo" className={styles.logoPreviewImg} />
            ) : currentLogo ? (
              <span className={styles.logoPreviewEmoji}>{currentLogo}</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// COMPONENTE CalculadoraPyG
// ============================================
const CalculadoraPyG = ({ puntosConfig, promociones, premios, usuarios }) => {
  const obtenerRango = (puntos) => {
    if (!puntosConfig) return null;
    if (puntos >= puntosConfig.rango_diamante_min) return { nombre: 'Diamante', icono: '💎', color: '#b9f2ff' };
    if (puntos >= puntosConfig.rango_oro_min) return { nombre: 'Oro', icono: '🥇', color: '#ffd700' };
    if (puntos >= puntosConfig.rango_plata_min) return { nombre: 'Plata', icono: '🥈', color: '#c0c0c0' };
    return null;
  };

  const calcularPuntos = (monto) => {
    if (!puntosConfig) return 0;
    if (monto < puntosConfig.umbral_minimo) {
      return puntosConfig.puntos_fijos;
    }

    let puntos = monto * puntosConfig.tasa_conversion;

    switch (puntosConfig.redondeo) {
      case 'floor':
        puntos = Math.floor(puntos);
        break;
      case 'ceil':
        puntos = Math.ceil(puntos);
        break;
      case 'round':
        puntos = Math.round(puntos);
        break;
      default:
        puntos = puntos;
    }

    return puntos;
  };

  const calcularMetricas = () => {
    if (!puntosConfig) return {};
    const totalUsuarios = usuarios?.length || 0;
    const usuariosConPuntos = usuarios?.filter(u => (u.puntosAcumulados || 0) > 0).length || 0;

    const puntosEmitidos = usuarios?.reduce((sum, u) => sum + (u.puntosAcumulados || 0), 0) || 0;
    const valorMonetarioTotal = puntosEmitidos / (puntosConfig.tasa_conversion || 10);

    const puntosCanjeados = premios?.reduce((sum, p) => {
      return sum + ((p.puntos || 0) * ((p.vecesCanjeado || 0)));
    }, 0) || 0;

    const valorPremiosCanjeados = premios?.reduce((sum, p) => {
      return sum + ((p.puntos || 0) * ((p.vecesCanjeado || 0)) / (puntosConfig.tasa_conversion || 10));
    }, 0) || 0;

    const tasaRedencion = puntosEmitidos > 0 ? (puntosCanjeados / puntosEmitidos) * 100 : 0;
    const balancePuntos = puntosEmitidos - puntosCanjeados;
    const balanceMonetario = valorMonetarioTotal - valorPremiosCanjeados;

    return {
      puntosEmitidos,
      puntosCanjeados,
      tasaRedencion,
      balancePuntos,
      valorMonetarioTotal,
      valorPremiosCanjeados,
      balanceMonetario,
      totalUsuarios,
      usuariosConPuntos,
      puntosPorUsuario: totalUsuarios > 0 ? (puntosEmitidos / totalUsuarios) : 0
    };
  };

  const metricas = calcularMetricas();
  const promocionActiva = promociones?.find(p => {
    if (!p.activo) return false;
    const ahora = new Date();
    const inicio = new Date(p.fechaInicio);
    const fin = new Date(p.fechaFin);
    return ahora >= inicio && ahora <= fin;
  });

  const ejemplos = [
    { monto: 0.50, desc: "Compra menor a $1" },
    { monto: 1.00, desc: "Compra exacta de $1" },
    { monto: 5.50, desc: "Compra de $5.50" },
    { monto: 12.75, desc: "Compra de $12.75" }
  ];

  if (!puntosConfig) return <div>Cargando configuración...</div>;

  return (
    <div>

      <div className={styles.pygSummary}>
        <div className={`${styles.pygCard} ${metricas.balanceMonetario >= 0 ? styles.pygPositive : styles.pygNegative}`}>
          <div className={styles.pygCardHeader}>
            <span className={styles.pygIcon}>💰</span>
            <h4>Balance Monetario</h4>
          </div>
          <div className={styles.pygCardValue}>
            ${metricas.balanceMonetario?.toFixed(2) || '0.00'}
          </div>
          <div className={styles.pygCardLabel}>
            {metricas.balanceMonetario >= 0 ? 'Ganancia' : 'Pérdida'}
          </div>
        </div>

        <div className={styles.pygCard}>
          <div className={styles.pygCardHeader}>
            <span className={styles.pygIcon}>⭐</span>
            <h4>Balance de Puntos</h4>
          </div>
          <div className={styles.pygCardValue}>
            {metricas.balancePuntos?.toLocaleString() || '0'}
          </div>
          <div className={styles.pygCardLabel}>
            Puntos en circulación
          </div>
        </div>

        <div className={styles.pygCard}>
          <div className={styles.pygCardHeader}>
            <span className={styles.pygIcon}>📈</span>
            <h4>Tasa de Redención</h4>
          </div>
          <div className={styles.pygCardValue}>
            {metricas.tasaRedencion?.toFixed(1) || '0'}%
          </div>
          <div className={styles.pygCardLabel}>
            {metricas.tasaRedencion > 70 ? '🔥 Alta' : metricas.tasaRedencion > 40 ? '📊 Media' : '📉 Baja'}
          </div>
        </div>
      </div>

      <div className={styles.pygEjemplos}>
        <h4>📝 Ejemplos con reglas actuales:</h4>
        <div className={styles.pygEjemplosGrid}>
          {ejemplos.map((ej, idx) => {
            const puntos = calcularPuntos(ej.monto);
            const conPromo = promocionActiva ? puntos * promocionActiva.multiplicador : puntos;
            const rango = obtenerRango(puntos);

            return (
              <div key={idx} className={styles.pygEjemploCard}>
                <div className={styles.pygEjemploMonto}>${ej.monto.toFixed(2)}</div>
                <div className={styles.pygEjemploDesc}>{ej.desc}</div>
                <div className={styles.pygEjemploPuntos}>
                  <span className={styles.pygEjemploLabel}>Puntos:</span>
                  <strong>{puntos}</strong>
                </div>
                {rango && (
                  <div className={styles.pygEjemploRango} style={{ backgroundColor: rango.color + '20', color: rango.color }}>
                    <span>{rango.icono}</span>
                    <span>{rango.nombre}</span>
                  </div>
                )}
                {promocionActiva && (
                  <div className={styles.pygEjemploPromo}>
                    <span className={styles.pygEjemploLabel}>Con promo {promocionActiva.multiplicador}x:</span>
                    <strong className={styles.pygEjemploPromoValue}>{conPromo}</strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.pygDetalles}>
        <h4>Detalle de Puntos</h4>
        <div className={styles.pygBarras}>
          <div className={styles.pygBarraItem}>
            <div className={styles.pygBarraLabel}>
              <span>Puntos Emitidos</span>
              <strong>{metricas.puntosEmitidos?.toLocaleString() || '0'}</strong>
            </div>
            <div className={styles.pygBarraContenedor}>
              <div className={styles.pygBarraEmitidos} style={{ width: '100%' }} />
            </div>
          </div>
          <div className={styles.pygBarraItem}>
            <div className={styles.pygBarraLabel}>
              <span>Puntos Canjeados</span>
              <strong>{metricas.puntosCanjeados?.toLocaleString() || '0'}</strong>
            </div>
            <div className={styles.pygBarraContenedor}>
              <div
                className={styles.pygBarraCanjeados}
                style={{ width: `${(metricas.puntosCanjeados / metricas.puntosEmitidos * 100) || 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.pygUsuarios}>
        <h4>Top Usuarios con Más Puntos</h4>
        <table className={styles.pygTable}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Puntos Acumulados</th>
              <th>Rango</th>
              <th>Valor Monetario</th>
            </tr>
          </thead>
          <tbody>
            {(usuarios || [])
              .filter(u => (u.puntosAcumulados || 0) > 0)
              .sort((a, b) => (b.puntosAcumulados || 0) - (a.puntosAcumulados || 0))
              .slice(0, 5)
              .map(user => {
                const rango = obtenerRango(user.puntosAcumulados || 0);
                return (
                  <tr key={user.id}>
                    <td>{user.usuario}</td>
                    <td>
                      <span className={`${styles.roleBadge} ${user.rol === 'admin' ? styles.adminBadge :
                        user.rol === 'colab' ? styles.colabBadge : styles.userBadge
                        }`}>
                        {user.rol === 'admin' ? 'Admin' : user.rol === 'colab' ? 'Colaborador' : 'Usuario'}
                      </span>
                    </td>
                    <td><strong>{user.puntosAcumulados?.toLocaleString() || 0}</strong></td>
                    <td>
                      {rango ? (
                        <span className={`${styles.rankBadge} ${styles[`rank${rango.nombre}`]}`}>
                          {rango.icono} {rango.nombre}
                        </span>
                      ) : (
                        <span className={`${styles.rankBadge} ${styles.rankBronce}`}>
                          🥉 Bronce
                        </span>
                      )}
                    </td>
                    <td>${((user.puntosAcumulados || 0) / (puntosConfig.tasa_conversion || 10)).toFixed(2)}</td>
                  </tr>
                );
              })}
            {(usuarios || []).filter(u => (u.puntosAcumulados || 0) > 0).length === 0 && (
              <tr>
                <td colSpan="5" className={styles.pygEmpty}>No hay usuarios con puntos acumulados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.pygPremios}>
        <h4>Premios Más Canjeados</h4>
        <table className={styles.pygTable}>
          <thead>
            <tr>
              <th>Premio</th>
              <th>Puntos</th>
              <th>Veces Canjeado</th>
              <th>Total Puntos</th>
            </tr>
          </thead>
          <tbody>
            {(premios || [])
              .filter(p => (p.vecesCanjeado || 0) > 0)
              .sort((a, b) => (b.vecesCanjeado || 0) - (a.vecesCanjeado || 0))
              .slice(0, 5)
              .map(premio => (
                <tr key={premio.id}>
                  <td>{premio.nombre}</td>
                  <td>{premio.puntos?.toLocaleString()}</td>
                  <td>{premio.vecesCanjeado || 0}</td>
                  <td><strong>{((premio.puntos || 0) * (premio.vecesCanjeado || 0)).toLocaleString()}</strong></td>
                </tr>
              ))}
            {(premios || []).filter(p => (p.vecesCanjeado || 0) > 0).length === 0 && (
              <tr>
                <td colSpan="4" className={styles.pygEmpty}>No hay premios canjeados aún</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {promocionActiva && (
        <div className={styles.pygPromocionActiva}>
          <h4>🔥 Promoción Activa</h4>
          <div className={styles.pygPromoCard}>
            <div className={styles.pygPromoHeader}>
              <span className={styles.pygPromoMultiplicador}>{promocionActiva.multiplicador}x</span>
              <span className={styles.pygPromoNombre}>{promocionActiva.nombre}</span>
            </div>
            <p className={styles.pygPromoDesc}>{promocionActiva.descripcion}</p>
            <div className={styles.pygPromoFechas}>
              <span>📅 Válido hasta: {new Date(promocionActiva.fechaFin).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.pygKPI}>
        <div className={styles.pygKPIItem}>
          <span className={styles.pygKPILabel}>Usuarios con puntos</span>
          <span className={styles.pygKPIValue}>{metricas.usuariosConPuntos} / {metricas.totalUsuarios}</span>
        </div>
        <div className={styles.pygKPIItem}>
          <span className={styles.pygKPILabel}>Promedio puntos/usuario</span>
          <span className={styles.pygKPIValue}>{Math.round(metricas.puntosPorUsuario).toLocaleString()}</span>
        </div>
        <div className={styles.pygKPIItem}>
          <span className={styles.pygKPILabel}>Valor puntos emitidos</span>
          <span className={styles.pygKPIValue}>${metricas.valorMonetarioTotal?.toFixed(2) || '0.00'}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE PuntosConfig
// ============================================
const PuntosConfig = ({ config, onUpdate }) => {
  const [localConfig, setLocalConfig] = useState(config);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    let parsedValue;

    if (type === 'checkbox') {
      parsedValue = checked;
    } else if (type === 'number' || name === 'valor_punto') {
      parsedValue = parseFloat(value) || 0;
    } else {
      parsedValue = value;
    }

    setLocalConfig(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const configToSend = {
        umbral_minimo: parseFloat(localConfig.umbral_minimo) || 0,
        puntos_fijos: parseInt(localConfig.puntos_fijos) || 0,
        tasa_conversion: parseFloat(localConfig.tasa_conversion) || 0,
        redondeo: localConfig.redondeo,
        rango_bronce_max: parseInt(localConfig.rango_bronce_max) || 0,
        rango_plata_min: parseInt(localConfig.rango_plata_min) || 0,
        rango_plata_max: parseInt(localConfig.rango_plata_max) || 0,
        rango_oro_min: parseInt(localConfig.rango_oro_min) || 0,
        rango_oro_max: parseInt(localConfig.rango_oro_max) || 0,
        rango_diamante_min: parseInt(localConfig.rango_diamante_min) || 0,
        valor_punto: parseFloat(localConfig.valor_punto) || 0.005
      };

      console.log('📤 Enviando configuración:', configToSend);
      await onUpdate(configToSend);
      alert('✅ Configuración de puntos guardada');
    } catch (error) {
      console.error('❌ Error:', error);
      alert('❌ Error al guardar la configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const getValorPuntoSeguro = () => {
    const valor = parseFloat(localConfig?.valor_punto) || 0.005;
    return valor;
  };

  if (!localConfig) return <div>Cargando configuración...</div>;

  return (
    <div >

      <div className={styles.configGrid}>
        <div className={styles.configCard}>
          <h4>📉 Para compras menores a:</h4>
          <div className={styles.configItem}>
            <label className={styles.configLabel}>
              Umbral mínimo ($):
              <input
                type="number"
                name="umbral_minimo"
                value={localConfig.umbral_minimo}
                onChange={handleChange}
                className={styles.configInput}
                min="0.01"
                step="0.01"
              />
            </label>
            <small className={styles.helperText}>
              Compras MENORES a este valor reciben puntos fijos
            </small>
          </div>

          <div className={styles.configItem}>
            <label className={styles.configLabel}>
              Puntos fijos:
              <input
                type="number"
                name="puntos_fijos"
                value={localConfig.puntos_fijos}
                onChange={handleChange}
                className={styles.configInput}
                min="1"
                step="1"
              />
            </label>
            <small className={styles.helperText}>
              Puntos que reciben las compras bajo el umbral
            </small>
          </div>
        </div>

        <div className={styles.configCard}>
          <h4>📈 Para compras de ${localConfig.umbral_minimo} o más:</h4>
          <div className={styles.configItem}>
            <label className={styles.configLabel}>
              💵 1 Dólar =
              <input
                type="number"
                name="tasa_conversion"
                value={localConfig.tasa_conversion}
                onChange={handleChange}
                className={styles.configInput}
                min="1"
                step="0.5"
              />
              Puntos
            </label>
            <small className={styles.helperText}>
              Ej: si vale 2, una compra de $5 dará 10 puntos
            </small>
          </div>

          <div className={styles.configItem}>
            <label className={styles.configLabel}>
              🏷️ Redondeo:
            </label>
            <select
              name="redondeo"
              value={localConfig.redondeo}
              onChange={handleChange}
              className={styles.configSelect}
            >
              <option value="none">Sin redondeo</option>
              <option value="floor">Redondear hacia abajo</option>
              <option value="ceil">Redondear hacia arriba</option>
              <option value="round">Redondear al entero más cercano</option>
            </select>
          </div>
        </div>

        <div className={styles.configCard}>
          <h4>💰 Valor del Punto</h4>
          <div className={styles.configItem}>
            <label className={styles.configLabel}>
              1 punto equivale a $
              <input
                type="number"
                name="valor_punto"
                value={localConfig.valor_punto}
                onChange={handleChange}
                className={styles.configInput}
                min="0.001"
                step="0.001"
              />
            </label>
            <small className={styles.helperText}>
              1000 puntos = ${(getValorPuntoSeguro() * 1000).toFixed(2)}
            </small>
          </div>
        </div>

        <div className={`${styles.configCard} ${styles.rangeCard}`}>
          <h4>🏆 Rangos por Nivel de Puntos</h4>

          <div className={styles.rangeItem}>
            <div className={styles.rangeIcon}>🥉</div>
            <div className={styles.rangeContent}>
              <label className={styles.rangeLabel}>Bronce</label>
              <div className={styles.rangeInputs}>
                <span>0 -</span>
                <input
                  type="number"
                  name="rango_bronce_max"
                  value={localConfig.rango_bronce_max}
                  onChange={handleChange}
                  className={styles.rangeInput}
                  min="0"
                  step="100"
                />
                <span>pts</span>
              </div>
            </div>
          </div>

          <div className={styles.rangeItem}>
            <div className={styles.rangeIcon}>🥈</div>
            <div className={styles.rangeContent}>
              <label className={styles.rangeLabel}>Plata</label>
              <div className={styles.rangeInputs}>
                <input
                  type="number"
                  name="rango_plata_min"
                  value={localConfig.rango_plata_min}
                  onChange={handleChange}
                  className={styles.rangeInput}
                  min="0"
                  step="100"
                />
                <span>-</span>
                <input
                  type="number"
                  name="rango_plata_max"
                  value={localConfig.rango_plata_max}
                  onChange={handleChange}
                  className={styles.rangeInput}
                  min="0"
                  step="100"
                />
                <span>pts</span>
              </div>
            </div>
          </div>

          <div className={styles.rangeItem}>
            <div className={styles.rangeIcon}>🥇</div>
            <div className={styles.rangeContent}>
              <label className={styles.rangeLabel}>Oro</label>
              <div className={styles.rangeInputs}>
                <input
                  type="number"
                  name="rango_oro_min"
                  value={localConfig.rango_oro_min}
                  onChange={handleChange}
                  className={styles.rangeInput}
                  min="0"
                  step="100"
                />
                <span>-</span>
                <input
                  type="number"
                  name="rango_oro_max"
                  value={localConfig.rango_oro_max}
                  onChange={handleChange}
                  className={styles.rangeInput}
                  min="0"
                  step="100"
                />
                <span>pts</span>
              </div>
            </div>
          </div>

          <div className={styles.rangeItem}>
            <div className={styles.rangeIcon}>💎</div>
            <div className={styles.rangeContent}>
              <label className={styles.rangeLabel}>Diamante</label>
              <div className={styles.rangeInputs}>
                <input
                  type="number"
                  name="rango_diamante_min"
                  value={localConfig.rango_diamante_min}
                  onChange={handleChange}
                  className={styles.rangeInput}
                  min="0"
                  step="100"
                />
                <span>pts o más</span>
              </div>
            </div>
          </div>

          <small className={styles.rangeHelper}>
            ✨ Los usuarios obtendrán automáticamente el rango según sus puntos acumulados
          </small>
        </div>
      </div>

      <div className={styles.configPreview}>
        <h4>📋 Resumen de reglas:</h4>
        <div className={styles.previewRules}>
          <div className={styles.previewRule}>
            <span className={styles.previewRuleIcon}>📉</span>
            <div className={styles.previewRuleText}>
              <strong>Si el monto es menor a ${localConfig.umbral_minimo}:</strong>
              <p>El cliente recibe <strong>{localConfig.puntos_fijos} punto{localConfig.puntos_fijos !== 1 ? 's' : ''} fijo{localConfig.puntos_fijos !== 1 ? 's' : ''}</strong> sin importar el monto</p>
            </div>
          </div>
          <div className={styles.previewRule}>
            <span className={styles.previewRuleIcon}>📈</span>
            <div className={styles.previewRuleText}>
              <strong>Si el monto es ${localConfig.umbral_minimo} o más:</strong>
              <p>El cliente recibe <strong>{localConfig.tasa_conversion} puntos por cada dólar</strong> {localConfig.redondeo !== 'none' && `(redondeo: ${localConfig.redondeo === 'floor' ? 'hacia abajo' : localConfig.redondeo === 'ceil' ? 'hacia arriba' : 'al entero más cercano'})`}</p>
            </div>
          </div>
          <div className={styles.previewRule}>
            <span className={styles.previewRuleIcon}>💰</span>
            <div className={styles.previewRuleText}>
              <strong>Valor del punto:</strong>
              <p>1 punto = <strong>${getValorPuntoSeguro().toFixed(3)}</strong> → 1000 puntos = <strong>${(getValorPuntoSeguro() * 1000).toFixed(2)}</strong></p>
            </div>
          </div>
          <div className={styles.previewRule}>
            <span className={styles.previewRuleIcon}>🏆</span>
            <div className={styles.previewRuleText}>
              <strong>Rangos por niveles:</strong>
              <div className={styles.previewRanges}>
                <span>🥉 Bronce: 0 - {localConfig.rango_bronce_max} pts</span>
                <span>🥈 Plata: {localConfig.rango_plata_min} - {localConfig.rango_plata_max} pts</span>
                <span>🥇 Oro: {localConfig.rango_oro_min} - {localConfig.rango_oro_max} pts</span>
                <span>💎 Diamante: {localConfig.rango_diamante_min}+ pts</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={isSaving} className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge}`}>
        {isSaving ? '💾 Guardando...' : '💾 Guardar Configuración de Puntos'}
      </button>
    </div>
  );
};

// ============================================
// COMPONENTE PromocionesManager - CON MODAL
// ============================================
const PromocionesManager = ({ promociones, emprendimientos, onAdd, onUpdate, onDelete, onToggleActivo }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    multiplicador: 2,
    fechaInicio: '',
    fechaFin: '',
    activo: true,
    emprendimiento_id: ''
  });

  const resetForm = () => {
    setFormData({
      nombre: '',
      descripcion: '',
      multiplicador: 2,
      fechaInicio: '',
      fechaFin: '',
      activo: true,
      emprendimiento_id: ''
    });
    setEditingId(null);
    setShowModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const dataToSend = {
        ...formData,
        emprendimiento_id: formData.emprendimiento_id || null
      };
      if (editingId) {
        await onUpdate(editingId, dataToSend);
      } else {
        await onAdd(dataToSend);
      }
      resetForm();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (promo) => {
    setFormData({
      nombre: promo.nombre,
      descripcion: promo.descripcion || '',
      multiplicador: promo.multiplicador,
      fechaInicio: promo.fechaInicio.slice(0, 16),
      fechaFin: promo.fechaFin.slice(0, 16),
      activo: promo.activo === 1,
      emprendimiento_id: promo.emprendimiento_id || ''
    });
    setEditingId(promo.id);
    setShowModal(true);
  };

  const getEstadoPromo = (promo) => {
    const ahora = new Date();
    const inicio = new Date(promo.fechaInicio);
    const fin = new Date(promo.fechaFin);

    if (!promo.activo) return 'inactivo';
    if (ahora < inicio) return 'proximo';
    if (ahora > fin) return 'expirado';
    return 'activo';
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  return (
    <div>
      <div className={styles.promocionesHeader}>
        <button
          onClick={openCreateModal}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          ➕ Nueva Promoción
        </button>
      </div>

      <div className={styles.promocionesList}>
        {(promociones || []).length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyMessage}>📭 No hay promociones creadas</p>
          </div>
        ) : (
          (promociones || []).map(promo => {
            const estado = getEstadoPromo(promo);
            const emprendimientoNombre = (emprendimientos || []).find(e => e.id === promo.emprendimiento_id)?.nombre;
            return (
              <div key={promo.id} className={`${styles.promoCard} ${styles[estado]}`}>
                <div className={styles.promoHeader}>
                  <div className={styles.promoBadges}>
                    <span className={`${styles.promoBadge} ${styles[`badge${estado}`]}`}>
                      {estado === 'activo' && '🔥 Activo'}
                      {estado === 'proximo' && '⏳ Próximo'}
                      {estado === 'expirado' && '⌛ Expirado'}
                      {estado === 'inactivo' && '⏸️ Inactivo'}
                    </span>
                    <span className={styles.promoMultiplicador}>
                      {promo.multiplicador}x Puntos
                    </span>
                  </div>
                  <h4>{promo.nombre}</h4>
                  {promo.descripcion && <p className={styles.promoDesc}>{promo.descripcion}</p>}
                  {promo.emprendimiento_id && emprendimientoNombre && (
                    <p className={styles.promoEmprendimiento}>
                      🏢 {emprendimientoNombre}
                    </p>
                  )}
                  {!promo.emprendimiento_id && (
                    <p className={styles.promoGlobal}>
                      🌍 Aplica a todos los emprendimientos
                    </p>
                  )}
                </div>

                <div className={styles.promoFechas}>
                  <div className={styles.promoFecha}>
                    <span>📅 Inicio:</span>
                    <strong>{new Date(promo.fechaInicio).toLocaleString()}</strong>
                  </div>
                  <div className={styles.promoFecha}>
                    <span>📅 Fin:</span>
                    <strong>{new Date(promo.fechaFin).toLocaleString()}</strong>
                  </div>
                </div>

                <div className={styles.promoActions}>
                  <button
                    onClick={() => onToggleActivo(promo.id)}
                    className={`${styles.btn} ${styles.btnOutline}`}
                  >
                    {promo.activo ? '⏸️ Pausar' : '▶️ Activar'}
                  </button>
                  <button
                    onClick={() => handleEdit(promo)}
                    className={`${styles.btn} ${styles.btnPrimary}`}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('¿Eliminar esta promoción?')) {
                        onDelete(promo.id);
                      }
                    }}
                    className={`${styles.btn} ${styles.btnDanger}`}
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL PARA CREAR/EDITAR PROMOCIÓN */}
      {showModal && (
        <div className={`${styles.modal} ${styles.show}`} style={{ display: 'flex' }}>
          <div className={styles.modalContent} style={{ maxWidth: '900px' }}>
            <div className={styles.modalHeader}>
              <h3>{editingId ? '✏️ Editar Promoción' : '➕ Crear Promoción'}</h3>
              <button
                onClick={resetForm}
                className={styles.closeBtn}
                aria-label="Cerrar"
              >
                &times;
              </button>
            </div>
            <div className={styles.modalBody}>
              <form onSubmit={handleSubmit}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nombre de la promoción *</label>
                    <input
                      type="text"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      className={styles.formInput}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Descripción</label>
                    <input
                      type="text"
                      value={formData.descripcion}
                      onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                      className={styles.formInput}
                      placeholder="Ej: ¡Doble de puntos por tiempo limitado!"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Multiplicador *</label>
                    <select
                      value={formData.multiplicador}
                      onChange={(e) => setFormData({ ...formData, multiplicador: parseInt(e.target.value) })}
                      className={styles.formInput}
                      required
                    >
                      <option value="2">2x (Doble puntos)</option>
                      <option value="3">3x (Triple puntos)</option>
                      <option value="4">4x (Cuádruple puntos)</option>
                      <option value="5">5x (Quíntuple puntos)</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Emprendimiento (opcional)</label>
                    <select
                      value={formData.emprendimiento_id}
                      onChange={(e) => setFormData({ ...formData, emprendimiento_id: e.target.value })}
                      className={styles.formInput}
                    >
                      <option value="">🌍 Todos los emprendimientos</option>
                      {(emprendimientos || []).map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                      ))}
                    </select>
                    <small className={styles.helperText}>Dejar vacío para aplicar a todos los negocios</small>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Fecha de inicio *</label>
                    <input
                      type="datetime-local"
                      value={formData.fechaInicio}
                      onChange={(e) => setFormData({ ...formData, fechaInicio: e.target.value })}
                      className={styles.formInput}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Fecha de fin *</label>
                    <input
                      type="datetime-local"
                      value={formData.fechaFin}
                      onChange={(e) => setFormData({ ...formData, fechaFin: e.target.value })}
                      className={styles.formInput}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <input
                        type="checkbox"
                        checked={formData.activo}
                        onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                        className={styles.checkboxInput}
                      />
                      <span>Activar inmediatamente</span>
                    </label>
                  </div>
                </div>

                <div className={styles.modalActions}>
                  <button type="submit" disabled={isSubmitting} className={`${styles.btn} ${styles.btnPrimary}`}>
                    {isSubmitting ? '💾 Guardando...' : (editingId ? '💾 Guardar Cambios' : '➕ Crear Promoción')}
                  </button>
                  <button type="button" onClick={resetForm} className={`${styles.btn} ${styles.btnOutline}`}>
                    ❌ Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// COMPONENTE AddForm
// ============================================
const AddForm = ({
  activeSection,
  addFormData,
  handleInputChange,
  handleAdd,
  resetAddForm,
  premioEmojiSuggestions,
  usuariosPropietarios,
  isSubmitting = false,
  onSuccess
}) => {
  const formFields = {
    emprendimientos: [
      { name: 'nombre', label: 'Nombre del Emprendimiento', type: 'text', required: true },
      { name: 'categoria', label: 'Categoría', type: 'text', required: true, placeholder: 'Cafetería, Taller, Tienda...' },
      { name: 'ubicacion', label: 'Ubicación', type: 'text', required: true, placeholder: 'Dirección completa' },
      { name: 'ciudad', label: 'Ciudad', type: 'text', required: true, placeholder: 'Ciudad' },
      { name: 'horario', label: 'Horario', type: 'text', placeholder: 'Lun-Vie 9AM-6PM' },
      { name: 'whatsapp', label: 'WhatsApp', type: 'text', placeholder: 'https://wa.me/...' },
      { name: 'instagram', label: 'Instagram', type: 'text', placeholder: 'https://instagram.com/...' },
      { name: 'tiktok', label: 'TikTok', type: 'text', placeholder: 'https://tiktok.com/@...' }
    ],
    premios: [
      { name: 'nombre', label: 'Nombre del Premio', type: 'text', required: true },
      { name: 'categoria', label: 'Categoría', type: 'text', required: true, placeholder: 'Viajes, Electrónica, Experiencias...' },
      { name: 'puntos', label: 'Puntos requeridos', type: 'number', required: true, placeholder: 'Ej: 10000' },
      { name: 'descripcion', label: 'Descripción', type: 'text', required: true, placeholder: 'Descripción detallada del premio' },
      { name: 'stock', label: 'Stock disponible', type: 'number', required: true, placeholder: 'Cantidad disponible' },
      { name: 'fechaVencimiento', label: 'Fecha de vencimiento', type: 'date' }
    ],
    usuarios: [
      { name: 'email', label: 'Correo electrónico', type: 'email', required: true, placeholder: 'usuario@ejemplo.com' },
      { name: 'usuario', label: 'Nombre de usuario', type: 'text', required: true, placeholder: 'usuario123' },
      { name: 'contra', label: 'Contraseña', type: 'password', required: true, placeholder: '******' }
    ]
  };

  const currentFields = formFields[activeSection] || [];

  const handleImageSelect = (file) => {
    const event = {
      target: {
        name: 'imagen',
        value: file
      }
    };
    handleInputChange(event, true);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    await handleAdd(activeSection, addFormData);
    if (onSuccess) {
      onSuccess();
    }
  };

  return (
    <div className={styles.formPanel}>

      <form onSubmit={handleSubmitForm}>
        <div className={styles.formDataGrid}>
          {currentFields.map(field => (
            <div key={field.name} className={styles.formGroup}>
              <label className={styles.formLabel}>
                {field.label}
                {field.required && <span className={styles.required}>*</span>}
              </label>
              <input
                type={field.type}
                name={field.name}
                value={addFormData[field.name] || ''}
                onChange={(e) => handleInputChange(e, true)}
                className={styles.formInput}
                placeholder={field.placeholder || `Ingrese ${field.label.toLowerCase()}`}
                required={field.required}
                min={field.name === 'puntos' || field.name === 'stock' ? '1' : undefined}
              />
            </div>
          ))}

          {activeSection === 'emprendimientos' && (
            <div className={styles.formGroupFull}>
              <label className={styles.formLabel}>
                Propietario del negocio *
                <span className={styles.required}>*</span>
              </label>
              <select
                name="propietario_id"
                value={addFormData.propietario_id || ''}
                onChange={(e) => handleInputChange(e, true)}
                className={styles.formInput}
                required
              >
                <option value="">-- Seleccionar propietario --</option>
                {(usuariosPropietarios || []).map(usuario => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.usuario} ({usuario.rol === 'admin' ? '👑 Admin' : '👷 Colaborador'})
                  </option>
                ))}
              </select>
              <small className={styles.helperText}>
                Solo usuarios Admin y Colaborador pueden ser propietarios
              </small>
            </div>
          )}

          {activeSection === 'premios' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <input
                  type="checkbox"
                  name="disponible"
                  checked={addFormData.disponible || false}
                  onChange={(e) => handleInputChange(e, true)}
                  className={styles.checkboxInput}
                />
                <span>Disponible para canje</span>
              </label>
            </div>
          )}

          {activeSection === 'usuarios' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Rol del usuario *</label>
              <select
                name="rol"
                value={addFormData.rol || 'usuario'}
                onChange={(e) => handleInputChange(e, true)}
                className={styles.formInput}
                required
              >
                <option value="">-- Seleccionar rol --</option>
                <option value="admin">👑 Administrador</option>
                <option value="colab">👷 Colaborador</option>
                <option value="usuario">👤 Usuario normal</option>
              </select>
              <small className={styles.helperText}>
                {addFormData.rol === 'admin' && 'Acceso total al sistema'}
                {addFormData.rol === 'colab' && 'Puede ser propietario de emprendimientos'}
                {addFormData.rol === 'usuario' && 'Usuario normal para canjear puntos'}
              </small>
            </div>
          )}
        </div>

        {activeSection === 'emprendimientos' && (
          <div className={styles.logoSection}>
            <h3>🎨 Logo del Emprendimiento</h3>
            <DragDropLogoConEmoji
              onImageSelect={(file) => {
                const event = { target: { name: 'logoImagen', value: file } };
                handleInputChange(event, true);
              }}
              onEmojiSelect={(emoji) => {
                const event = { target: { name: 'logo', value: emoji } };
                handleInputChange(event, true);
              }}
              currentLogo={addFormData.logo}
              currentImage={addFormData.logoImagen}
            />
          </div>
        )}

        {activeSection === 'premios' && (
          <div className={styles.logoSection}>
            <h3>🖼️ Imagen del Premio</h3>
            <DragDropLogo
              onImageSelect={handleImageSelect}
              currentImage={addFormData.imagen}
              isPremio={true}
            />
            <small className={styles.helperText}>
              Sube una imagen para el premio (PNG, JPG, GIF hasta 2MB)
            </small>
          </div>
        )}

        <div className={styles.formActions}>
          <button type="submit" disabled={isSubmitting} className={`${styles.btn} ${styles.btnPrimary}`}>
            {isSubmitting ? '💾 Guardando...' : `💾 Guardar ${activeSection === 'emprendimientos' ? 'Emprendimiento' : activeSection === 'premios' ? 'Premio' : 'Usuario'}`}
          </button>
          <button type="button" onClick={resetAddForm} className={`${styles.btn} ${styles.btnOutline}`}>
            🧹 Limpiar Formulario
          </button>
        </div>
      </form>
    </div>
  );
};

// ============================================
// COMPONENTE FiltersSection
// ============================================
const FiltersSection = ({
  activeSection,
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  cityFilter,
  setCityFilter,
  minPoints,
  setMinPoints,
  maxPoints,
  setMaxPoints,
  uniqueCategories,
  uniqueCities,
  filteredData,
  getSectionData,
  resetFilters
}) => (
  <div className={styles.filtersSection}>
    <h3>🔍 Buscar y Filtrar</h3>

    <div className={styles.filtersGrid}>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>
          {activeSection === 'usuarios' ? 'Buscar por usuario/email' : 'Buscar por nombre'}
        </label>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.filterInput}
          placeholder={
            activeSection === 'emprendimientos' ? "Ej: Cafetería, Taller..." :
              activeSection === 'premios' ? "Ej: iPhone, Viaje..." :
                "Ej: usuario123, admin@..."
          }
        />
      </div>

      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>
          {activeSection === 'usuarios' ? 'Filtrar por rol' : 'Filtrar por categoría'}
        </label>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">
            {activeSection === 'usuarios' ? 'Todos los roles' : 'Todas las categorías'}
          </option>
          {uniqueCategories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>

      {activeSection === 'emprendimientos' && (
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Filtrar por ciudad</label>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">Todas las ciudades</option>
            {uniqueCities.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>
      )}

      {activeSection === 'premios' && (
        <>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Puntos mínimos</label>
            <input
              type="number"
              value={minPoints}
              onChange={(e) => setMinPoints(e.target.value)}
              className={styles.filterInput}
              placeholder="0"
              min="0"
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Puntos máximos</label>
            <input
              type="number"
              value={maxPoints}
              onChange={(e) => setMaxPoints(e.target.value)}
              className={styles.filterInput}
              placeholder="99999"
              min="0"
            />
          </div>
        </>
      )}
    </div>

    <div className={styles.filterActions}>
      <div className={styles.filterInfo}>
        Mostrando {(filteredData || []).length} de {(getSectionData(activeSection) || []).length} resultados
        {activeSection === 'premios' && (filteredData || []).length > 0 && (
          <span> • Total puntos: {(filteredData || []).reduce((sum, item) => sum + (item.puntos || 0), 0).toLocaleString()}</span>
        )}
      </div>
      <button
        onClick={resetFilters}
        className={`${styles.btn} ${styles.btnOutline}`}
      >
        🧹 Limpiar filtros
      </button>
    </div>
  </div>
);

// ============================================
// COMPONENTE Cards
// ============================================
const Cards = ({
  activeSection,
  filteredData,
  isLoading,
  getSectionLabel,
  resetFilters,
  openEditModal,
  handleDelete,
  getUsuarioById
}) => {
  const safeFilteredData = filteredData || [];

  if (activeSection === 'usuarios') {
    const adminColabUsers = safeFilteredData.filter(user => user.rol === 'admin' || user.rol === 'colab');

    if (adminColabUsers.length === 0) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyMessage}>📭 No hay administradores o colaboradores registrados</p>
        </div>
      );
    }

    return (
      <div className={styles.cardsGrid}>
        {adminColabUsers.map(user => (
          <div key={user.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconContainer}>
                <span className={`${styles.cardIcon} ${user.rol === 'admin' ? styles.adminBadge : styles.colabBadge}`}>
                  {user.rol === 'admin' ? '👑' : '👷'}
                </span>
              </div>
              <div>
                <h3>{user.usuario}</h3>
                <div className={styles.cardMeta}>
                  <span className={`${styles.cardBadge} ${styles.idBadge}`}>
                    🆔 {user.id}
                  </span>
                  <span className={`${styles.cardBadge} ${user.rol === 'admin' ? styles.adminBadge : styles.colabBadge}`}>
                    {user.rol === 'admin' ? '👑 Admin' : '👷 Colaborador'}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.cardBody}>
              <div className={styles.cardField}>
                <strong>📧 Email:</strong> {user.email}
              </div>
              <div className={styles.cardField}>
                <strong>👤 Usuario:</strong> {user.usuario}
              </div>
              <div className={styles.cardField}>
                <strong>⭐ Puntos:</strong> {user.puntosAcumulados?.toLocaleString() || 0}
              </div>
            </div>

            <div className={styles.cardActions}>
              <button
                onClick={() => openEditModal(activeSection, user.id)}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                ✏️ Editar
              </button>
              <button
                onClick={() => handleDelete(activeSection, user.id)}
                className={`${styles.btn} ${styles.btnDanger}`}
              >
                🗑️ Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.spinner}></div>
        <p className={styles.emptyMessage}>⏳ Cargando datos...</p>
      </div>
    );
  }

  if (safeFilteredData.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyMessage}>
          📭 No se encontraron {getSectionLabel(activeSection).toLowerCase()}s
        </p>
        <button
          onClick={resetFilters}
          className={styles.btnAdd}
        >
          🔄 Limpiar filtros
        </button>
      </div>
    );
  }

  return (
    <div className={styles.cardsGrid}>
      {safeFilteredData.map(item => (
        <div key={item.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconContainer}>
              {activeSection === 'premios' ? (
                item.imagen ? (
                  <img
                    src={item.imagen}
                    alt={`Imagen ${item.nombre}`}
                    className={styles.cardImageLogo}
                    style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }}
                  />
                ) : (
                  <span className={styles.cardIcon} style={{ backgroundColor: '#10b981', fontSize: '24px' }}>
                    🎁
                  </span>
                )
              ) : (
                item.logo_imagen ? (
                  <img
                    src={item.logo_imagen}
                    alt={`Logo ${item.nombre}`}
                    className={styles.cardImageLogo}
                  />
                ) : (
                  <span className={styles.cardIcon} style={{ backgroundColor: '#8b5cf6' }}>
                    {item.logo || '🏢'}
                  </span>
                )
              )}
            </div>
            <div>
              <h3>{item.nombre}</h3>
              <div className={styles.cardMeta}>
                <span className={`${styles.cardBadge} ${styles.idBadge}`}>
                  🆔 {item.id}
                </span>

                <span className={`${styles.cardBadge} ${styles.categoryBadge}`}>
                  {item.categoria}
                </span>

                {activeSection === 'emprendimientos' && (
                  <>
                    <span className={`${styles.cardBadge} ${styles.imageBadge}`}>
                      📍 {item.ciudad}
                    </span>
                    {item.propietario_id && (
                      <span className={`${styles.cardBadge} ${styles.propietarioBadge}`}>
                        👤 {getUsuarioById(item.propietario_id)?.usuario || 'Propietario'}
                      </span>
                    )}
                    {item.logo_imagen && (
                      <span className={`${styles.cardBadge} ${styles.imageBadge}`}>
                        📷 Con imagen
                      </span>
                    )}
                  </>
                )}

                {activeSection === 'premios' && (
                  <>
                    <span className={`${styles.cardBadge} ${item.disponible ? styles.availableBadge : styles.unavailableBadge}`}>
                      {item.disponible ? '✅ Disponible' : '❌ Agotado'}
                    </span>
                    <span className={`${styles.cardBadge} ${styles.pointsBadge}`}>
                      ⭐ {item.puntos?.toLocaleString()} pts
                    </span>
                    {item.imagen && (
                      <span className={`${styles.cardBadge} ${styles.imageBadge}`}>
                        📷 Con imagen
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={styles.cardBody}>
            {activeSection === 'emprendimientos' ? (
              <>
                {item.propietario_id && (
                  <div className={styles.cardField}>
                    <strong>👤 Propietario:</strong> {getUsuarioById(item.propietario_id)?.usuario || 'No disponible'}
                    {getUsuarioById(item.propietario_id) && (
                      <small style={{ marginLeft: '0.5rem', color: '#6b7280' }}>
                        ({getUsuarioById(item.propietario_id)?.rol === 'admin' ? 'Admin' : 'Colaborador'})
                      </small>
                    )}
                  </div>
                )}
                <div className={styles.cardField}>
                  <strong>📍 Ubicación:</strong> {item.ubicacion}, {item.ciudad}
                </div>
                <div className={styles.cardField}>
                  <strong>🕐 Horario:</strong> {item.horario || 'No especificado'}
                </div>
                <div className={styles.cardField}>
                  <strong>📱 Contacto:</strong>
                  <div className={styles.socialLinks}>
                    {item.whatsapp && (
                      <a href={item.whatsapp} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        WhatsApp
                      </a>
                    )}
                    {item.instagram && (
                      <a href={item.instagram} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        Instagram
                      </a>
                    )}
                    {item.tiktok && (
                      <a href={item.tiktok} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        TikTok
                      </a>
                    )}
                    {!item.whatsapp && !item.instagram && !item.tiktok && (
                      <span className={styles.noContact}>📭 Sin contacto</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={styles.cardField}>
                  <strong>📝 Descripción:</strong> {item.descripcion}
                </div>
                <div className={styles.cardField}>
                  <strong>📦 Stock:</strong> {item.stock ?? 0} unidades
                </div>
                {item.fechaVencimiento && (
                  <div className={styles.cardField}>
                    <strong>📅 Vence:</strong> {new Date(item.fechaVencimiento).toLocaleDateString()}
                  </div>
                )}
                <div className={styles.cardField}>
                  <strong>🔄 Veces canjeado:</strong> {item.vecesCanjeado || 0}
                </div>
              </>
            )}
          </div>

          <div className={styles.cardActions}>
            <button
              onClick={() => openEditModal(activeSection, item.id)}
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              ✏️ Editar
            </button>
            <button
              onClick={() => handleDelete(activeSection, item.id)}
              className={`${styles.btn} ${styles.btnDanger}`}
            >
              🗑️ Eliminar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};



// ============================================
// COMPONENTE ModalForm
// ============================================
const ModalForm = ({
  showModal,
  activeSection,
  formData: initialFormData,
  setFormData: setParentFormData,
  editingId,
  closeModal,
  handleUpdate,
  handleDelete,
  getSectionLabel,
  usuariosPropietarios,
  isUpdating = false
}) => {
  // ✅ Estado LOCAL para el modal
  const [localFormData, setLocalFormData] = useState(initialFormData);
  
  // ✅ Estado separado para la NUEVA imagen (File) - SOLUCIÓN PRINCIPAL
  const [nuevaImagenFile, setNuevaImagenFile] = useState(null);
  
  // ✅ URL para preview de la nueva imagen
  const [previewUrl, setPreviewUrl] = useState(null);

  // ✅ Solo sincronizar cuando se ABRE el modal (editingId cambia)
  useEffect(() => {
    if (editingId && initialFormData && Object.keys(initialFormData).length > 0) {
      setLocalFormData(initialFormData);
      // Resetear la nueva imagen al abrir el modal
      setNuevaImagenFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }
  }, [editingId]);

  // Limpiar preview al cerrar el modal
  useEffect(() => {
    if (!showModal && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setNuevaImagenFile(null);
    }
  }, [showModal]);

  if (!showModal) return null;

  const handleModalInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setLocalFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleImageSelect = (file, isPremio = false) => {
    console.log('🖼️ handleImageSelect - Archivo recibido:', file?.name, 'isPremio:', isPremio);
    console.log('🖼️ Tipo de archivo:', file instanceof File ? 'File object' : typeof file);

    if (!file || !(file instanceof File)) {
      console.error('❌ No se recibió un archivo válido');
      return;
    }

    if (isPremio) {
      // Guardar el archivo en el estado separado
      setNuevaImagenFile(file);
      
      // Crear URL para preview
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      
      // Limpiar la URL existente en localFormData
      setLocalFormData(prev => ({
        ...prev,
        imagen_url: null
      }));
      
      console.log('✅ Premio - Imagen guardada:', file.name);
    } else {
      // Guardar el archivo en el estado separado
      setNuevaImagenFile(file);
      
      // Crear URL para preview
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      
      // Limpiar el emoji y la URL existente
      setLocalFormData(prev => ({
        ...prev,
        logo: null,
        logo_imagen_url: null
      }));
      
      console.log('✅ Emprendimiento - Logo guardado:', file.name);
    }
  };

  const handleEmojiSelect = (emoji) => {
    // Limpiar la nueva imagen si existe
    if (nuevaImagenFile) {
      setNuevaImagenFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }
    
    setLocalFormData(prev => ({
      ...prev,
      logo: emoji,
      logo_imagen: null,
      logo_imagen_url: null
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Construir el objeto a enviar
    const datosAEnviar = {
      ...localFormData
    };
    
    // ✅ ELIMINAR el id del body (ya va en la URL)
    delete datosAEnviar.id;
    
    // 🔧 CORRECCIÓN: Normalizar 'activo' a booleano para evitar error 400
    if (datosAEnviar.activo !== undefined) {
      datosAEnviar.activo = datosAEnviar.activo === true || 
                            datosAEnviar.activo === 1 || 
                            datosAEnviar.activo === '1';
      console.log('🔄 activo normalizado a:', datosAEnviar.activo, 'tipo:', typeof datosAEnviar.activo);
    }
    
    // Limpiar campos que no deben enviarse para usuarios
    if (activeSection === 'usuarios') {
      delete datosAEnviar.fecha_registro;
      delete datosAEnviar.ultimo_acceso;
      delete datosAEnviar.google_id;
      delete datosAEnviar.foto_url;
    }
    
    // ✅ Si hay una nueva imagen, agregarla al objeto
    if (nuevaImagenFile) {
      if (activeSection === 'emprendimientos') {
        datosAEnviar.logo_imagen = nuevaImagenFile;
        console.log('📤 Enviando nuevo logo:', nuevaImagenFile.name);
      } else if (activeSection === 'premios') {
        datosAEnviar.imagen = nuevaImagenFile;
        console.log('📤 Enviando nueva imagen de premio:', nuevaImagenFile.name);
      }
    }
    
    console.log('📤 ¿Hay archivo para enviar?', !!datosAEnviar.logo_imagen || !!datosAEnviar.imagen);
    console.log('📤 ¿Es File?', (datosAEnviar.logo_imagen instanceof File) || (datosAEnviar.imagen instanceof File));
    
    await handleUpdate(activeSection, datosAEnviar);
    
    // Limpiar preview después de enviar
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setNuevaImagenFile(null);
    }
  };

  // Determinar qué imagen mostrar en el preview
  const getCurrentImageForPreview = () => {
    if (previewUrl) return previewUrl; // Nueva imagen seleccionada
    if (activeSection === 'emprendimientos' && localFormData.logo_imagen_url) {
      return localFormData.logo_imagen_url; // Imagen existente del emprendimiento
    }
    if (activeSection === 'premios' && localFormData.imagen_url) {
      return localFormData.imagen_url; // Imagen existente del premio
    }
    return null; // Sin imagen
  };

  return (
    <div className={`${styles.modal} ${showModal ? styles.show : ''}`}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3>✏️ Editar {getSectionLabel(activeSection)}</h3>
          <button onClick={closeModal} className={styles.closeBtn} aria-label="Cerrar">
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.idInfo}>
            <span><strong>🆔 ID:</strong> {editingId}</span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              {activeSection === 'emprendimientos' && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nombre *</label>
                    <input
                      type="text"
                      name="nombre"
                      value={localFormData.nombre || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Categoría *</label>
                    <input
                      type="text"
                      name="categoria"
                      value={localFormData.categoria || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Ubicación</label>
                    <input
                      type="text"
                      name="ubicacion"
                      value={localFormData.ubicacion || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Ciudad</label>
                    <input
                      type="text"
                      name="ciudad"
                      value={localFormData.ciudad || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Horario</label>
                    <input
                      type="text"
                      name="horario"
                      value={localFormData.horario || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroupFull}>
                    <label className={styles.formLabel}>Propietario del negocio *</label>
                    <select
                      name="propietario_id"
                      value={localFormData.propietario_id || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                      required
                    >
                      <option value="">-- Seleccionar propietario --</option>
                      {(usuariosPropietarios || []).map(usuario => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.usuario} ({usuario.rol === 'admin' ? '👑 Admin' : '👷 Colaborador'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroupFull}>
                    <label className={styles.formLabel}>Redes Sociales</label>
                    <div className={styles.socialInputs}>
                      <input
                        type="text"
                        name="whatsapp"
                        value={localFormData.whatsapp || ''}
                        onChange={handleModalInputChange}
                        className={styles.formInput}
                        placeholder="WhatsApp URL"
                      />
                      <input
                        type="text"
                        name="instagram"
                        value={localFormData.instagram || ''}
                        onChange={handleModalInputChange}
                        className={styles.formInput}
                        placeholder="Instagram URL"
                      />
                      <input
                        type="text"
                        name="tiktok"
                        value={localFormData.tiktok || ''}
                        onChange={handleModalInputChange}
                        className={styles.formInput}
                        placeholder="TikTok URL"
                      />
                    </div>
                  </div>

                  <div className={styles.formGroupFull}>
                    <label className={styles.formLabel}>Logo del emprendimiento</label>
                    <DragDropLogoConEmoji
                      onImageSelect={(file) => handleImageSelect(file, false)}
                      onEmojiSelect={handleEmojiSelect}
                      currentLogo={localFormData.logo}
                      currentImage={getCurrentImageForPreview()}
                    />
                  </div>
                </>
              )}

              {activeSection === 'premios' && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nombre *</label>
                    <input
                      type="text"
                      name="nombre"
                      value={localFormData.nombre || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Categoría *</label>
                    <input
                      type="text"
                      name="categoria"
                      value={localFormData.categoria || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Puntos</label>
                    <input
                      type="number"
                      name="puntos"
                      value={localFormData.puntos || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Descripción</label>
                    <input
                      type="text"
                      name="descripcion"
                      value={localFormData.descripcion || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Stock</label>
                    <input
                      type="number"
                      name="stock"
                      value={localFormData.stock || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Fecha de vencimiento</label>
                    <input
                      type="date"
                      name="fechaVencimiento"
                      value={localFormData.fechaVencimiento ? (localFormData.fechaVencimiento.split('T')[0] || localFormData.fechaVencimiento) : ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Veces canjeado</label>
                    <input
                      type="number"
                      name="vecesCanjeado"
                      value={localFormData.vecesCanjeado || 0}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                      min="0"
                    />
                  </div>
                  <div className={styles.formGroupFull}>
                    <label className={styles.formLabel}>Imagen del Premio</label>
                    <DragDropLogo
                      onImageSelect={(file) => handleImageSelect(file, true)}
                      currentImage={getCurrentImageForPreview()}
                      isPremio={true}
                    />
                    <small className={styles.helperText}>
                      Sube una imagen para el premio (PNG, JPG, GIF hasta 2MB)
                    </small>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <input
                        type="checkbox"
                        name="disponible"
                        checked={localFormData.disponible || false}
                        onChange={handleModalInputChange}
                        className={styles.checkboxInput}
                      />
                      <span>Disponible para canje</span>
                    </label>
                  </div>
                </>
              )}

              {activeSection === 'usuarios' && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Usuario *</label>
                    <input
                      type="text"
                      name="usuario"
                      value={localFormData.usuario || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={localFormData.email || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Contraseña</label>
                    <input
                      type="password"
                      name="contra"
                      value={localFormData.contra || ''}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                      placeholder="Dejar en blanco para no cambiar"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Puntos acumulados</label>
                    <input
                      type="number"
                      name="puntosAcumulados"
                      value={localFormData.puntosAcumulados || 0}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                      min="0"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Rol</label>
                    <select
                      name="rol"
                      value={localFormData.rol || 'usuario'}
                      onChange={handleModalInputChange}
                      className={styles.formInput}
                    >
                      <option value="admin">👑 Administrador</option>
                      <option value="colab">👷 Colaborador</option>
                      <option value="usuario">👤 Usuario</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className={styles.modalActions}>
              <button type="submit" disabled={isUpdating} className={`${styles.btn} ${styles.btnPrimary}`}>
                {isUpdating ? '💾 Guardando...' : '💾 Guardar'}
              </button>
              <button type="button" onClick={closeModal} className={`${styles.btn} ${styles.btnOutline}`}>
                ❌ Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("¿Eliminar este elemento?")) {
                    handleDelete(activeSection, editingId);
                    closeModal();
                  }
                }}
                className={`${styles.btn} ${styles.btnDanger}`}
              >
                🗑️ Eliminar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL Ini (CON NAVEGACIÓN SUPERIOR Y MODALES PARA AGREGAR)
// ============================================
export default function Ini() {
  const [emprendimientos, setEmprendimientos] = useState([]);
  const [premios, setPremios] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [activeSection, setActiveSection] = useState('emprendimientos');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const [formData, setFormData] = useState({});
  const [addFormData, setAddFormData] = useState({});
  const [editingId, setEditingId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [showAddEmprendimientoModal, setShowAddEmprendimientoModal] = useState(false);
  const [showAddPremioModal, setShowAddPremioModal] = useState(false);
  const [showAddUsuarioModal, setShowAddUsuarioModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [minPoints, setMinPoints] = useState('');
  const [maxPoints, setMaxPoints] = useState('');

  const [puntosConfig, setPuntosConfig] = useState({
    umbral_minimo: 0.99,
    puntos_fijos: 5,
    tasa_conversion: 1,
    redondeo: 'none',
    rango_bronce_max: 999,
    rango_plata_min: 1000,
    rango_plata_max: 4999,
    rango_oro_min: 5000,
    rango_oro_max: 9999,
    rango_diamante_min: 10000,
    valor_punto: 0.005
  });

  const [promociones, setPromociones] = useState([]);

  // ============================================
  // SOCKET.IO CONFIGURACIÓN - ✅ CON RUTAS RELATIVAS
  // ============================================
  const socketRef = useRef(null);

  useEffect(() => {
    // Conectar a Socket.IO con ruta relativa
    const socket = io('/', {
      transports: ['websocket'],
      autoConnect: true
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Conectado a Socket.IO');
      setIsSocketConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('❌ Desconectado de Socket.IO');
      setIsSocketConnected(false);
    });

    // ===== EVENTOS DE EMPRENDIMIENTOS =====
    socket.on('nuevo_emprendimiento', (data) => {
      console.log('📡 Nuevo emprendimiento en tiempo real:', data);
      setEmprendimientos(prev => {
        // Evitar duplicados
        if (prev.some(item => item.id === data.id)) return prev;
        return [data, ...prev];
      });
    });

    socket.on('emprendimiento_actualizado', (data) => {
      console.log('📡 Emprendimiento actualizado:', data);
      setEmprendimientos(prev => 
        prev.map(item => item.id === data.id ? data : item)
      );
    });

    socket.on('emprendimiento_eliminado', (data) => {
      console.log('📡 Emprendimiento eliminado:', data);
      setEmprendimientos(prev => 
        prev.filter(item => item.id !== data.id)
      );
    });

    // ===== EVENTOS DE PREMIOS =====
    socket.on('premio_creado', (data) => {
      console.log('📡 Nuevo premio en tiempo real:', data);
      if (data.premio) {
        setPremios(prev => {
          if (prev.some(item => item.id === data.premio.id)) return prev;
          return [data.premio, ...prev];
        });
      }
    });

    socket.on('premio_actualizado', (data) => {
      console.log('📡 Premio actualizado:', data);
      if (data.premio) {
        setPremios(prev => 
          prev.map(item => item.id === data.premio.id ? data.premio : item)
        );
      }
    });

    socket.on('premio_eliminado', (data) => {
      console.log('📡 Premio eliminado:', data);
      if (data.premio) {
        setPremios(prev => 
          prev.filter(item => item.id !== data.premio.id)
        );
      }
    });

    // ===== EVENTOS DE USUARIOS =====
    socket.on('usuario_creado', (data) => {
      console.log('📡 Usuario creado en tiempo real:', data);
      if (data.usuario) {
        setUsuarios(prev => {
          if (prev.some(item => item.id === data.usuario.id)) return prev;
          return [data.usuario, ...prev];
        });
      }
    });

    socket.on('usuario_actualizado', (data) => {
      console.log('📡 Usuario actualizado:', data);
      setUsuarios(prev => 
        prev.map(item => item.id === data.user_id ? { ...item, ...data } : item)
      );
    });

    socket.on('usuario_eliminado', (data) => {
      console.log('📡 Usuario eliminado:', data);
      setUsuarios(prev => 
        prev.filter(item => item.id !== data.user_id)
      );
    });

    // ===== EVENTOS DE CONFIGURACIÓN =====
    socket.on('config_puntos_actualizada', (data) => {
      console.log('📡 Configuración actualizada en tiempo real:', data);
      if (data.config) {
        setPuntosConfig(data.config);
      }
    });

    // ===== EVENTOS DE PUNTOS =====
    socket.on('puntos_actualizados', (data) => {
      console.log('📡 Puntos actualizados en tiempo real:', data);
      setUsuarios(prev => 
        prev.map(item => {
          if (item.id === data.user_id) {
            return {
              ...item,
              puntosAcumulados: data.puntos_totales,
              nivel: data.nuevo_nivel || item.nivel
            };
          }
          return item;
        })
      );
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('nuevo_emprendimiento');
      socket.off('emprendimiento_actualizado');
      socket.off('emprendimiento_eliminado');
      socket.off('premio_creado');
      socket.off('premio_actualizado');
      socket.off('premio_eliminado');
      socket.off('usuario_creado');
      socket.off('usuario_actualizado');
      socket.off('usuario_eliminado');
      socket.off('config_puntos_actualizada');
      socket.off('puntos_actualizados');
      socket.disconnect();
    };
  }, []);

  // ============================================
  // FUNCIONES DE AUTENTICACIÓN
  // ============================================

  const verificarToken = () => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (!token || !user) {
      console.error('❌ No hay token o usuario guardado');
      return false;
    }

    try {
      const userData = JSON.parse(user);
      console.log('✅ Sesión válida para:', userData.usuario, 'Rol:', userData.rol);
      return true;
    } catch (e) {
      console.error('❌ Error parseando usuario:', e);
      return false;
    }
  };

  const getAuthToken = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('⚠️ No hay token de autenticación');
      return null;
    }
    return token;
  };

  const getAuthHeaders = (multipart = false) => {
    const token = getAuthToken();

    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    const headers = {
      'Authorization': `Bearer ${token}`
    };

    if (!multipart) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  };

  const redirectToLogin = () => {
    if (redirecting) return;
    setRedirecting(true);
    setError('Tu sesión ha expirado o no has iniciado sesión. Redirigiendo al login...');
    setTimeout(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }, 2000);
  };

  const premioEmojiSuggestions = {
    'Viajes': ['✈️', '🏖️', '🗺️', '🏨', '🚗', '⛰️'],
    'Electrónica': ['📱', '💻', '🎮', '📺', '🎧', '⌚'],
    'Hogar': ['🏠', '🛋️', '🍳', '🧹', '🛏️', '🚿'],
    'Moda': ['👕', '👖', '👟', '👜', '👓', '🧥'],
    'Experiencias': ['🎫', '🎭', '🎪', '🍽️', '🎳', '🎨'],
    'Descuentos': ['💸', '💰', '💳', '🏷️', '🎁', '📉'],
    'Otros': ['🎯', '🏆', '⭐', '✨', '💎', '🎁']
  };

  // ============================================
  // FUNCIONES CRUD - ✅ CON RUTAS RELATIVAS
  // ============================================

  const cargarUsuarios = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/admin-registro', {
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success) {
        setUsuarios(data.usuarios || []);
      } else {
        setError('Error al cargar usuarios');
      }
    } catch (error) {
      console.error('Error cargando usuarios:', error);
      if (error.message === 'No hay token de autenticación') {
        redirectToLogin();
      } else {
        setError('Error de conexión al cargar usuarios');
      }
    }
  };

  const cargarEmprendimientos = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/emprendimientos', {
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      console.log('📥 Respuesta emprendimientos:', data);

      if (data.success) {
        setEmprendimientos(data.data || []);
        console.log('✅ Emprendimientos cargados:', data.data?.length);
      } else {
        console.error('❌ Error:', data.message);
        setError('Error al cargar emprendimientos');
      }
    } catch (error) {
      console.error('Error cargando emprendimientos:', error);
      if (error.message === 'No hay token de autenticación') {
        redirectToLogin();
      }
    }
  };

  const cargarPremios = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/premios', {
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success) {
        setPremios(data.premios || []);
      }
    } catch (error) {
      console.error('Error cargando premios:', error);
      if (error.message === 'No hay token de autenticación') {
        redirectToLogin();
      }
    }
  };

  const cargarPromociones = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/promociones', {
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success) {
        setPromociones(data.promociones || []);
      }
    } catch (error) {
      console.error('Error cargando promociones:', error);
      if (error.message === 'No hay token de autenticación') {
        redirectToLogin();
      }
    }
  };

  const cargarConfigPuntos = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/config-puntos', {
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success && data.config) {
        setPuntosConfig(data.config);
        console.log('📥 Configuración cargada desde BD:', data.config);
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      if (error.message === 'No hay token de autenticación') {
        redirectToLogin();
      }
    }
  };

  const cargarTodosLosDatos = async () => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      await Promise.all([
        cargarUsuarios(),
        cargarEmprendimientos(),
        cargarPremios(),
        cargarPromociones(),
        cargarConfigPuntos()
      ]);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      if (!error.message?.includes('token')) {
        setError('Error al cargar los datos. Verifica la conexión con el servidor.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Effect principal
  useEffect(() => {
    console.log('🔍 Ini montado - Verificando autenticación...');

    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    console.log('Token existe?', !!token);
    console.log('User existe?', !!user);

    if (!token || !user) {
      console.log('❌ No hay sesión, redirigiendo a login');
      redirectToLogin();
      return;
    }

    try {
      const userData = JSON.parse(user);
      console.log('👤 Usuario logueado:', userData.usuario, 'Rol:', userData.rol);

      if (userData.rol !== 'admin') {
        console.error('❌ Usuario no es admin, rol:', userData.rol);
        setError('No tienes permisos de administrador');
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
        return;
      }
    } catch (e) {
      console.error('Error parseando user:', e);
      redirectToLogin();
      return;
    }

    cargarTodosLosDatos();
  }, []);

  const handleAddUsuario = async (data) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    setIsSubmitting(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/admin-registro', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarUsuarios();
        alert('✅ Usuario creado exitosamente');
        resetAddForm();
        setShowAddUsuarioModal(false);
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear usuario');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUsuario = async (id, data) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    setIsUpdating(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/admin-registro/${id}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(data)
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarUsuarios();
        alert('✅ Usuario actualizado');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al actualizar');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteUsuario = async (id) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    if (!window.confirm('¿Eliminar este usuario?')) return;

    setIsLoading(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/admin-registro/${id}`, {
        method: 'DELETE',
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarUsuarios();
        alert('✅ Usuario eliminado');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEmprendimiento = async (data) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('nombre', data.nombre);
      formData.append('categoria', data.categoria);
      formData.append('ubicacion', data.ubicacion);
      formData.append('ciudad', data.ciudad);
      if (data.horario) formData.append('horario', data.horario);
      if (data.whatsapp) formData.append('whatsapp', data.whatsapp);
      if (data.instagram) formData.append('instagram', data.instagram);
      if (data.tiktok) formData.append('tiktok', data.tiktok);
      if (data.logo) formData.append('logo', data.logo);
      if (data.logoImagen && data.logoImagen instanceof File) {
        formData.append('logo_imagen', data.logoImagen);
      }
      if (data.propietario_id) formData.append('propietario_id', data.propietario_id);

      const headers = getAuthHeaders(true);
      const response = await fetch('/api/emprendimientos', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarEmprendimientos();
        alert('✅ Emprendimiento creado exitosamente');
        resetAddForm();
        setShowAddEmprendimientoModal(false);
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear emprendimiento');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ⭐ CORRECCIÓN: normalizar activo a número 0/1 y priorizar imagen sobre emoji
  const handleUpdateEmprendimiento = async (id, data) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    setIsUpdating(true);
    try {
      // ✅ LOG: Verificar qué datos llegan
      console.log('🔍 DATOS RECIBIDOS en handleUpdateEmprendimiento:', {
        id,
        tiene_logo_imagen: !!data.logo_imagen,
        logo_imagen_es_file: data.logo_imagen instanceof File,
        logo_imagen_nombre: data.logo_imagen?.name,
        logo_valor: data.logo,
        tiene_imagen_existente: !!data.logo_imagen_url
      });

      const formData = new FormData();
      if (data.nombre !== undefined) formData.append('nombre', data.nombre);
      if (data.categoria !== undefined) formData.append('categoria', data.categoria);
      if (data.ubicacion !== undefined) formData.append('ubicacion', data.ubicacion);
      if (data.ciudad !== undefined) formData.append('ciudad', data.ciudad);
      if (data.horario !== undefined) formData.append('horario', data.horario || '');
      if (data.whatsapp !== undefined) formData.append('whatsapp', data.whatsapp || '');
      if (data.instagram !== undefined) formData.append('instagram', data.instagram || '');
      if (data.tiktok !== undefined) formData.append('tiktok', data.tiktok || '');

      // ✅ PRIORIDAD: Si hay imagen, el emoji se limpia (se guarda null)
      const hasNewImage = data.logo_imagen && data.logo_imagen instanceof File;

      console.log('📸 ¿Hay nueva imagen?', hasNewImage);
      console.log('📸 data.logo_imagen:', data.logo_imagen);

      if (hasNewImage) {
        // Cuando se sube una nueva imagen, limpiar el emoji
        console.log('✅ Agregando imagen al FormData:', data.logo_imagen.name);
        formData.append('logo_imagen', data.logo_imagen);
        formData.append('logo', ''); // Enviar vacío para que el backend lo guarde como NULL
      } else {
        console.log('❌ NO hay imagen nueva, solo emoji:', data.logo);
        // Solo enviar emoji si NO hay imagen nueva y el emoji tiene valor
        if (data.logo !== undefined && data.logo !== null && data.logo !== '') {
          formData.append('logo', data.logo);
        }
        // Mantener imagen existente (no se envía porque ya está en BD)
      }

      if (data.propietario_id !== undefined) formData.append('propietario_id', parseInt(data.propietario_id));

      // Convertir activo a número 0 o 1
      let activoValue = 1;
      if (data.activo !== undefined) {
        if (data.activo === true || data.activo === 'true' || data.activo === 1 || data.activo === '1') {
          activoValue = 1;
        } else {
          activoValue = 0;
        }
      }
      formData.append('activo', activoValue);

      // ✅ LOG: Verificar qué se envía en FormData
      console.log('📤 FormData a enviar:');
      for (let pair of formData.entries()) {
        if (pair[0] === 'logo_imagen') {
          console.log(`   ${pair[0]}: [ARCHIVO] ${pair[1].name} (${pair[1].size} bytes)`);
        } else {
          console.log(`   ${pair[0]}: ${pair[1]}`);
        }
      }

      const headers = getAuthHeaders(true);
      const response = await fetch(`/api/emprendimientos/${id}`, {
        method: 'PUT',
        headers: headers,
        body: formData
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      console.log('📥 Respuesta del servidor:', result);

      if (result.success) {
        await cargarEmprendimientos();
        alert('✅ Emprendimiento actualizado');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al actualizar');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteEmprendimiento = async (id) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    if (!window.confirm('¿Eliminar este emprendimiento?')) return;

    setIsLoading(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/emprendimientos/${id}`, {
        method: 'DELETE',
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarEmprendimientos();
        alert('✅ Emprendimiento eliminado');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPremio = async (data) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('nombre', data.nombre);
      formData.append('categoria', data.categoria);
      formData.append('puntos', data.puntos);
      formData.append('descripcion', data.descripcion);
      formData.append('stock', data.stock);
      if (data.fechaVencimiento) formData.append('fechaVencimiento', data.fechaVencimiento);
      formData.append('disponible', data.disponible !== false ? '1' : '0');

      if (data.imagen && data.imagen instanceof File) {
        formData.append('imagen', data.imagen);
      }

      const headers = getAuthHeaders(true);
      const response = await fetch('/api/premios', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarPremios();
        alert('✅ Premio creado exitosamente');
        resetAddForm();
        setShowAddPremioModal(false);
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear premio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePremio = async (id, data) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    setIsUpdating(true);
    try {
      const formData = new FormData();
      if (data.nombre !== undefined) formData.append('nombre', data.nombre);
      if (data.categoria !== undefined) formData.append('categoria', data.categoria);
      if (data.puntos !== undefined) formData.append('puntos', data.puntos);
      if (data.descripcion !== undefined) formData.append('descripcion', data.descripcion);
      if (data.stock !== undefined) formData.append('stock', data.stock);
      if (data.fechaVencimiento) formData.append('fechaVencimiento', data.fechaVencimiento);
      if (data.disponible !== undefined) formData.append('disponible', data.disponible ? '1' : '0');
      if (data.vecesCanjeado !== undefined) formData.append('vecesCanjeado', data.vecesCanjeado);

      if (data.imagen && data.imagen instanceof File) {
        formData.append('imagen', data.imagen);
      }

      const headers = getAuthHeaders(true);
      const response = await fetch(`/api/premios/${id}`, {
        method: 'PUT',
        headers: headers,
        body: formData
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarPremios();
        alert('✅ Premio actualizado');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al actualizar');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeletePremio = async (id) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    if (!window.confirm('¿Eliminar este premio?')) return;

    setIsLoading(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/premios/${id}`, {
        method: 'DELETE',
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarPremios();
        alert('✅ Premio eliminado');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePuntosConfigUpdate = async (newConfig) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/config-puntos', {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(newConfig)
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        setPuntosConfig(newConfig);
        alert('✅ Configuración guardada');
        return;
      }
    } catch (error) {
      console.error('Error guardando configuración:', error);
      throw error;
    }
  };

  const handleAddPromocion = async (promoData) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    setIsSubmitting(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/promociones', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(promoData)
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarPromociones();
        alert('✅ Promoción creada exitosamente');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear promoción');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePromocion = async (id, promoData) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    setIsUpdating(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/promociones/${id}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(promoData)
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarPromociones();
        alert('✅ Promoción actualizada');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al actualizar');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeletePromocion = async (id) => {
    if (!verificarToken()) {
      redirectToLogin();
      return;
    }

    if (!window.confirm('¿Eliminar esta promoción?')) return;

    setIsLoading(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/promociones/${id}`, {
        method: 'DELETE',
        headers: headers
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const result = await response.json();
      if (result.success) {
        await cargarPromociones();
        alert('✅ Promoción eliminada');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePromocionActivo = async (id) => {
    const promo = promociones.find(p => p.id === id);
    if (promo) {
      await handleUpdatePromocion(id, { ...promo, activo: !promo.activo });
    }
  };

  // ============================================
  // FUNCIONES DE UTILIDAD
  // ============================================

  const getSectionData = (section) => {
    switch (section) {
      case 'emprendimientos': return emprendimientos || [];
      case 'premios': return premios || [];
      case 'usuarios': return usuarios || [];
      default: return [];
    }
  };

  const getSectionLabel = (section) => {
    switch (section) {
      case 'emprendimientos': return 'Emprendimiento';
      case 'premios': return 'Premio';
      case 'usuarios': return 'Usuario';
      default: return '';
    }
  };

  const getUsuarioById = (id) => {
    return (usuarios || []).find(u => u.id === id);
  };

  const usuariosPropietarios = useMemo(() => {
    return (usuarios || []).filter(u => u.rol === 'admin' || u.rol === 'colab');
  }, [usuarios]);

  const uniqueCategories = useMemo(() => {
    const data = getSectionData(activeSection);
    if (activeSection === 'usuarios') {
      const roles = data.map(item => item.rol);
      return [...new Set(roles)].filter(Boolean).sort();
    }
    const categories = data.map(item => item.categoria);
    return [...new Set(categories)].filter(Boolean).sort();
  }, [activeSection, emprendimientos, premios, usuarios]);

  const uniqueCities = useMemo(() => {
    if (activeSection !== 'emprendimientos') return [];
    return [...new Set((emprendimientos || []).map(e => e.ciudad).filter(Boolean))].sort();
  }, [activeSection, emprendimientos]);

  const filteredData = useMemo(() => {
    const data = getSectionData(activeSection);

    if (!data || !Array.isArray(data)) return [];

    return data.filter(item => {
      const matchesSearch = searchTerm === '' ||
        item.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.usuario?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.email?.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesCategory = true;
      if (categoryFilter !== '') {
        if (activeSection === 'usuarios') {
          matchesCategory = item.rol === categoryFilter;
        } else {
          matchesCategory = item.categoria === categoryFilter;
        }
      }

      const matchesCity = cityFilter === '' ||
        (activeSection === 'emprendimientos' && item.ciudad === cityFilter);

      let matchesPoints = true;
      if (activeSection === 'premios' && item.puntos) {
        if (minPoints && item.puntos < parseInt(minPoints)) matchesPoints = false;
        if (maxPoints && item.puntos > parseInt(maxPoints)) matchesPoints = false;
      }

      return matchesSearch && matchesCategory && matchesCity && matchesPoints;
    });
  }, [activeSection, emprendimientos, premios, usuarios, searchTerm, categoryFilter, cityFilter, minPoints, maxPoints]);

  const handleInputChange = (e, isAddForm = false) => {
    const { name, value, type, checked } = e.target;

    if (isAddForm) {
      setAddFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const openEditModal = (section, id) => {
    const data = getSectionData(section);
    const item = data.find(item => item.id === id);
    if (item) {
      const itemCopy = { ...item };

      if (section === 'emprendimientos' && itemCopy.activo !== undefined) {
        itemCopy.activo = itemCopy.activo === 1 || itemCopy.activo === true;
      }

      if (section === 'emprendimientos') {
        // ✅ Guardar la URL existente para mostrar preview
        itemCopy.logo_imagen_url = itemCopy.logo_imagen;
        // ✅ IMPORTANTE: NO establecer a null si ya tiene imagen
        // Solo si NO tiene imagen existente
        if (!itemCopy.logo_imagen) {
          itemCopy.logo_imagen = null;
        }
        // Si tiene imagen, mantenerla como string para mostrar
        // y tener un campo separado para la nueva
      }

      if (section === 'premios') {
        itemCopy.imagen_url = itemCopy.imagen;
        if (!itemCopy.imagen) {
          itemCopy.imagen = null;
        }
      }

      setFormData(itemCopy);
      setEditingId(id);
      setShowModal(true);
    }
  };


  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    // setFormData({});
  };


  const handleAdd = (section, data) => {
    switch (section) {
      case 'emprendimientos':
        handleAddEmprendimiento(data);
        break;
      case 'premios':
        handleAddPremio(data);
        break;
      case 'usuarios':
        handleAddUsuario(data);
        break;
    }
  };


  const handleUpdate = async (section, data = null) => {
    // Si se pasaron datos directamente, usarlos; si no, usar formData
    const datosAActualizar = data || formData;

    console.log('📤 handleUpdate - datosAActualizar:', {
      logo_imagen: datosAActualizar.logo_imagen,
      esFile: datosAActualizar.logo_imagen instanceof File,
      nombre_archivo: datosAActualizar.logo_imagen?.name
    });

    switch (section) {
      case 'emprendimientos':
        await handleUpdateEmprendimiento(editingId, datosAActualizar);
        break;
      case 'premios':
        await handleUpdatePremio(editingId, datosAActualizar);
        break;
      case 'usuarios':
        await handleUpdateUsuario(editingId, datosAActualizar);
        break;
    }
    closeModal();
  };

  const handleDelete = (section, id) => {
    switch (section) {
      case 'emprendimientos':
        handleDeleteEmprendimiento(id);
        break;
      case 'premios':
        handleDeletePremio(id);
        break;
      case 'usuarios':
        handleDeleteUsuario(id);
        break;
    }
  };

  const resetAddForm = () => {
    setAddFormData({});
  };

  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setCityFilter('');
    setMinPoints('');
    setMaxPoints('');
  };

  const handleSectionChange = (sectionId) => {
    console.log('Cambiando a sección:', sectionId);
    setActiveSection(sectionId);
    resetAddForm();
    resetFilters();
  };

  if (redirecting) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>{error || 'Verificando autenticación...'}</p>
      </div>
    );
  }

  return (
    <div className={styles.adminContainer}>
      {/* INDICADOR DE CONEXIÓN SOCKET.IO */}
      <div className={styles.socketStatus}>
        {isSocketConnected ? (
          <span className={styles.connected}>🟢 Conectado en tiempo real</span>
        ) : (
          <span className={styles.disconnected}>🔴 Conectando...</span>
        )}
      </div>

      {/* BARRA DE NAVEGACIÓN SUPERIOR */}
      <div className={styles.topNavBar}>
        <nav className={styles.navMenuHorizontal}>
          {[
            { id: 'emprendimientos', label: '🏢 Emprendimientos' },
            { id: 'promociones', label: '🎯 Promociones' },
            { id: 'premios', label: '🎁 Premios' },
            { id: 'calculadora', label: '📊 Calculadora PyG' },
            { id: 'usuarios', label: '👥 Usuarios' },
            { id: 'configuracion', label: '⚙️ Reglas de Puntos' }
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleSectionChange(id)}
              className={`${styles.navBtnHorizontal} ${activeSection === id ? styles.active : ''}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {error && !redirecting && (
        <div className={styles.errorBanner}>
          ⚠️ {error}
          <button onClick={cargarTodosLosDatos} className={styles.retryBtn}>
            Reintentar
          </button>
        </div>
      )}

      <div className={styles.adminGrid}>
        <main >
          <header className={styles.sectionHeader}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <h2>
                {activeSection === 'emprendimientos' && '🏢 Gestión de Emprendimientos'}
                {activeSection === 'promociones' && '🎯 Gestión de Promociones'}
                {activeSection === 'premios' && '🎁 Gestión de Premios'}
                {activeSection === 'calculadora' && '📊 Calculadora de Pérdidas y Ganancias'}
                {activeSection === 'usuarios' && '👥 Gestión de Administradores y Colaboradores'}
                {activeSection === 'configuracion' && '⚙️ Reglas de Puntos Personalizables'}
              </h2>
              {activeSection === 'emprendimientos' && (
                <button
                  onClick={() => {
                    resetAddForm();
                    setShowAddEmprendimientoModal(true);
                  }}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ fontSize: '0.95rem', padding: '0.75rem 1.25rem' }}
                >
                  ➕ Agregar Emprendimiento
                </button>
              )}
              {activeSection === 'premios' && (
                <button
                  onClick={() => {
                    resetAddForm();
                    setShowAddPremioModal(true);
                  }}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ fontSize: '0.95rem', padding: '0.75rem 1.25rem' }}
                >
                  ➕ Agregar Premio
                </button>
              )}
              {activeSection === 'usuarios' && (
                <button
                  onClick={() => {
                    resetAddForm();
                    setShowAddUsuarioModal(true);
                  }}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ fontSize: '0.95rem', padding: '0.75rem 1.25rem' }}
                >
                  ➕ Agregar Usuario
                </button>
              )}
            </div>
          </header>

          <div className={styles.mainContentInner}>
            {activeSection === 'calculadora' && (
              <CalculadoraPyG
                puntosConfig={puntosConfig}
                promociones={promociones}
                premios={premios}
                usuarios={usuarios}
              />
            )}

            {activeSection === 'configuracion' && (
              <PuntosConfig
                config={puntosConfig}
                onUpdate={handlePuntosConfigUpdate}
              />
            )}

            {activeSection === 'promociones' && (
              <PromocionesManager
                promociones={promociones}
                emprendimientos={emprendimientos}
                onAdd={handleAddPromocion}
                onUpdate={handleUpdatePromocion}
                onDelete={handleDeletePromocion}
                onToggleActivo={handleTogglePromocionActivo}
              />
            )}

            {(activeSection === 'emprendimientos' || activeSection === 'premios' || activeSection === 'usuarios') && (
              <>
                <FiltersSection
                  activeSection={activeSection}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  categoryFilter={categoryFilter}
                  setCategoryFilter={setCategoryFilter}
                  cityFilter={cityFilter}
                  setCityFilter={setCityFilter}
                  minPoints={minPoints}
                  setMinPoints={setMinPoints}
                  maxPoints={maxPoints}
                  setMaxPoints={setMaxPoints}
                  uniqueCategories={uniqueCategories}
                  uniqueCities={uniqueCities}
                  filteredData={filteredData}
                  getSectionData={getSectionData}
                  resetFilters={resetFilters}
                />

                <section >
                  <div className={styles.cardsSectionHeader}>
                    <h4>
                      {activeSection === 'emprendimientos' ? '🏢 Todos los Emprendimientos' :
                        activeSection === 'premios' ? '🎁 Premios Disponibles' :
                          '👥 Administradores y Colaboradores'}
                    </h4>
                    <span className={styles.resultsCount}>
                      {activeSection === 'usuarios'
                        ? filteredData.filter(u => u.rol === 'admin' || u.rol === 'colab').length
                        : filteredData.length} de {activeSection === 'usuarios'
                          ? (usuarios || []).filter(u => u.rol === 'admin' || u.rol === 'colab').length
                          : getSectionData(activeSection).length}
                    </span>
                  </div>

                  <Cards
                    activeSection={activeSection}
                    filteredData={filteredData}
                    isLoading={isLoading}
                    getSectionLabel={getSectionLabel}
                    resetFilters={resetFilters}
                    openEditModal={openEditModal}
                    handleDelete={handleDelete}
                    getUsuarioById={getUsuarioById}
                  />
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      {/* MODAL PARA AGREGAR EMPRENDIMIENTO */}
      {showAddEmprendimientoModal && (
        <div className={`${styles.modal} ${styles.show}`} style={{ display: 'flex' }}>
          <div className={styles.modalContent} style={{ maxWidth: '900px' }}>
            <div className={styles.modalHeader}>
              <h3>➕ Nuevo Emprendimiento</h3>
              <button
                onClick={() => setShowAddEmprendimientoModal(false)}
                className={styles.closeBtn}
                aria-label="Cerrar"
              >
                &times;
              </button>
            </div>
            <div  >
              <AddForm
                activeSection="emprendimientos"
                addFormData={addFormData}
                handleInputChange={handleInputChange}
                handleAdd={(section, data) => {
                  handleAddEmprendimiento(data);
                }}
                resetAddForm={resetAddForm}
                premioEmojiSuggestions={premioEmojiSuggestions}
                usuariosPropietarios={usuariosPropietarios}
                isSubmitting={isSubmitting}
                onSuccess={() => setShowAddEmprendimientoModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA AGREGAR PREMIO */}
      {showAddPremioModal && (
        <div className={`${styles.modal} ${styles.show}`} style={{ display: 'flex' }}>
          <div className={styles.modalContent} style={{ maxWidth: '900px' }}>
            <div className={styles.modalHeader}>
              <h3>➕ Nuevo Premio</h3>
              <button
                onClick={() => setShowAddPremioModal(false)}
                className={styles.closeBtn}
                aria-label="Cerrar"
              >
                &times;
              </button>
            </div>
            <div className={styles.modalBody} style={{ padding: '2rem' }}>
              <AddForm
                activeSection="premios"
                addFormData={addFormData}
                handleInputChange={handleInputChange}
                handleAdd={(section, data) => {
                  handleAddPremio(data);
                }}
                resetAddForm={resetAddForm}
                premioEmojiSuggestions={premioEmojiSuggestions}
                usuariosPropietarios={usuariosPropietarios}
                isSubmitting={isSubmitting}
                onSuccess={() => setShowAddPremioModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA AGREGAR USUARIO */}
      {showAddUsuarioModal && (
        <div className={`${styles.modal} ${styles.show}`} style={{ display: 'flex' }}>
          <div className={styles.modalContent} style={{ maxWidth: '900px' }}>
            <div className={styles.modalHeader}>
              <h3>➕ Nuevo Usuario</h3>
              <button
                onClick={() => setShowAddUsuarioModal(false)}
                className={styles.closeBtn}
                aria-label="Cerrar"
              >
                &times;
              </button>
            </div>
            <div >
              <AddForm
                activeSection="usuarios"
                addFormData={addFormData}
                handleInputChange={handleInputChange}
                handleAdd={(section, data) => {
                  handleAddUsuario(data);
                }}
                resetAddForm={resetAddForm}
                premioEmojiSuggestions={premioEmojiSuggestions}
                usuariosPropietarios={usuariosPropietarios}
                isSubmitting={isSubmitting}
                onSuccess={() => setShowAddUsuarioModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      <ModalForm
        showModal={showModal}
        activeSection={activeSection}
        formData={formData}
        setFormData={setFormData}
        editingId={editingId}
        closeModal={closeModal}
        handleUpdate={handleUpdate}
        handleDelete={handleDelete}
        getSectionLabel={getSectionLabel}
        usuariosPropietarios={usuariosPropietarios}
        isUpdating={isUpdating}
      />
    </div>
  );
}