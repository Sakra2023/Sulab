-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: lap
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `canjes_colab`
--

DROP TABLE IF EXISTS `canjes_colab`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `canjes_colab` (
  `id` int NOT NULL AUTO_INCREMENT,
  `solicitud_id` int NOT NULL COMMENT 'ID de la solicitud original',
  `user_id` int NOT NULL COMMENT 'ID del colaborador',
  `empresa_nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Nombre de la empresa',
  `departamento` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Departamento',
  `valor_puntos` int NOT NULL COMMENT 'Valor en puntos canjeados',
  `valor_dinero` decimal(10,2) NOT NULL COMMENT 'Valor en dinero (USD)',
  `producto_nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Nombre del producto canjeado',
  `producto_descripcion` text COLLATE utf8mb4_unicode_ci COMMENT 'Descripción del producto',
  `fecha_solicitud` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_procesamiento` datetime DEFAULT NULL,
  `estado` enum('pendiente','aprobado','rechazado','entregado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `motivo_rechazo` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `solicitud_id` (`solicitud_id`),
  KEY `idx_empresa` (`empresa_nombre`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_estado` (`estado`),
  KEY `idx_fecha` (`fecha_solicitud`),
  CONSTRAINT `canjes_colab_ibfk_1` FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes_canje` (`id`) ON DELETE CASCADE,
  CONSTRAINT `canjes_colab_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `canjes_colab`
--

LOCK TABLES `canjes_colab` WRITE;
/*!40000 ALTER TABLE `canjes_colab` DISABLE KEYS */;
/*!40000 ALTER TABLE `canjes_colab` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `comandas`
--

DROP TABLE IF EXISTS `comandas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comandas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `emprendimiento_id` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `cliente_id` int DEFAULT NULL,
  `cliente_nombre` varchar(200) DEFAULT NULL,
  `cliente_telefono` varchar(50) DEFAULT NULL,
  `cliente_direccion` text,
  `items` json NOT NULL,
  `subtotal` decimal(10,2) DEFAULT '0.00',
  `impuesto` decimal(10,2) DEFAULT '0.00',
  `total` decimal(10,2) DEFAULT '0.00',
  `estado` enum('activa','facturada','cancelada') DEFAULT 'activa',
  `creada_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizada_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `cliente_id` (`cliente_id`),
  KEY `idx_emprendimiento` (`emprendimiento_id`),
  KEY `idx_estado` (`estado`),
  CONSTRAINT `comandas_ibfk_1` FOREIGN KEY (`emprendimiento_id`) REFERENCES `emprendimientos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `comandas_ibfk_2` FOREIGN KEY (`cliente_id`) REFERENCES `user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `comandas`
--

LOCK TABLES `comandas` WRITE;
/*!40000 ALTER TABLE `comandas` DISABLE KEYS */;
INSERT INTO `comandas` VALUES (1,1,'Mesa 1',4,'jperez',NULL,NULL,'[{\"id\": 1776096067854, \"color\": \"Negro\", \"talla\": \"S\", \"codigo\": \"EMP-1-PROD-001\", \"nombre\": \"Pantalon\", \"precio\": \"20.00\", \"puntos\": 60, \"cantidad\": 3, \"subtotal\": 60, \"productoId\": 1}]',60.00,9.60,69.60,'facturada','2026-04-13 16:00:55','2026-04-13 16:02:34');
/*!40000 ALTER TABLE `comandas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `config_puntos`
--

DROP TABLE IF EXISTS `config_puntos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `config_puntos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `umbral_minimo` decimal(10,2) NOT NULL,
  `puntos_fijos` int NOT NULL,
  `tasa_conversion` decimal(10,2) NOT NULL,
  `redondeo` enum('none','floor','ceil','round') NOT NULL,
  `rango_bronce_max` int NOT NULL,
  `rango_plata_min` int NOT NULL,
  `rango_plata_max` int NOT NULL,
  `rango_oro_min` int NOT NULL,
  `rango_oro_max` int NOT NULL,
  `rango_diamante_min` int NOT NULL,
  `valor_punto` decimal(10,4) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `config_puntos`
--

LOCK TABLES `config_puntos` WRITE;
/*!40000 ALTER TABLE `config_puntos` DISABLE KEYS */;
INSERT INTO `config_puntos` VALUES (1,0.99,5,10.00,'none',999,1000,4999,5000,9999,10200,0.0050,'2026-03-26 22:03:54','2026-06-17 15:33:34');
/*!40000 ALTER TABLE `config_puntos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `emprendimientos`
--

DROP TABLE IF EXISTS `emprendimientos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `emprendimientos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `categoria` varchar(50) NOT NULL,
  `ubicacion` varchar(255) NOT NULL,
  `ciudad` varchar(100) NOT NULL,
  `horario` varchar(100) DEFAULT NULL,
  `whatsapp` varchar(255) DEFAULT NULL,
  `instagram` varchar(255) DEFAULT NULL,
  `tiktok` varchar(255) DEFAULT NULL,
  `logo` varchar(10) DEFAULT NULL,
  `logo_imagen` longtext,
  `propietario_id` int NOT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `activo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `propietario_id` (`propietario_id`),
  CONSTRAINT `emprendimientos_ibfk_1` FOREIGN KEY (`propietario_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `emprendimientos`
--

LOCK TABLES `emprendimientos` WRITE;
/*!40000 ALTER TABLE `emprendimientos` DISABLE KEYS */;
INSERT INTO `emprendimientos` VALUES (1,'SoyElMejor','Zapatería','Av. Principo','Ciudad Central','Lun-Vie: 7AM-10PM','https://web.whatsapp.com/','https://instagram.com/cafeteria_central','https://instagram.com/cafeteria_central',NULL,'/img-emprendimientos/93f14ad0-8a2c-4532-86a0-77705bd9006e.webp',5,'2026-03-26 20:00:20',1),(2,'Calla y Paga','Electronica','Av. Principal ','Azogues','lunes-viernes','https://wa.me/1234567890','https://instagram.com/cafeteria_central','https://instagram.com/cafeteria_central',NULL,'/img-emprendimientos/0f823e49-6064-48c1-8512-0daf94f14a2f.webp',7,'2026-05-20 18:07:52',1);
/*!40000 ALTER TABLE `emprendimientos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `factura_items`
--

DROP TABLE IF EXISTS `factura_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `factura_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `factura_id` int NOT NULL,
  `producto_id` int NOT NULL,
  `codigo` varchar(50) DEFAULT NULL,
  `nombre` varchar(100) NOT NULL,
  `precio` decimal(10,2) NOT NULL,
  `cantidad` int NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `puntos` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `factura_id` (`factura_id`),
  KEY `producto_id` (`producto_id`),
  CONSTRAINT `factura_items_ibfk_1` FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `factura_items_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `factura_items`
--

LOCK TABLES `factura_items` WRITE;
/*!40000 ALTER TABLE `factura_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `factura_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `facturas`
--

DROP TABLE IF EXISTS `facturas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `facturas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `emprendimiento_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `numero` varchar(50) NOT NULL,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `cliente_nombre` varchar(100) NOT NULL,
  `cliente_direccion` text,
  `cliente_email` varchar(100) DEFAULT NULL,
  `cliente_telefono` varchar(20) DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `impuesto` decimal(10,2) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','transferencia') NOT NULL,
  `pago_recibido` decimal(10,2) DEFAULT NULL,
  `vuelto` decimal(10,2) DEFAULT NULL,
  `puntos_otorgados` int DEFAULT '0',
  `referencia` varchar(100) DEFAULT NULL,
  `ruta_pdf` varchar(500) DEFAULT NULL,
  `estado` enum('pendiente','completado','cancelado') DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `cliente_id` int DEFAULT NULL,
  `promocion_aplicada` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
  KEY `emprendimiento_id` (`emprendimiento_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `idx_cliente_id` (`cliente_id`),
  CONSTRAINT `facturas_ibfk_1` FOREIGN KEY (`emprendimiento_id`) REFERENCES `emprendimientos` (`id`),
  CONSTRAINT `facturas_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `facturas`
--

LOCK TABLES `facturas` WRITE;
/*!40000 ALTER TABLE `facturas` DISABLE KEYS */;
/*!40000 ALTER TABLE `facturas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notificaciones`
--

DROP TABLE IF EXISTS `notificaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notificaciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `cliente_id` int DEFAULT NULL,
  `solicitud_id` int DEFAULT NULL,
  `tipo` varchar(50) DEFAULT NULL,
  `titulo` varchar(200) DEFAULT NULL,
  `mensaje` text,
  `metadata` json DEFAULT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `procesado_en` datetime DEFAULT NULL,
  `procesado_por` varchar(100) DEFAULT NULL,
  `completado_en` datetime DEFAULT NULL,
  `motivo_rechazo` text,
  `leida` tinyint(1) DEFAULT '0',
  `estado` varchar(20) DEFAULT 'pending',
  `importante` tinyint(1) DEFAULT '0',
  `icono` varchar(10) DEFAULT NULL,
  `color` varchar(7) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`,`leida`),
  KEY `cliente_id` (`cliente_id`),
  CONSTRAINT `notificaciones_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `notificaciones_ibfk_2` FOREIGN KEY (`cliente_id`) REFERENCES `user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notificaciones`
--

LOCK TABLES `notificaciones` WRITE;
/*!40000 ALTER TABLE `notificaciones` DISABLE KEYS */;
INSERT INTO `notificaciones` VALUES (1,4,NULL,NULL,'puntos','? +12100 puntos agregados','Se agregaron 12100 puntos a tu cuenta. Motivo: Ajuste manual de puntos. Total actual: 20000 puntos.','{\"admin\": \"edi\", \"motivo\": \"Ajuste manual de puntos\", \"puntos\": 12100, \"operacion\": \"suma\", \"total_actual\": 20000}','2026-06-29 10:11:37',NULL,NULL,NULL,NULL,0,'pending',0,NULL,NULL),(2,4,NULL,NULL,'puntos','? +200 puntos ganados','¡Felicidades! Ganaste 200 puntos por tu compra en SoyElMejor. Total: $23,00 | Método: efectivo','{\"total\": 23, \"puntos\": 200, \"tienda\": \"SoyElMejor\", \"promocion\": null, \"factura_id\": 1, \"metodo_pago\": \"efectivo\", \"puntos_base\": 200, \"numero_factura\": \"FAC-2026-001\", \"tipo_transaccion\": \"compra\"}','2026-06-29 12:13:36',NULL,NULL,NULL,NULL,0,'pending',0,NULL,NULL),(3,1,4,NULL,'canje','? Nueva solicitud de canje de producto','Edison V solicita canjear 4000 puntos por el producto: Mouse','{\"producto_id\": 3, \"valor_punto\": \"0.0050\", \"solicitud_id\": 15, \"producto_nombre\": \"Mouse\", \"emprendimiento_id\": 1}','2026-06-29 14:56:13',NULL,NULL,NULL,NULL,0,'pending',1,NULL,NULL),(4,1,4,NULL,'canje','? Nueva solicitud de pago mixto','Edison V solicita PAGO MIXTO: 2000 puntos (USD $10.00) + USD $20.00 en efectivo | Producto: Teclado','{\"producto_id\": 2, \"valor_punto\": \"0.0050\", \"solicitud_id\": 16, \"producto_nombre\": \"Teclado\", \"emprendimiento_id\": 1}','2026-06-29 14:57:12',NULL,NULL,NULL,NULL,0,'pending',1,NULL,NULL),(5,4,4,16,'sys','? Canje aprobado','✅ ¡Pago MIXTO aprobado! Canjeaste 2,000 puntos (USD $10.00) + USD $20 en efectivo.',NULL,'2026-07-06 09:33:08',NULL,NULL,NULL,NULL,0,'aprobado',1,NULL,NULL),(6,4,4,15,'sys','? Canje aprobado','✅ ¡Canje de producto aprobado! Recibiste \"Mouse\" por 4,000 puntos.',NULL,'2026-07-06 09:33:13',NULL,NULL,NULL,NULL,0,'aprobado',1,NULL,NULL),(7,4,NULL,NULL,'puntos','? +600 puntos ganados (x2 por promoción \"La hora feliz\")','¡Felicidades! Ganaste 600 puntos por tu compra en SoyElMejor. Total: $34,50 | Método: efectivo','{\"total\": 34.5, \"puntos\": 600, \"tienda\": \"SoyElMejor\", \"promocion\": {\"id\": 2, \"nombre\": \"La hora feliz\", \"multiplicador\": 2}, \"factura_id\": 1, \"metodo_pago\": \"efectivo\", \"puntos_base\": 300, \"numero_factura\": \"FAC-2026-001\", \"tipo_transaccion\": \"compra\"}','2026-07-06 09:35:03',NULL,NULL,NULL,NULL,0,'pending',0,NULL,NULL),(8,4,NULL,NULL,'puntos','? +200 puntos ganados','¡Felicidades! Ganaste 200 puntos por tu compra en SoyElMejor. Total: $23,00 | Método: efectivo','{\"total\": 23, \"puntos\": 200, \"tienda\": \"SoyElMejor\", \"promocion\": null, \"factura_id\": 2, \"metodo_pago\": \"efectivo\", \"puntos_base\": 200, \"numero_factura\": \"FAC-2026-002\", \"tipo_transaccion\": \"compra\"}','2026-07-06 09:38:35',NULL,NULL,NULL,NULL,0,'pending',0,NULL,NULL);
/*!40000 ALTER TABLE `notificaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `premios`
--

DROP TABLE IF EXISTS `premios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `premios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `categoria` varchar(50) NOT NULL,
  `puntos` int NOT NULL,
  `descripcion` text,
  `stock` int DEFAULT '1',
  `vecesCanjeado` int DEFAULT '0',
  `imagen` varchar(255) DEFAULT NULL,
  `disponible` tinyint(1) DEFAULT '1',
  `fechaVencimiento` date DEFAULT NULL,
  `fechaRegistro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_categoria` (`categoria`),
  KEY `idx_puntos` (`puntos`),
  KEY `idx_disponible` (`disponible`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `premios`
--

LOCK TABLES `premios` WRITE;
/*!40000 ALTER TABLE `premios` DISABLE KEYS */;
INSERT INTO `premios` VALUES (1,'Telefono','Electronica',2000,'El mejor celular',3,19,'/img-premios/cf8e767c-27b1-4fbb-b8cf-baac0e1b662b.webp',1,'2026-09-24','2026-03-28 00:22:42'),(2,'Carro','Electronica',2000,'Carro de juguete',4,0,'/img-premios/eb44b0b6-011c-43c9-b91a-4844308d890c.webp',1,'2026-06-20','2026-05-20 19:34:40');
/*!40000 ALTER TABLE `premios` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `productos`
--

DROP TABLE IF EXISTS `productos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `productos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `emprendimiento_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `codigo` varchar(50) NOT NULL,
  `nombre` varchar(200) NOT NULL,
  `descripcion` text,
  `categoria` varchar(50) DEFAULT NULL,
  `precio_venta` decimal(10,2) NOT NULL,
  `stock` int DEFAULT '0',
  `stock_minimo` int DEFAULT '5',
  `unidad_medida` varchar(30) DEFAULT NULL,
  `proveedor` varchar(100) DEFAULT NULL,
  `iva` decimal(5,2) DEFAULT '16.00',
  `activo` tinyint(1) DEFAULT '1',
  `atributos` json DEFAULT NULL,
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `precio_compra` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `emprendimiento_id` (`emprendimiento_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `productos_ibfk_1` FOREIGN KEY (`emprendimiento_id`) REFERENCES `emprendimientos` (`id`),
  CONSTRAINT `productos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `productos`
--

LOCK TABLES `productos` WRITE;
/*!40000 ALTER TABLE `productos` DISABLE KEYS */;
INSERT INTO `productos` VALUES (1,1,5,'EMP-1-PROD-001','Pantalon','Pantalon de cuero','ropa',20.00,9,1,'unidad','Lacteos SA',12.00,1,'{\"color\": \"Negro\", \"talla\": \"S\", \"material\": \"Algodon\"}','2026-04-08 12:37:24',15.00),(2,1,5,'EMP-1-PROD-002','Teclado','Teclado gamer tkl','electronica',30.00,9,5,'unidad',NULL,15.00,1,'{\"marca\": \"Tkl\", \"modelo\": \"sm23\", \"garantia\": \"12\"}','2026-05-12 10:44:54',20.00),(3,1,5,'EMP-1-PROD-003','Mouse','Mouse color negro','electronica',20.00,29,5,'unidad',NULL,15.00,1,'{\"marca\": \"rgb\", \"modelo\": \"sm34\", \"garantia\": \"24\"}','2026-05-12 10:46:40',10.00),(4,1,5,'EMP-1-PROD-004','Mouse','Teclado blanco ','electronica',20.00,12,5,'unidad',NULL,15.00,1,'{\"marca\": \"rgb\", \"modelo\": \"sm35\", \"garantia\": \"24\"}','2026-05-12 10:48:10',15.00);
/*!40000 ALTER TABLE `productos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `promociones`
--

DROP TABLE IF EXISTS `promociones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promociones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text,
  `multiplicador` int NOT NULL,
  `fechaInicio` datetime NOT NULL,
  `fechaFin` datetime NOT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `emprendimiento_id` int DEFAULT NULL,
  `fechaRegistro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fechas` (`fechaInicio`,`fechaFin`),
  KEY `idx_activo` (`activo`),
  KEY `idx_emprendimiento` (`emprendimiento_id`),
  CONSTRAINT `promociones_ibfk_1` FOREIGN KEY (`emprendimiento_id`) REFERENCES `emprendimientos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_fechas` CHECK ((`fechaFin` > `fechaInicio`))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promociones`
--

LOCK TABLES `promociones` WRITE;
/*!40000 ALTER TABLE `promociones` DISABLE KEYS */;
INSERT INTO `promociones` VALUES (2,'La hora feliz','Puntos al doble',2,'2026-05-22 01:25:00','2026-06-30 01:25:00',1,1,'2026-05-20 19:25:46');
/*!40000 ALTER TABLE `promociones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reset_tokens`
--

DROP TABLE IF EXISTS `reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reset_tokens`
--

LOCK TABLES `reset_tokens` WRITE;
/*!40000 ALTER TABLE `reset_tokens` DISABLE KEYS */;
INSERT INTO `reset_tokens` VALUES (1,4,'f5c4565ef116ef36c6b9f1279480a832b0f2e5a52a32f9c2017b59c10b335c6a','2026-06-09 16:43:06',0,'2026-06-09 20:43:06'),(2,4,'5c4492b06e9145d20cadd8b7f0d6919cbbc42414801f4c2851317a5ac94c5748','2026-06-09 16:53:15',0,'2026-06-09 20:53:14'),(3,4,'5c79c36b564d23ad5693865c95d6596e8f6ea8bf11ed2a95d2c4ecbfdf8ce5cd','2026-06-09 17:04:19',0,'2026-06-09 21:04:18'),(4,4,'3bae4b47a8b640066f556f191a9f3db448de98829eaa0b67099b461af4ef8b60','2026-06-09 17:10:30',1,'2026-06-09 21:10:29'),(5,4,'7d09831e2efc4be44ed2d0a1d6351b8677d6f28be77ccfe656db18f52d62f916','2026-06-09 17:27:33',1,'2026-06-09 21:27:32'),(6,4,'98b37dc166518ba7586a429b085f15ef4aec049e9c38e887728437b2409eeb56','2026-06-09 18:01:47',1,'2026-06-09 22:01:47'),(7,6,'0f1d86d4dc81fb5ba72f43365f3ba4b269b69498604bf7fa72b3fa71afa0ac01','2026-06-09 18:35:59',1,'2026-06-09 22:35:58'),(8,6,'9a95999b8767b5108affac33356d607021848f1401a3f1d493a58e54acf05bf9','2026-08-11 20:00:48',0,'2026-08-12 00:00:47'),(9,6,'f9dd89101903e584ad26dff479569df624c647d081e5b7e555ab3c3e94edf548','2026-08-14 11:30:55',1,'2026-08-14 15:30:55');
/*!40000 ALTER TABLE `reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `solicitudes_canje`
--

DROP TABLE IF EXISTS `solicitudes_canje`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `solicitudes_canje` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `emprendimiento_id` int DEFAULT NULL,
  `tipo_canje` enum('efectivo','premio','mixto','producto') NOT NULL,
  `premio_id` int DEFAULT NULL,
  `premio_nombre` varchar(255) DEFAULT NULL,
  `referencia` varchar(50) DEFAULT NULL,
  `puntos_requeridos` int NOT NULL,
  `estado` enum('pendiente','aprobado','rechazado') DEFAULT 'pendiente',
  `fecha_solicitud` datetime DEFAULT NULL,
  `fecha_procesamiento` datetime DEFAULT NULL,
  `procesado_por` int DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `origen_soli` enum('usuario','colab') DEFAULT 'usuario',
  `empresa_nombre` varchar(255) DEFAULT NULL,
  `departamento` varchar(100) DEFAULT NULL,
  `valor_dinero` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_estado_tipo` (`estado`,`tipo_canje`),
  KEY `idx_emprendimiento` (`emprendimiento_id`),
  KEY `idx_origen` (`origen_soli`),
  CONSTRAINT `solicitudes_canje_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `solicitudes_canje`
--

LOCK TABLES `solicitudes_canje` WRITE;
/*!40000 ALTER TABLE `solicitudes_canje` DISABLE KEYS */;
INSERT INTO `solicitudes_canje` VALUES (15,4,1,'producto',3,'Mouse',NULL,4000,'aprobado','2026-06-29 14:56:13','2026-07-06 09:33:13',1,'{\"motivo\": \"Mouse - EMP-1-PROD-003 (Solo canje de puntos)\", \"tipo_pago\": \"solo_puntos\", \"producto_id\": 3, \"valor_punto\": \"0.0050\", \"nombre_tienda\": \"SoyElMejor\", \"monto_efectivo\": 0, \"monto_descuento\": 20, \"producto_nombre\": \"Mouse\", \"puntos_actuales\": 20200, \"emprendimiento_id\": 1, \"puntos_solicitados\": 4000}','colab','SoyElMejor',NULL,NULL),(16,4,1,'mixto',2,'Teclado',NULL,2000,'aprobado','2026-06-29 14:57:12','2026-07-06 09:33:08',1,'{\"motivo\": \"Teclado - EMP-1-PROD-002 (Pago mixto - Producto: USD $30.00)\", \"tipo_pago\": \"mixto\", \"producto_id\": 2, \"valor_punto\": \"0.0050\", \"nombre_tienda\": \"SoyElMejor\", \"monto_efectivo\": 20, \"monto_descuento\": 10, \"producto_nombre\": \"Teclado\", \"puntos_actuales\": 20200, \"emprendimiento_id\": 1, \"puntos_solicitados\": 2000}','colab','SoyElMejor',NULL,20.00);
/*!40000 ALTER TABLE `solicitudes_canje` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transacciones`
--

DROP TABLE IF EXISTS `transacciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transacciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `tipo` enum('compra','canje','transferencia','promocion','expiracion','ajuste','canje_efectivo','canje_premio','canje_mixto') DEFAULT NULL,
  `referencia` varchar(50) DEFAULT NULL,
  `tienda` varchar(100) DEFAULT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_completado` datetime DEFAULT NULL,
  `fecha_rechazado` datetime DEFAULT NULL,
  `motivo_rechazo` text,
  `puntos` int NOT NULL,
  `puntos_usados` int DEFAULT '0',
  `estado` enum('completado','pendiente','rechazado','procesando') DEFAULT 'pendiente',
  `detalles` json DEFAULT NULL,
  `emprendimiento_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `fecha` (`fecha`),
  CONSTRAINT `transacciones_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transacciones`
--

LOCK TABLES `transacciones` WRITE;
/*!40000 ALTER TABLE `transacciones` DISABLE KEYS */;
INSERT INTO `transacciones` VALUES (1,4,'canje_mixto','CANJE_MIXTO-1783348388046',NULL,'2026-07-06 09:33:08',NULL,NULL,NULL,-2000,2000,'completado','{\"motivo\": \"Teclado - EMP-1-PROD-002 (Pago mixto - Producto: USD $30.00)\", \"tipo_pago\": \"mixto\", \"origen_soli\": \"colab\", \"producto_id\": 2, \"valor_punto\": \"0.0050\", \"aprobado_por\": 1, \"solicitud_id\": 16, \"nombre_tienda\": \"SoyElMejor\", \"monto_efectivo\": 20, \"monto_descuento\": 10, \"producto_nombre\": \"Teclado\", \"puntos_actuales\": 20200, \"fecha_aprobacion\": \"2026-07-06T14:33:08.046Z\", \"emprendimiento_id\": 1, \"puntos_solicitados\": 2000}',1),(2,4,'canje','CANJE-1783348393804',NULL,'2026-07-06 09:33:13',NULL,NULL,NULL,-4000,4000,'completado','{\"motivo\": \"Mouse - EMP-1-PROD-003 (Solo canje de puntos)\", \"tipo_pago\": \"solo_puntos\", \"origen_soli\": \"colab\", \"producto_id\": 3, \"valor_punto\": \"0.0050\", \"aprobado_por\": 1, \"solicitud_id\": 15, \"nombre_tienda\": \"SoyElMejor\", \"monto_efectivo\": 0, \"monto_descuento\": 20, \"producto_nombre\": \"Mouse\", \"puntos_actuales\": 20200, \"fecha_aprobacion\": \"2026-07-06T14:33:13.804Z\", \"emprendimiento_id\": 1, \"puntos_solicitados\": 4000}',1),(3,4,'compra','FAC-2026-001','SoyElMejor','2026-07-06 09:35:03',NULL,NULL,NULL,600,0,'completado','{\"total\": 34.5, \"productos\": [\"Teclado\"], \"promocion\": {\"nombre\": \"La hora feliz\", \"multiplicador\": 2}, \"factura_id\": 1, \"metodo_pago\": \"efectivo\", \"puntos_base\": 300}',1),(4,4,'compra','FAC-2026-002','SoyElMejor','2026-07-06 09:38:35',NULL,NULL,NULL,200,0,'completado','{\"total\": 23, \"productos\": [\"Mouse\"], \"promocion\": null, \"factura_id\": 2, \"metodo_pago\": \"efectivo\", \"puntos_base\": 200}',1);
/*!40000 ALTER TABLE `transacciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL DEFAULT 'temp_email',
  `usuario` varchar(100) DEFAULT NULL,
  `contra` varchar(255) DEFAULT NULL,
  `rol` enum('admin','usuario','colab') DEFAULT 'usuario',
  `fecha_registro` datetime DEFAULT NULL,
  `ultimo_acceso` datetime DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `google_id` varchar(255) DEFAULT NULL,
  `facebook_id` varchar(255) DEFAULT NULL,
  `foto_url` text,
  `telefono` varchar(20) DEFAULT NULL,
  `direccion` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario` (`usuario`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user`
--

LOCK TABLES `user` WRITE;
/*!40000 ALTER TABLE `user` DISABLE KEYS */;
INSERT INTO `user` VALUES (1,'edison.vargasp2020@gmail.com','edi','$2b$10$nGM.w9uc4CR/cAByxpWdtuyNgR16nlqs/GP0acJT8cZv.fE2hzggK','admin',NULL,'2026-09-23 18:35:23',1,NULL,NULL,NULL,NULL,NULL),(2,'santy@gmaill.com','santy','$2b$10$w5G.uztuDQ16oUxJI.mRkOCtLfBtAWCq2SRBNYzbibQt/H947Rdq2','usuario',NULL,'2026-09-23 18:41:10',1,NULL,NULL,'/img-usuarios/920bb997-5fc7-4c5d-bbcf-cf41c2daacb8.webp',NULL,NULL),(3,'temp_email','san','$2b$10$Mn/Cgc7TB.xG1fZ9FVALte2vMo1vaL6.7T5v1Lu6I4E6vnTPR4csC','colab',NULL,'2026-08-11 18:59:00',1,NULL,NULL,NULL,NULL,NULL),(4,'edison.vikas2021@gmail.com','Edison V','$2b$10$/daZ6nWESqDkL9kXW1FePuJHQ6t586MqKGQqEdfWaRJtYiiiVK8Zq','usuario',NULL,'2026-09-23 18:37:25',1,NULL,NULL,'/img-usuarios/d5ea26e3-7330-456c-af7f-ff1eb1d7057b.webp','0992852633','La Playa'),(5,'edison.@gmail.com','DUEÑO','$2b$10$ZVuybrTBU3FZm9afsuSuNuBA.c/C8BF5DYPSeN4PSQUbY1uCLwWAq','colab','2026-03-26 12:12:30','2026-09-24 09:56:57',1,NULL,NULL,NULL,NULL,NULL),(6,'edison.vargasp2017@gmail.com','Edison','$2b$10$H14283eH74GMzozJtnqE8.tXSr4jDYByto2mF3yChUquxkSHUvYHi','usuario','2026-05-08 16:23:58','2026-09-23 18:40:47',1,'3stU2RFV5zbMO2R1lQ7j9jl9CWm1',NULL,'https://lh3.googleusercontent.com/a/ACg8ocLT0OiFcWMeZEOVYQ8hwnCyuc7dyOsThL2QLt7tIMjx9cWQmg=s96-c','0992852633','Azogues'),(7,'edison.vargasp@gmail.com','Santiago','$2b$10$XxQYkt8wjzkgyiq.gpwUc.rE83i1bMEYwbk7rqNlwSM3zUdVTLmuK','colab','2026-05-20 12:36:47','2026-08-11 18:59:52',1,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_config`
--

DROP TABLE IF EXISTS `user_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_config` (
  `user_id` int NOT NULL,
  `email_notificaciones` tinyint(1) DEFAULT '1',
  `push_notificaciones` tinyint(1) DEFAULT '1',
  `puntos_notif` tinyint(1) DEFAULT '1',
  `canjes_notif` tinyint(1) DEFAULT '1',
  `promociones_notif` tinyint(1) DEFAULT '1',
  `recordatorios_notif` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`user_id`),
  CONSTRAINT `user_config_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_config`
--

LOCK TABLES `user_config` WRITE;
/*!40000 ALTER TABLE `user_config` DISABLE KEYS */;
INSERT INTO `user_config` VALUES (4,1,1,1,1,1,0),(6,1,1,1,1,1,0);
/*!40000 ALTER TABLE `user_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_puntos`
--

DROP TABLE IF EXISTS `user_puntos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_puntos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `nivel` enum('Bronce','Plata','Oro','Diamante') DEFAULT 'Bronce',
  `puntos_totales` int DEFAULT '0',
  `nivel_actual` int DEFAULT '1',
  `puntos_nivel_actual` int DEFAULT '0',
  `puntos_siguiente_nivel` int DEFAULT '5000',
  `fecha_registro` datetime DEFAULT CURRENT_TIMESTAMP,
  `ultimo_acceso` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `user_puntos_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_puntos`
--

LOCK TABLES `user_puntos` WRITE;
/*!40000 ALTER TABLE `user_puntos` DISABLE KEYS */;
INSERT INTO `user_puntos` VALUES (1,4,'Diamante',15000,4,20000,0,'2026-02-10 12:25:33',NULL),(2,2,'Plata',2000,2,2000,3000,'2026-04-13 09:38:58',NULL),(3,6,'Oro',10000,3,10000,200,'2026-05-08 16:23:58',NULL);
/*!40000 ALTER TABLE `user_puntos` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-24 10:56:41
