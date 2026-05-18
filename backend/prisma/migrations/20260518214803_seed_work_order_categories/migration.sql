-- Seed default Work Order Categories
-- ON CONFLICT DO NOTHING makes this idempotent (safe to re-run)

INSERT INTO work_order_categories (id, name, module, "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  -- Technology
  (gen_random_uuid(), 'Hardware Failure',       'TECHNOLOGY', true,  1,  NOW(), NOW()),
  (gen_random_uuid(), 'Software Issue',         'TECHNOLOGY', true,  2,  NOW(), NOW()),
  (gen_random_uuid(), 'Network / Connectivity', 'TECHNOLOGY', true,  3,  NOW(), NOW()),
  (gen_random_uuid(), 'Printer / Copier',       'TECHNOLOGY', true,  4,  NOW(), NOW()),
  (gen_random_uuid(), 'Phone / VoIP',           'TECHNOLOGY', true,  5,  NOW(), NOW()),
  (gen_random_uuid(), 'Account / Access',       'TECHNOLOGY', true,  6,  NOW(), NOW()),
  (gen_random_uuid(), 'New Equipment Setup',    'TECHNOLOGY', true,  7,  NOW(), NOW()),
  (gen_random_uuid(), 'Projector / Display',    'TECHNOLOGY', true,  8,  NOW(), NOW()),
  (gen_random_uuid(), 'Security Camera',        'TECHNOLOGY', true,  9,  NOW(), NOW()),
  (gen_random_uuid(), 'Other',                  'TECHNOLOGY', true,  10, NOW(), NOW()),
  -- Maintenance
  (gen_random_uuid(), 'Plumbing',               'MAINTENANCE', true, 1,  NOW(), NOW()),
  (gen_random_uuid(), 'Electrical',             'MAINTENANCE', true, 2,  NOW(), NOW()),
  (gen_random_uuid(), 'HVAC / Heating',         'MAINTENANCE', true, 3,  NOW(), NOW()),
  (gen_random_uuid(), 'HVAC / Cooling',         'MAINTENANCE', true, 4,  NOW(), NOW()),
  (gen_random_uuid(), 'Carpentry',              'MAINTENANCE', true, 5,  NOW(), NOW()),
  (gen_random_uuid(), 'Painting',               'MAINTENANCE', true, 6,  NOW(), NOW()),
  (gen_random_uuid(), 'Flooring',               'MAINTENANCE', true, 7,  NOW(), NOW()),
  (gen_random_uuid(), 'Roofing',                'MAINTENANCE', true, 8,  NOW(), NOW()),
  (gen_random_uuid(), 'Pest Control',           'MAINTENANCE', true, 9,  NOW(), NOW()),
  (gen_random_uuid(), 'Grounds / Landscaping',  'MAINTENANCE', true, 10, NOW(), NOW()),
  (gen_random_uuid(), 'Custodial',              'MAINTENANCE', true, 11, NOW(), NOW()),
  (gen_random_uuid(), 'Security / Locks',       'MAINTENANCE', true, 12, NOW(), NOW()),
  (gen_random_uuid(), 'Furniture / Equipment',  'MAINTENANCE', true, 13, NOW(), NOW()),
  (gen_random_uuid(), 'Other',                  'MAINTENANCE', true, 14, NOW(), NOW())
ON CONFLICT (name, module) DO NOTHING;