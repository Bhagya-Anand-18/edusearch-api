export const schema = `
CREATE TABLE IF NOT EXISTS institutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT,
    type TEXT,
    state TEXT,
    city TEXT,
    nirf_rank INTEGER,        -- latest official NIRF rank in its category, if ranked
    nirf_score REAL,
    nirf_category TEXT,       -- 'engineering' or 'medical'
    website TEXT,
    established_year INTEGER
);

CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institute_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    degree TEXT,
    duration_years INTEGER,
    branch_code TEXT,
    FOREIGN KEY(institute_id) REFERENCES institutes(id)
);

CREATE TABLE IF NOT EXISTS cutoffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL,
    exam TEXT,
    year INTEGER,
    round INTEGER,
    is_final_round INTEGER NOT NULL DEFAULT 0, -- 1 when this is the year's last round
    quota TEXT,               -- JoSAA quota: AI, HS, OS, GO, JK or LA
    category TEXT,
    pwd INTEGER NOT NULL DEFAULT 0, -- 1 for seats reserved for persons with disabilities
    gender TEXT,
    opening_rank INTEGER,
    closing_rank INTEGER,
    source TEXT NOT NULL,     -- 'josaa' (official cutoffs) or 'mcc_derived' (ranges from official MCC allotments)
    FOREIGN KEY(program_id) REFERENCES programs(id)
);

CREATE TABLE IF NOT EXISTS nirf_rankings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institute_id INTEGER NOT NULL,
    year INTEGER,
    category TEXT,
    rank INTEGER,
    score REAL,
    tlr_score REAL,
    rpc_score REAL,
    go_score REAL,
    oi_score REAL,
    perception_score REAL,
    nirf_id TEXT,             -- NIRF's own institute ID, e.g. IR-E-U-0456
    source TEXT NOT NULL,     -- 'nirf' (official)
    FOREIGN KEY(institute_id) REFERENCES institutes(id)
);

CREATE TABLE IF NOT EXISTS placements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institute_id INTEGER NOT NULL,
    year INTEGER,             -- year the batch graduated: academic year 2023-24 -> 2024
    academic_year TEXT,       -- as NIRF reports it, e.g. 2023-24
    program_or_dept TEXT,
    graduating INTEGER,       -- students graduating in minimum stipulated time
    placed INTEGER,
    higher_studies INTEGER,   -- students selected for higher studies
    students_placed_pct REAL,
    median_salary REAL,
    average_salary REAL,
    highest_salary REAL,
    top_recruiters TEXT,      -- JSON string; NIRF reports do not include recruiters
    source TEXT NOT NULL,     -- 'nirf' (official institute data report)
    FOREIGN KEY(institute_id) REFERENCES institutes(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cutoffs_exam_year_cat ON cutoffs(exam, year, category);
CREATE INDEX IF NOT EXISTS idx_cutoffs_program ON cutoffs(program_id, exam, category, year);
CREATE INDEX IF NOT EXISTS idx_nirf_inst_year ON nirf_rankings(institute_id, year);
CREATE INDEX IF NOT EXISTS idx_programs_inst ON programs(institute_id);
CREATE INDEX IF NOT EXISTS idx_placements_inst_year ON placements(institute_id, year);
`;
