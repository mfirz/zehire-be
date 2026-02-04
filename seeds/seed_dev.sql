-- Seed script for local development
-- Run with: bun run db:seed:local
-- Reset with: bun run db:reset:local (wipes DB, migrates, and seeds)

-- ============================================================================
-- 1. ORGANIZATION
-- ============================================================================

INSERT OR IGNORE INTO orgs (id, name, jobs_list_version, active_role_capacity, billing_waived, billing_waived_reason, video_call_provider, created_at, updated_at)
VALUES (
  'org_dev_acme',
  'Acme Corporation',
  1,
  10,
  1,
  'Founding Access - Development',
  'google_meet',
  '2024-01-01T00:00:00Z',
  '2024-01-01T00:00:00Z'
);

-- ============================================================================
-- 2. USERS
-- ============================================================================

INSERT OR IGNORE INTO users (id, email, name, role, org_id, created_at, updated_at)
VALUES
  ('user_dev_admin', 'farizzx77@gmail.com', 'Fariz Admin', 'admin', 'org_dev_acme', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('user_dev_recruiter', 'recruiter@acme.com', 'Sarah Johnson', 'recruiter', 'org_dev_acme', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('user_dev_recruiter2', 'recruiter2@acme.com', 'Mike Chen', 'recruiter', 'org_dev_acme', '2024-01-02T00:00:00Z', '2024-01-02T00:00:00Z');

-- ============================================================================
-- 3. INTERVIEWERS + AVAILABILITY + BLOCKED DATES
-- ============================================================================

INSERT OR IGNORE INTO interviewers (id, org_id, email, name, magic_token, timezone, status, invited_at, created_at, updated_at)
VALUES
  ('int_dev_eng1', 'org_dev_acme', 'john.smith@acme.com', 'John Smith', 'token_john_dev', 'America/New_York', 'active', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('int_dev_eng2', 'org_dev_acme', 'emily.davis@acme.com', 'Emily Davis', 'token_emily_dev', 'America/Los_Angeles', 'active', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('int_dev_mgr', 'org_dev_acme', 'robert.wilson@acme.com', 'Robert Wilson', 'token_robert_dev', 'Europe/London', 'active', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('int_dev_hr', 'org_dev_acme', 'lisa.taylor@acme.com', 'Lisa Taylor', 'token_lisa_dev', 'Asia/Singapore', 'invited', '2024-01-05T00:00:00Z', '2024-01-05T00:00:00Z', '2024-01-05T00:00:00Z');

INSERT OR IGNORE INTO interviewer_availability (id, interviewer_id, day_of_week, start_time, end_time, created_at, updated_at)
VALUES
  ('avail_john_1', 'int_dev_eng1', 1, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_john_2', 'int_dev_eng1', 2, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_john_3', 'int_dev_eng1', 3, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_john_4', 'int_dev_eng1', 4, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_john_5', 'int_dev_eng1', 5, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_emily_1', 'int_dev_eng2', 2, '10:00', '18:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_emily_2', 'int_dev_eng2', 3, '10:00', '18:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_emily_3', 'int_dev_eng2', 4, '10:00', '18:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z');

INSERT OR IGNORE INTO interviewer_blocked_dates (id, interviewer_id, blocked_date, reason, created_at)
VALUES
  ('block_john_1', 'int_dev_eng1', '2024-02-14', 'Personal day', '2024-01-20T00:00:00Z'),
  ('block_robert_1', 'int_dev_mgr', '2024-02-05', 'Tech conference', '2024-01-15T00:00:00Z');

-- ============================================================================
-- 4. PRICING HISTORY
-- ============================================================================

INSERT OR IGNORE INTO pricing_history (id, rate_cents, currency, effective_from, description, created_at, created_by)
VALUES
  ('price_v1', 5000, 'usd', '2024-01-01T00:00:00Z', 'Launch pricing: $50/active role/month', '2024-01-01T00:00:00Z', 'system');

-- ============================================================================
-- 5. ASSESSMENT DEFINITIONS + PARTS
-- ============================================================================

INSERT OR IGNORE INTO assessment_definitions (id, org_id, name, scheduling_config, status, created_by, created_at, updated_at)
VALUES
  ('assess_def_be', 'org_dev_acme', 'Backend Engineering Take-Home', '{"scheduleWithinDays":7,"completeWithinHours":48,"maxReschedules":1}', 'active', 'user_dev_admin', '2024-01-10T00:00:00Z', '2024-01-10T00:00:00Z'),
  ('assess_def_design', 'org_dev_acme', 'Design Portfolio Review', '{"scheduleWithinDays":5,"completeWithinHours":72,"maxReschedules":2}', 'active', 'user_dev_admin', '2024-01-05T00:00:00Z', '2024-01-05T00:00:00Z');

INSERT OR IGNORE INTO assessment_parts (id, assessment_definition_id, name, instructions, evidence_description, required, order_index, created_at, updated_at)
VALUES
  ('assess_part_design', 'assess_def_be', 'System Design Document', 'Design a scalable API system for a real-time messaging platform. Include: 1) High-level architecture diagram, 2) Database schema, 3) API endpoint specifications, 4) Scalability considerations.', 'A PDF or markdown document with the system design including architecture diagrams and technical decisions.', 1, 0, '2024-01-10T00:00:00Z', '2024-01-10T00:00:00Z'),
  ('assess_part_code', 'assess_def_be', 'Code Implementation', 'Implement the core message handling service from your design. Focus on: 1) Clean well-structured code, 2) Error handling, 3) Basic tests, 4) README with setup instructions.', 'A zip file or Git repository link containing the implementation with tests and documentation.', 1, 1, '2024-01-10T00:00:00Z', '2024-01-10T00:00:00Z'),
  ('assess_part_portfolio', 'assess_def_design', 'Portfolio Presentation', 'Prepare a presentation of 2-3 case studies from your portfolio. For each project explain the problem, your design process, key decisions, and outcomes.', 'A slide deck (PDF or link) with detailed case studies showing your design process.', 1, 0, '2024-01-05T00:00:00Z', '2024-01-05T00:00:00Z'),
  ('assess_part_redesign', 'assess_def_design', 'Redesign Exercise', 'Choose one screen from our product and propose improvements. Document your reasoning, user research approach, and before/after comparisons.', 'A Figma file or PDF showing the redesign with annotations explaining your decisions.', 0, 1, '2024-01-05T00:00:00Z', '2024-01-05T00:00:00Z');

-- ============================================================================
-- 6. JOBS (different statuses)
-- ============================================================================

-- Published job with questions + pipeline completed
INSERT OR IGNORE INTO jobs (
  id, org_id, status, questions_status, pipeline_status, title, description, description_text,
  company_name, department, location, work_type, employment_type,
  salary_min, salary_max, salary_currency, public_slug,
  job_context, archetypes, questions, pipeline_recommendation,
  application_config,
  processing_duration_ms, completed_at, pipeline_generated_at,
  created_at, updated_at, published_at
)
VALUES (
  'job_dev_swe',
  'org_dev_acme',
  'published',
  'completed',
  'completed',
  'Senior Software Engineer',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"We are looking for a senior software engineer to join our team. You will be responsible for designing, developing, and maintaining scalable backend systems. The ideal candidate has strong experience with distributed systems, cloud infrastructure, and modern development practices."}]}]}',
  'We are looking for a senior software engineer to join our team. You will be responsible for designing, developing, and maintaining scalable backend systems. The ideal candidate has strong experience with distributed systems, cloud infrastructure, and modern development practices.',
  'Acme Corporation',
  'Engineering',
  'San Francisco, CA',
  'hybrid',
  'fulltime',
  150000,
  200000,
  'USD',
  'swe-acme-dev',
  '{"domain":"technology","specialization":"Backend Engineering","riskLevel":"medium","decisionImpact":"business","primarySignals":["technical_depth","system_thinking","decision_under_uncertainty"],"collaborationRequired":"high","customerFacing":false,"peopleManagement":false,"regulatedEnvironment":false,"experienceLevel":"senior"}',
  '[{"id":"arch_technical_depth","category":"technical_depth","description":"Assess hands-on technical expertise and problem-solving ability","signals":["technical_depth","system_thinking"],"selectionReason":"Senior engineering role requires deep technical verification"},{"id":"arch_decision_judgment","category":"decision_judgment","description":"Evaluate decision-making under uncertainty and trade-off analysis","signals":["decision_under_uncertainty","tradeoff_awareness"],"selectionReason":"Role involves architectural decisions with business impact"},{"id":"arch_ownership","category":"ownership","description":"Assess accountability and ownership mentality","signals":["accountability","learning_from_failure"],"selectionReason":"Senior engineers need to own outcomes end-to-end"}]',
  '[{"archetypeId":"arch_technical_depth","questionText":"Describe a complex technical system you designed or significantly improved. What were the key technical challenges, and how did you approach solving them?","signals":["technical_depth","system_thinking"],"minAnswerWords":100,"metadata":{"category":"technical_depth","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}},{"archetypeId":"arch_decision_judgment","questionText":"Tell me about a time when you had to make a significant technical decision with incomplete information. How did you approach the decision, and what was the outcome?","signals":["decision_under_uncertainty","tradeoff_awareness"],"minAnswerWords":100,"metadata":{"category":"decision_judgment","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}},{"archetypeId":"arch_ownership","questionText":"Describe a project or feature that did not go as planned. What happened, what was your role, and what did you learn from the experience?","signals":["accountability","learning_from_failure"],"minAnswerWords":100,"metadata":{"category":"ownership","formats":["experience_based","reflection"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}}]',
  '{"assessment":{"recommended":false,"reason":"For senior software engineering roles, technical interviews provide better signal than standardized assessments","suggestedType":"none","suggestedProviders":[],"whatToTest":[]},"interviewPanel":{"rounds":[{"name":"Phone Screen","duration":30,"interviewerProfile":"Senior Engineer or Engineering Manager","focus":"Initial fit, communication, and high-level technical background"},{"name":"Technical Interview","duration":60,"interviewerProfile":"Senior or Staff Engineer","focus":"System design, coding ability, and technical depth"},{"name":"Culture Fit","duration":45,"interviewerProfile":"Engineering Manager and Team Lead","focus":"Team collaboration, values alignment, and growth mindset"}],"totalTime":"2 hours 15 minutes"},"evaluationCriteria":{"mustHave":["Strong system design skills","Proficiency in at least one modern programming language","Experience with distributed systems","Clear communication of technical concepts"],"niceToHave":["Experience with cloud platforms (AWS/GCP/Azure)","Open source contributions","Experience mentoring junior engineers"],"redFlags":["Unable to explain past technical decisions","Blames others for project failures","No curiosity about our tech stack"]}}',
  '{"requirePhone":false,"allowCv":true,"requireCv":false}',
  1250,
  '2024-01-12T00:00:00Z',
  '2024-01-13T00:00:00Z',
  '2024-01-10T00:00:00Z',
  '2024-01-15T00:00:00Z',
  '2024-01-15T00:00:00Z'
);

-- Draft job (no questions or pipeline)
INSERT OR IGNORE INTO jobs (
  id, org_id, status, questions_status, pipeline_status, title, description, description_text,
  company_name, department, location, work_type, employment_type,
  created_at, updated_at
)
VALUES (
  'job_dev_pm',
  'org_dev_acme',
  'draft',
  'none',
  'none',
  'Product Manager',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Product manager role for our growing team."}]}]}',
  'Product manager role for our growing team.',
  'Acme Corporation',
  'Product',
  'Remote',
  'remote',
  'fulltime',
  '2024-01-20T00:00:00Z',
  '2024-01-20T00:00:00Z'
);

-- Paused job (was published, now paused)
INSERT OR IGNORE INTO jobs (
  id, org_id, status, questions_status, pipeline_status, title, description, description_text,
  company_name, department, location, work_type, employment_type,
  salary_min, salary_max, salary_currency, public_slug,
  job_context, archetypes, questions, pipeline_recommendation,
  application_config,
  processing_duration_ms, completed_at, pipeline_generated_at,
  created_at, updated_at, published_at
)
VALUES (
  'job_dev_design',
  'org_dev_acme',
  'paused',
  'completed',
  'completed',
  'UX Designer',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Looking for a creative UX designer to join our product team. You will be responsible for user research, wireframing, prototyping, and creating intuitive user interfaces."}]}]}',
  'Looking for a creative UX designer to join our product team. You will be responsible for user research, wireframing, prototyping, and creating intuitive user interfaces.',
  'Acme Corporation',
  'Design',
  'New York, NY',
  'onsite',
  'fulltime',
  100000,
  140000,
  'USD',
  'ux-acme-dev',
  '{"domain":"technology","specialization":"UX Design","riskLevel":"low","decisionImpact":"business","primarySignals":["communication_clarity","stakeholder_management","tradeoff_awareness"],"collaborationRequired":"high","customerFacing":true,"peopleManagement":false,"regulatedEnvironment":false,"experienceLevel":"mid"}',
  '[{"id":"arch_communication","category":"communication","description":"Assess ability to communicate design decisions clearly","signals":["communication_clarity","stakeholder_management"],"selectionReason":"UX designers must articulate design rationale to stakeholders"},{"id":"arch_decision_judgment","category":"decision_judgment","description":"Evaluate user-centered decision making","signals":["tradeoff_awareness","decision_under_uncertainty"],"selectionReason":"Design involves balancing user needs with business constraints"}]',
  '[{"archetypeId":"arch_communication","questionText":"Tell me about a time when you had to present a design that stakeholders initially disagreed with. How did you handle the situation?","signals":["communication_clarity","stakeholder_management"],"minAnswerWords":100,"metadata":{"category":"communication","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}},{"archetypeId":"arch_decision_judgment","questionText":"Describe a situation where user research findings conflicted with business requirements. How did you navigate this trade-off?","signals":["tradeoff_awareness","decision_under_uncertainty"],"minAnswerWords":100,"metadata":{"category":"decision_judgment","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}}]',
  '{"assessment":{"recommended":true,"reason":"Portfolio review is essential for design roles","suggestedType":"portfolio_review","suggestedProviders":["internal"],"whatToTest":["Visual design skills","Interaction design","User research methodology"]},"interviewPanel":{"rounds":[{"name":"Portfolio Review","duration":45,"interviewerProfile":"Senior Designer or Design Lead","focus":"Design process, visual skills, and problem-solving approach"},{"name":"Design Challenge","duration":60,"interviewerProfile":"Product Designer and Product Manager","focus":"Real-time problem solving and collaboration"}],"totalTime":"1 hour 45 minutes"},"evaluationCriteria":{"mustHave":["Strong portfolio with case studies","User research experience","Proficiency in Figma or similar tools"],"niceToHave":["Motion design skills","Design system experience","Accessibility expertise"],"redFlags":["Cannot explain design rationale","No user research in process","Defensive about feedback"]}}',
  '{"requirePhone":false,"allowCv":true,"requireCv":true}',
  980,
  '2024-01-06T00:00:00Z',
  '2024-01-07T00:00:00Z',
  '2024-01-05T00:00:00Z',
  '2024-01-25T00:00:00Z',
  '2024-01-08T00:00:00Z'
);

-- Closed job
INSERT OR IGNORE INTO jobs (
  id, org_id, status, questions_status, pipeline_status, title, description, description_text,
  company_name, department, location, work_type, employment_type,
  public_slug, job_context, archetypes, questions, pipeline_recommendation,
  processing_duration_ms, completed_at, pipeline_generated_at,
  created_at, updated_at, published_at, closed_at
)
VALUES (
  'job_dev_intern',
  'org_dev_acme',
  'closed',
  'completed',
  'completed',
  'Software Engineering Intern',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Summer internship program for aspiring software engineers. You will work on real projects alongside senior engineers, learning modern development practices and contributing to our codebase."}]}]}',
  'Summer internship program for aspiring software engineers. You will work on real projects alongside senior engineers, learning modern development practices and contributing to our codebase.',
  'Acme Corporation',
  'Engineering',
  'San Francisco, CA',
  'onsite',
  'internship',
  'intern-acme-dev',
  '{"domain":"technology","specialization":"Software Engineering","riskLevel":"low","decisionImpact":"low","primarySignals":["technical_depth","learning_from_failure","communication_clarity"],"collaborationRequired":"medium","customerFacing":false,"peopleManagement":false,"regulatedEnvironment":false,"experienceLevel":"entry"}',
  '[{"id":"arch_learning","category":"ownership","description":"Assess learning ability and growth mindset","signals":["learning_from_failure","accountability"],"selectionReason":"Interns need strong learning ability to grow quickly"},{"id":"arch_technical_basics","category":"technical_depth","description":"Evaluate foundational technical knowledge","signals":["technical_depth","communication_clarity"],"selectionReason":"Need to verify basic programming competency"}]',
  '[{"archetypeId":"arch_learning","questionText":"Tell me about a challenging concept or skill you recently learned. What was your approach to learning it, and what obstacles did you overcome?","signals":["learning_from_failure","accountability"],"minAnswerWords":75,"metadata":{"category":"ownership","formats":["experience_based","reflection"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":75}}},{"archetypeId":"arch_technical_basics","questionText":"Describe a programming project you have worked on (personal, academic, or professional). What technologies did you use and what did you learn from the experience?","signals":["technical_depth","communication_clarity"],"minAnswerWords":75,"metadata":{"category":"technical_depth","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":75}}}]',
  '{"assessment":{"recommended":true,"reason":"Coding assessment helps evaluate foundational skills for interns","suggestedType":"coding_challenge","suggestedProviders":["hackerrank","codility"],"whatToTest":["Basic algorithms","Data structures","Problem-solving approach"]},"interviewPanel":{"rounds":[{"name":"Technical Screen","duration":30,"interviewerProfile":"Software Engineer","focus":"Basic coding ability and problem-solving"},{"name":"Behavioral Interview","duration":30,"interviewerProfile":"Engineering Manager","focus":"Cultural fit and learning potential"}],"totalTime":"1 hour"},"evaluationCriteria":{"mustHave":["Basic programming knowledge","Eagerness to learn","Good communication skills"],"niceToHave":["Personal projects or contributions","Relevant coursework","Previous internship experience"],"redFlags":["No enthusiasm for learning","Cannot explain basic concepts","Poor communication"]}}',
  850,
  '2023-12-03T00:00:00Z',
  '2023-12-05T00:00:00Z',
  '2023-12-01T00:00:00Z',
  '2024-01-30T00:00:00Z',
  '2023-12-15T00:00:00Z',
  '2024-01-30T00:00:00Z'
);

-- ============================================================================
-- 7. JOB ASSESSMENTS (link SWE job to assessment definition)
-- ============================================================================

INSERT OR IGNORE INTO job_assessments (id, job_id, assessment_definition_id, snapshot, snapshot_at, created_at, updated_at)
VALUES (
  'ja_swe',
  'job_dev_swe',
  'assess_def_be',
  '{"definition":{"id":"assess_def_be","orgId":"org_dev_acme","name":"Backend Engineering Take-Home","schedulingConfig":"{\"scheduleWithinDays\":7,\"completeWithinHours\":48,\"maxReschedules\":1}","status":"active","createdBy":"user_dev_admin","createdAt":"2024-01-10T00:00:00Z","updatedAt":"2024-01-10T00:00:00Z"},"parts":[{"id":"assess_part_design","assessmentDefinitionId":"assess_def_be","name":"System Design Document","instructions":"Design a scalable API system for a real-time messaging platform.","evidenceDescription":"A PDF or markdown document with the system design.","required":true,"orderIndex":0,"createdAt":"2024-01-10T00:00:00Z","updatedAt":"2024-01-10T00:00:00Z"},{"id":"assess_part_code","assessmentDefinitionId":"assess_def_be","name":"Code Implementation","instructions":"Implement the core message handling service from your design.","evidenceDescription":"A zip file or Git repository link containing the implementation.","required":true,"orderIndex":1,"createdAt":"2024-01-10T00:00:00Z","updatedAt":"2024-01-10T00:00:00Z"}]}',
  '2024-01-15T00:00:00Z',
  '2024-01-13T00:00:00Z',
  '2024-01-15T00:00:00Z'
);

-- ============================================================================
-- 8. INTERVIEW STAGES + ASSIGNMENTS
-- ============================================================================

-- Stages for Senior Software Engineer (published)
INSERT OR IGNORE INTO interview_stage_config (id, job_id, stage_id, name, focus, order_index, mode, duration_minutes, created_at, updated_at)
VALUES
  ('stage_swe_screen', 'job_dev_swe', 'phone_screen', 'Phone Screen', 'Initial fit and communication', 0, 'any_one', 30, '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z'),
  ('stage_swe_tech', 'job_dev_swe', 'technical', 'Technical Interview', 'Coding and system design', 1, 'any_one', 60, '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z'),
  ('stage_swe_culture', 'job_dev_swe', 'culture_fit', 'Culture Fit', 'Team collaboration and values', 2, 'all_required', 45, '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z');

-- Stages for UX Designer (paused)
INSERT OR IGNORE INTO interview_stage_config (id, job_id, stage_id, name, focus, order_index, mode, duration_minutes, created_at, updated_at)
VALUES
  ('stage_ux_portfolio', 'job_dev_design', 'portfolio_review', 'Portfolio Review', 'Design process, visual skills, and problem-solving approach', 0, 'any_one', 45, '2024-01-08T00:00:00Z', '2024-01-08T00:00:00Z'),
  ('stage_ux_challenge', 'job_dev_design', 'design_challenge', 'Design Challenge', 'Real-time problem solving and collaboration', 1, 'any_one', 60, '2024-01-08T00:00:00Z', '2024-01-08T00:00:00Z');

-- Stages for Software Engineering Intern (closed)
INSERT OR IGNORE INTO interview_stage_config (id, job_id, stage_id, name, focus, order_index, mode, duration_minutes, created_at, updated_at)
VALUES
  ('stage_intern_tech', 'job_dev_intern', 'tech_screen', 'Technical Screen', 'Basic coding ability and problem-solving', 0, 'any_one', 30, '2023-12-15T00:00:00Z', '2023-12-15T00:00:00Z'),
  ('stage_intern_behav', 'job_dev_intern', 'behavioral', 'Behavioral Interview', 'Cultural fit and learning potential', 1, 'any_one', 30, '2023-12-15T00:00:00Z', '2023-12-15T00:00:00Z');

-- Assign interviewers to stages (SWE)
INSERT OR IGNORE INTO interview_stage_interviewers (id, job_id, stage_id, interviewer_id, created_at)
VALUES
  ('assign_1', 'job_dev_swe', 'phone_screen', 'int_dev_eng1', '2024-01-15T00:00:00Z'),
  ('assign_2', 'job_dev_swe', 'phone_screen', 'int_dev_eng2', '2024-01-15T00:00:00Z'),
  ('assign_3', 'job_dev_swe', 'technical', 'int_dev_eng1', '2024-01-15T00:00:00Z'),
  ('assign_4', 'job_dev_swe', 'technical', 'int_dev_eng2', '2024-01-15T00:00:00Z'),
  ('assign_5', 'job_dev_swe', 'culture_fit', 'int_dev_mgr', '2024-01-15T00:00:00Z');

-- Assign interviewers to stages (UX Designer)
INSERT OR IGNORE INTO interview_stage_interviewers (id, job_id, stage_id, interviewer_id, created_at)
VALUES
  ('assign_ux_1', 'job_dev_design', 'portfolio_review', 'int_dev_mgr', '2024-01-08T00:00:00Z'),
  ('assign_ux_2', 'job_dev_design', 'design_challenge', 'int_dev_mgr', '2024-01-08T00:00:00Z');

-- Assign interviewers to stages (Intern)
INSERT OR IGNORE INTO interview_stage_interviewers (id, job_id, stage_id, interviewer_id, created_at)
VALUES
  ('assign_intern_1', 'job_dev_intern', 'tech_screen', 'int_dev_eng1', '2023-12-15T00:00:00Z'),
  ('assign_intern_2', 'job_dev_intern', 'behavioral', 'int_dev_mgr', '2023-12-15T00:00:00Z');

-- ============================================================================
-- 9. CUSTOM QUESTIONS
-- (screening: yes_no/single_choice only; evaluative: free_text only;
--  logistical: single_choice/multiple_choice/number/date/url)
-- ============================================================================

INSERT OR IGNORE INTO custom_questions (
  id, job_id, category, question_text, answer_type, required, order_index,
  expected_answer, fail_action, target_signals, options, created_at, updated_at
)
VALUES
  ('cq_1', 'job_dev_swe', 'screening', 'Do you have at least 5 years of professional software development experience?', 'yes_no', 1, 0, '"yes"', 'flag', NULL, NULL, '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z'),
  ('cq_2', 'job_dev_swe', 'screening', 'Are you proficient in TypeScript?', 'yes_no', 1, 1, '"yes"', 'flag', NULL, NULL, '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z'),
  ('cq_3', 'job_dev_swe', 'screening', 'Are you authorized to work in the United States?', 'yes_no', 1, 2, '"yes"', 'reject', NULL, NULL, '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z'),
  ('cq_4', 'job_dev_swe', 'evaluative', 'Describe your experience with cloud platforms (AWS, GCP, Azure)', 'free_text', 0, 3, NULL, NULL, '["technical_depth"]', NULL, '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z'),
  ('cq_5', 'job_dev_swe', 'logistical', 'What is your earliest possible start date?', 'date', 1, 4, NULL, NULL, NULL, NULL, '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z');

-- ============================================================================
-- 10. APPLICATIONS (different statuses and triage levels)
-- ============================================================================

-- Alice: Shortlisted, interview stage, with CV data
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name, preferred_name, phone,
  detected_country, detected_timezone, status, signals_status, triage_status,
  signal_evaluations, decision_posture,
  cv_path, cv_filename, cv_uploaded_at, cv_extraction_status, total_years_experience, has_management_experience,
  current_stage_id, stage_updated_at,
  created_at, updated_at, signals_computed_at
)
VALUES (
  'app_dev_alice',
  'job_dev_swe',
  'alice.wonder@email.com',
  'Alice Wonderland',
  'Alice',
  '+1-555-0101',
  'US',
  'America/New_York',
  'interview',
  'completed',
  'SHORTLIST',
  '{"posture":"LOW_REGRET_RISK","primaryReason":"Critical signals are clearly demonstrated","reasons":[{"code":"SIGNALS_SATISFIED","message":"Critical signals are clearly demonstrated","severity":"info"}],"signalState":{"aggregated":{"present":["technical_depth","system_thinking","decision_under_uncertainty","accountability"],"partial":["tradeoff_awareness"],"missing":[],"notAsked":["learning_from_failure"],"details":{"technical_depth":{"bestConfidence":"clear","evaluationCount":1,"evidence":["Led migration of monolithic application to microservices"]},"system_thinking":{"bestConfidence":"clear","evaluationCount":1,"evidence":["Reduced deployment time by 80%"]},"decision_under_uncertainty":{"bestConfidence":"clear","evaluationCount":1,"evidence":["Chose event-driven architecture despite team unfamiliarity"]},"accountability":{"bestConfidence":"clear","evaluationCount":1,"evidence":["Owned entire migration process end-to-end"]},"tradeoff_awareness":{"bestConfidence":"partial","evaluationCount":1,"evidence":["Mentioned complexity trade-offs briefly"]}}},"criticalAnalysis":{"criticalSignals":["technical_depth","system_thinking","decision_under_uncertainty"],"satisfied":["technical_depth","system_thinking","decision_under_uncertainty"],"gaps":[],"hasCriticalGap":false},"conflicts":[],"cvContradictions":[],"computedAt":"2024-01-16T12:00:00Z"},"suggestedActions":[],"computedAt":"2024-01-16T12:00:00Z"}',
  'LOW_REGRET_RISK',
  'cvs/app_dev_alice/alice_wonderland_resume.pdf',
  'alice_wonderland_resume.pdf',
  '2024-01-16T10:00:00Z',
  'completed',
  7,
  0,
  'technical',
  '2024-01-19T00:00:00Z',
  '2024-01-16T10:00:00Z',
  '2024-01-20T00:00:00Z',
  '2024-01-16T12:00:00Z'
);

