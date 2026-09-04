import { db } from './database.js';
import { logger } from '../utils/logger.js';

const seedData = async () => {
    logger.info("Starting seed data generation...");

    // Clear existing data
    logger.info("Clearing existing data...");
    db.exec(`
        DELETE FROM placements;
        DELETE FROM nirf_rankings;
        DELETE FROM cutoffs;
        DELETE FROM programs;
        DELETE FROM institutes;
        DELETE FROM exam_stats;
        DELETE FROM sqlite_sequence;
    `);

    // Use transaction for speed
    const tx = db.transaction(() => {
        logger.info("Inserting institutes...");
        
        const insertInstitute = db.prepare(`
            INSERT INTO institutes (name, short_name, type, state, city, nirf_rank, nirf_score, website, established_year)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const iits = [
            ['Indian Institute of Technology Madras', 'IIT Madras', 'IIT', 'Tamil Nadu', 'Chennai', 1, 90.00, 'www.iitm.ac.in', 1959],
            ['Indian Institute of Technology Delhi', 'IIT Delhi', 'IIT', 'Delhi', 'New Delhi', 2, 88.00, 'www.iitd.ac.in', 1961],
            ['Indian Institute of Technology Bombay', 'IIT Bombay', 'IIT', 'Maharashtra', 'Mumbai', 3, 85.00, 'www.iitb.ac.in', 1958],
            ['Indian Institute of Technology Kanpur', 'IIT Kanpur', 'IIT', 'Uttar Pradesh', 'Kanpur', 4, 82.50, 'www.iitk.ac.in', 1959],
            ['Indian Institute of Technology Roorkee', 'IIT Roorkee', 'IIT', 'Uttarakhand', 'Roorkee', 5, 80.00, 'www.iitr.ac.in', 1847],
            ['Indian Institute of Technology Kharagpur', 'IIT Kharagpur', 'IIT', 'West Bengal', 'Kharagpur', 6, 78.50, 'www.iitkgp.ac.in', 1951],
            ['Indian Institute of Technology Guwahati', 'IIT Guwahati', 'IIT', 'Assam', 'Guwahati', 7, 75.00, 'www.iitg.ac.in', 1994],
            ['Indian Institute of Technology Hyderabad', 'IIT Hyderabad', 'IIT', 'Telangana', 'Hyderabad', 8, 72.00, 'www.iith.ac.in', 2008],
            ['Indian Institute of Technology Banaras Hindu University', 'IIT BHU', 'IIT', 'Uttar Pradesh', 'Varanasi', 11, 65.00, 'www.iitbhu.ac.in', 1919],
            ['Indian Institute of Technology Indore', 'IIT Indore', 'IIT', 'Madhya Pradesh', 'Indore', 14, 61.00, 'www.iiti.ac.in', 2009],
            ['Indian Institute of Technology Ropar', 'IIT Ropar', 'IIT', 'Punjab', 'Rupnagar', 22, 55.00, 'www.iitrpr.ac.in', 2008],
            ['Indian Institute of Technology Patna', 'IIT Patna', 'IIT', 'Bihar', 'Patna', 33, 50.00, 'www.iitp.ac.in', 2008],
            ['Indian Institute of Technology Gandhinagar', 'IIT Gandhinagar', 'IIT', 'Gujarat', 'Gandhinagar', 18, 58.00, 'www.iitgn.ac.in', 2008],
            ['Indian Institute of Technology Jodhpur', 'IIT Jodhpur', 'IIT', 'Rajasthan', 'Jodhpur', 30, 52.00, 'www.iitj.ac.in', 2008],
            ['Indian Institute of Technology Bhubaneswar', 'IIT Bhubaneswar', 'IIT', 'Odisha', 'Bhubaneswar', 47, 45.00, 'www.iitbbs.ac.in', 2008],
            ['Indian Institute of Technology Mandi', 'IIT Mandi', 'IIT', 'Himachal Pradesh', 'Mandi', 33, 50.00, 'www.iitmandi.ac.in', 2009],
            ['Indian Institute of Technology Palakkad', 'IIT Palakkad', 'IIT', 'Kerala', 'Palakkad', 69, 39.00, 'www.iitpkd.ac.in', 2015],
            ['Indian Institute of Technology Tirupati', 'IIT Tirupati', 'IIT', 'Andhra Pradesh', 'Tirupati', 59, 42.00, 'www.iittp.ac.in', 2015],
            ['Indian Institute of Technology (ISM) Dhanbad', 'IIT Dhanbad', 'IIT', 'Jharkhand', 'Dhanbad', 42, 47.00, 'www.iitism.ac.in', 1926],
            ['Indian Institute of Technology Bhilai', 'IIT Bhilai', 'IIT', 'Chhattisgarh', 'Bhilai', 81, 35.00, 'www.iitbhilai.ac.in', 2016],
            ['Indian Institute of Technology Goa', 'IIT Goa', 'IIT', 'Goa', 'Ponda', 65, 40.00, 'www.iitgoa.ac.in', 2016],
            ['Indian Institute of Technology Jammu', 'IIT Jammu', 'IIT', 'Jammu & Kashmir', 'Jammu', 67, 39.50, 'www.iitjammu.ac.in', 2016],
            ['Indian Institute of Technology Dharwad', 'IIT Dharwad', 'IIT', 'Karnataka', 'Dharwad', 93, 33.00, 'www.iitdh.ac.in', 2016]
        ];

        const nits = [
            ['National Institute of Technology Tiruchirappalli', 'NIT Trichy', 'NIT', 'Tamil Nadu', 'Tiruchirappalli', 9, 70.00, 'www.nitt.edu', 1964],
            ['National Institute of Technology Karnataka Surathkal', 'NIT Surathkal', 'NIT', 'Karnataka', 'Mangalore', 12, 64.00, 'www.nitk.ac.in', 1960],
            ['National Institute of Technology Rourkela', 'NIT Rourkela', 'NIT', 'Odisha', 'Rourkela', 16, 59.00, 'www.nitrkl.ac.in', 1961],
            ['National Institute of Technology Warangal', 'NIT Warangal', 'NIT', 'Telangana', 'Warangal', 21, 56.00, 'www.nitw.ac.in', 1959],
            ['National Institute of Technology Calicut', 'NIT Calicut', 'NIT', 'Kerala', 'Kozhikode', 23, 54.00, 'www.nitc.ac.in', 1961],
            ['Motilal Nehru National Institute of Technology Allahabad', 'NIT Allahabad', 'NIT', 'Uttar Pradesh', 'Prayagraj', 49, 44.00, 'www.mnnit.ac.in', 1961],
            ['Malaviya National Institute of Technology Jaipur', 'NIT Jaipur', 'NIT', 'Rajasthan', 'Jaipur', 37, 48.00, 'www.mnit.ac.in', 1963],
            ['Visvesvaraya National Institute of Technology Nagpur', 'NIT Nagpur', 'NIT', 'Maharashtra', 'Nagpur', 41, 47.50, 'www.vnit.ac.in', 1960],
            ['National Institute of Technology Durgapur', 'NIT Durgapur', 'NIT', 'West Bengal', 'Durgapur', 43, 46.00, 'www.nitdgp.ac.in', 1960],
            ['National Institute of Technology Kurukshetra', 'NIT Kurukshetra', 'NIT', 'Haryana', 'Kurukshetra', 58, 43.00, 'www.nitkkr.ac.in', 1963]
        ];

        const iiits = [
            ['International Institute of Information Technology Hyderabad', 'IIIT Hyderabad', 'IIIT', 'Telangana', 'Hyderabad', 55, 43.50, 'www.iiit.ac.in', 1998],
            ['Indraprastha Institute of Information Technology Delhi', 'IIIT Delhi', 'IIIT', 'Delhi', 'New Delhi', 75, 37.00, 'www.iiitd.ac.in', 2008],
            ['Indian Institute of Information Technology Allahabad', 'IIIT Allahabad', 'IIIT', 'Uttar Pradesh', 'Prayagraj', 89, 34.00, 'www.iiita.ac.in', 1999],
            ['International Institute of Information Technology Bangalore', 'IIIT Bangalore', 'IIIT', 'Karnataka', 'Bengaluru', 74, 38.00, 'www.iiitb.ac.in', 1999],
            ['Atal Bihari Vajpayee Indian Institute of Information Technology and Management', 'IIIT Gwalior', 'IIIT', 'Madhya Pradesh', 'Gwalior', 88, 34.50, 'www.iiitm.ac.in', 1997]
        ];

        const medical = [
            ['All India Institute of Medical Sciences New Delhi', 'AIIMS Delhi', 'Medical', 'Delhi', 'New Delhi', 1, 95.00, 'www.aiims.edu', 1956],
            ['Jawaharlal Institute of Postgraduate Medical Education and Research', 'JIPMER', 'Medical', 'Puducherry', 'Puducherry', 2, 92.00, 'www.jipmer.edu.in', 1823],
            ['Christian Medical College Vellore', 'CMC Vellore', 'Medical', 'Tamil Nadu', 'Vellore', 3, 90.00, 'www.cmch-vellore.edu', 1900],
            ['All India Institute of Medical Sciences Bhopal', 'AIIMS Bhopal', 'Medical', 'Madhya Pradesh', 'Bhopal', 10, 85.00, 'www.aiimsbhopal.edu.in', 2012],
            ['King George Medical University', 'KGMU Lucknow', 'Medical', 'Uttar Pradesh', 'Lucknow', 11, 84.00, 'www.kgmu.org', 1911],
            ['Maulana Azad Medical College', 'MAMC', 'Medical', 'Delhi', 'New Delhi', 15, 80.00, 'www.mamc.ac.in', 1959],
            ['Grant Medical College', 'GMC Mumbai', 'Medical', 'Maharashtra', 'Mumbai', 20, 75.00, 'www.gmcjjh.org', 1845],
            ['Madras Medical College', 'MMC', 'Medical', 'Tamil Nadu', 'Chennai', 14, 81.00, 'www.mmc.ac.in', 1835],
            ['B. J. Medical College', 'BJMC Ahmedabad', 'Medical', 'Gujarat', 'Ahmedabad', 30, 70.00, 'www.bjmcabd.edu.in', 1871],
            ['Seth GS Medical College', 'GSMC Mumbai', 'Medical', 'Maharashtra', 'Mumbai', 18, 77.00, 'www.kem.edu', 1926]
        ];

        const allInstitutes = [...iits, ...nits, ...iiits, ...medical];
        const instIdMap: Record<string, number | bigint> = {};

        for (const inst of allInstitutes) {
            const res = insertInstitute.run(inst[0], inst[1], inst[2], inst[3], inst[4], inst[5], inst[6], inst[7], inst[8]);
            instIdMap[inst[1] as string] = res.lastInsertRowid;
        }

        logger.info("Inserting programs...");
        const insertProgram = db.prepare(`
            INSERT INTO programs (institute_id, name, degree, duration_years, branch_code)
            VALUES (?, ?, ?, ?, ?)
        `);

        const progIdMap: Record<string, number | bigint> = {};

        // Engineering Programs
        const engPrograms = [
            { name: 'Computer Science and Engineering', code: 'CSE' },
            { name: 'Electrical Engineering', code: 'EE' },
            { name: 'Mechanical Engineering', code: 'ME' },
            { name: 'Civil Engineering', code: 'CE' },
            { name: 'Chemical Engineering', code: 'CH' },
            { name: 'Mathematics & Computing', code: 'MNC' },
            { name: 'Aerospace Engineering', code: 'AE' },
            { name: 'Engineering Physics', code: 'EP' }
        ];

        for (const [shortName, id] of Object.entries(instIdMap)) {
            const isMedical = medical.find(m => m[1] === shortName);
            if (!isMedical) {
                // Determine which programs to add
                let progs = engPrograms;
                if (shortName.startsWith('NIT')) {
                    progs = engPrograms.filter(p => !['MNC', 'AE', 'EP'].includes(p.code));
                } else if (shortName.startsWith('IIIT')) {
                    progs = engPrograms.filter(p => ['CSE', 'EE'].includes(p.code));
                }

                for (const p of progs) {
                    const res = insertProgram.run(id, p.name, 'B.Tech', 4, p.code);
                    progIdMap[`${shortName}_${p.code}`] = res.lastInsertRowid;
                }
            } else {
                const res1 = insertProgram.run(id, 'Medicine and Surgery', 'MBBS', 5, 'MBBS');
                progIdMap[`${shortName}_MBBS`] = res1.lastInsertRowid;
                const res2 = insertProgram.run(id, 'Dental Surgery', 'BDS', 5, 'BDS');
                progIdMap[`${shortName}_BDS`] = res2.lastInsertRowid;
            }
        }

        logger.info("Inserting cutoffs...");
        const insertCutoff = db.prepare(`
            INSERT INTO cutoffs (program_id, exam, year, round, category, gender, opening_rank, closing_rank)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Helper to randomize
        const randRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
        
        // Base ranges for Top IIT CSE Gen (adjust for other IITs)
        const iitBaseRanks: Record<string, { o: number, c: number }> = {
            'IIT Bombay': { o: 15, c: 60 },
            'IIT Delhi': { o: 30, c: 150 },
            'IIT Madras': { o: 40, c: 200 },
            'IIT Kanpur': { o: 80, c: 300 },
            'IIT Kharagpur': { o: 100, c: 450 },
        };

        const nitBaseRanks: Record<string, { o: number, c: number }> = {
            'NIT Trichy': { o: 1000, c: 5000 },
            'NIT Surathkal': { o: 2000, c: 8000 },
            'NIT Warangal': { o: 1500, c: 7000 },
        };
        
        const branchMult: Record<string, number> = {
            'CSE': 1.0, 'MNC': 1.5, 'EE': 2.5, 'EP': 3.5, 'ME': 4.5, 'AE': 5.0, 'CH': 6.0, 'CE': 7.0
        };

        const catMult: Record<string, number> = { 'general': 1.0, 'obc': 1.5, 'sc': 3.5, 'st': 5.0 };

        for (const year of [2022, 2023, 2024, 2025]) {
            for (const [key, progId] of Object.entries(progIdMap)) {
                const [instName, branchCode] = key.split('_');
                const isIIT = instName.startsWith('IIT');
                const isNIT = instName.startsWith('NIT');
                const isIIIT = instName.startsWith('IIIT');
                const isMed = medical.some(m => m[1] === instName);

                if (isIIT) {
                    const baseRank = iitBaseRanks[instName] || { o: randRange(200, 1000), c: randRange(1500, 4000) };
                    const bMult = branchMult[branchCode] || 1;
                    
                    for (const cat of ['general', 'obc', 'sc', 'st']) {
                        const cMult = catMult[cat];
                        const vary = 1 + (randRange(-10, 15) / 100);
                        
                        // Round 1
                        const r1_op = Math.floor(baseRank.o * bMult * cMult * vary);
                        const r1_cl = Math.floor(baseRank.c * bMult * cMult * vary);
                        insertCutoff.run(progId, 'jee_advanced', year, 1, cat, 'neutral', r1_op, r1_cl);
                        
                        // Final Round
                        const f_op = r1_op;
                        const f_cl = Math.floor(r1_cl * (1 + (randRange(5, 20) / 100)));
                        insertCutoff.run(progId, 'jee_advanced', year, 6, cat, 'neutral', f_op, f_cl);
                    }
                } else if (isNIT || isIIIT) {
                    const baseRank = nitBaseRanks[instName] || { o: randRange(3000, 8000), c: randRange(10000, 20000) };
                    const bMult = branchMult[branchCode] || 1;

                    for (const cat of ['general', 'obc', 'sc', 'st']) {
                        const cMult = catMult[cat];
                        const vary = 1 + (randRange(-10, 15) / 100);
                        
                        const r1_op = Math.floor(baseRank.o * bMult * cMult * vary);
                        const r1_cl = Math.floor(baseRank.c * bMult * cMult * vary);
                        
                        // Home State vs Other State
                        const hsOp = Math.floor(r1_op * 1.3);
                        const hsCl = Math.floor(r1_cl * 1.3);
                        insertCutoff.run(progId, 'jee_main', year, 1, cat, 'neutral', hsOp, hsCl);
                        insertCutoff.run(progId, 'jee_main', year, 1, cat, 'neutral', r1_op, r1_cl);
                    }
                } else if (isMed) {
                    // NEET scores are stored as ranks in DB usually, but user specified scores.
                    // We'll store score as negative rank to simulate or just store rank equivalents.
                    // Actually, schema uses opening_rank/closing_rank. 
                    // Let's store NEET AIR and then score as another table? Schema doesn't have score for cutoffs.
                    // Let's store NEET ranks corresponding to the scores. 
                    // Score 710-720 = Rank 1-50
                    // Score 680-700 = Rank 500-1500
                    let op, cl;
                    if (instName === 'AIIMS Delhi') { op = 1; cl = 50; }
                    else if (instName === 'JIPMER') { op = 50; cl = 300; }
                    else { op = randRange(300, 2000); cl = randRange(1500, 8000); }
                    
                    for (const cat of ['general', 'obc', 'sc', 'st']) {
                        const cMult = catMult[cat];
                        const r_op = Math.floor(op * cMult * (1 + randRange(-5, 5)/100));
                        const r_cl = Math.floor(cl * cMult * (1 + randRange(-5, 5)/100));
                        insertCutoff.run(progId, 'neet', year, 1, cat, 'neutral', Math.max(1, r_op), r_cl);
                    }
                }
            }
        }

        logger.info("Inserting placements...");
        const insertPlacement = db.prepare(`
            INSERT INTO placements (institute_id, year, program_or_dept, students_placed_pct, median_salary, average_salary, highest_salary, top_recruiters)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const [shortName, id] of Object.entries(instIdMap)) {
            for (const year of [2023, 2024, 2025]) {
                let pct, med, avg, high;
                if (shortName.startsWith('IIT') && ['IIT Bombay', 'IIT Delhi', 'IIT Madras'].includes(shortName)) {
                    pct = randRange(85, 95); med = randRange(20, 25); avg = randRange(25, 30); high = randRange(200, 300);
                } else if (shortName.startsWith('IIT')) {
                    pct = randRange(75, 90); med = randRange(14, 18); avg = randRange(16, 22); high = randRange(80, 150);
                } else if (shortName.startsWith('NIT')) {
                    pct = randRange(70, 85); med = randRange(8, 12); avg = randRange(10, 15); high = randRange(50, 80);
                } else if (shortName.startsWith('IIIT')) {
                    pct = randRange(80, 95); med = randRange(15, 22); avg = randRange(18, 26); high = randRange(80, 120);
                } else {
                    pct = randRange(95, 99); med = randRange(12, 20); avg = randRange(15, 25); high = randRange(30, 40);
                }
                
                const recruiters = JSON.stringify(['Google', 'Microsoft', 'Amazon', 'Apple', 'Meta', 'HFTs'].sort(() => 0.5 - Math.random()).slice(0, 3));
                insertPlacement.run(id, year, 'Overall', pct, med * 100000, avg * 100000, high * 100000, recruiters);
            }
        }

        logger.info("Inserting NIRF Rankings...");
        const insertNirf = db.prepare(`
            INSERT INTO nirf_rankings (institute_id, year, category, rank, score, tlr_score, rpc_score, go_score, oi_score, perception_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const [shortName, id] of Object.entries(instIdMap)) {
            for (const year of [2023, 2024, 2025, 2026]) {
                const category = medical.some(m => m[1] === shortName) ? 'medical' : 'engineering';
                const baseInst = allInstitutes.find(i => i[1] === shortName);
                if (baseInst) {
                    const baseRank = baseInst[5] as number;
                    const baseScore = baseInst[6] as number;
                    
                    const rankVary = randRange(-2, 2);
                    const finalRank = Math.max(1, baseRank + rankVary);
                    const finalScore = baseScore + (randRange(-20, 20)/10);
                    
                    insertNirf.run(id, year, category, finalRank, finalScore, 
                        Math.max(0, finalScore - 10), Math.max(0, finalScore - 5), Math.max(0, finalScore + 5), Math.max(0, finalScore - 15), Math.max(0, finalScore - 12)
                    );
                }
            }
        }

        logger.info("Inserting Exam Stats...");
        const insertExamStat = db.prepare(`
            INSERT INTO exam_stats (exam, year, total_registered, total_appeared, total_qualified, max_score, min_qualifying_score, avg_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        insertExamStat.run('jee_main', 2025, 1200000, 1000000, 250000, 300, 93.2, 55.4);
        insertExamStat.run('jee_advanced', 2025, 200000, 180000, 40000, 360, 86.0, 45.0);
        insertExamStat.run('neet', 2025, 2400000, 2200000, 1000000, 720, 164.0, 250.0);

    });

    tx();
    logger.info("Seed data generation complete!");
};

seedData().catch(e => {
    logger.error("Failed to seed data", e);
    process.exit(1);
});
