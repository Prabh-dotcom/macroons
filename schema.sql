-- =====================================================================
-- BATTERY ERP - PRODUCTION DATABASE SCHEMA (v4 -- dispatch + warranty + replacement extra fields merged)
-- Engine: MySQL 8.0+
-- Naming convention: snake_case, singular table names avoided in favor
-- of plural (industry standard), every table has id PK + timestamps.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS battery_erp
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE battery_erp;

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 1. USERS  (Admin / Staff who log into the /admin panel)
-- =====================================================================
CREATE TABLE users (
    user_id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name       VARCHAR(100)    NOT NULL,
    email           VARCHAR(150)    NOT NULL,
    mobile          VARCHAR(15)     NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,          -- bcrypt hash, NEVER plain text
    role            ENUM('super_admin','admin','staff') NOT NULL DEFAULT 'staff',
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    last_login_at   DATETIME        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_mobile (mobile)
) ENGINE=InnoDB;

-- =====================================================================
-- 2. DEALERS  (Dealer master + their own login for /dealer portal)
-- =====================================================================
CREATE TABLE dealers (
    dealer_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dealer_code     VARCHAR(20)     NOT NULL,          -- e.g. DLR1000 (human friendly, shown in UI)
    login_id        VARCHAR(50)     NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    dealer_name     VARCHAR(150)    NOT NULL,
    contact_person  VARCHAR(100)    NULL,
    phone           VARCHAR(15)     NOT NULL,
    email           VARCHAR(150)    NULL,
    address_line    VARCHAR(255)    NULL,
    city            VARCHAR(100)    NULL,
    district        VARCHAR(100)    NULL,
    state           VARCHAR(100)    NULL,
    pincode         VARCHAR(10)     NULL,
    gst_number      VARCHAR(20)     NULL,
    photo_path      VARCHAR(255)    NULL,             -- dealer's own profile photo (uploads/dealers/<file>)
    dealer_status   ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
    reward_eligible TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dealers_code (dealer_code),
    UNIQUE KEY uq_dealers_login_id (login_id),
    INDEX idx_dealers_status (dealer_status),
    INDEX idx_dealers_city (city)
) ENGINE=InnoDB;

-- Dealer documents: ek dealer ke multiple documents ho sakte hain
-- (GST cert, shop license, ID proof) -- isliye alag table, dealers
-- table me nahi (warna repeating columns doc1, doc2, doc3 bante).
CREATE TABLE dealer_documents (
    document_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dealer_id       INT UNSIGNED    NOT NULL,
    document_type   VARCHAR(50)     NOT NULL,          -- e.g. 'GST Certificate', 'Aadhar'
    file_path       VARCHAR(255)    NOT NULL,
    uploaded_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_docs_dealer
        FOREIGN KEY (dealer_id) REFERENCES dealers(dealer_id)
        ON DELETE CASCADE,
    INDEX idx_docs_dealer (dealer_id)
) ENGINE=InnoDB;

-- =====================================================================
-- 3. PRODUCT CATALOG  (normalized so "Category"/"Product" text doesn't
--    get typed inconsistently across hundreds of inventory rows)
-- =====================================================================
CREATE TABLE product_categories (
    category_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_name   VARCHAR(100)    NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_category_name (category_name)
) ENGINE=InnoDB;

CREATE TABLE products (
    product_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id     INT UNSIGNED    NOT NULL,
    product_name    VARCHAR(150)    NOT NULL,
    model_name      VARCHAR(100)    NOT NULL,
    warranty_months INT UNSIGNED    NOT NULL DEFAULT 12,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_category
        FOREIGN KEY (category_id) REFERENCES product_categories(category_id)
        ON DELETE RESTRICT,
    UNIQUE KEY uq_product_model (product_name, model_name),
    INDEX idx_products_category (category_id)
) ENGINE=InnoDB;