-- Bob: Maybe candidate, screening stage
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name, preferred_name,
  detected_country, detected_timezone, status, signals_status, triage_status,
  signal_evaluations, decision_posture,
  created_at, updated_at, signals_computed_at
)
VALUES (
  'app_dev_bob',
  'job_dev_swe',
  'bob.builder@email.com',
  'Robert Builder',
  'Bob',
  'CA',
  'America/Toronto',
  'screening',
  'completed',
  'MAYBE',
  '{"posture":"SOME_UNCERTAINTY","primaryReason":"Some critical signals are missing or unclear","reasons":[{"code":"CRITICAL_GAP","message":"Some critical signals are missing or unclear","severity":"warning"},{"code":"MOSTLY_PARTIAL","message":"Most signals are only partially demonstrated","severity":"warning"},{"code":"CRITICAL_ONLY_PARTIAL","message":"Some critical signals lack depth or specificity","severity":"info"}],"signalState":{"aggregated":{"present":["technical_depth"],"partial":["system_thinking","decision_under_uncertainty"],"missing":["accountability"],"notAsked":["learning_from_failure","tradeoff_awareness"],"details":{"technical_depth":{"bestConfidence":"clear","evaluationCount":1,"evidence":["Built REST APIs with Node.js"]},"system_thinking":{"bestConfidence":"partial","evaluationCount":1,"evidence":["Mentioned caching but lacked depth"]},"decision_under_uncertainty":{"bestConfidence":"partial","evaluationCount":1,"evidence":["Described choosing between frameworks"]},"accountability":{"bestConfidence":"absent","evaluationCount":1,"evidence":[]}}},"criticalAnalysis":{"criticalSignals":["technical_depth","system_thinking","decision_under_uncertainty"],"satisfied":["technical_depth"],"gaps":[{"signalId":"system_thinking","status":"partial","wasAsked":true},{"signalId":"decision_under_uncertainty","status":"partial","wasAsked":true}],"hasCriticalGap":true},"conflicts":[],"cvContradictions":[],"computedAt":"2024-01-17T15:00:00Z"},"suggestedActions":["Ask for specific examples about: system_thinking, decision_under_uncertainty","Responses were brief; interview can explore depth"],"computedAt":"2024-01-17T15:00:00Z"}',
  'SOME_UNCERTAINTY',
  '2024-01-17T14:30:00Z',
  '2024-01-18T00:00:00Z',
  '2024-01-17T15:00:00Z'
);

