-- OxyService backup database (Cloudflare D1)
-- Every record from the app is stored as one row; `data` is JSON.
--   kind = 'fill'     : no, date, customer, phone, size, startP, finalP, charge, manifold{1,2,3}, notes
--   kind = 'swap'     : position, date, serial, pressure, cost (refill cost), empty, notes
--   kind = 'service'  : date, status (in | ready | returned), customer, phone, size, serial, work, certDate, nextDue,
--                       charge, miles, tolls, otherCost, otherDesc, notes
--   kind = 'hire'     : system (S1 | S2 | S3 single place, T1 two place), status (booked | out | returned),
--                       period (day | weekend | week), qty, date (hire start), end (hire finish), customer, phone, charge, notes
--   kind = 'entry'    : type (rental | cost | income | mileage), date, desc, amount (miles for mileage)
--   kind = 'settings' : unit, fullPressure, lowPressure, defaultCharge, defaultRefillCost, sizes[]
CREATE TABLE IF NOT EXISTS records (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,   -- set by the device that made the change (last write wins)
  deleted    INTEGER NOT NULL DEFAULT 0,
  server_ts  INTEGER NOT NULL    -- when the server received it (used to send changes to other devices)
);
CREATE INDEX IF NOT EXISTS records_server_ts ON records (server_ts);
CREATE INDEX IF NOT EXISTS records_kind ON records (kind);

-- Handy read-only views for looking at the backup in the Cloudflare dashboard
CREATE VIEW IF NOT EXISTS fills AS
  SELECT json_extract(data,'$.no') AS fill_no, json_extract(data,'$.date') AS date,
         json_extract(data,'$.customer') AS customer, json_extract(data,'$.phone') AS phone,
         json_extract(data,'$.size') AS size, json_extract(data,'$.startP') AS start_pressure,
         json_extract(data,'$.finalP') AS final_pressure, json_extract(data,'$.charge') AS charge,
         json_extract(data,'$.manifold."1"') AS manifold_1, json_extract(data,'$.manifold."2"') AS manifold_2,
         json_extract(data,'$.manifold."3"') AS manifold_3, json_extract(data,'$.notes') AS notes
  FROM records WHERE kind = 'fill' AND deleted = 0;
CREATE VIEW IF NOT EXISTS cylinder_changes AS
  SELECT json_extract(data,'$.position') AS position, json_extract(data,'$.date') AS date,
         json_extract(data,'$.serial') AS serial, json_extract(data,'$.pressure') AS pressure,
         json_extract(data,'$.cost') AS refill_cost, json_extract(data,'$.empty') AS removed_only
  FROM records WHERE kind = 'swap' AND deleted = 0;
CREATE VIEW IF NOT EXISTS service_jobs AS
  SELECT json_extract(data,'$.date') AS date_in, json_extract(data,'$.status') AS status,
         json_extract(data,'$.customer') AS customer, json_extract(data,'$.phone') AS phone,
         json_extract(data,'$.size') AS size, json_extract(data,'$.serial') AS serial, json_extract(data,'$.work') AS work,
         json_extract(data,'$.certDate') AS certified_on, json_extract(data,'$.nextDue') AS next_test_due,
         json_extract(data,'$.charge') AS charge, json_extract(data,'$.miles') AS miles, json_extract(data,'$.tolls') AS tolls,
         json_extract(data,'$.otherCost') AS other_cost, json_extract(data,'$.otherDesc') AS other_cost_for, json_extract(data,'$.notes') AS notes
  FROM records WHERE kind = 'service' AND deleted = 0;
CREATE VIEW IF NOT EXISTS money_entries AS
  SELECT json_extract(data,'$.type') AS type, json_extract(data,'$.date') AS date,
         json_extract(data,'$.desc') AS description, json_extract(data,'$.amount') AS amount
  FROM records WHERE kind = 'entry' AND deleted = 0;
CREATE VIEW IF NOT EXISTS hires AS
  SELECT json_extract(data,'$.system') AS system, json_extract(data,'$.status') AS status,
         json_extract(data,'$.date') AS hire_start, json_extract(data,'$.end') AS hire_finish,
         json_extract(data,'$.period') AS period, json_extract(data,'$.qty') AS how_many,
         json_extract(data,'$.customer') AS customer, json_extract(data,'$.phone') AS phone,
         json_extract(data,'$.charge') AS charge, json_extract(data,'$.notes') AS notes
  FROM records WHERE kind = 'hire' AND deleted = 0;
