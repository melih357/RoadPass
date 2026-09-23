SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP DATABASE IF EXISTS roadpass;
CREATE DATABASE roadpass CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE roadpass;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  profile_photo VARCHAR(255) NULL,
  status ENUM('active','passive','blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE user_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  theme ENUM('dark','light','system') NOT NULL DEFAULT 'dark',
  language ENUM('tr','en') NOT NULL DEFAULT 'tr',
  push_enabled TINYINT(1) NOT NULL DEFAULT 1,
  email_enabled TINYINT(1) NOT NULL DEFAULT 1,
  premium_theme_enabled TINYINT(1) NOT NULL DEFAULT 1,
  simple_mode TINYINT(1) NOT NULL DEFAULT 0,
  large_text TINYINT(1) NOT NULL DEFAULT 0,
  accent_theme ENUM('aurora','mint','midnight') NOT NULL DEFAULT 'aurora',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_settings_user (user_id),
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE hgs_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(100) NOT NULL DEFAULT 'Ana HGS Hesabı',
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  auto_topup TINYINT(1) NOT NULL DEFAULT 0,
  auto_topup_amount DECIMAL(12,2) NOT NULL DEFAULT 500,
  low_balance_limit DECIMAL(12,2) NOT NULL DEFAULT 250,
  provider_reference VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hgs_user (user_id),
  CONSTRAINT fk_hgs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE hgs_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  hgs_account_id BIGINT UNSIGNED NOT NULL,
  transaction_type ENUM('topup','passage','refund','adjustment') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('pending','completed','failed','cancelled') NOT NULL DEFAULT 'completed',
  payment_method VARCHAR(60) NULL,
  reference_code VARCHAR(80) NULL,
  description VARCHAR(255) NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hgs_tx_user_date (user_id, created_at),
  CONSTRAINT fk_hgs_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_hgs_tx_account FOREIGN KEY (hgs_account_id) REFERENCES hgs_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE vehicle_types (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name_tr VARCHAR(80) NOT NULL,
  name_en VARCHAR(80) NOT NULL,
  hgs_class TINYINT UNSIGNED NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_vehicle_type_code (code)
) ENGINE=InnoDB;

CREATE TABLE vehicle_brands (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_type_id SMALLINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_brand_type_name (vehicle_type_id, name),
  INDEX idx_brand_type (vehicle_type_id),
  CONSTRAINT fk_brand_type FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE vehicle_models (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  brand_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_model_brand_name (brand_id, name),
  INDEX idx_model_brand (brand_id),
  CONSTRAINT fk_model_brand FOREIGN KEY (brand_id) REFERENCES vehicle_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE vehicles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  vehicle_type_id SMALLINT UNSIGNED NULL,
  brand_id INT UNSIGNED NULL,
  model_id INT UNSIGNED NULL,
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(100) NOT NULL,
  plate VARCHAR(16) NOT NULL,
  color VARCHAR(50) NULL,
  vehicle_type VARCHAR(60) NOT NULL DEFAULT 'Otomobil',
  hgs_tag VARCHAR(80) NULL,
  image_path VARCHAR(255) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  manufacture_year SMALLINT UNSIGNED NULL,
  body_type VARCHAR(60) NULL,
  fuel_type ENUM('gasoline','diesel','lpg','hybrid','electric','other') NOT NULL DEFAULT 'gasoline',
  transmission ENUM('manual','automatic','semi_automatic','other') NULL,
  engine_label VARCHAR(60) NULL,
  average_consumption DECIMAL(7,2) NULL COMMENT 'L/100 km veya kWh/100 km',
  tank_capacity DECIMAL(7,2) NULL,
  battery_capacity DECIMAL(7,2) NULL,
  current_fuel_liters DECIMAL(7,2) NULL,
  current_charge_percent DECIMAL(5,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_plate (user_id, plate),
  UNIQUE KEY uq_user_hgs_tag (user_id, hgs_tag),
  INDEX idx_vehicle_user (user_id),
  CONSTRAINT fk_vehicle_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vehicle_type FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE RESTRICT,
  CONSTRAINT fk_vehicle_brand FOREIGN KEY (brand_id) REFERENCES vehicle_brands(id) ON DELETE RESTRICT,
  CONSTRAINT fk_vehicle_model FOREIGN KEY (model_id) REFERENCES vehicle_models(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE passages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  vehicle_id BIGINT UNSIGNED NULL,
  location VARCHAR(160) NOT NULL,
  road_name VARCHAR(160) NULL,
  gate_name VARCHAR(160) NULL,
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('completed','pending','violation','cancelled') NOT NULL DEFAULT 'completed',
  passed_at DATETIME NOT NULL,
  source ENUM('demo','manual','api') NOT NULL DEFAULT 'demo',
  deleted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_passage_user_date (user_id, passed_at),
  INDEX idx_passage_user_deleted (user_id, deleted_at),
  INDEX idx_passage_vehicle (vehicle_id),
  CONSTRAINT fk_passage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_passage_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'general',
  title VARCHAR(140) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notification_user (user_id, is_read, created_at),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payment_methods (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(60) NOT NULL DEFAULT 'roadpass_demo',
  demo_token VARCHAR(128) NOT NULL,
  card_brand VARCHAR(30) NOT NULL,
  card_last4 CHAR(4) NOT NULL,
  holder_name VARCHAR(100) NOT NULL,
  expiry_month TINYINT UNSIGNED NOT NULL,
  expiry_year SMALLINT UNSIGNED NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payment_method_user (user_id, is_default),
  CONSTRAINT fk_payment_method_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE premium_plans (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name_tr VARCHAR(80) NOT NULL,
  name_en VARCHAR(80) NOT NULL,
  billing_period ENUM('monthly','yearly') NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'TRY',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_premium_plan_code (code)
) ENGINE=InnoDB;

CREATE TABLE subscriptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_id SMALLINT UNSIGNED NOT NULL,
  status ENUM('active','cancelled','expired','trial') NOT NULL DEFAULT 'active',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  cancelled_at DATETIME NULL,
  auto_renew TINYINT(1) NOT NULL DEFAULT 1,
  payment_method_id BIGINT UNSIGNED NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subscription_user_status (user_id, status, ends_at),
  CONSTRAINT fk_subscription_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_plan FOREIGN KEY (plan_id) REFERENCES premium_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_subscription_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE subscription_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NOT NULL,
  plan_id SMALLINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'TRY',
  status ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'completed',
  reference_code VARCHAR(80) NOT NULL,
  card_brand VARCHAR(30) NOT NULL,
  card_last4 CHAR(4) NOT NULL,
  description VARCHAR(255) NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_subscription_payment_reference (reference_code),
  INDEX idx_subscription_payment_user (user_id, created_at),
  CONSTRAINT fk_subscription_payment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_payment_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_payment_plan FOREIGN KEY (plan_id) REFERENCES premium_plans(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE journey_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  origin VARCHAR(500) NOT NULL,
  destination VARCHAR(500) NOT NULL,
  estimated_toll DECIMAL(12,2) NULL DEFAULT NULL,
  toll_status VARCHAR(40) NOT NULL DEFAULT 'unverified',
  total_complete TINYINT(1) NOT NULL DEFAULT 0,
  estimated_duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  estimated_distance_meters INT UNSIGNED NOT NULL DEFAULT 0,
  estimated_fuel_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  estimated_total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  fuel_sufficient TINYINT(1) NULL,
  origin_detail TEXT NULL,
  destination_detail TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_journey_plan_user (user_id, created_at),
  CONSTRAINT fk_journey_plan_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_journey_plan_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB;


CREATE TABLE vehicle_model_suggestions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  vehicle_type_id SMALLINT UNSIGNED NOT NULL,
  brand_id INT UNSIGNED NOT NULL,
  model_name VARCHAR(120) NOT NULL,
  manufacture_year SMALLINT UNSIGNED NULL,
  fuel_type VARCHAR(30) NULL,
  body_type VARCHAR(60) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note VARCHAR(255) NULL,
  approved_model_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_model_suggestion_status (status, created_at),
  INDEX idx_model_suggestion_user (user_id, created_at),
  CONSTRAINT fk_suggestion_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_suggestion_type FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE RESTRICT,
  CONSTRAINT fk_suggestion_brand FOREIGN KEY (brand_id) REFERENCES vehicle_brands(id) ON DELETE RESTRICT,
  CONSTRAINT fk_suggestion_approved_model FOREIGN KEY (approved_model_id) REFERENCES vehicle_models(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE saved_addresses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(60) NOT NULL,
  address_type ENUM('home','work','other') NOT NULL DEFAULT 'other',
  province VARCHAR(80) NULL,
  district VARCHAR(100) NULL,
  neighborhood VARCHAR(120) NULL,
  street VARCHAR(160) NULL,
  building_no VARCHAR(30) NULL,
  full_address VARCHAR(500) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  is_default_origin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_address_user (user_id, created_at),
  CONSTRAINT fk_address_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE vehicle_expenses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  category ENUM('fuel','maintenance','insurance','inspection','parking','wash','tax','other') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  odometer_km INT UNSIGNED NULL,
  description VARCHAR(255) NULL,
  expense_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expense_user_date (user_id, expense_date),
  INDEX idx_expense_vehicle (vehicle_id, expense_date),
  CONSTRAINT fk_expense_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_expense_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE vehicle_reminders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  reminder_type ENUM('inspection','insurance','maintenance','tax','tire','other') NOT NULL,
  title VARCHAR(140) NOT NULL,
  due_date DATE NOT NULL,
  due_odometer_km INT UNSIGNED NULL,
  is_completed TINYINT(1) NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reminder_user_due (user_id, is_completed, due_date),
  CONSTRAINT fk_reminder_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reminder_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE fuel_stations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  province VARCHAR(80) NOT NULL,
  district VARCHAR(100) NULL,
  address VARCHAR(255) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  is_24h TINYINT(1) NOT NULL DEFAULT 1,
  source VARCHAR(60) NOT NULL DEFAULT 'demo',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_station_province (province, is_active)
) ENGINE=InnoDB;

CREATE TABLE support_tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  reference_code VARCHAR(80) NOT NULL,
  category ENUM('account','wallet','vehicle','premium','other') NOT NULL DEFAULT 'other',
  subject VARCHAR(140) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  priority ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_support_reference (reference_code),
  INDEX idx_support_user (user_id, status, created_at),
  CONSTRAINT fk_support_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ai_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  mode VARCHAR(40) NOT NULL DEFAULT 'rule-based',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_user_date (user_id, created_at),
  CONSTRAINT fk_ai_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;


INSERT INTO vehicle_types (id, code, name_tr, name_en, hgs_class, sort_order) VALUES
(1, 'car', 'Otomobil', 'Car', 1, 10),
(2, 'motorcycle', 'Motosiklet', 'Motorcycle', 6, 20),
(3, 'light_commercial', 'Hafif Ticari / Kamyonet', 'Light Commercial / Van', 2, 30),
(4, 'minibus', 'Minibüs', 'Minibus', 2, 40),
(5, 'bus', 'Otobüs', 'Bus', 4, 50),
(6, 'truck', 'Kamyon / Çekici', 'Truck / Tractor', 5, 60);

INSERT INTO vehicle_brands (id, vehicle_type_id, name) VALUES
(1,1,'Volkswagen'),(2,1,'Renault'),(3,1,'Fiat'),(4,1,'Toyota'),(5,1,'Ford'),(6,1,'Hyundai'),(7,1,'Honda'),(8,1,'Peugeot'),(9,1,'Citroën'),(10,1,'Opel'),(11,1,'Mercedes-Benz'),(12,1,'BMW'),(13,1,'Audi'),(14,1,'Skoda'),(15,1,'Dacia'),(16,1,'Nissan'),(17,1,'Kia'),(18,1,'Seat'),(19,1,'Volvo'),(20,1,'Tesla'),(21,1,'Togg'),
(30,2,'Honda'),(31,2,'Yamaha'),(32,2,'BMW Motorrad'),(33,2,'Kawasaki'),(34,2,'Suzuki'),(35,2,'KTM'),(36,2,'Ducati'),(37,2,'Bajaj'),
(40,3,'Ford'),(41,3,'Fiat'),(42,3,'Volkswagen'),(43,3,'Renault'),(44,3,'Mercedes-Benz'),(45,3,'Peugeot'),(46,3,'Citroën'),(47,3,'Iveco'),
(50,4,'Mercedes-Benz'),(51,4,'Ford'),(52,4,'Volkswagen'),(53,4,'Isuzu'),(54,4,'Otokar'),(55,4,'Karsan'),
(60,5,'Mercedes-Benz'),(61,5,'MAN'),(62,5,'Temsa'),(63,5,'Otokar'),(64,5,'Karsan'),(65,5,'Isuzu'),
(70,6,'Mercedes-Benz'),(71,6,'Ford Trucks'),(72,6,'MAN'),(73,6,'Volvo'),(74,6,'Scania'),(75,6,'DAF'),(76,6,'Iveco');

INSERT INTO vehicle_models (id, brand_id, name) VALUES
(101,1,'Passat'),(102,1,'Golf'),(103,1,'Polo'),(104,1,'Tiguan'),(105,1,'T-Roc'),
(110,2,'Clio'),(111,2,'Megane'),(112,2,'Taliant'),(113,2,'Captur'),(114,2,'Austral'),
(120,3,'Egea'),(121,3,'500'),(122,3,'Tipo'),(123,3,'Panda'),
(130,4,'Corolla'),(131,4,'C-HR'),(132,4,'Yaris'),(133,4,'RAV4'),
(140,5,'Focus'),(141,5,'Puma'),(142,5,'Kuga'),(143,5,'Mustang Mach-E'),
(150,6,'i20'),(151,6,'i30'),(152,6,'Bayon'),(153,6,'Tucson'),(154,6,'Ioniq 5'),
(160,7,'Civic'),(161,7,'City'),(162,7,'Jazz'),(163,7,'HR-V'),(164,7,'CR-V'),
(170,8,'208'),(171,8,'308'),(172,8,'2008'),(173,8,'3008'),(174,8,'508'),
(180,9,'C3'),(181,9,'C4'),(182,9,'C4 X'),(183,9,'C5 Aircross'),
(190,10,'Corsa'),(191,10,'Astra'),(192,10,'Mokka'),(193,10,'Grandland'),
(200,11,'A Serisi'),(201,11,'C Serisi'),(202,11,'E Serisi'),(203,11,'CLA'),(204,11,'GLA'),
(210,12,'1 Serisi'),(211,12,'3 Serisi'),(212,12,'5 Serisi'),(213,12,'X1'),(214,12,'X3'),
(220,13,'A3'),(221,13,'A4'),(222,13,'A6'),(223,13,'Q3'),(224,13,'Q5'),
(230,14,'Fabia'),(231,14,'Scala'),(232,14,'Octavia'),(233,14,'Superb'),(234,14,'Karoq'),
(240,15,'Sandero'),(241,15,'Jogger'),(242,15,'Duster'),
(250,16,'Micra'),(251,16,'Juke'),(252,16,'Qashqai'),(253,16,'X-Trail'),
(260,17,'Picanto'),(261,17,'Rio'),(262,17,'Stonic'),(263,17,'Sportage'),(264,17,'EV6'),
(270,18,'Ibiza'),(271,18,'Leon'),(272,18,'Arona'),(273,18,'Ateca'),
(280,19,'S60'),(281,19,'XC40'),(282,19,'XC60'),(283,19,'EX30'),
(290,20,'Model 3'),(291,20,'Model Y'),(292,20,'Model S'),(293,20,'Model X'),
(300,21,'T10X'),(301,21,'T10F'),
(400,30,'PCX 125'),(401,30,'Forza 250'),(402,30,'CBR650R'),(403,30,'Africa Twin'),
(410,31,'NMAX 125'),(411,31,'XMAX 250'),(412,31,'MT-07'),(413,31,'Tracer 9'),
(420,32,'G 310 GS'),(421,32,'F 900 GS'),(422,32,'R 1300 GS'),
(430,33,'Ninja 400'),(431,33,'Z650'),(432,33,'Versys 650'),
(440,34,'V-Strom 650'),(441,34,'GSX-8S'),(442,34,'Hayabusa'),
(450,35,'Duke 250'),(451,35,'390 Adventure'),(452,35,'1290 Super Adventure'),
(460,36,'Monster'),(461,36,'Multistrada V4'),(462,36,'Panigale V2'),
(470,37,'Pulsar NS 200'),(471,37,'Dominar 400'),
(500,40,'Courier'),(501,40,'Connect'),(502,40,'Custom'),(503,40,'Transit'),
(510,41,'Fiorino'),(511,41,'Doblo'),(512,41,'Ducato'),
(520,42,'Caddy'),(521,42,'Transporter'),(522,42,'Crafter'),
(530,43,'Express'),(531,43,'Kangoo'),(532,43,'Trafic'),(533,43,'Master'),
(540,44,'Citan'),(541,44,'Vito'),(542,44,'Sprinter'),
(550,45,'Partner'),(551,45,'Expert'),(552,45,'Boxer'),
(560,46,'Berlingo'),(561,46,'Jumpy'),(562,46,'Jumper'),
(570,47,'Daily'),
(600,50,'Sprinter Minibüs'),(601,50,'Vito Tourer'),(610,51,'Transit Minibüs'),(620,52,'Crafter Minibüs'),(630,53,'Novo'),(631,53,'Turquoise'),(640,54,'Centro'),(641,54,'Sultan'),(650,55,'Jest'),
(700,60,'Conecto'),(701,60,'Tourismo'),(710,61,'Lion''s City'),(711,61,'Lion''s Coach'),(720,62,'Avenue'),(721,62,'Maraton'),(730,63,'Kent'),(731,63,'Doruk'),(740,64,'Atak'),(741,64,'Jest Electric'),(750,65,'Citiport'),
(800,70,'Actros'),(801,70,'Arocs'),(810,71,'F-MAX'),(811,71,'Cargo'),(820,72,'TGX'),(821,72,'TGS'),(830,73,'FH'),(831,73,'FM'),(840,74,'R Serisi'),(841,74,'S Serisi'),(850,75,'XF'),(851,75,'XG'),(860,76,'S-Way'),(861,76,'Eurocargo');


-- Revizyon 3 genişletilmiş araç kataloğu
INSERT INTO vehicle_brands (id, vehicle_type_id, name) VALUES
(100,1,'Alfa Romeo'),
(101,1,'Chevrolet'),
(102,1,'Cupra'),
(103,1,'Jeep'),
(104,1,'Land Rover'),
(105,1,'Lexus'),
(106,1,'Mazda'),
(107,1,'MG'),
(108,1,'MINI'),
(109,1,'Mitsubishi'),
(110,1,'Porsche'),
(111,1,'Subaru'),
(112,1,'Suzuki'),
(113,1,'DS Automobiles'),
(114,1,'BYD'),
(115,1,'Chery'),
(116,1,'Omoda'),
(117,1,'Jaecoo'),
(118,1,'Leapmotor'),
(119,1,'Skywell');

INSERT INTO vehicle_models (id, brand_id, name) VALUES
(1000,1,'Arteon'),
(1001,1,'Bora'),
(1002,1,'CC'),
(1003,1,'Jetta'),
(1004,1,'Taigo'),
(1005,1,'Touareg'),
(1006,1,'Touran'),
(1007,1,'ID.3'),
(1008,1,'ID.4'),
(1009,1,'ID.5'),
(1010,1,'ID.7'),
(1011,2,'Rafale'),
(1012,2,'Koleos'),
(1013,2,'Kadjar'),
(1014,2,'Fluence'),
(1015,2,'Symbol'),
(1016,2,'Latitude'),
(1017,2,'Laguna'),
(1018,2,'Scenic'),
(1019,2,'Espace'),
(1020,2,'Zoe'),
(1021,3,'600'),
(1022,3,'500X'),
(1023,3,'500L'),
(1024,3,'Bravo'),
(1025,3,'Linea'),
(1026,3,'Albea'),
(1027,3,'Palio'),
(1028,3,'Punto'),
(1029,3,'Marea'),
(1030,3,'Siena'),
(1031,3,'Stilo'),
(1032,4,'Auris'),
(1033,4,'Avensis'),
(1034,4,'Camry'),
(1035,4,'Prius'),
(1036,4,'Land Cruiser'),
(1037,4,'Proace City'),
(1038,4,'Hilux'),
(1039,4,'GR Yaris'),
(1040,4,'Supra'),
(1041,4,'bZ4X'),
(1042,5,'Fiesta'),
(1043,5,'Mondeo'),
(1044,5,'EcoSport'),
(1045,5,'Explorer'),
(1046,5,'Mustang'),
(1047,5,'Ranger'),
(1048,5,'Tourneo Courier'),
(1049,5,'Tourneo Connect'),
(1050,5,'Edge'),
(1051,6,'Accent Blue'),
(1052,6,'Accent Era'),
(1053,6,'Elantra'),
(1054,6,'Kona'),
(1055,6,'Santa Fe'),
(1056,6,'Getz'),
(1057,6,'Matrix'),
(1058,6,'Sonata'),
(1059,6,'Ioniq 6'),
(1060,6,'Staria'),
(1061,7,'Accord'),
(1062,7,'CR-Z'),
(1063,7,'CRX'),
(1064,7,'Integra'),
(1065,7,'Prelude'),
(1066,7,'S2000'),
(1067,7,'e:Ny1'),
(1068,7,'ZR-V'),
(1069,8,'107'),
(1070,8,'108'),
(1071,8,'207'),
(1072,8,'307'),
(1073,8,'407'),
(1074,8,'206'),
(1075,8,'301'),
(1076,8,'408'),
(1077,8,'5008'),
(1078,8,'Rifter'),
(1079,9,'C1'),
(1080,9,'C2'),
(1081,9,'C-Elysee'),
(1082,9,'C4 Cactus'),
(1083,9,'C5'),
(1084,9,'C5 X'),
(1085,9,'Berlingo Multispace'),
(1086,9,'Saxo'),
(1087,9,'Xsara'),
(1088,10,'Insignia'),
(1089,10,'Vectra'),
(1090,10,'Meriva'),
(1091,10,'Zafira'),
(1092,10,'Crossland'),
(1093,10,'Combo Life'),
(1094,10,'Adam'),
(1095,10,'Antara'),
(1096,10,'Calibra'),
(1097,11,'B Serisi'),
(1098,11,'S Serisi'),
(1099,11,'CLS'),
(1100,11,'GLB'),
(1101,11,'GLC'),
(1102,11,'GLE'),
(1103,11,'GLS'),
(1104,11,'EQB'),
(1105,11,'EQE'),
(1106,11,'EQS'),
(1107,11,'SLK'),
(1108,12,'2 Serisi'),
(1109,12,'4 Serisi'),
(1110,12,'6 Serisi'),
(1111,12,'7 Serisi'),
(1112,12,'X2'),
(1113,12,'X4'),
(1114,12,'X5'),
(1115,12,'X6'),
(1116,12,'X7'),
(1117,12,'i4'),
(1118,12,'i5'),
(1119,12,'iX'),
(1120,13,'A1'),
(1121,13,'A5'),
(1122,13,'A7'),
(1123,13,'A8'),
(1124,13,'Q2'),
(1125,13,'Q4 e-tron'),
(1126,13,'Q7'),
(1127,13,'Q8'),
(1128,13,'e-tron GT'),
(1129,13,'TT'),
(1130,14,'Rapid'),
(1131,14,'Roomster'),
(1132,14,'Kamiq'),
(1133,14,'Kodiaq'),
(1134,14,'Enyaq'),
(1135,14,'Yeti'),
(1136,14,'Citigo'),
(1137,15,'Logan'),
(1138,15,'Lodgy'),
(1139,15,'Dokker'),
(1140,15,'Spring'),
(1141,15,'Solenza'),
(1142,16,'Almera'),
(1143,16,'Primera'),
(1144,16,'Note'),
(1145,16,'Pulsar'),
(1146,16,'Leaf'),
(1147,16,'Navara'),
(1148,16,'Pathfinder'),
(1149,16,'Patrol'),
(1150,16,'Ariya'),
(1151,17,'Cerato'),
(1152,17,'Ceed'),
(1153,17,'ProCeed'),
(1154,17,'Niro'),
(1155,17,'Sorento'),
(1156,17,'Soul'),
(1157,17,'XCeed'),
(1158,17,'EV9'),
(1159,18,'Toledo'),
(1160,18,'Cordoba'),
(1161,18,'Altea'),
(1162,18,'Tarraco'),
(1163,19,'S40'),
(1164,19,'S80'),
(1165,19,'V40'),
(1166,19,'V60'),
(1167,19,'V90'),
(1168,19,'XC90'),
(1169,19,'C40'),
(1170,19,'EX90'),
(1171,20,'Cybertruck'),
(1172,20,'Roadster'),
(1173,21,'T10X V1 RWD'),
(1174,21,'T10X V2 RWD'),
(1175,21,'T10X V2 AWD'),
(1176,100,'Giulietta'),
(1177,100,'Giulia'),
(1178,100,'Stelvio'),
(1179,100,'Tonale'),
(1180,100,'MiTo'),
(1181,100,'159'),
(1182,100,'Brera'),
(1183,101,'Aveo'),
(1184,101,'Cruze'),
(1185,101,'Captiva'),
(1186,101,'Trax'),
(1187,101,'Spark'),
(1188,101,'Lacetti'),
(1189,101,'Camaro'),
(1190,101,'Corvette'),
(1191,102,'Formentor'),
(1192,102,'Leon'),
(1193,102,'Ateca'),
(1194,102,'Born'),
(1195,102,'Tavascan'),
(1196,102,'Terramar'),
(1197,103,'Avenger'),
(1198,103,'Renegade'),
(1199,103,'Compass'),
(1200,103,'Cherokee'),
(1201,103,'Grand Cherokee'),
(1202,103,'Wrangler'),
(1203,103,'Gladiator'),
(1204,104,'Range Rover'),
(1205,104,'Range Rover Sport'),
(1206,104,'Range Rover Evoque'),
(1207,104,'Range Rover Velar'),
(1208,104,'Discovery'),
(1209,104,'Discovery Sport'),
(1210,104,'Defender'),
(1211,104,'Freelander'),
(1212,105,'LBX'),
(1213,105,'UX'),
(1214,105,'NX'),
(1215,105,'RX'),
(1216,105,'ES'),
(1217,105,'IS'),
(1218,105,'LS'),
(1219,105,'LC'),
(1220,105,'RZ'),
(1221,106,'Mazda2'),
(1222,106,'Mazda3'),
(1223,106,'Mazda6'),
(1224,106,'CX-3'),
(1225,106,'CX-30'),
(1226,106,'CX-5'),
(1227,106,'CX-60'),
(1228,106,'MX-5'),
(1229,107,'MG3'),
(1230,107,'MG4'),
(1231,107,'MG5'),
(1232,107,'ZS'),
(1233,107,'HS'),
(1234,107,'Marvel R'),
(1235,107,'Cyberster'),
(1236,108,'Cooper'),
(1237,108,'Countryman'),
(1238,108,'Clubman'),
(1239,108,'Aceman'),
(1240,108,'Paceman'),
(1241,109,'Colt'),
(1242,109,'Lancer'),
(1243,109,'ASX'),
(1244,109,'Eclipse Cross'),
(1245,109,'Outlander'),
(1246,109,'Space Star'),
(1247,109,'Pajero'),
(1248,110,'718 Boxster'),
(1249,110,'718 Cayman'),
(1250,110,'911'),
(1251,110,'Taycan'),
(1252,110,'Panamera'),
(1253,110,'Macan'),
(1254,110,'Cayenne'),
(1255,111,'Impreza'),
(1256,111,'Legacy'),
(1257,111,'Levorg'),
(1258,111,'XV'),
(1259,111,'Crosstrek'),
(1260,111,'Forester'),
(1261,111,'Outback'),
(1262,111,'BRZ'),
(1263,112,'Swift'),
(1264,112,'Baleno'),
(1265,112,'Ignis'),
(1266,112,'Vitara'),
(1267,112,'S-Cross'),
(1268,112,'Jimny'),
(1269,112,'Across'),
(1270,113,'DS 3'),
(1271,113,'DS 4'),
(1272,113,'DS 7'),
(1273,113,'DS 9'),
(1274,114,'Atto 3'),
(1275,114,'Dolphin'),
(1276,114,'Seal'),
(1277,114,'Seal U'),
(1278,114,'Han'),
(1279,114,'Tang'),
(1280,115,'Tiggo 4 Pro'),
(1281,115,'Tiggo 7 Pro'),
(1282,115,'Tiggo 8 Pro'),
(1283,115,'Arrizo 5'),
(1284,115,'Arrizo 8'),
(1285,116,'Omoda 5'),
(1286,116,'Omoda E5'),
(1287,116,'Omoda 7'),
(1288,117,'J7'),
(1289,117,'J8'),
(1290,118,'T03'),
(1291,118,'C10'),
(1292,119,'ET5'),
(1293,119,'HT-i');

INSERT INTO premium_plans (id, code, name_tr, name_en, billing_period, price, currency) VALUES
(1, 'premium_monthly', 'RoadPass Premium Aylık', 'RoadPass Premium Monthly', 'monthly', 149.90, 'TRY'),
(2, 'premium_yearly', 'RoadPass Premium Yıllık', 'RoadPass Premium Yearly', 'yearly', 1199.90, 'TRY');

-- Demo hesap şifresi: Demo1234
INSERT INTO users (id, role, full_name, phone, email, password_hash, status) VALUES
(1, 'admin', 'Mert Yılmaz', '0532 555 12 34', 'demo@roadpass.local', '$2y$12$OEdeeGT8SBOu4BQnnzhACu8WkAJ41L8bPD5IEXgM6YCuzq0tNLoAe', 'active');

INSERT INTO user_settings (user_id, theme, language, push_enabled, email_enabled, premium_theme_enabled, simple_mode, large_text, accent_theme) VALUES
(1, 'dark', 'tr', 1, 1, 1, 0, 0, 'aurora');

INSERT INTO payment_methods (id,user_id,provider,demo_token,card_brand,card_last4,holder_name,expiry_month,expiry_year,is_default) VALUES
(1,1,'roadpass_demo','demo-token-roadpass-4242','Visa','4242','MERT YILMAZ',12,2029,1);

INSERT INTO subscriptions (id,user_id, plan_id, status, starts_at, ends_at, cancelled_at, auto_renew, payment_method_id, is_demo) VALUES
(1,1, 1, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH), NULL, 1, 1, 1);

INSERT INTO subscription_payments (user_id,subscription_id,plan_id,amount,currency,status,reference_code,card_brand,card_last4,description,is_demo,created_at) VALUES
(1,1,1,149.90,'TRY','completed','RP-PRO-DEMO-1001','Visa','4242','RoadPass Premium demo abonelik ödemesi',1,NOW());

INSERT INTO hgs_accounts (id, user_id, label, balance, auto_topup, auto_topup_amount, low_balance_limit) VALUES
(1, 1, 'Ana HGS Hesabı', 1845.50, 1, 750.00, 300.00);

INSERT INTO hgs_transactions (user_id, hgs_account_id, transaction_type, amount, status, payment_method, reference_code, description, is_demo, created_at) VALUES
(1,1,'topup',1000.00,'completed','Demo Kart','RP-DEMO-1001','Demo bakiye yükleme',1,DATE_SUB(NOW(), INTERVAL 18 DAY)),
(1,1,'topup',750.00,'completed','Otomatik Yükleme','RP-DEMO-1002','Düşük bakiye otomatik yükleme',1,DATE_SUB(NOW(), INTERVAL 5 DAY));

INSERT INTO vehicles (id, user_id, vehicle_type_id, brand_id, model_id, brand, model, plate, color, vehicle_type, hgs_tag, is_default) VALUES
(1, 1, 1, 1, 101, 'Volkswagen', 'Passat', '34 RDP 2026', 'Siyah', 'Otomobil', 'HGSTR482901', 1),
(2, 1, 1, 2, 110, 'Renault', 'Clio', '06 RDP 34', 'Beyaz', 'Otomobil', 'HGSTR923114', 0);

UPDATE vehicles SET manufacture_year=2021, body_type='Sedan', fuel_type='diesel', transmission='automatic', engine_label='2.0 TDI', average_consumption=5.7, tank_capacity=66, current_fuel_liters=38 WHERE id=1;
UPDATE vehicles SET manufacture_year=2023, body_type='Hatchback', fuel_type='gasoline', transmission='automatic', engine_label='1.0 TCe', average_consumption=6.1, tank_capacity=42, current_fuel_liters=24 WHERE id=2;

INSERT INTO passages (user_id, vehicle_id, location, road_name, gate_name, amount, status, passed_at, source) VALUES
(1, 1, '15 Temmuz Şehitler Köprüsü', 'O-1', 'Avrupa → Anadolu', 47.50, 'completed', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'demo'),
(1, 1, 'Kuzey Marmara Otoyolu', 'O-7', 'Kurnaköy Gişeleri', 96.00, 'completed', DATE_SUB(NOW(), INTERVAL 1 DAY), 'demo'),
(1, 2, 'Avrasya Tüneli', 'D100 Bağlantısı', 'Kazlıçeşme → Göztepe', 225.00, 'completed', DATE_SUB(NOW(), INTERVAL 2 DAY), 'demo'),
(1, 1, 'Anadolu Otoyolu', 'O-4', 'Çamlıca Gişeleri', 84.75, 'completed', DATE_SUB(NOW(), INTERVAL 3 DAY), 'demo'),
(1, 1, 'Yavuz Sultan Selim Köprüsü', 'O-7', 'Garipçe → Poyrazköy', 80.00, 'completed', DATE_SUB(NOW(), INTERVAL 5 DAY), 'demo'),
(1, 2, 'İzmir Çevre Yolu', 'O-30', 'Işıkkent Gişeleri', 31.50, 'completed', DATE_SUB(NOW(), INTERVAL 8 DAY), 'demo'),
(1, 1, 'Osmangazi Köprüsü', 'O-5', 'Dilovası → Altınova', 795.00, 'completed', DATE_SUB(NOW(), INTERVAL 11 DAY), 'demo'),
(1, 1, 'Ankara-Niğde Otoyolu', 'O-21', 'Gölbaşı Gişeleri', 146.00, 'completed', DATE_SUB(NOW(), INTERVAL 14 DAY), 'demo');

INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES
(1, 'passage', 'Yeni geçiş kaydı', '15 Temmuz Şehitler Köprüsü geçişiniz 47,50 ₺ olarak kaydedildi.', 0, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(1, 'low_balance', 'Bakiye analiziniz hazır', 'Mevcut harcama hızınıza göre bakiyeniz yeterli görünüyor.', 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(1, 'campaign', 'Hafta sonu rota önerisi', 'Yoğunluğu azaltmak için alternatif saat önerilerini inceleyin.', 1, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(1, 'topup', 'Otomatik yükleme aktif', 'Bakiyeniz 300 ₺ altına düştüğünde 750 ₺ otomatik yükleme yapılacak.', 1, DATE_SUB(NOW(), INTERVAL 5 DAY)),
(1, 'premium', 'RoadPass Premium aktif', 'Demo hesabınızda Premium özellikleri deneyebilirsiniz.', 0, DATE_SUB(NOW(), INTERVAL 1 HOUR));

INSERT INTO journey_plans (user_id,vehicle_id,origin,destination,estimated_toll,toll_status,total_complete,estimated_duration_seconds,estimated_distance_meters,estimated_fuel_cost,estimated_total_cost,created_at) VALUES
(1,1,'İstanbul','Bursa',795.00,'verified_corridor_estimate',1,6900,154000,745.00,1540.00,DATE_SUB(NOW(),INTERVAL 3 DAY));

INSERT INTO ai_messages (user_id, role, content, mode, created_at) VALUES
(1, 'assistant', 'Merhaba! RoadPass hesabınız, araçlarınız, HGS bakiyeniz, geçişleriniz ve yolculuk planlarınız hakkında yardımcı olabilirim.', 'system-welcome', DATE_SUB(NOW(), INTERVAL 1 DAY));


INSERT INTO saved_addresses (user_id,label,address_type,province,district,neighborhood,street,building_no,full_address,is_default_origin) VALUES
(1,'Ev','home','İstanbul','Kadıköy','Kozyatağı','Bayar Caddesi','12','Kozyatağı Mahallesi, Bayar Caddesi No:12, Kadıköy/İstanbul',1),
(1,'İş','work','İstanbul','Şişli','Esentepe','Büyükdere Caddesi','110','Esentepe Mahallesi, Büyükdere Caddesi No:110, Şişli/İstanbul',0);

INSERT INTO vehicle_expenses (user_id,vehicle_id,category,amount,odometer_km,description,expense_date) VALUES
(1,1,'fuel',1850.00,84250,'Motorin dolumu',DATE_SUB(CURRENT_DATE,INTERVAL 6 DAY)),
(1,1,'maintenance',4250.00,83500,'Periyodik bakım',DATE_SUB(CURRENT_DATE,INTERVAL 22 DAY)),
(1,2,'fuel',1250.00,31400,'Benzin dolumu',DATE_SUB(CURRENT_DATE,INTERVAL 3 DAY)),
(1,2,'parking',280.00,NULL,'Aylık otopark',CURRENT_DATE);

INSERT INTO vehicle_reminders (user_id,vehicle_id,reminder_type,title,due_date,due_odometer_km,notes) VALUES
(1,1,'inspection','Araç muayenesi',DATE_ADD(CURRENT_DATE,INTERVAL 24 DAY),NULL,'Randevu tarihini önceden planlayın.'),
(1,1,'maintenance','Periyodik bakım',DATE_ADD(CURRENT_DATE,INTERVAL 60 DAY),90000,'Yağ ve filtre değişimi.'),
(1,2,'insurance','Trafik sigortası yenileme',DATE_ADD(CURRENT_DATE,INTERVAL 45 DAY),NULL,'Poliçe tekliflerini karşılaştırın.');

INSERT INTO fuel_stations (name,province,district,address,latitude,longitude,is_24h,source) VALUES
('RoadPass Demo İstasyon Kozyatağı','İstanbul','Kadıköy','Kozyatağı, Kadıköy/İstanbul',40.9689000,29.0954000,1,'demo'),
('RoadPass Demo İstasyon Ümraniye','İstanbul','Ümraniye','Şerifali, Ümraniye/İstanbul',41.0005000,29.1289000,1,'demo'),
('RoadPass Demo İstasyon Çankaya','Ankara','Çankaya','Söğütözü, Çankaya/Ankara',39.9126000,32.8083000,1,'demo'),
('RoadPass Demo İstasyon Nilüfer','Bursa','Nilüfer','Odunluk, Nilüfer/Bursa',40.2096000,28.9890000,1,'demo'),
('RoadPass Demo İstasyon Bornova','İzmir','Bornova','Kazımdirik, Bornova/İzmir',38.4557000,27.2149000,1,'demo'),
('RoadPass Demo İstasyon Konyaaltı','Antalya','Konyaaltı','Arapsuyu, Konyaaltı/Antalya',36.8838000,30.6531000,1,'demo'),
('RoadPass Demo İstasyon Seyhan','Adana','Seyhan','Reşatbey, Seyhan/Adana',36.9915000,35.3260000,1,'demo'),
('RoadPass Demo İstasyon İzmit','Kocaeli','İzmit','Yahya Kaptan, İzmit/Kocaeli',40.7666000,29.9477000,1,'demo');


SET FOREIGN_KEY_CHECKS = 1;