-- Charlie: Weak candidate, pending review
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name, phone,
  detected_country, status, signals_status, triage_status,
  signal_evaluations, decision_posture,
  created_at, updated_at, signals_computed_at
)
VALUES (
  'app_dev_charlie',
  'job_dev_swe',
  'charlie.brown@email.com',
  'Charlie Brown',
  '+44-7700-900123',
  'GB',
  'pending',
  'completed',
  'WEAK',
  '{"posture":"HIGH_UNCERTAINTY","primaryReason":"Majority of critical signals are not demonstrated","reasons":[{"code":"MAJORITY_CRITICAL_MISSING","message":"Majority of critical signals are not demonstrated","severity":"critical"}],"signalState":{"aggregated":{"present":[],"partial":["technical_depth"],"missing":["system_thinking","decision_under_uncertainty","accountability"],"notAsked":["learning_from_failure","tradeoff_awareness"],"details":{"technical_depth":{"bestConfidence":"partial","evaluationCount":1,"evidence":["Mentioned using Python for scripts"]},"system_thinking":{"bestConfidence":"absent","evaluationCount":1,"evidence":[]},"decision_under_uncertainty":{"bestConfidence":"absent","evaluationCount":1,"evidence":[]},"accountability":{"bestConfidence":"absent","evaluationCount":1,"evidence":[]}}},"criticalAnalysis":{"criticalSignals":["technical_depth","system_thinking","decision_under_uncertainty"],"satisfied":[],"gaps":[{"signalId":"technical_depth","status":"partial","wasAsked":true},{"signalId":"system_thinking","status":"missing","wasAsked":true},{"signalId":"decision_under_uncertainty","status":"missing","wasAsked":true}],"hasCriticalGap":true},"conflicts":[],"cvContradictions":[],"computedAt":"2024-01-18T12:00:00Z"},"suggestedActions":["Probe these areas in interview: system_thinking, decision_under_uncertainty"],"computedAt":"2024-01-18T12:00:00Z"}',
  'HIGH_UNCERTAINTY',
  '2024-01-18T09:15:00Z',
  '2024-01-18T12:00:00Z',
  '2024-01-18T12:00:00Z'
);

