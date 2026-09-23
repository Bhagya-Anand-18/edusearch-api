/**
 * Real institute metadata: name, short name, type, state, city, website,
 * founding year. Institutes admitted through JoSAA are also created from the
 * JoSAA snapshot; entries here enrich them (matched by name) and add the
 * institutes JoSAA does not cover (self-admitting IIITs, medical colleges).
 */
export const KNOWN_INSTITUTES: [string, string, string, string, string, string, number][] = [
    ['Indian Institute of Technology Madras', 'IIT Madras', 'IIT', 'Tamil Nadu', 'Chennai', 'www.iitm.ac.in', 1959],
    ['Indian Institute of Technology Delhi', 'IIT Delhi', 'IIT', 'Delhi', 'New Delhi', 'www.iitd.ac.in', 1961],
    ['Indian Institute of Technology Bombay', 'IIT Bombay', 'IIT', 'Maharashtra', 'Mumbai', 'www.iitb.ac.in', 1958],
    ['Indian Institute of Technology Kanpur', 'IIT Kanpur', 'IIT', 'Uttar Pradesh', 'Kanpur', 'www.iitk.ac.in', 1959],
    ['Indian Institute of Technology Roorkee', 'IIT Roorkee', 'IIT', 'Uttarakhand', 'Roorkee', 'www.iitr.ac.in', 1847],
    ['Indian Institute of Technology Kharagpur', 'IIT Kharagpur', 'IIT', 'West Bengal', 'Kharagpur', 'www.iitkgp.ac.in', 1951],
    ['Indian Institute of Technology Guwahati', 'IIT Guwahati', 'IIT', 'Assam', 'Guwahati', 'www.iitg.ac.in', 1994],
    ['Indian Institute of Technology Hyderabad', 'IIT Hyderabad', 'IIT', 'Telangana', 'Hyderabad', 'www.iith.ac.in', 2008],
    ['Indian Institute of Technology Banaras Hindu University', 'IIT BHU', 'IIT', 'Uttar Pradesh', 'Varanasi', 'www.iitbhu.ac.in', 1919],
    ['Indian Institute of Technology Indore', 'IIT Indore', 'IIT', 'Madhya Pradesh', 'Indore', 'www.iiti.ac.in', 2009],
    ['Indian Institute of Technology Ropar', 'IIT Ropar', 'IIT', 'Punjab', 'Rupnagar', 'www.iitrpr.ac.in', 2008],
    ['Indian Institute of Technology Patna', 'IIT Patna', 'IIT', 'Bihar', 'Patna', 'www.iitp.ac.in', 2008],
    ['Indian Institute of Technology Gandhinagar', 'IIT Gandhinagar', 'IIT', 'Gujarat', 'Gandhinagar', 'www.iitgn.ac.in', 2008],
    ['Indian Institute of Technology Jodhpur', 'IIT Jodhpur', 'IIT', 'Rajasthan', 'Jodhpur', 'www.iitj.ac.in', 2008],
    ['Indian Institute of Technology Bhubaneswar', 'IIT Bhubaneswar', 'IIT', 'Odisha', 'Bhubaneswar', 'www.iitbbs.ac.in', 2008],
    ['Indian Institute of Technology Mandi', 'IIT Mandi', 'IIT', 'Himachal Pradesh', 'Mandi', 'www.iitmandi.ac.in', 2009],
    ['Indian Institute of Technology Palakkad', 'IIT Palakkad', 'IIT', 'Kerala', 'Palakkad', 'www.iitpkd.ac.in', 2015],
    ['Indian Institute of Technology Tirupati', 'IIT Tirupati', 'IIT', 'Andhra Pradesh', 'Tirupati', 'www.iittp.ac.in', 2015],
    ['Indian Institute of Technology (ISM) Dhanbad', 'IIT Dhanbad', 'IIT', 'Jharkhand', 'Dhanbad', 'www.iitism.ac.in', 1926],
    ['Indian Institute of Technology Bhilai', 'IIT Bhilai', 'IIT', 'Chhattisgarh', 'Bhilai', 'www.iitbhilai.ac.in', 2016],
    ['Indian Institute of Technology Goa', 'IIT Goa', 'IIT', 'Goa', 'Ponda', 'www.iitgoa.ac.in', 2016],
    ['Indian Institute of Technology Jammu', 'IIT Jammu', 'IIT', 'Jammu & Kashmir', 'Jammu', 'www.iitjammu.ac.in', 2016],
    ['Indian Institute of Technology Dharwad', 'IIT Dharwad', 'IIT', 'Karnataka', 'Dharwad', 'www.iitdh.ac.in', 2016],
    ['National Institute of Technology Tiruchirappalli', 'NIT Trichy', 'NIT', 'Tamil Nadu', 'Tiruchirappalli', 'www.nitt.edu', 1964],
    ['National Institute of Technology Karnataka Surathkal', 'NIT Surathkal', 'NIT', 'Karnataka', 'Mangalore', 'www.nitk.ac.in', 1960],
    ['National Institute of Technology Rourkela', 'NIT Rourkela', 'NIT', 'Odisha', 'Rourkela', 'www.nitrkl.ac.in', 1961],
    ['National Institute of Technology Warangal', 'NIT Warangal', 'NIT', 'Telangana', 'Warangal', 'www.nitw.ac.in', 1959],
    ['National Institute of Technology Calicut', 'NIT Calicut', 'NIT', 'Kerala', 'Kozhikode', 'www.nitc.ac.in', 1961],
    ['Motilal Nehru National Institute of Technology Allahabad', 'NIT Allahabad', 'NIT', 'Uttar Pradesh', 'Prayagraj', 'www.mnnit.ac.in', 1961],
    ['Malaviya National Institute of Technology Jaipur', 'NIT Jaipur', 'NIT', 'Rajasthan', 'Jaipur', 'www.mnit.ac.in', 1963],
    ['Visvesvaraya National Institute of Technology Nagpur', 'NIT Nagpur', 'NIT', 'Maharashtra', 'Nagpur', 'www.vnit.ac.in', 1960],
    ['National Institute of Technology Durgapur', 'NIT Durgapur', 'NIT', 'West Bengal', 'Durgapur', 'www.nitdgp.ac.in', 1960],
    ['National Institute of Technology Kurukshetra', 'NIT Kurukshetra', 'NIT', 'Haryana', 'Kurukshetra', 'www.nitkkr.ac.in', 1963],
    ['International Institute of Information Technology Hyderabad', 'IIIT Hyderabad', 'IIIT', 'Telangana', 'Hyderabad', 'www.iiit.ac.in', 1998],
    ['Indraprastha Institute of Information Technology Delhi', 'IIIT Delhi', 'IIIT', 'Delhi', 'New Delhi', 'www.iiitd.ac.in', 2008],
    ['Indian Institute of Information Technology Allahabad', 'IIIT Allahabad', 'IIIT', 'Uttar Pradesh', 'Prayagraj', 'www.iiita.ac.in', 1999],
    ['International Institute of Information Technology Bangalore', 'IIIT Bangalore', 'IIIT', 'Karnataka', 'Bengaluru', 'www.iiitb.ac.in', 1999],
    ['Atal Bihari Vajpayee Indian Institute of Information Technology and Management', 'IIIT Gwalior', 'IIIT', 'Madhya Pradesh', 'Gwalior', 'www.iiitm.ac.in', 1997],
    ['All India Institute of Medical Sciences New Delhi', 'AIIMS Delhi', 'Medical', 'Delhi', 'New Delhi', 'www.aiims.edu', 1956],
    ['Jawaharlal Institute of Postgraduate Medical Education and Research', 'JIPMER', 'Medical', 'Puducherry', 'Puducherry', 'www.jipmer.edu.in', 1823],
    ['Christian Medical College Vellore', 'CMC Vellore', 'Medical', 'Tamil Nadu', 'Vellore', 'www.cmch-vellore.edu', 1900],
    ['All India Institute of Medical Sciences Bhopal', 'AIIMS Bhopal', 'Medical', 'Madhya Pradesh', 'Bhopal', 'www.aiimsbhopal.edu.in', 2012],
    ['King George Medical University', 'KGMU Lucknow', 'Medical', 'Uttar Pradesh', 'Lucknow', 'www.kgmu.org', 1911],
    ['Maulana Azad Medical College', 'MAMC', 'Medical', 'Delhi', 'New Delhi', 'www.mamc.ac.in', 1959],
    ['Grant Medical College', 'GMC Mumbai', 'Medical', 'Maharashtra', 'Mumbai', 'www.gmcjjh.org', 1845],
    ['Madras Medical College', 'MMC', 'Medical', 'Tamil Nadu', 'Chennai', 'www.mmc.ac.in', 1835],
    ['B. J. Medical College', 'BJMC Ahmedabad', 'Medical', 'Gujarat', 'Ahmedabad', 'www.bjmcabd.edu.in', 1871],
    ['Seth GS Medical College', 'GSMC Mumbai', 'Medical', 'Maharashtra', 'Mumbai', 'www.kem.edu', 1926],
];
/**
 * States for institutes that neither KNOWN_INSTITUTES nor NIRF locate, where
 * the state is stated in the institute's own name. /predict needs these to
 * decide home-state (HS) quota eligibility. Keyed by the JoSAA name.
 */
