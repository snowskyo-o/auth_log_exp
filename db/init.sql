CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(10) PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  role VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  force_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS login_failures (
  user_id VARCHAR(10) PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_name VARCHAR(80) NOT NULL,
  level VARCHAR(12) NOT NULL,
  request_id VARCHAR(64) NULL,
  user_id VARCHAR(10) NULL,
  source_ip VARCHAR(64) NULL,
  payload JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert fixed test users (passwords hashed with scrypt(password, id))
INSERT INTO users (id, name, role, is_active, force_change_password, password_hash)
VALUES
  ('2024000001', 'Student One', 'student', true, false, '3a1eda9fd96ac6f38782d6b0c2cdaecdb32659c23d350e5c2bf4fd69177aec13'),
  ('2024000002', 'Student Two', 'student', true, false, '01e2e3d041a0d43158f6c5771afc323a6c1dacaa48d26f6a9402df6906d3fb01'),
  ('2024000003', 'Student Three', 'student', true, false, '59a855244c428fa3797bf3aaa418ce418b0e1fc036b9a8ac838a380a151087d7'),
  ('2024000004', 'Student Four', 'student', true, false, '8ad4bbdb83840db1250d6c80c0aa250234bb6c1842bf3da761bbe231867c74ae'),
  ('2024000005', 'Student Five', 'student', true, false, '7f670b74f490e9a39b7338bbb2ae8d5d3b10560670800ac4991b483f4ce3ffb7')
ON CONFLICT (id) DO NOTHING;

-- Insert fixed test student accounts (passwords hashed using scrypt(password, id))
INSERT INTO users (id, name, role, is_active, force_change_password, password_hash)
VALUES
  ('2024000001', 'Student One', 'student', TRUE, FALSE, '3a1eda9fd96ac6f38782d6b0c2cdaecdb32659c23d350e5c2bf4fd69177aec13'),
  ('2024000002', 'Student Two', 'student', TRUE, FALSE, '01e2e3d041a0d43158f6c5771afc323a6c1dacaa48d26f6a9402df6906d3fb01'),
  ('2024000003', 'Student Three', 'student', TRUE, FALSE, '59a855244c428fa3797bf3aaa418ce418b0e1fc036b9a8ac838a380a151087d7'),
  ('2024000004', 'Student Four', 'student', TRUE, FALSE, '8ad4bbdb83840db1250d6c80c0aa250234bb6c1842bf3da761bbe231867c74ae'),
  ('2024000005', 'Student Five', 'student', TRUE, FALSE, '7f670b74f490e9a39b7338bbb2ae8d5d3b10560670800ac4991b483f4ce3ffb7')
ON CONFLICT (id) DO NOTHING;