-- Diana: Signals still processing
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name,
  detected_country, detected_timezone, status, signals_status,
  created_at, updated_at
)
VALUES (
  'app_dev_diana',
  'job_dev_swe',
  'diana.prince@email.com',
  'Diana Prince',
  'US',
  'America/Los_Angeles',
  'pending',
  'processing',
  '2024-01-19T16:45:00Z',
  '2024-01-19T16:45:00Z'
);

-- Eve: Rejected candidate
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name,
  status, signals_status, triage_status,
  signal_evaluations, decision_posture,
  created_at, updated_at, signals_computed_at
)
VALUES (
  'app_dev_eve',
  'job_dev_swe',
  'eve.johnson@email.com',
  'Eve Johnson',
  'rejected',
  'completed',
  'WEAK',
  '{"posture":"HIGH_UNCERTAINTY","primaryReason":"Majority of critical signals are not demonstrated","reasons":[{"code":"MAJORITY_CRITICAL_MISSING","message":"Majority of critical signals are not demonstrated","severity":"critical"},{"code":"ALL_SIGNALS_UNCLEAR","message":"No signals could be evaluated from responses","severity":"critical"}],"signalState":{"aggregated":{"present":[],"partial":[],"missing":["technical_depth","system_thinking","decision_under_uncertainty","accountability"],"notAsked":["learning_from_failure","tradeoff_awareness"],"details":{"technical_depth":{"bestConfidence":"absent","evaluationCount":1,"evidence":[]},"system_thinking":{"bestConfidence":"absent","evaluationCount":1,"evidence":[]},"decision_under_uncertainty":{"bestConfidence":"unclear","evaluationCount":1,"evidence":[]},"accountability":{"bestConfidence":"absent","evaluationCount":1,"evidence":[]}}},"criticalAnalysis":{"criticalSignals":["technical_depth","system_thinking","decision_under_uncertainty"],"satisfied":[],"gaps":[{"signalId":"technical_depth","status":"missing","wasAsked":true},{"signalId":"system_thinking","status":"missing","wasAsked":true},{"signalId":"decision_under_uncertainty","status":"missing","wasAsked":true}],"hasCriticalGap":true},"conflicts":[],"cvContradictions":[],"computedAt":"2024-01-15T10:00:00Z"},"suggestedActions":["Probe these areas in interview: technical_depth, system_thinking"],"computedAt":"2024-01-15T10:00:00Z"}',
  'HIGH_UNCERTAINTY',
  '2024-01-15T08:00:00Z',
  '2024-01-17T00:00:00Z',
  '2024-01-15T10:00:00Z'
);

-- ============================================================================
-- 11. ANSWERS (matching actual archetype IDs from the job)
-- ============================================================================

-- Alice's answers (strong, SHORTLIST)
INSERT OR IGNORE INTO answers (id, application_id, archetype_id, question_text, answer_text, extracted_signals, extraction_status, created_at, updated_at, answered_at, extracted_at)
VALUES
  ('ans_alice_1', 'app_dev_alice', 'arch_technical_depth',
   'Describe a complex technical system you designed or significantly improved. What were the key technical challenges, and how did you approach solving them?',
   'I led the migration of our monolithic application to microservices at my previous company. The main challenges were decomposing tightly coupled modules, managing distributed transactions, and maintaining zero-downtime during migration. I designed an event-driven architecture using Kafka for inter-service communication and implemented the strangler fig pattern for gradual migration. This reduced deployment time by 80% and improved system reliability from 99.5% to 99.99% uptime.',
   '[{"signalId":"technical_depth","confidence":"clear","evidence":"Led migration from monolith to microservices with specific architectural decisions","reasoning":"Demonstrated deep understanding of distributed systems patterns"},{"signalId":"system_thinking","confidence":"clear","evidence":"Considered deployment, reliability, and gradual migration strategy","reasoning":"Showed holistic system-level thinking beyond just code"}]',
   'completed', '2024-01-16T10:05:00Z', '2024-01-16T10:05:00Z', '2024-01-16T10:05:00Z', '2024-01-16T12:00:00Z'),
  ('ans_alice_2', 'app_dev_alice', 'arch_decision_judgment',
   'Tell me about a time when you had to make a significant technical decision with incomplete information. How did you approach the decision, and what was the outcome?',
   'When our team needed to choose between event-driven and request-response architecture for a new payment processing system, we had limited data on expected transaction volumes. I proposed building a proof-of-concept with both approaches and running load tests simulating various scenarios. Based on the results, we chose event-driven architecture which later proved correct when traffic grew 10x. The key was making the decision reversible by abstracting the communication layer.',
   '[{"signalId":"decision_under_uncertainty","confidence":"clear","evidence":"Proposed proof-of-concept approach when data was limited, made decision reversible","reasoning":"Strong evidence of structured decision-making under uncertainty"},{"signalId":"tradeoff_awareness","confidence":"partial","evidence":"Mentioned abstraction layer for reversibility","reasoning":"Showed awareness of trade-offs but could have explored more deeply"}]',
   'completed', '2024-01-16T10:10:00Z', '2024-01-16T10:10:00Z', '2024-01-16T10:10:00Z', '2024-01-16T12:00:00Z'),
  ('ans_alice_3', 'app_dev_alice', 'arch_ownership',
   'Describe a project or feature that did not go as planned. What happened, what was your role, and what did you learn from the experience?',
   'I was the tech lead for a real-time notification system that initially failed to scale during a product launch. The WebSocket connections overwhelmed our servers. I took ownership of the incident, coordinated the team to implement connection pooling and horizontal scaling as an emergency fix. After stabilization, I led a retrospective and redesigned the system with proper load testing in CI. I learned the importance of load testing at realistic scale before launches, not just functional testing.',
   '[{"signalId":"accountability","confidence":"clear","evidence":"Took ownership of incident, coordinated fix, led retrospective","reasoning":"Clear demonstration of accountability and learning from failure"},{"signalId":"learning_from_failure","confidence":"clear","evidence":"Redesigned system with load testing in CI after the incident","reasoning":"Concrete improvement implemented as a result of the failure"}]',
   'completed', '2024-01-16T10:15:00Z', '2024-01-16T10:15:00Z', '2024-01-16T10:15:00Z', '2024-01-16T12:00:00Z');

