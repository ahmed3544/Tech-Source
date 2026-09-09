-- Initial employee seed for the fresh Neon database.
-- Safe to run repeatedly: existing employees are updated by id.
-- Avatar images are intentionally omitted here; they are not required for login.

INSERT INTO employees (
  id, code, name_ar, name_en, email, phone, department,
  job_title_ar, job_title_en, shift_id, pin, role, joined_date,
  status, annual_leave_balance, casual_leave_balance,
  regular_leave_balance, sick_leave_balance, is_photo_removed
) VALUES
  ('emp-002','2051','Ahmed Mahmoud Ahmed Mahmoud','Ahmed Mahmoud Ahmed Mahmoud','ahmed.mahmoud@techsource-gds.com','01023282847','CX','CX Agent','CX Agent','shift-1','Tech_123','employee','2025-12-07','active',15,7,8,30,false),
  ('emp-004','2048','Eslam Mashref Shehata','Eslam Mashref Shehata','eslam.shehata@techsource-gds.com','01017067917','CX','CX Agent','CX Agent','shift-1','Tech_123','employee','2025-12-07','active',15,7,8,30,false),
  ('emp-005','2057','Goyes Emad George Ibrahim','Goyes Emad George Ibrahim','goyes.george@techsource-gds.com','01020188854','CX','CX Agent','CX Agent','shift-1','Tech_123','employee','2025-12-07','active',15,7,8,30,false),
  ('emp-007','2078','Mahmoud Sayed Ahmed Hassan','Mahmoud Sayed Ahmed Hassan','mahmoud.sayed@techsource-gds.com','01553588051','E-Commerce','E-Commerce Specialist','E-Commerce Specialist','shift-1','Tech_123','employee','2025-12-07','active',13,7,6,30,false),
  ('emp-008','2052','Mohamed Ehab Osman Ahmed','Mohamed Ehab Osman Ahmed','mohamed.ehab@techsource-gds.com','01553442188','CX','CX Agent','CX Agent','shift-1','Tech_123','employee','2025-12-07','active',13,7,6,30,false),
  ('emp-011','2079','Mostafa mohamed kamel abou seada','Mostafa mohamed kamel abou seada','mostafa.kamel@techsource-gds.com','01127761383','CX','TL','TL','shift-1','Tech_123','leader','2025-12-07','active',21,7,14,30,false),
  ('emp-012','2036','Nihal Gamal Omeira Hassan','Nihal Gamal Omeira Hassan','nihal.gamal@techsource-gds.com','01115661166','CX','CX Agent','CX Agent','shift-1','Tech_123','employee','2025-12-07','active',30,7,8,30,false),
  ('emp-015','2054','Zeinab Mohamed Saber Saeed','Zeinab Mohamed Saber Saeed','zeinab.saber@techsource-gds.com','01014325837','Quality','Quality Specialist','Quality Specialist','shift-1','Tech_123','employee','2025-12-07','active',15,7,8,30,false)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  department = EXCLUDED.department,
  job_title_ar = EXCLUDED.job_title_ar,
  job_title_en = EXCLUDED.job_title_en,
  shift_id = EXCLUDED.shift_id,
  pin = EXCLUDED.pin,
  role = EXCLUDED.role,
  joined_date = EXCLUDED.joined_date,
  status = EXCLUDED.status,
  annual_leave_balance = EXCLUDED.annual_leave_balance,
  casual_leave_balance = EXCLUDED.casual_leave_balance,
  regular_leave_balance = EXCLUDED.regular_leave_balance,
  sick_leave_balance = EXCLUDED.sick_leave_balance,
  is_photo_removed = EXCLUDED.is_photo_removed;

-- Verify only the login-related fields (no photos/PII dump needed).
SELECT id, code, role, status FROM employees ORDER BY id;
