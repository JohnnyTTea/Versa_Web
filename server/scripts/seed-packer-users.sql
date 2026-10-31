-- seed packer role and default warehouse users
INSERT INTO roles (role_name, description, created_time, can_warehouse)
SELECT 'packer', 'Warehouse packer', NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE LOWER(role_name) = 'packer'
);

UPDATE roles
SET can_warehouse = 1
WHERE LOWER(role_name) = 'packer';

INSERT INTO users (username, password, first_name, last_name, created_time, role_id, is_active)
SELECT 'Richardoa', 'ricardoa369', 'Ricardo', 'Aguirre', NOW(), r.id, 1
FROM roles r
WHERE LOWER(r.role_name) = 'packer'
AND NOT EXISTS (
  SELECT 1 FROM users WHERE LOWER(username) = 'richardoa'
)
UNION ALL
SELECT 'Carlog', 'carlog124', 'Carlo', 'Gonzalez', NOW(), r.id, 1
FROM roles r
WHERE LOWER(r.role_name) = 'packer'
AND NOT EXISTS (
  SELECT 1 FROM users WHERE LOWER(username) = 'carlog'
)
UNION ALL
SELECT 'Tianav', 'taniav354', 'Tania', 'Valdovinos', NOW(), r.id, 1
FROM roles r
WHERE LOWER(r.role_name) = 'packer'
AND NOT EXISTS (
  SELECT 1 FROM users WHERE LOWER(username) = 'tianav'
)
UNION ALL
SELECT 'Miguelm', 'miguelm751', 'Miguel', 'Montiel', NOW(), r.id, 1
FROM roles r
WHERE LOWER(r.role_name) = 'packer'
AND NOT EXISTS (
  SELECT 1 FROM users WHERE LOWER(username) = 'miguelm'
)
UNION ALL
SELECT 'Christopferc', 'christoperc152', 'Christopher', 'Chevry', NOW(), r.id, 1
FROM roles r
WHERE LOWER(r.role_name) = 'packer'
AND NOT EXISTS (
  SELECT 1 FROM users WHERE LOWER(username) = 'christopferc'
);

UPDATE users u
JOIN roles r ON r.id = u.role_id
SET u.password = CASE u.username
  WHEN 'Richardoa' THEN 'ricardoa369'
  WHEN 'Carlog' THEN 'carlog124'
  WHEN 'Tianav' THEN 'taniav354'
  WHEN 'Miguelm' THEN 'miguelm751'
  WHEN 'Christopferc' THEN 'christoperc152'
END,
    u.first_name = CASE u.username
      WHEN 'Richardoa' THEN 'Ricardo'
      WHEN 'Carlog' THEN 'Carlo'
      WHEN 'Tianav' THEN 'Tania'
      WHEN 'Miguelm' THEN 'Miguel'
      WHEN 'Christopferc' THEN 'Christopher'
    END,
    u.last_name = CASE u.username
      WHEN 'Richardoa' THEN 'Aguirre'
      WHEN 'Carlog' THEN 'Gonzalez'
      WHEN 'Tianav' THEN 'Valdovinos'
      WHEN 'Miguelm' THEN 'Montiel'
      WHEN 'Christopferc' THEN 'Chevry'
    END,
    u.role_id = r.id,
    u.is_active = 1
WHERE LOWER(r.role_name) = 'packer'
  AND LOWER(u.username) IN ('richardoa', 'carlog', 'tianav', 'miguelm', 'christopferc');