-- Bob's answers (mixed, MAYBE)
INSERT OR IGNORE INTO answers (id, application_id, archetype_id, question_text, answer_text, extracted_signals, extraction_status, created_at, updated_at, answered_at, extracted_at)
VALUES
  ('ans_bob_1', 'app_dev_bob', 'arch_technical_depth',
   'Describe a complex technical system you designed or significantly improved. What were the key technical challenges, and how did you approach solving them?',
   'I built a REST API using Node.js and Express for our e-commerce platform. We used MongoDB for the database and added Redis caching to improve performance. The main challenge was handling concurrent requests during sales events. I added rate limiting and connection pooling which helped with the load.',
   '[{"signalId":"technical_depth","confidence":"clear","evidence":"Built REST API with Node.js, implemented caching and rate limiting","reasoning":"Demonstrates solid practical experience with web technologies"},{"signalId":"system_thinking","confidence":"partial","evidence":"Added caching and rate limiting but description lacks architectural depth","reasoning":"Shows some system awareness but limited to tactical solutions"}]',
   'completed', '2024-01-17T14:35:00Z', '2024-01-17T14:35:00Z', '2024-01-17T14:35:00Z', '2024-01-17T15:00:00Z'),
  ('ans_bob_2', 'app_dev_bob', 'arch_decision_judgment',
   'Tell me about a time when you had to make a significant technical decision with incomplete information. How did you approach the decision, and what was the outcome?',
   'We needed to choose between React and Vue for our frontend rebuild. I compared both frameworks by looking at documentation, community size, and job market trends. We went with React because it had a larger ecosystem. The project went well and we delivered on time.',
   '[{"signalId":"decision_under_uncertainty","confidence":"partial","evidence":"Compared frameworks using multiple criteria","reasoning":"Decision-making process described but criteria were surface-level, not driven by specific project needs"},{"signalId":"tradeoff_awareness","confidence":"absent","evidence":"","reasoning":"No discussion of trade-offs or what was sacrificed by choosing React"}]',
   'completed', '2024-01-17T14:40:00Z', '2024-01-17T14:40:00Z', '2024-01-17T14:40:00Z', '2024-01-17T15:00:00Z'),
  ('ans_bob_3', 'app_dev_bob', 'arch_ownership',
   'Describe a project or feature that did not go as planned. What happened, what was your role, and what did you learn from the experience?',
   'A feature I worked on had a bug that caused data inconsistency in production. The team fixed it together and we added more tests. I learned that testing is important.',
   '[{"signalId":"accountability","confidence":"absent","evidence":"","reasoning":"No personal ownership described. Used passive language and attributed fix to the team generically"},{"signalId":"learning_from_failure","confidence":"absent","evidence":"","reasoning":"Learning stated as generic platitude without specific changes implemented"}]',
   'completed', '2024-01-17T14:45:00Z', '2024-01-17T14:45:00Z', '2024-01-17T14:45:00Z', '2024-01-17T15:00:00Z');

-- Charlie's answers (weak, WEAK)
INSERT OR IGNORE INTO answers (id, application_id, archetype_id, question_text, answer_text, extracted_signals, extraction_status, created_at, updated_at, answered_at, extracted_at)
VALUES
  ('ans_charlie_1', 'app_dev_charlie', 'arch_technical_depth',
   'Describe a complex technical system you designed or significantly improved. What were the key technical challenges, and how did you approach solving them?',
   'I have used Python for various scripting tasks and built some web scrapers. I also made a personal website using HTML, CSS and JavaScript. I am currently learning about databases.',
   '[{"signalId":"technical_depth","confidence":"partial","evidence":"Experience with Python scripting and web development basics","reasoning":"Shows some programming experience but no evidence of designing complex systems"},{"signalId":"system_thinking","confidence":"absent","evidence":"","reasoning":"No discussion of system-level concerns or architectural thinking"}]',
   'completed', '2024-01-18T09:20:00Z', '2024-01-18T09:20:00Z', '2024-01-18T09:20:00Z', '2024-01-18T12:00:00Z'),
  ('ans_charlie_2', 'app_dev_charlie', 'arch_decision_judgment',
   'Tell me about a time when you had to make a significant technical decision with incomplete information. How did you approach the decision, and what was the outcome?',
   'I usually follow tutorials and best practices online when making decisions about technology. I try to use popular frameworks because they have good support.',
   '[{"signalId":"decision_under_uncertainty","confidence":"absent","evidence":"","reasoning":"No specific example provided. Response describes general approach of following tutorials rather than independent decision-making"},{"signalId":"tradeoff_awareness","confidence":"absent","evidence":"","reasoning":"No evidence of evaluating trade-offs"}]',
   'completed', '2024-01-18T09:25:00Z', '2024-01-18T09:25:00Z', '2024-01-18T09:25:00Z', '2024-01-18T12:00:00Z'),
  ('ans_charlie_3', 'app_dev_charlie', 'arch_ownership',
   'Describe a project or feature that did not go as planned. What happened, what was your role, and what did you learn from the experience?',
   'My projects have generally gone according to plan. I follow instructions carefully and try not to make mistakes.',
   '[{"signalId":"accountability","confidence":"absent","evidence":"","reasoning":"No example of handling failure provided. Claims no failures which suggests lack of challenging experience"},{"signalId":"learning_from_failure","confidence":"absent","evidence":"","reasoning":"No evidence of learning from challenges or setbacks"}]',
   'completed', '2024-01-18T09:30:00Z', '2024-01-18T09:30:00Z', '2024-01-18T09:30:00Z', '2024-01-18T12:00:00Z');

-- Eve's answers (very weak, rejected)
INSERT OR IGNORE INTO answers (id, application_id, archetype_id, question_text, answer_text, extracted_signals, extraction_status, created_at, updated_at, answered_at, extracted_at)
VALUES
  ('ans_eve_1', 'app_dev_eve', 'arch_technical_depth',
   'Describe a complex technical system you designed or significantly improved. What were the key technical challenges, and how did you approach solving them?',
   'I am a fast learner and very passionate about technology.',
   '[{"signalId":"technical_depth","confidence":"absent","evidence":"","reasoning":"No technical example provided. Response is generic self-description"},{"signalId":"system_thinking","confidence":"absent","evidence":"","reasoning":"No evidence of system-level thinking"}]',
   'completed', '2024-01-15T08:05:00Z', '2024-01-15T08:05:00Z', '2024-01-15T08:05:00Z', '2024-01-15T10:00:00Z'),
  ('ans_eve_2', 'app_dev_eve', 'arch_decision_judgment',
   'Tell me about a time when you had to make a significant technical decision with incomplete information. How did you approach the decision, and what was the outcome?',
   'I am good at making decisions and always deliver quality work.',
   '[{"signalId":"decision_under_uncertainty","confidence":"unclear","evidence":"","reasoning":"No specific example given. Generic self-assessment without evidence"},{"signalId":"tradeoff_awareness","confidence":"absent","evidence":"","reasoning":"No discussion of trade-offs"}]',
   'completed', '2024-01-15T08:10:00Z', '2024-01-15T08:10:00Z', '2024-01-15T08:10:00Z', '2024-01-15T10:00:00Z'),
  ('ans_eve_3', 'app_dev_eve', 'arch_ownership',
   'Describe a project or feature that did not go as planned. What happened, what was your role, and what did you learn from the experience?',
   'I have not had any major failures in my career.',
   '[{"signalId":"accountability","confidence":"absent","evidence":"","reasoning":"No example provided. Deflects the question entirely"},{"signalId":"learning_from_failure","confidence":"absent","evidence":"","reasoning":"No evidence of growth through challenges"}]',
   'completed', '2024-01-15T08:15:00Z', '2024-01-15T08:15:00Z', '2024-01-15T08:15:00Z', '2024-01-15T10:00:00Z');

-- ============================================================================
-- 12. CUSTOM ANSWERS
-- ============================================================================

-- Alice's custom answers
INSERT OR IGNORE INTO custom_answers (id, application_id, question_id, answer_text, answer_number, answer_date, screening_passed, extraction_status, extracted_signals, created_at)
VALUES
  ('ca_alice_1', 'app_dev_alice', 'cq_1', 'yes', NULL, NULL, 1, 'skipped', NULL, '2024-01-16T10:00:00Z'),
  ('ca_alice_2', 'app_dev_alice', 'cq_2', 'yes', NULL, NULL, 1, 'skipped', NULL, '2024-01-16T10:00:00Z'),
  ('ca_alice_3', 'app_dev_alice', 'cq_3', 'yes', NULL, NULL, 1, 'skipped', NULL, '2024-01-16T10:00:00Z'),
  ('ca_alice_4', 'app_dev_alice', 'cq_4', 'Extensive experience with AWS (ECS, Lambda, RDS) and GCP (Cloud Run, BigQuery). Led cloud migration projects and implemented infrastructure as code with Terraform.', NULL, NULL, NULL, 'completed', '[{"signalId":"technical_depth","confidence":"clear","evidence":"Extensive AWS and GCP experience with specific services listed","reasoning":"Demonstrates broad and deep cloud platform knowledge"}]', '2024-01-16T10:00:00Z'),
  ('ca_alice_5', 'app_dev_alice', 'cq_5', NULL, NULL, '2024-03-01', NULL, 'skipped', NULL, '2024-01-16T10:00:00Z');

