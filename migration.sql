SET NAMES utf8mb4;
USE roadpass;

-- RoadPass Revizyon 3 -> Revizyon 4
-- Verilerinizi koruyarak erişilebilirlik ve görünüm tercihlerini ekler.

SET @db := DATABASE();

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='user_settings' AND COLUMN_NAME='simple_mode'),
  'SELECT 1',
  'ALTER TABLE user_settings ADD COLUMN simple_mode TINYINT(1) NOT NULL DEFAULT 0 AFTER premium_theme_enabled'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='user_settings' AND COLUMN_NAME='large_text'),
  'SELECT 1',
  'ALTER TABLE user_settings ADD COLUMN large_text TINYINT(1) NOT NULL DEFAULT 0 AFTER simple_mode'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='user_settings' AND COLUMN_NAME='accent_theme'),
  'SELECT 1',
  'ALTER TABLE user_settings ADD COLUMN accent_theme ENUM(''aurora'',''mint'',''midnight'') NOT NULL DEFAULT ''aurora'' AFTER large_text'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE user_settings SET accent_theme='aurora' WHERE accent_theme IS NULL OR accent_theme='';


SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='journey_plans' AND COLUMN_NAME='toll_status'),
  'SELECT 1',
  'ALTER TABLE journey_plans ADD COLUMN toll_status VARCHAR(40) NOT NULL DEFAULT ''unverified'' AFTER estimated_toll'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='journey_plans' AND COLUMN_NAME='total_complete'),
  'SELECT 1',
  'ALTER TABLE journey_plans ADD COLUMN total_complete TINYINT(1) NOT NULL DEFAULT 0 AFTER toll_status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='journey_plans' AND COLUMN_NAME='estimated_toll' AND IS_NULLABLE='YES'),
  'SELECT 1',
  'ALTER TABLE journey_plans MODIFY COLUMN estimated_toll DECIMAL(12,2) NULL DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE journey_plans
SET toll_status = CASE WHEN estimated_toll > 0 THEN 'legacy_estimate' ELSE 'unverified' END,
    total_complete = CASE WHEN estimated_toll > 0 THEN 1 ELSE 0 END
WHERE toll_status='unverified' AND total_complete=0;

-- Revizyon 4, bilinmeyen rotalarda ücret uydurmak yerine 'doğrulanamadı' sonucu üretir.
-- 0 TL yalnızca ücretli yollardan kaçınma tercihi veya tanımlı ücretsiz alternatif için saklanır.
