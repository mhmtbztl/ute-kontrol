-- =============================================================================
-- UTE KONTROL MERKEZİ V5 - PRODUCTION DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- Uludağ Tatil Evleri: Seyir, Doğuş, Zirve, Şirin, Nefes
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROPERTIES (Mülkler / Villalar)
CREATE TABLE IF NOT EXISTS properties (
    id VARCHAR(20) PRIMARY KEY, -- 'SEYIR', 'DOGUS', 'ZIRVE', 'SIRIN', 'NEFES'
    name VARCHAR(100) NOT NULL,
    capacity INT NOT NULL,
    bedrooms INT NOT NULL,
    bathrooms NUMERIC(3,1) NOT NULL,
    distance_piste_km NUMERIC(4,1) NOT NULL,
    features TEXT[] DEFAULT '{}',
    floor_rate NUMERIC(10,2) NOT NULL,
    base_rate NUMERIC(10,2) NOT NULL,
    target_rate NUMERIC(10,2) NOT NULL,
    premium_rate NUMERIC(10,2) NOT NULL,
    peak_rate NUMERIC(10,2) NOT NULL,
    cleaning_cost NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
    heating_daily_cost NUMERIC(10,2) NOT NULL DEFAULT 400.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed UTE Properties
INSERT INTO properties (id, name, capacity, bedrooms, bathrooms, distance_piste_km, features, floor_rate, base_rate, target_rate, premium_rate, peak_rate, cleaning_cost, heating_daily_cost)
VALUES
('SEYIR', 'Seyir', 8, 2, 1.5, 24.0, ARRAY['Isı Pompası', 'Şömine', 'Soba', 'Kış Bahçesi', 'Otopark'], 3500, 4500, 6000, 8500, 12000, 800, 350),
('DOGUS', 'Doğuş', 11, 4, 2.0, 14.0, ARRAY['Isı Pompası', 'Şömine', 'Soba', 'Lüks Kış Bahçesi'], 5000, 6500, 9000, 13000, 18000, 1200, 500),
('ZIRVE', 'Zirve', 9, 3, 2.0, 12.0, ARRAY['Isı Pompası', 'Şömine', 'Sauna', 'Isıtmalı Jakuzi', 'Isıtmalı Çardak'], 6500, 8500, 12000, 16500, 24000, 1500, 700),
('SIRIN', 'Şirin', 7, 2, 1.0, 21.0, ARRAY['Isı Pompası', 'Şömine', 'Üst Teras', 'Kapalı Veranda'], 3000, 4000, 5500, 7500, 11000, 750, 300),
('NEFES', 'Nefes', 12, 4, 3.0, 21.0, ARRAY['Isı Pompası', 'Şömine', 'Soba', 'Isıtmalı Kış Bahçesi', 'Voleybol Alanı'], 5500, 7000, 9500, 14000, 19000, 1400, 550)
ON CONFLICT (id) DO UPDATE SET 
    floor_rate = EXCLUDED.floor_rate,
    base_rate = EXCLUDED.base_rate,
    target_rate = EXCLUDED.target_rate;

-- 2. LEADS (Müşteri Talepleri ve CRM Hunisi)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id VARCHAR(20) REFERENCES properties(id),
    guest_name VARCHAR(150) NOT NULL,
    guest_phone VARCHAR(50),
    channel VARCHAR(50) NOT NULL, -- 'WhatsApp', 'Instagram', 'Website', 'Airbnb', 'Booking', 'Phone'
    lead_date DATE NOT NULL DEFAULT CURRENT_DATE,
    requested_check_in DATE,
    requested_check_out DATE,
    pax INT,
    quote_amount NUMERIC(10,2) DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW', -- 'NEW', 'QUOTE_SENT', 'FOLLOW_UP', 'WON', 'LOST'
    lost_reason VARCHAR(100), -- 'FIYAT_YUKSEK', 'TARIH_DOLU', 'MUSAITLIK_YOK', 'CEVAP_VERMEDI', 'DIGER'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BOOKINGS (Kesinleşmiş Rezervasyonlar - Single Source of Truth)
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_code VARCHAR(50) UNIQUE NOT NULL,
    lead_id UUID REFERENCES leads(id),
    property_id VARCHAR(20) NOT NULL REFERENCES properties(id),
    guest_name VARCHAR(150) NOT NULL,
    guest_phone VARCHAR(50),
    channel VARCHAR(50) NOT NULL, -- 'Airbnb', 'Booking', 'WhatsApp', 'Instagram', 'Website', 'Repeat'
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    pax INT NOT NULL DEFAULT 2,
    gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    ota_commission NUMERIC(10,2) NOT NULL DEFAULT 0,
    cleaning_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_room_revenue NUMERIC(10,2) GENERATED ALWAYS AS (
        GREATEST(0, gross_amount - ota_commission - cleaning_fee - discount)
    ) STORED,
    nights INT GENERATED ALWAYS AS (
        (check_out - check_in)
    ) STORED,
    status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED', -- 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_dates CHECK (check_out > check_in)
);