-- Bob's custom answers
INSERT OR IGNORE INTO custom_answers (id, application_id, question_id, answer_text, answer_number, answer_date, screening_passed, extraction_status, extracted_signals, created_at)
VALUES
  ('ca_bob_1', 'app_dev_bob', 'cq_1', 'yes', NULL, NULL, 1, 'skipped', NULL, '2024-01-17T14:30:00Z'),
  ('ca_bob_2', 'app_dev_bob', 'cq_2', 'yes', NULL, NULL, 1, 'skipped', NULL, '2024-01-17T14:30:00Z'),
  ('ca_bob_3', 'app_dev_bob', 'cq_3', 'yes', NULL, NULL, 1, 'skipped', NULL, '2024-01-17T14:30:00Z'),
  ('ca_bob_4', 'app_dev_bob', 'cq_4', 'I have used AWS for deploying applications with EC2 and S3. Some experience with basic cloud services.', NULL, NULL, NULL, 'completed', '[{"signalId":"technical_depth","confidence":"partial","evidence":"Basic AWS usage with EC2 and S3","reasoning":"Limited cloud experience compared to senior role expectations"}]', '2024-01-17T14:30:00Z'),
  ('ca_bob_5', 'app_dev_bob', 'cq_5', NULL, NULL, '2024-04-15', NULL, 'skipped', NULL, '2024-01-17T14:30:00Z');

-- ============================================================================
-- 13. CANDIDATE ASSESSMENTS (Alice evaluated)
-- ============================================================================

INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline, scheduled_for, scheduled_timezone,
  completion_deadline, submitted_at, reschedule_count,
  evaluation_signal, evaluation_notes, evaluated_by, evaluated_at,
  created_at, updated_at
)
VALUES (
  'ca_assess_alice',
  'app_dev_alice',
  'job_dev_swe',
  'evaluated',
  'assess_token_alice_dev',
  '2024-02-16T10:00:00Z',
  '2024-01-16T14:00:00Z',
  '2024-01-23T14:00:00Z',
  '2024-01-18T09:00:00Z',
  'America/New_York',
  '2024-01-20T09:00:00Z',
  '2024-01-19T15:30:00Z',
  0,
  'clear_evidence',
  'Strong system design document with clear architecture decisions. Code implementation was clean, well-tested, and well-documented. Candidate demonstrated deep understanding of distributed systems patterns.',
  'user_dev_admin',
  '2024-01-19T18:00:00Z',
  '2024-01-16T14:00:00Z',
  '2024-01-19T18:00:00Z'
);

-- ============================================================================
-- 14. CV STRUCTURED DATA (Alice)
-- ============================================================================

INSERT OR IGNORE INTO cv_work_experiences (id, application_id, title, company, start_date, end_date, is_current, duration_months, highlights, order_index, created_at)
VALUES
  ('cvw_alice_1', 'app_dev_alice', 'Senior Software Engineer', 'TechCorp Inc.', '2021-06', 'present', 1, 31, '["Led microservices migration reducing deployment time by 80%","Designed event-driven architecture using Kafka","Improved system reliability from 99.5% to 99.99%"]', 0, '2024-01-16T12:00:00Z'),
  ('cvw_alice_2', 'app_dev_alice', 'Software Engineer', 'StartupXYZ', '2019-01', '2021-05', 0, 29, '["Built real-time notification system serving 1M+ users","Implemented CI/CD pipeline with automated testing","Mentored 3 junior engineers"]', 1, '2024-01-16T12:00:00Z'),
  ('cvw_alice_3', 'app_dev_alice', 'Junior Developer', 'WebAgency LLC', '2017-06', '2018-12', 0, 19, '["Developed REST APIs for client projects","Contributed to open-source tools"]', 2, '2024-01-16T12:00:00Z');

INSERT OR IGNORE INTO cv_education (id, application_id, degree, field, institution, year, order_index, created_at)
VALUES
  ('cve_alice_1', 'app_dev_alice', 'Bachelor''s', 'Computer Science', 'MIT', '2017', 0, '2024-01-16T12:00:00Z');

INSERT OR IGNORE INTO cv_skills (id, application_id, skill_name, category, created_at)
VALUES
  ('cvs_alice_1', 'app_dev_alice', 'TypeScript', 'language', '2024-01-16T12:00:00Z'),
  ('cvs_alice_2', 'app_dev_alice', 'Python', 'language', '2024-01-16T12:00:00Z'),
  ('cvs_alice_3', 'app_dev_alice', 'Go', 'language', '2024-01-16T12:00:00Z'),
  ('cvs_alice_4', 'app_dev_alice', 'Node.js', 'framework', '2024-01-16T12:00:00Z'),
  ('cvs_alice_5', 'app_dev_alice', 'React', 'framework', '2024-01-16T12:00:00Z'),
  ('cvs_alice_6', 'app_dev_alice', 'AWS', 'tool', '2024-01-16T12:00:00Z'),
  ('cvs_alice_7', 'app_dev_alice', 'Docker', 'tool', '2024-01-16T12:00:00Z'),
  ('cvs_alice_8', 'app_dev_alice', 'Kafka', 'tool', '2024-01-16T12:00:00Z'),
  ('cvs_alice_9', 'app_dev_alice', 'PostgreSQL', 'tool', '2024-01-16T12:00:00Z'),
  ('cvs_alice_10', 'app_dev_alice', 'Leadership', 'soft_skill', '2024-01-16T12:00:00Z');

-- ============================================================================
-- 15. APPLICATION NOTES
-- ============================================================================

INSERT OR IGNORE INTO application_notes (id, application_id, author_id, author_name, content, created_at, updated_at)
VALUES
  ('note_1', 'app_dev_alice', 'user_dev_recruiter', 'Sarah Johnson', 'Strong technical background. Assessment results are excellent. Recommend moving to technical interview.', '2024-01-17T09:00:00Z', '2024-01-17T09:00:00Z'),
  ('note_2', 'app_dev_alice', 'user_dev_admin', 'Fariz Admin', 'Agreed. Schedule with John for technical round.', '2024-01-17T10:30:00Z', '2024-01-17T10:30:00Z'),
  ('note_3', 'app_dev_bob', 'user_dev_recruiter', 'Sarah Johnson', 'Good potential but needs more context on distributed systems experience. Assessment pending.', '2024-01-18T11:00:00Z', '2024-01-18T11:00:00Z');

-- ============================================================================
-- 16. APPLICATION EVENTS (timeline)
-- ============================================================================

INSERT OR IGNORE INTO application_events (id, application_id, event_type, actor_id, actor_name, old_value, new_value, created_at)
VALUES
  ('evt_1', 'app_dev_alice', 'status_change', 'user_dev_recruiter', 'Sarah Johnson', 'pending', 'screening', '2024-01-16T12:00:00Z'),
  ('evt_2', 'app_dev_alice', 'triage_change', 'user_dev_recruiter', 'Sarah Johnson', NULL, 'SHORTLIST', '2024-01-16T12:05:00Z'),
  ('evt_3', 'app_dev_alice', 'cv_uploaded', NULL, NULL, NULL, 'alice_wonderland_resume.pdf', '2024-01-16T10:00:00Z'),
  ('evt_4', 'app_dev_alice', 'note_added', 'user_dev_recruiter', 'Sarah Johnson', NULL, NULL, '2024-01-17T09:00:00Z'),
  ('evt_5', 'app_dev_alice', 'status_change', 'user_dev_admin', 'Fariz Admin', 'screening', 'assessment', '2024-01-16T14:00:00Z'),
  ('evt_6', 'app_dev_alice', 'status_change', 'user_dev_admin', 'Fariz Admin', 'assessment', 'interview', '2024-01-19T18:00:00Z'),
  ('evt_7', 'app_dev_eve', 'status_change', 'user_dev_recruiter', 'Sarah Johnson', 'pending', 'rejected', '2024-01-17T00:00:00Z');

-- ============================================================================
-- 17. SCHEDULED INTERVIEWS
-- ============================================================================

INSERT OR IGNORE INTO scheduled_interviews (
  id, application_id, job_id, stage_id, scheduled_at, duration_minutes, timezone,
  video_call_link, video_call_provider, status, created_at, updated_at
)
VALUES (
  'interview_alice_tech',
  'app_dev_alice',
  'job_dev_swe',
  'technical',
  '2024-02-01T14:00:00Z',
  60,
  'America/New_York',
  'https://meet.google.com/abc-defg-hij',
  'google_meet',
  'scheduled',
  '2024-01-20T00:00:00Z',
  '2024-01-20T00:00:00Z'
);

INSERT OR IGNORE INTO interview_participants (id, interview_id, interviewer_id, feedback_status, created_at)
VALUES
  ('part_1', 'interview_alice_tech', 'int_dev_eng1', 'pending', '2024-01-20T00:00:00Z'),
  ('part_2', 'interview_alice_tech', 'int_dev_eng2', 'pending', '2024-01-20T00:00:00Z');

-- ============================================================================
-- 18. BILLING EVENTS
-- ============================================================================