export const STATE_OVERRIDES: Record<string, string> = {
  'Assam University, Silchar': 'Assam',
  'Birla Institute of Technology, Deoghar Off-Campus': 'Jharkhand',
  'Birla Institute of Technology, Mesra, Ranchi': 'Jharkhand',
  'Birla Institute of Technology, Patna Off-Campus': 'Bihar',
  'Ghani Khan Choudhary Institute of Engineering and Technology, Malda, West Bengal': 'West Bengal',
  'Institute of Chemical Technology, Mumbai: Indian Oil Odisha Campus, Bhubaneswar': 'Odisha',
  'Islamic University of Science and Technology Kashmir': 'Jammu and Kashmir',
  'Puducherry Technological University, Puducherry': 'Puducherry',
  'Punjab Engineering College, Chandigarh': 'Chandigarh',
  'National Institute of Technology Arunachal Pradesh': 'Arunachal Pradesh',
  'National Institute of Technology Nagaland': 'Nagaland',
  'National Institute of Technology Sikkim': 'Sikkim',
  'National Institute of Technology, Andhra Pradesh': 'Andhra Pradesh',
  'National Institute of Technology, Mizoram': 'Mizoram',
  'National Institute of Technology, Uttarakhand': 'Uttarakhand',
};

/**
 * MCC identities of the medical colleges in KNOWN_INSTITUTES, so their curated
 * metadata and MCC's cutoffs land on one record. Matched on PIN code plus a
 * name pattern against MCC's institute text.
 */
