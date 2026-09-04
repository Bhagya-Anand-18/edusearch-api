export const schema = `
CREATE TABLE IF NOT EXISTS institutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT,
    type TEXT,
    state TEXT,
    city TEXT,
    nirf_rank INTEGER,
    nirf_score REAL,
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
    category TEXT,
    gender TEXT,
    opening_rank INTEGER,
    closing_rank INTEGER,
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
    FOREIGN KEY(institute_id) REFERENCES institutes(id)
);

CREATE TABLE IF NOT EXISTS placements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institute_id INTEGER NOT NULL,
    year INTEGER,
    program_or_dept TEXT,
    students_placed_pct REAL,
    median_salary REAL,
    average_salary REAL,
    highest_salary REAL,
    top_recruiters TEXT, -- JSON string
    FOREIGN KEY(institute_id) REFERENCES institutes(id)
);

CREATE TABLE IF NOT EXISTS exam_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam TEXT,
    year INTEGER,
    total_registered INTEGER,
    total_appeared INTEGER,
    total_qualified INTEGER,
    max_score REAL,
    min_qualifying_score REAL,
    avg_score REAL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cutoffs_exam_year_cat ON cutoffs(exam, year, category);
CREATE INDEX IF NOT EXISTS idx_nirf_inst_year ON nirf_rankings(institute_id, year);
CREATE INDEX IF NOT EXISTS idx_programs_inst ON programs(institute_id);
CREATE INDEX IF NOT EXISTS idx_placements_inst_year ON placements(institute_id, year);
`;