INSERT OR IGNORE INTO billing_events (id, org_id, job_id, event_type, occurred_at, metadata, created_at)
VALUES
  ('be_swe_activated', 'org_dev_acme', 'job_dev_swe', 'activated', '2024-01-15T00:00:00Z', '{"trigger":"published"}', '2024-01-15T00:00:00Z'),
  ('be_design_activated', 'org_dev_acme', 'job_dev_design', 'activated', '2024-01-08T00:00:00Z', '{"trigger":"published"}', '2024-01-08T00:00:00Z'),
  ('be_design_paused', 'org_dev_acme', 'job_dev_design', 'paused', '2024-01-25T00:00:00Z', '{"trigger":"paused"}', '2024-01-25T00:00:00Z'),
  ('be_intern_activated', 'org_dev_acme', 'job_dev_intern', 'activated', '2023-12-15T00:00:00Z', '{"trigger":"published"}', '2023-12-15T00:00:00Z'),
  ('be_intern_deactivated', 'org_dev_acme', 'job_dev_intern', 'deactivated', '2024-01-30T00:00:00Z', '{"trigger":"closed"}', '2024-01-30T00:00:00Z');

-- ============================================================================
-- 19. ASSESSMENT UI TEST DATA (12 candidates covering all status states)
-- ============================================================================

-- Applications for assessment UI testing
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name,
  detected_country, detected_timezone, status, signals_status, triage_status,
  decision_posture,
  created_at, updated_at
)
VALUES
  ('app_assess_alice', 'job_dev_swe', 'alice.invited@test.com', 'Alice Invited', 'US', 'America/New_York', 'assessment', 'completed', 'SHORTLIST', 'LOW_REGRET_RISK', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
  ('app_assess_bob', 'job_dev_swe', 'bob.scheduled@test.com', 'Bob Scheduled', 'US', 'America/Chicago', 'assessment', 'completed', 'SHORTLIST', 'LOW_REGRET_RISK', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
  ('app_assess_carol', 'job_dev_swe', 'carol.rescheduled@test.com', 'Carol Rescheduled', 'US', 'America/Denver', 'assessment', 'completed', 'MAYBE', 'SOME_UNCERTAINTY', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
  ('app_assess_dave', 'job_dev_swe', 'dave.working@test.com', 'Dave Working', 'US', 'America/Los_Angeles', 'assessment', 'completed', 'SHORTLIST', 'LOW_REGRET_RISK', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
  ('app_assess_eve', 'job_dev_swe', 'eve.submitted@test.com', 'Eve Submitted', 'GB', 'Europe/London', 'assessment', 'completed', 'SHORTLIST', 'LOW_REGRET_RISK', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
  ('app_assess_frank', 'job_dev_swe', 'frank.clear@test.com', 'Frank ClearEvidence', 'DE', 'Europe/Berlin', 'assessment', 'completed', 'SHORTLIST', 'LOW_REGRET_RISK', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
  ('app_assess_grace', 'job_dev_swe', 'grace.gaps@test.com', 'Grace SomeGaps', 'JP', 'Asia/Tokyo', 'assessment', 'completed', 'MAYBE', 'SOME_UNCERTAINTY', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
  ('app_assess_henry', 'job_dev_swe', 'henry.insufficient@test.com', 'Henry Insufficient', 'AU', 'Australia/Sydney', 'assessment', 'completed', 'WEAK', 'HIGH_UNCERTAINTY', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
  ('app_assess_iris', 'job_dev_swe', 'iris.expired@test.com', 'Iris Expired', 'CA', 'America/Toronto', 'assessment', 'completed', 'SHORTLIST', 'LOW_REGRET_RISK', '2026-01-10T10:00:00Z', '2026-01-25T10:00:00Z'),
  ('app_assess_jack', 'job_dev_swe', 'jack.schedexp@test.com', 'Jack ScheduleExpired', 'FR', 'Europe/Paris', 'assessment', 'completed', 'MAYBE', 'SOME_UNCERTAINTY', '2026-01-10T10:00:00Z', '2026-01-20T10:00:00Z'),
  ('app_assess_kate', 'job_dev_swe', 'kate.cancelafter@test.com', 'Kate CancelledAfter', 'ES', 'Europe/Madrid', 'assessment', 'completed', 'SHORTLIST', 'LOW_REGRET_RISK', '2026-01-20T10:00:00Z', '2026-01-25T10:00:00Z'),
  ('app_assess_leo', 'job_dev_swe', 'leo.cancelbefore@test.com', 'Leo CancelledBefore', 'IT', 'Europe/Rome', 'assessment', 'completed', 'MAYBE', 'SOME_UNCERTAINTY', '2026-01-20T10:00:00Z', '2026-01-22T10:00:00Z');

-- Candidate assessments for all UI states
-- Note: Dates use 2026 to be "current" for testing, with appropriate relative timestamps

-- 1. Alice Invited: Fresh invite, no action yet
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  created_at, updated_at
)
VALUES (
  'ca_ui_alice', 'app_assess_alice', 'job_dev_swe', 'invited',
  'token_ui_alice_invited',
  '2026-03-10T10:00:00Z',
  '2026-02-03T10:00:00Z',
  '2026-02-10T10:00:00Z',
  NULL, NULL, NULL, NULL, NULL,
  0,
  '2026-02-03T10:00:00Z', '2026-02-03T10:00:00Z'
);

-- 2. Bob Scheduled: Scheduled, waiting to start (future date)
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  created_at, updated_at
)
VALUES (
  'ca_ui_bob', 'app_assess_bob', 'job_dev_swe', 'scheduled',
  'token_ui_bob_scheduled',
  '2026-03-10T10:00:00Z',
  '2026-01-25T10:00:00Z',
  '2026-02-01T10:00:00Z',
  '2026-02-06T14:00:00Z', 'America/Chicago', '2026-02-08T14:00:00Z', NULL, NULL,
  0,
  '2026-01-25T10:00:00Z', '2026-01-28T10:00:00Z'
);

-- 3. Carol Rescheduled: Scheduled with max reschedules used
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  created_at, updated_at
)
VALUES (
  'ca_ui_carol', 'app_assess_carol', 'job_dev_swe', 'scheduled',
  'token_ui_carol_rescheduled',
  '2026-03-10T10:00:00Z',
  '2026-01-20T10:00:00Z',
  '2026-02-05T10:00:00Z',
  '2026-02-07T09:00:00Z', 'America/Denver', '2026-02-09T09:00:00Z', NULL, NULL,
  2,
  '2026-01-20T10:00:00Z', '2026-02-01T15:00:00Z'
);

-- 4. Dave Working: In progress (started recently, deadline in future)
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  created_at, updated_at
)
VALUES (
  'ca_ui_dave', 'app_assess_dave', 'job_dev_swe', 'in_progress',
  'token_ui_dave_working',
  '2026-03-10T10:00:00Z',
  '2026-01-25T10:00:00Z',
  '2026-02-01T10:00:00Z',
  '2026-02-03T10:00:00Z', 'America/Los_Angeles', '2026-02-05T10:00:00Z', '2026-02-03T10:05:00Z', NULL,
  0,
  '2026-01-25T10:00:00Z', '2026-02-03T10:05:00Z'
);

-- 5. Eve Submitted: Awaiting evaluation
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  created_at, updated_at
)
VALUES (
  'ca_ui_eve', 'app_assess_eve', 'job_dev_swe', 'submitted',
  'token_ui_eve_submitted',
  '2026-03-10T10:00:00Z',
  '2026-01-20T10:00:00Z',
  '2026-01-27T10:00:00Z',
  '2026-01-25T09:00:00Z', 'Europe/London', '2026-01-27T09:00:00Z', '2026-01-25T09:05:00Z', '2026-01-26T14:30:00Z',
  0,
  '2026-01-20T10:00:00Z', '2026-01-26T14:30:00Z'
);

-- 6. Frank ClearEvidence: Evaluated with clear_evidence signal
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  evaluation_signal, evaluation_notes, evaluated_by, evaluated_at,
  created_at, updated_at
)
VALUES (
  'ca_ui_frank', 'app_assess_frank', 'job_dev_swe', 'evaluated',
  'token_ui_frank_clear',
  '2026-03-10T10:00:00Z',
  '2026-01-15T10:00:00Z',
  '2026-01-22T10:00:00Z',
  '2026-01-18T10:00:00Z', 'Europe/Berlin', '2026-01-20T10:00:00Z', '2026-01-18T10:02:00Z', '2026-01-19T16:45:00Z',
  0,
  'clear_evidence', 'Exceptional system design document with clear architectural decisions. Code implementation demonstrates strong understanding of distributed systems, clean code practices, and comprehensive test coverage. Highly recommend proceeding to interview stage.', 'user_dev_admin', '2026-01-21T09:00:00Z',
  '2026-01-15T10:00:00Z', '2026-01-21T09:00:00Z'
);

-- 7. Grace SomeGaps: Evaluated with some_gaps signal
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  evaluation_signal, evaluation_notes, evaluated_by, evaluated_at,
  created_at, updated_at
)
VALUES (
  'ca_ui_grace', 'app_assess_grace', 'job_dev_swe', 'evaluated',
  'token_ui_grace_gaps',
  '2026-03-10T10:00:00Z',
  '2026-01-15T10:00:00Z',
  '2026-01-22T10:00:00Z',
  '2026-01-19T02:00:00Z', 'Asia/Tokyo', '2026-01-21T02:00:00Z', '2026-01-19T02:10:00Z', '2026-01-20T08:00:00Z',
  1,
  'some_gaps', 'Design document shows good understanding of the problem space. However, the scalability section lacks depth - no discussion of sharding strategies or read replicas. Code is functional but missing edge case handling. Would benefit from follow-up technical interview to probe these areas.', 'user_dev_recruiter', '2026-01-22T14:00:00Z',
  '2026-01-15T10:00:00Z', '2026-01-22T14:00:00Z'
);

-- 8. Henry Insufficient: Evaluated with insufficient_evidence signal
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  evaluation_signal, evaluation_notes, evaluated_by, evaluated_at,
  created_at, updated_at
)
VALUES (
  'ca_ui_henry', 'app_assess_henry', 'job_dev_swe', 'evaluated',
  'token_ui_henry_insufficient',
  '2026-03-10T10:00:00Z',
  '2026-01-15T10:00:00Z',
  '2026-01-22T10:00:00Z',
  '2026-01-20T00:00:00Z', 'Australia/Sydney', '2026-01-22T00:00:00Z', '2026-01-20T00:05:00Z', '2026-01-21T23:55:00Z',
  0,
  'insufficient_evidence', 'Submitted work does not meet the minimum requirements. Design document is incomplete - missing architecture diagrams and database schema. Code implementation has critical bugs and no tests. Cannot proceed to interview stage.', 'user_dev_admin', '2026-01-23T10:00:00Z',
  '2026-01-15T10:00:00Z', '2026-01-23T10:00:00Z'
);