export const KNOWN_MEDICAL_MCC: Record<string, { pin: string; name: RegExp }> = {
  'All India Institute of Medical Sciences New Delhi': { pin: '110029', name: /^AIIMS, New Delhi/i },
  'Jawaharlal Institute of Postgraduate Medical Education and Research': { pin: '605006', name: /^JIPMER PUDUCHERRY/i },
  'All India Institute of Medical Sciences Bhopal': { pin: '462020', name: /^AIIMS-Bhopal/i },
  'King George Medical University': { pin: '226003', name: /^(KGMC, LUCKNOW|FACULTY OF DEN SCI, KG MED UNIV)/i },
  'Maulana Azad Medical College': { pin: '110002', name: /^Maulana Azad Medical College/i },
  'Grant Medical College': { pin: '400008', name: /^GRANT MEDICAL COLL/i },
  'Madras Medical College': { pin: '600003', name: /^MADRAS MEDICAL COLLEGE/i },
  'B. J. Medical College': { pin: '380016', name: /^B\.J\. MEDICAL COLLEGE, AHMEDABAD/i },
  'Seth GS Medical College': { pin: '400012', name: /^SETH G\.S\. MEDICAL COLLEGE/i },
  // Christian Medical College Vellore is a minority institution outside MCC's
  // all-India quota, so it has no MCC entry.
};