-- 4. STAY NIGHT LEDGER (USALI Standardı - Gecelik Accrual Dağıtım Defteri)
CREATE TABLE IF NOT EXISTS stay_night_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    property_id VARCHAR(20) NOT NULL REFERENCES properties(id),
    stay_date DATE NOT NULL,
    year_month VARCHAR(7) NOT NULL, -- '2026-09'
    night_revenue NUMERIC(10,2) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    is_direct BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(booking_id, stay_date)
);

-- 5. MAINTENANCE & QUALITY (P1/P2/P3 Bakım ve Yatırım Defteri)
CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id VARCHAR(20) NOT NULL REFERENCES properties(id),
    title VARCHAR(200) NOT NULL,
    task_type VARCHAR(50) NOT NULL, -- 'Isıtma', 'Tesisat', 'Elektrik', 'Temizlik', 'Dekorasyon', 'Bahçe', 'Güvenlik'
    priority VARCHAR(10) NOT NULL CHECK (priority IN ('P1', 'P2', 'P3')),
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
    assignee VARCHAR(100),
    estimated_cost NUMERIC(10,2) DEFAULT 0,
    actual_cost NUMERIC(10,2) DEFAULT 0,
    downtime_nights INT DEFAULT 0,
    guest_impact INT CHECK (guest_impact BETWEEN 1 AND 5) DEFAULT 3,
    revenue_impact INT CHECK (revenue_impact BETWEEN 1 AND 5) DEFAULT 3,
    target_date DATE,
    completed_at DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. GOALS & DECISIONS (90 Günlük Proje ve Toplantı Defteri)
CREATE TABLE IF NOT EXISTS goals_and_decisions (
    id SERIAL PRIMARY KEY,
    meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
    title VARCHAR(255) NOT NULL,
    owner VARCHAR(100) NOT NULL,
    deadline DATE NOT NULL,
    budget NUMERIC(10,2) DEFAULT 0,
    impacted_kpi VARCHAR(100) NOT NULL, -- 'Occupancy', 'ADR', 'RevPAR', 'Direct Booking %', 'P1 Zero'
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNED', -- 'PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'
    result TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- AUTOMATIC STAY NIGHT SPLITTER TRIGGER (PHASE 1 ENGINE)
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_sync_booking_stay_nights()
RETURNS TRIGGER AS $$
DECLARE
    curr_date DATE;
    total_nights INT;
    nightly_rev NUMERIC(10,2);
    is_dir BOOLEAN;
BEGIN
    -- Delete existing ledger rows if updating
    DELETE FROM stay_night_ledger WHERE booking_id = NEW.id;

    IF NEW.status = 'CANCELLED' THEN
        RETURN NEW;
    END IF;

    total_nights := NEW.check_out - NEW.check_in;
    IF total_nights > 0 THEN
        nightly_rev := ROUND(NEW.net_room_revenue / total_nights, 2);
        is_dir := NEW.channel IN ('WhatsApp', 'Instagram', 'Website', 'Phone', 'Repeat');

        FOR i IN 0..(total_nights - 1) LOOP
            curr_date := NEW.check_in + i;
            INSERT INTO stay_night_ledger (
                booking_id,
                property_id,
                stay_date,
                year_month,
                night_revenue,
                channel,
                is_direct
            ) VALUES (
                NEW.id,
                NEW.property_id,
                curr_date,
                TO_CHAR(curr_date, 'YYYY-MM'),
                nightly_rev,
                NEW.channel,
                is_dir
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_booking_stay_nights
AFTER INSERT OR UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION fn_sync_booking_stay_nights();

-- =============================================================================
-- ANALYTICAL VIEWS (PHASE 2 & 10 ENGINE)
-- =============================================================================

-- View: Aylık Villa Performansı (USALI RevPAR & ADR)
CREATE OR REPLACE VIEW v_monthly_villa_performance AS
SELECT 
    l.year_month,
    l.property_id,
    p.name AS property_name,
    COUNT(l.id) AS paid_nights,
    SUM(l.night_revenue) AS total_net_revenue,
    ROUND(SUM(l.night_revenue) / NULLIF(COUNT(l.id), 0), 2) AS adr,
    SUM(CASE WHEN l.is_direct THEN l.night_revenue ELSE 0 END) AS direct_revenue,
    ROUND((SUM(CASE WHEN l.is_direct THEN l.night_revenue ELSE 0 END) / NULLIF(SUM(l.night_revenue), 0)) * 100, 1) AS direct_share_pct
FROM stay_night_ledger l
JOIN properties p ON p.id = l.property_id
GROUP BY l.year_month, l.property_id, p.name;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals_and_decisions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Authenticated users can read all" ON properties FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage bookings" ON bookings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage leads" ON leads FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage maintenance" ON maintenance_tasks FOR ALL USING (auth.role() = 'authenticated');