-- 9. Iris Expired: Started but didn't submit in time
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  created_at, updated_at
)
VALUES (
  'ca_ui_iris', 'app_assess_iris', 'job_dev_swe', 'expired',
  'token_ui_iris_expired',
  '2026-02-20T10:00:00Z',
  '2026-01-10T10:00:00Z',
  '2026-01-17T10:00:00Z',
  '2026-01-15T15:00:00Z', 'America/Toronto', '2026-01-17T15:00:00Z', '2026-01-15T15:10:00Z', NULL,
  0,
  '2026-01-10T10:00:00Z', '2026-01-17T15:10:00Z'
);

-- 10. Jack ScheduleExpired: Never scheduled, deadline passed
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  created_at, updated_at
)
VALUES (
  'ca_ui_jack', 'app_assess_jack', 'job_dev_swe', 'schedule_expired',
  'token_ui_jack_schedexp',
  '2026-02-20T10:00:00Z',
  '2026-01-10T10:00:00Z',
  '2026-01-17T10:00:00Z',
  NULL, NULL, NULL, NULL, NULL,
  0,
  '2026-01-10T10:00:00Z', '2026-01-17T10:01:00Z'
);

-- 11. Kate CancelledAfter: Cancelled after scheduling
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  cancelled_at, cancel_reason,
  created_at, updated_at
)
VALUES (
  'ca_ui_kate', 'app_assess_kate', 'job_dev_swe', 'cancelled',
  'token_ui_kate_cancelafter',
  '2026-03-10T10:00:00Z',
  '2026-01-20T10:00:00Z',
  '2026-01-27T10:00:00Z',
  '2026-01-25T11:00:00Z', 'Europe/Madrid', '2026-01-27T11:00:00Z', NULL, NULL,
  0,
  '2026-01-24T09:00:00Z', 'Candidate withdrew from the process',
  '2026-01-20T10:00:00Z', '2026-01-24T09:00:00Z'
);

-- 12. Leo CancelledBefore: Cancelled before scheduling
INSERT OR IGNORE INTO candidate_assessments (
  id, application_id, job_id, status,
  token, token_expires_at,
  invited_at, schedule_deadline,
  scheduled_for, scheduled_timezone, completion_deadline, started_at, submitted_at,
  reschedule_count,
  cancelled_at, cancel_reason,
  created_at, updated_at
)
VALUES (
  'ca_ui_leo', 'app_assess_leo', 'job_dev_swe', 'cancelled',
  'token_ui_leo_cancelbefore',
  '2026-03-10T10:00:00Z',
  '2026-01-20T10:00:00Z',
  '2026-01-27T10:00:00Z',
  NULL, NULL, NULL, NULL, NULL,
  0,
  '2026-01-22T10:00:00Z', 'Wrong assessment assigned - need to re-invite with correct assessment',
  '2026-01-20T10:00:00Z', '2026-01-22T10:00:00Z'
);

-- Assessment files for submitted/evaluated states (Eve, Frank, Grace, Henry)

-- Eve's files (submitted, awaiting evaluation)
INSERT OR IGNORE INTO assessment_files (id, candidate_assessment_id, part_id, file_name, file_size, mime_type, r2_key, uploaded_at)
VALUES
  ('af_eve_1', 'ca_ui_eve', 'assess_part_design', 'system-design.pdf', 2450000, 'application/pdf', 'assessments/ca_ui_eve/assess_part_design/af_eve_1/system-design.pdf', '2026-01-26T10:00:00Z'),
  ('af_eve_2', 'ca_ui_eve', 'assess_part_code', 'messaging-service.zip', 15200000, 'application/zip', 'assessments/ca_ui_eve/assess_part_code/af_eve_2/messaging-service.zip', '2026-01-26T12:30:00Z'),
  ('af_eve_3', 'ca_ui_eve', 'assess_part_code', 'README.md', 3200, 'text/markdown', 'assessments/ca_ui_eve/assess_part_code/af_eve_3/README.md', '2026-01-26T14:00:00Z');

-- Frank's files (evaluated - clear evidence)
INSERT OR IGNORE INTO assessment_files (id, candidate_assessment_id, part_id, file_name, file_size, mime_type, r2_key, uploaded_at)
VALUES
  ('af_frank_1', 'ca_ui_frank', 'assess_part_design', 'architecture-document.pdf', 3100000, 'application/pdf', 'assessments/ca_ui_frank/assess_part_design/af_frank_1/architecture-document.pdf', '2026-01-18T14:00:00Z'),
  ('af_frank_2', 'ca_ui_frank', 'assess_part_design', 'diagrams.fig', 890000, 'application/x-fig', 'assessments/ca_ui_frank/assess_part_design/af_frank_2/diagrams.fig', '2026-01-18T15:00:00Z'),
  ('af_frank_3', 'ca_ui_frank', 'assess_part_code', 'realtime-messaging-api.zip', 22500000, 'application/zip', 'assessments/ca_ui_frank/assess_part_code/af_frank_3/realtime-messaging-api.zip', '2026-01-19T11:00:00Z'),
  ('af_frank_4', 'ca_ui_frank', 'assess_part_code', 'test-results.pdf', 156000, 'application/pdf', 'assessments/ca_ui_frank/assess_part_code/af_frank_4/test-results.pdf', '2026-01-19T16:30:00Z');

-- Grace's files (evaluated - some gaps)
INSERT OR IGNORE INTO assessment_files (id, candidate_assessment_id, part_id, file_name, file_size, mime_type, r2_key, uploaded_at)
VALUES
  ('af_grace_1', 'ca_ui_grace', 'assess_part_design', 'design-doc.pdf', 1800000, 'application/pdf', 'assessments/ca_ui_grace/assess_part_design/af_grace_1/design-doc.pdf', '2026-01-19T18:00:00Z'),
  ('af_grace_2', 'ca_ui_grace', 'assess_part_code', 'implementation.zip', 8900000, 'application/zip', 'assessments/ca_ui_grace/assess_part_code/af_grace_2/implementation.zip', '2026-01-20T05:00:00Z');

-- Henry's files (evaluated - insufficient evidence) - incomplete submission
INSERT OR IGNORE INTO assessment_files (id, candidate_assessment_id, part_id, file_name, file_size, mime_type, r2_key, uploaded_at)
VALUES
  ('af_henry_1', 'ca_ui_henry', 'assess_part_design', 'notes.pdf', 45000, 'application/pdf', 'assessments/ca_ui_henry/assess_part_design/af_henry_1/notes.pdf', '2026-01-21T20:00:00Z'),
  ('af_henry_2', 'ca_ui_henry', 'assess_part_code', 'partial-code.zip', 120000, 'application/zip', 'assessments/ca_ui_henry/assess_part_code/af_henry_2/partial-code.zip', '2026-01-21T23:50:00Z');

-- ============================================================================
-- Done! Summary of seeded data:
-- - 1 organization (Acme Corporation)
-- - 3 users (1 admin, 2 recruiters)
-- - 4 interviewers (3 active, 1 invited) with availability + blocked dates
-- - 1 pricing history record
-- - 2 assessment definitions with 4 parts total
-- - 4 jobs (published, draft, paused, closed) with application_config
-- - 1 job assessment (SWE linked to BE take-home, with snapshot)
-- - 7 interview stages across 3 jobs with interviewer assignments
-- - 5 custom questions (3 screening, 1 evaluative, 1 logistical)
-- - 17 applications (5 original + 12 assessment UI test candidates)
-- - 12 archetype answers (Alice, Bob, Charlie, Eve)
-- - 10 custom answers (Alice + Bob)
-- - 13 candidate assessments:
--     * 1 original (Alice evaluated)
--     * 12 for UI testing covering all status states:
--       - invited (Alice Invited)
--       - scheduled (Bob Scheduled)
--       - scheduled with reschedules (Carol Rescheduled)
--       - in_progress (Dave Working)
--       - submitted (Eve Submitted)
--       - evaluated/clear_evidence (Frank ClearEvidence)
--       - evaluated/some_gaps (Grace SomeGaps)
--       - evaluated/insufficient_evidence (Henry Insufficient)
--       - expired (Iris Expired)
--       - schedule_expired (Jack ScheduleExpired)
--       - cancelled after scheduling (Kate CancelledAfter)
--       - cancelled before scheduling (Leo CancelledBefore)
-- - 12 assessment files (for Eve, Frank, Grace, Henry submissions)
-- - CV structured data for Alice (3 work experiences, 1 education, 10 skills)
-- - 3 application notes
-- - 7 application events (timeline)
-- - 1 scheduled interview with 2 participants
-- - 5 billing events
-- ============================================================================