-- =====================================================================
-- 4. INVENTORY  (the most important table -- one row per physical
--    battery, identified by its serial number. Warranty, dispatch,
--    replacement all point back to this table.)
-- =====================================================================
CREATE TABLE inventory (
    inventory_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id      INT UNSIGNED    NOT NULL,
    serial_number   VARCHAR(50)     NOT NULL,
    batch_number    VARCHAR(50)     NULL,
    mfg_date        DATE            NOT NULL,
    status          ENUM('in_stock','dispatched','sold','defective','returned')
                                     NOT NULL DEFAULT 'in_stock',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_inventory_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON DELETE RESTRICT,
    UNIQUE KEY uq_inventory_serial (serial_number),
    INDEX idx_inventory_status (status),
    INDEX idx_inventory_batch (batch_number)
) ENGINE=InnoDB;

-- =====================================================================
-- 5. DISPATCH  (invoice-level header + line items)
--    Header/line split kyunki ek invoice me kai serials jaate hain --
--    agar sab ek row me daalte to serial column me comma-separated
--    values aati, jo query/search/report sabko tod deta.
--
--    company_name, transport_name, lr_number, remarks -- yeh 4 columns
--    frontend form (dispatch.html) me the, ab yahan schema me bhi
--    directly merge kar diye taaki fresh install pe alag migration
--    na chalani pade.
-- =====================================================================
-- FIX_dispatch_table.sql
--
-- Yeh EK HI file hai jo chalani hai. Kuch aur nahi karna.
--
-- Yeh dispatch aur dispatch_items table ko DROP karke (mita ke) dobara
-- sahi structure ke saath banata hai -- safe hai kyunki abhi tak in
-- tables me koi successful data save nahi hua (har save error ki wajah
-- se fail hua tha).

USE battery_erp;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS dispatch_items;
DROP TABLE IF EXISTS dispatch;

