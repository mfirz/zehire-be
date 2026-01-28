-- Seed script for local development
-- Run with: bun run db:seed:local
-- Reset with: bun run db:reset:local

-- ============================================================================
-- ORGANIZATION
-- ============================================================================

INSERT OR IGNORE INTO orgs (id, name, jobs_list_version, active_role_capacity, billing_waived, created_at, updated_at)
VALUES (
  'org_dev_acme',
  'Acme Corporation',
  1,
  10,
  1, -- Billing waived for dev
  '2024-01-01T00:00:00Z',
  '2024-01-01T00:00:00Z'
);

-- ============================================================================
-- USERS (with different roles)
-- ============================================================================

-- Admin user
INSERT OR IGNORE INTO users (id, email, name, role, org_id, created_at, updated_at)
VALUES (
  'user_dev_admin',
  'farizzx77@gmail.com',
  'Fariz Admin',
  'admin',
  'org_dev_acme',
  '2024-01-01T00:00:00Z',
  '2024-01-01T00:00:00Z'
);

-- Recruiter user
INSERT OR IGNORE INTO users (id, email, name, role, org_id, created_at, updated_at)
VALUES (
  'user_dev_recruiter',
  'recruiter@acme.com',
  'Sarah Johnson',
  'recruiter',
  'org_dev_acme',
  '2024-01-01T00:00:00Z',
  '2024-01-01T00:00:00Z'
);

-- Another recruiter
INSERT OR IGNORE INTO users (id, email, name, role, org_id, created_at, updated_at)
VALUES (
  'user_dev_recruiter2',
  'recruiter2@acme.com',
  'Mike Chen',
  'recruiter',
  'org_dev_acme',
  '2024-01-02T00:00:00Z',
  '2024-01-02T00:00:00Z'
);

-- ============================================================================
-- INTERVIEWERS
-- ============================================================================

