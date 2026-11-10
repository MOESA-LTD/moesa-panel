-- 056: masked api views for projects, markets, listings, incidents and change requests.
SELECT private.enable_field_security (t)
FROM unnest(ARRAY['project', 'project_gate', 'project_product', 'project_task', 'market_cell', 'listing_submission',
                  'incident', 'incident_deadline', 'incident_log', 'change_request', 'change_request_product']) AS t;