CREATE TABLE dispatch (
    dispatch_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_number  VARCHAR(50)     NOT NULL,
    company_name    VARCHAR(150)    NULL,
    dealer_id       INT UNSIGNED    NOT NULL,
    dispatch_date   DATE            NOT NULL,
    transport_name  VARCHAR(150)    NULL,
    lr_number       VARCHAR(50)     NULL,
    remarks         VARCHAR(255)    NULL,
    status          ENUM('pending','dispatched','delivered','cancelled')
                                     NOT NULL DEFAULT 'pending',
    created_by      INT UNSIGNED    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dispatch_dealer
        FOREIGN KEY (dealer_id) REFERENCES dealers(dealer_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_dispatch_user
        FOREIGN KEY (created_by) REFERENCES users(user_id)
        ON DELETE SET NULL,
    UNIQUE KEY uq_dispatch_invoice (invoice_number),
    INDEX idx_dispatch_dealer (dealer_id),
    INDEX idx_dispatch_date (dispatch_date),
    INDEX idx_dispatch_status (status)
) ENGINE=InnoDB;

CREATE TABLE dispatch_items (
    dispatch_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dispatch_id      INT UNSIGNED    NOT NULL,
    inventory_id     BIGINT UNSIGNED NOT NULL,
    CONSTRAINT fk_ditems_dispatch
        FOREIGN KEY (dispatch_id) REFERENCES dispatch(dispatch_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ditems_inventory
        FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id)
        ON DELETE RESTRICT,
    UNIQUE KEY uq_ditems_inventory (inventory_id),
    INDEX idx_ditems_dispatch (dispatch_id)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;


-- =====================================================================
-- 6. WARRANTY  (customer activation against a serial number)
--
--    invoice_number, purchase_date, customer_email/state/district/city/
--    pincode/address, activated_by, remarks -- yeh sab baad me add hue
--    (frontend form me the, original schema me nahi thi). Status enum
--    me 'pending' bhi add kiya gaya (form me "Pending" option tha).
-- =====================================================================
CREATE TABLE warranty (
    warranty_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    inventory_id      BIGINT UNSIGNED NOT NULL,
    dealer_id         INT UNSIGNED    NOT NULL,
    invoice_number    VARCHAR(50)     NULL,
    purchase_date     DATE            NULL,
    customer_name     VARCHAR(150)    NOT NULL,
    customer_phone    VARCHAR(15)     NOT NULL,
    customer_email    VARCHAR(150)    NULL,
    customer_state    VARCHAR(100)    NULL,
    customer_district VARCHAR(100)    NULL,
    customer_city     VARCHAR(100)    NULL,
    customer_pincode  VARCHAR(10)     NULL,
    customer_address  VARCHAR(255)    NULL,
    activation_date   DATE            NOT NULL,
    expiry_date       DATE            NOT NULL,
    status            ENUM('pending','active','expired','claimed') NOT NULL DEFAULT 'pending',
    activated_by      INT UNSIGNED    NULL,          -- which staff user activated it
    remarks           VARCHAR(255)    NULL,
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_warranty_inventory
        FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_warranty_dealer
        FOREIGN KEY (dealer_id) REFERENCES dealers(dealer_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_warranty_activated_by
        FOREIGN KEY (activated_by) REFERENCES users(user_id)
        ON DELETE SET NULL,
    UNIQUE KEY uq_warranty_inventory (inventory_id), -- ek serial ki ek hi active warranty
    INDEX idx_warranty_dealer (dealer_id),
    INDEX idx_warranty_status (status),
    INDEX idx_warranty_expiry (expiry_date)
) ENGINE=InnoDB;

-- =====================================================================
-- 7. REPLACEMENT  (old serial swapped for new serial under warranty)
--
--    company_name, complaint_type, inspection_status/remarks,
--    customer_city/address, replacement_date -- yeh sab baad me add
--    hue (frontend form me the, original schema me nahi thi).
-- =====================================================================
CREATE TABLE replacements (
    replacement_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    old_inventory_id    BIGINT UNSIGNED NOT NULL,
    new_inventory_id    BIGINT UNSIGNED NULL,        -- null until a new serial is actually assigned
    replacement_date    DATE            NULL,
    dealer_id           INT UNSIGNED    NOT NULL,
    company_name         VARCHAR(150)    NULL,
    customer_name        VARCHAR(150)    NOT NULL,
    customer_phone       VARCHAR(15)     NOT NULL,
    customer_city         VARCHAR(100)    NULL,
    customer_address      VARCHAR(255)    NULL,
    reason               VARCHAR(255)    NULL,
    complaint_type        VARCHAR(150)    NULL,
    invoice_number        VARCHAR(100)    NULL,
    battery_condition     VARCHAR(50)     NULL,
    problem_description   VARCHAR(500)    NULL,
    battery_images        VARCHAR(1000)   NULL,
    invoice_file          VARCHAR(255)    NULL,
    inspection_status     VARCHAR(50)     NULL,
    inspection_remarks    VARCHAR(255)    NULL,
    status                ENUM('pending','approved','completed','rejected')
                                         NOT NULL DEFAULT 'pending',
    created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_replacement_old
        FOREIGN KEY (old_inventory_id) REFERENCES inventory(inventory_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_replacement_new
        FOREIGN KEY (new_inventory_id) REFERENCES inventory(inventory_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_replacement_dealer
        FOREIGN KEY (dealer_id) REFERENCES dealers(dealer_id)
        ON DELETE RESTRICT,
    INDEX idx_replacement_dealer (dealer_id),
    INDEX idx_replacement_status (status)
) ENGINE=InnoDB;

-- =====================================================================
-- 8. REWARD WALLET  (points ledger per dealer -- credit/debit entries,
--    balance is DERIVED, never stored as a running total that can
--    drift out of sync)
-- =====================================================================
CREATE TABLE reward_transactions (
    transaction_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dealer_id            INT UNSIGNED    NOT NULL,
    transaction_date     DATE            NOT NULL,
    transaction_type     ENUM('credit','debit') NOT NULL,
    reference_type        VARCHAR(50)    NULL,        -- e.g. 'dispatch', 'redemption'
    reference_id           BIGINT UNSIGNED NULL,       -- points back to dispatch_id etc.
    points                INT             NOT NULL,
    remarks                VARCHAR(255)    NULL,
    status                  ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
    created_by              INT UNSIGNED    NULL,
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reward_dealer
        FOREIGN KEY (dealer_id) REFERENCES dealers(dealer_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_reward_user
        FOREIGN KEY (created_by) REFERENCES users(user_id)
        ON DELETE SET NULL,
    INDEX idx_reward_dealer (dealer_id),
    INDEX idx_reward_date (transaction_date)
) ENGINE=InnoDB;
-- NOTE: "Balance" column jo UI me dikhta hai woh yahan store nahi hoga.
-- Use hamesha SUM(CASE WHEN transaction_type='credit' THEN points ELSE -points END)
-- se calculate karenge (query neeche examples me hai). Isse balance kabhi
-- galat/out-of-sync nahi hoga chahe kitni bhi entries ho jayein.

-- =====================================================================
-- 9. AUDIT LOGS  (kaunse user ne kab kya badla -- production ERP me
--    yeh compliance/debugging ke liye zaroori hota hai)
-- =====================================================================
CREATE TABLE audit_logs (
    log_id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED    NULL,
    action          ENUM('create','update','delete') NOT NULL,
    table_name      VARCHAR(50)     NOT NULL,
    record_id       BIGINT UNSIGNED NOT NULL,
    old_value       JSON            NULL,
    new_value       JSON            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE SET NULL,
    INDEX idx_audit_table_record (table_name, record_id),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- HELPER VIEW: dealer_reward_balance
-- UI ke "Balance" column ke liye -- hamesha yeh view use karo,
-- kabhi manually balance store/update mat karo.
-- =====================================================================
CREATE OR REPLACE VIEW dealer_reward_balance AS
SELECT
    dealer_id,
    SUM(CASE WHEN transaction_type = 'credit' THEN points ELSE -points END) AS current_balance
FROM reward_transactions
WHERE status = 'approved'
GROUP BY dealer_id;

-- =====================================================================
-- NOTIFICATIONS
-- In-app notifications -- e.g. dealer replacement request -> admin ko
-- bell icon me notification. audience='admin' sab admins ko dikhta hai;
-- audience='dealer' sirf us dealer_id wale dealer ko.
-- =====================================================================
CREATE TABLE notifications (
    notification_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    audience          ENUM('admin','dealer') NOT NULL,
    dealer_id         INT UNSIGNED    NULL,
    title             VARCHAR(200)    NOT NULL,
    message           VARCHAR(500)    NULL,
    link              VARCHAR(255)    NULL,
    is_read           TINYINT(1)      NOT NULL DEFAULT 0,
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_dealer
        FOREIGN KEY (dealer_id) REFERENCES dealers(dealer_id)
        ON DELETE CASCADE,
    INDEX idx_notification_audience (audience, is_read),
    INDEX idx_notification_dealer (dealer_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- SYSTEM SETTINGS
-- Admin panel "Settings" page (Warranty/Reward/Security) yahan se
-- padhta-likhta hai -- simple key/value store.
-- =====================================================================
CREATE TABLE system_settings (
    setting_key    VARCHAR(100)  PRIMARY KEY,
    setting_value  VARCHAR(255)  NOT NULL,
    updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO system_settings (setting_key, setting_value) VALUES
    ('warranty_default_months',      '24'),
    ('warranty_start_from',          'dispatch_date'),
    ('grace_period_days',            '90'),
    ('replacement_allowed',          'yes'),
    ('warranty_expiry_alert',        'enabled'),
    ('reminder_before_expiry_days',  '30'),
    ('warranty_reward_points',       '50'),
    ('dispatch_reward_points',       '10'),
    ('replacement_reward_points',    '0'),
    ('min_redeem_points',            '500'),
    ('max_redeem_per_month',         '5000'),
    ('session_timeout_minutes',      '30'),
    ('two_factor_enabled',           'no');