INSERT OR IGNORE INTO interviewers (id, org_id, email, name, magic_token, timezone, status, invited_at, created_at, updated_at)
VALUES
  ('int_dev_eng1', 'org_dev_acme', 'john.smith@acme.com', 'John Smith', 'token_john_dev', 'America/New_York', 'active', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('int_dev_eng2', 'org_dev_acme', 'emily.davis@acme.com', 'Emily Davis', 'token_emily_dev', 'America/Los_Angeles', 'active', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('int_dev_mgr', 'org_dev_acme', 'robert.wilson@acme.com', 'Robert Wilson', 'token_robert_dev', 'Europe/London', 'active', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('int_dev_hr', 'org_dev_acme', 'lisa.taylor@acme.com', 'Lisa Taylor', 'token_lisa_dev', 'Asia/Singapore', 'invited', '2024-01-05T00:00:00Z', '2024-01-05T00:00:00Z', '2024-01-05T00:00:00Z');

-- Interviewer availability (Mon-Fri 9am-5pm)
INSERT OR IGNORE INTO interviewer_availability (id, interviewer_id, day_of_week, start_time, end_time, created_at, updated_at)
VALUES
  -- John Smith (Mon-Fri)
  ('avail_john_1', 'int_dev_eng1', 1, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_john_2', 'int_dev_eng1', 2, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_john_3', 'int_dev_eng1', 3, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_john_4', 'int_dev_eng1', 4, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_john_5', 'int_dev_eng1', 5, '09:00', '17:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  -- Emily Davis (Tue-Thu only)
  ('avail_emily_1', 'int_dev_eng2', 2, '10:00', '18:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_emily_2', 'int_dev_eng2', 3, '10:00', '18:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('avail_emily_3', 'int_dev_eng2', 4, '10:00', '18:00', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z');

-- ============================================================================
-- JOBS (different statuses)
-- ============================================================================

-- Published job with questions completed
INSERT OR IGNORE INTO jobs (
  id, org_id, status, questions_status, pipeline_status, title, description, description_text,
  company_name, department, location, work_type, employment_type,
  salary_min, salary_max, salary_currency, public_slug,
  job_context, archetypes, questions, pipeline_recommendation,
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
  -- job_context (JobContextSchema)
  '{"domain":"technology","specialization":"Backend Engineering","riskLevel":"medium","decisionImpact":"business","primarySignals":["technical_depth","system_thinking","decision_under_uncertainty"],"collaborationRequired":"high","customerFacing":false,"peopleManagement":false,"regulatedEnvironment":false,"experienceLevel":"senior"}',
  -- archetypes (array of ResolvedArchetypeSchema)
  '[{"id":"arch_technical_depth","category":"technical_depth","description":"Assess hands-on technical expertise and problem-solving ability","signals":["technical_depth","system_thinking"],"selectionReason":"Senior engineering role requires deep technical verification"},{"id":"arch_decision_judgment","category":"decision_judgment","description":"Evaluate decision-making under uncertainty and trade-off analysis","signals":["decision_under_uncertainty","tradeoff_awareness"],"selectionReason":"Role involves architectural decisions with business impact"},{"id":"arch_ownership","category":"ownership","description":"Assess accountability and ownership mentality","signals":["accountability","learning_from_failure"],"selectionReason":"Senior engineers need to own outcomes end-to-end"}]',
  -- questions (array of RenderedQuestionSchema)
  '[{"archetypeId":"arch_technical_depth","questionText":"Describe a complex technical system you designed or significantly improved. What were the key technical challenges, and how did you approach solving them?","signals":["technical_depth","system_thinking"],"minAnswerWords":100,"metadata":{"category":"technical_depth","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}},{"archetypeId":"arch_decision_judgment","questionText":"Tell me about a time when you had to make a significant technical decision with incomplete information. How did you approach the decision, and what was the outcome?","signals":["decision_under_uncertainty","tradeoff_awareness"],"minAnswerWords":100,"metadata":{"category":"decision_judgment","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}},{"archetypeId":"arch_ownership","questionText":"Describe a project or feature that did not go as planned. What happened, what was your role, and what did you learn from the experience?","signals":["accountability","learning_from_failure"],"minAnswerWords":100,"metadata":{"category":"ownership","formats":["experience_based","reflection"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}}]',
  -- pipeline_recommendation (PipelineRecommendationSchema)
  '{"assessment":{"recommended":false,"reason":"For senior software engineering roles, technical interviews provide better signal than standardized assessments","suggestedType":"none","suggestedProviders":[],"whatToTest":[]},"interviewPanel":{"rounds":[{"name":"Phone Screen","duration":30,"interviewerProfile":"Senior Engineer or Engineering Manager","focus":"Initial fit, communication, and high-level technical background"},{"name":"Technical Interview","duration":60,"interviewerProfile":"Senior or Staff Engineer","focus":"System design, coding ability, and technical depth"},{"name":"Culture Fit","duration":45,"interviewerProfile":"Engineering Manager and Team Lead","focus":"Team collaboration, values alignment, and growth mindset"}],"totalTime":"2 hours 15 minutes"},"evaluationCriteria":{"mustHave":["Strong system design skills","Proficiency in at least one modern programming language","Experience with distributed systems","Clear communication of technical concepts"],"niceToHave":["Experience with cloud platforms (AWS/GCP/Azure)","Open source contributions","Experience mentoring junior engineers"],"redFlags":["Unable to explain past technical decisions","Blames others for project failures","No curiosity about our tech stack"]}}',
  1250,
  '2024-01-12T00:00:00Z',
  '2024-01-13T00:00:00Z',
  '2024-01-10T00:00:00Z',
  '2024-01-15T00:00:00Z',
  '2024-01-15T00:00:00Z'
);

-- Draft job
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

-- Paused job
INSERT OR IGNORE INTO jobs (
  id, org_id, status, questions_status, pipeline_status, title, description, description_text,
  company_name, department, location, work_type, employment_type,
  salary_min, salary_max, salary_currency, public_slug,
  job_context, archetypes, questions, pipeline_recommendation,
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
  -- job_context
  '{"domain":"technology","specialization":"UX Design","riskLevel":"low","decisionImpact":"business","primarySignals":["communication_clarity","stakeholder_management","tradeoff_awareness"],"collaborationRequired":"high","customerFacing":true,"peopleManagement":false,"regulatedEnvironment":false,"experienceLevel":"mid"}',
  -- archetypes
  '[{"id":"arch_communication","category":"communication","description":"Assess ability to communicate design decisions clearly","signals":["communication_clarity","stakeholder_management"],"selectionReason":"UX designers must articulate design rationale to stakeholders"},{"id":"arch_decision_judgment","category":"decision_judgment","description":"Evaluate user-centered decision making","signals":["tradeoff_awareness","decision_under_uncertainty"],"selectionReason":"Design involves balancing user needs with business constraints"}]',
  -- questions
  '[{"archetypeId":"arch_communication","questionText":"Tell me about a time when you had to present a design that stakeholders initially disagreed with. How did you handle the situation?","signals":["communication_clarity","stakeholder_management"],"minAnswerWords":100,"metadata":{"category":"communication","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}},{"archetypeId":"arch_decision_judgment","questionText":"Describe a situation where user research findings conflicted with business requirements. How did you navigate this trade-off?","signals":["tradeoff_awareness","decision_under_uncertainty"],"minAnswerWords":100,"metadata":{"category":"decision_judgment","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":100}}}]',
  -- pipeline_recommendation
  '{"assessment":{"recommended":true,"reason":"Portfolio review is essential for design roles","suggestedType":"portfolio_review","suggestedProviders":["internal"],"whatToTest":["Visual design skills","Interaction design","User research methodology"]},"interviewPanel":{"rounds":[{"name":"Portfolio Review","duration":45,"interviewerProfile":"Senior Designer or Design Lead","focus":"Design process, visual skills, and problem-solving approach"},{"name":"Design Challenge","duration":60,"interviewerProfile":"Product Designer and Product Manager","focus":"Real-time problem solving and collaboration"}],"totalTime":"1 hour 45 minutes"},"evaluationCriteria":{"mustHave":["Strong portfolio with case studies","User research experience","Proficiency in Figma or similar tools"],"niceToHave":["Motion design skills","Design system experience","Accessibility expertise"],"redFlags":["Cannot explain design rationale","No user research in process","Defensive about feedback"]}}',
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
  -- job_context
  '{"domain":"technology","specialization":"Software Engineering","riskLevel":"low","decisionImpact":"low","primarySignals":["technical_depth","learning_from_failure","communication_clarity"],"collaborationRequired":"medium","customerFacing":false,"peopleManagement":false,"regulatedEnvironment":false,"experienceLevel":"entry"}',
  -- archetypes
  '[{"id":"arch_learning","category":"ownership","description":"Assess learning ability and growth mindset","signals":["learning_from_failure","accountability"],"selectionReason":"Interns need strong learning ability to grow quickly"},{"id":"arch_technical_basics","category":"technical_depth","description":"Evaluate foundational technical knowledge","signals":["technical_depth","communication_clarity"],"selectionReason":"Need to verify basic programming competency"}]',
  -- questions
  '[{"archetypeId":"arch_learning","questionText":"Tell me about a challenging concept or skill you recently learned. What was your approach to learning it, and what obstacles did you overcome?","signals":["learning_from_failure","accountability"],"minAnswerWords":75,"metadata":{"category":"ownership","formats":["experience_based","reflection"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":75}}},{"archetypeId":"arch_technical_basics","questionText":"Describe a programming project you have worked on (personal, academic, or professional). What technologies did you use and what did you learn from the experience?","signals":["technical_depth","communication_clarity"],"minAnswerWords":75,"metadata":{"category":"technical_depth","formats":["experience_based"],"renderingConstraints":{"requiresRealExample":true,"forbidYesNo":true,"singleQuestion":true,"minAnswerWords":75}}}]',
  -- pipeline_recommendation
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
-- INTERVIEW STAGES (for published, paused, and closed jobs)
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
-- APPLICATIONS (different statuses and triage levels)
-- ============================================================================

-- Shortlisted candidate
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name, preferred_name, phone,
  detected_country, detected_timezone, status, signals_status, triage_status,
  current_stage_id, created_at, updated_at
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
  'technical',
  '2024-01-16T10:00:00Z',
  '2024-01-20T00:00:00Z'
);

-- Maybe candidate
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name, preferred_name,
  detected_country, detected_timezone, status, signals_status, triage_status,
  created_at, updated_at
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
  '2024-01-17T14:30:00Z',
  '2024-01-18T00:00:00Z'
);

-- Weak candidate
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name, phone,
  detected_country, status, signals_status, triage_status,
  created_at, updated_at
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
  '2024-01-18T09:15:00Z',
  '2024-01-18T12:00:00Z'
);

-- Pending signals (processing)
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

-- Rejected candidate
INSERT OR IGNORE INTO applications (
  id, job_id, candidate_email, candidate_name,
  status, signals_status, triage_status,
  created_at, updated_at
)
VALUES (
  'app_dev_eve',
  'job_dev_swe',
  'eve.johnson@email.com',
  'Eve Johnson',
  'rejected',
  'completed',
  'WEAK',
  '2024-01-15T08:00:00Z',
  '2024-01-17T00:00:00Z'
);

-- ============================================================================
-- ANSWERS (for shortlisted candidate)
-- ============================================================================

INSERT OR IGNORE INTO answers (id, application_id, archetype_id, question_text, answer_text, extraction_status, created_at, updated_at, answered_at)
VALUES
  ('ans_alice_1', 'app_dev_alice', 'problem_solver', 'Describe a challenging technical problem you solved', 'I led the migration of our monolithic application to microservices, reducing deployment time by 80% and improving system reliability.', 'completed', '2024-01-16T10:05:00Z', '2024-01-16T10:05:00Z', '2024-01-16T10:05:00Z'),
  ('ans_alice_2', 'app_dev_alice', 'team_player', 'How do you collaborate with cross-functional teams?', 'I regularly run design reviews with product and design teams, ensuring alignment on technical decisions and trade-offs.', 'completed', '2024-01-16T10:10:00Z', '2024-01-16T10:10:00Z', '2024-01-16T10:10:00Z'),
  ('ans_alice_3', 'app_dev_alice', 'growth_mindset', 'What new technology have you learned recently?', 'I have been learning Rust for systems programming and have contributed to open source projects to deepen my understanding.', 'completed', '2024-01-16T10:15:00Z', '2024-01-16T10:15:00Z', '2024-01-16T10:15:00Z');

-- ============================================================================
-- APPLICATION NOTES
-- ============================================================================

INSERT OR IGNORE INTO application_notes (id, application_id, author_id, author_name, content, created_at, updated_at)
VALUES
  ('note_1', 'app_dev_alice', 'user_dev_recruiter', 'Sarah Johnson', 'Strong technical background. Recommend moving to technical interview.', '2024-01-17T09:00:00Z', '2024-01-17T09:00:00Z'),
  ('note_2', 'app_dev_alice', 'user_dev_admin', 'Fariz Admin', 'Agreed. Schedule with John for technical round.', '2024-01-17T10:30:00Z', '2024-01-17T10:30:00Z'),
  ('note_3', 'app_dev_bob', 'user_dev_recruiter', 'Sarah Johnson', 'Good potential but needs more context on distributed systems experience.', '2024-01-18T11:00:00Z', '2024-01-18T11:00:00Z');

-- ============================================================================
-- APPLICATION EVENTS (timeline)
-- ============================================================================

INSERT OR IGNORE INTO application_events (id, application_id, event_type, actor_id, actor_name, old_value, new_value, created_at)
VALUES
  ('evt_1', 'app_dev_alice', 'status_change', 'user_dev_recruiter', 'Sarah Johnson', 'pending', 'screening', '2024-01-16T12:00:00Z'),
  ('evt_2', 'app_dev_alice', 'triage_change', 'user_dev_recruiter', 'Sarah Johnson', NULL, 'SHORTLIST', '2024-01-16T12:05:00Z'),
  ('evt_3', 'app_dev_alice', 'note_added', 'user_dev_recruiter', 'Sarah Johnson', NULL, NULL, '2024-01-17T09:00:00Z'),
  ('evt_4', 'app_dev_alice', 'status_change', 'user_dev_admin', 'Fariz Admin', 'screening', 'interview', '2024-01-18T00:00:00Z'),
  ('evt_5', 'app_dev_eve', 'status_change', 'user_dev_recruiter', 'Sarah Johnson', 'pending', 'rejected', '2024-01-17T00:00:00Z');

-- ============================================================================
-- SCHEDULED INTERVIEWS
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
-- CUSTOM QUESTIONS (for screening)
-- ============================================================================

INSERT OR IGNORE INTO custom_questions (
  id, job_id, category, question_text, answer_type, required, order_index,
  expected_answer, fail_action, created_at, updated_at
)
VALUES
  ('cq_1', 'job_dev_swe', 'screening', 'How many years of professional software development experience do you have?', 'number', 1, 0, '3', 'flag', '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z'),
  ('cq_2', 'job_dev_swe', 'screening', 'Are you proficient in TypeScript?', 'yes_no', 1, 1, 'yes', 'flag', '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z'),
  ('cq_3', 'job_dev_swe', 'logistical', 'Are you authorized to work in the United States?', 'yes_no', 1, 2, 'yes', 'reject', '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z'),
  ('cq_4', 'job_dev_swe', 'evaluative', 'Describe your experience with cloud platforms (AWS, GCP, Azure)', 'free_text', 0, 3, NULL, NULL, '2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z');

-- Custom answers for Alice
INSERT OR IGNORE INTO custom_answers (id, application_id, question_id, answer_text, answer_number, screening_passed, created_at)
VALUES
  ('ca_1', 'app_dev_alice', 'cq_1', '7', 7, 1, '2024-01-16T10:00:00Z'),
  ('ca_2', 'app_dev_alice', 'cq_2', 'yes', NULL, 1, '2024-01-16T10:00:00Z'),
  ('ca_3', 'app_dev_alice', 'cq_3', 'yes', NULL, 1, '2024-01-16T10:00:00Z'),
  ('ca_4', 'app_dev_alice', 'cq_4', 'Extensive experience with AWS (ECS, Lambda, RDS) and GCP (Cloud Run, BigQuery). Led cloud migration projects.', NULL, NULL, '2024-01-16T10:00:00Z');

-- ============================================================================
-- Done! Summary of seeded data:
-- - 1 organization (Acme Corporation)
-- - 3 users (1 admin, 2 recruiters)
-- - 4 interviewers (3 active, 1 invited)
-- - 4 jobs (published, draft, paused, closed)
-- - 3 interview stages for published job
-- - 5 applications (various statuses and triage levels)
-- - Application notes and timeline events
-- - 1 scheduled interview with participants
-- - Custom questions and answers
-- ============================================================================
