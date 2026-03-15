const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const requireAuth = require('../middleware/auth');
const Resume = require('../models/Resume');
const { MAX_UPLOAD_SIZE_BYTES, ALLOWED_RESUME_MIMETYPES } = require('../config/constants');

const router = express.Router();

// Make sure the uploads folder exists on startup — got burned once in prod when
// someone deleted it manually and every upload 500'd until we spotted the missing directory
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fsSync.existsSync(uploadDir)) {
    console.log('[resume.js] uploads/ directory missing — creating it now');
    fsSync.mkdirSync(uploadDir, { recursive: true });
}

// Multer disk storage — unique filename to avoid collisions when 2 users
// upload a file named "resume.pdf" at roughly the same time
const resumeStorageEngine = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        // Timestamp + random chunk. Not using UUID because that's another dep
        // and for file naming this is more than enough entropy
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
    },
});

const resumeFileFilter = (req, file, cb) => {
    if (ALLOWED_RESUME_MIMETYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        // Multer swallows this error silently if you don't pass it back as the first arg
        cb(new Error(`File type not allowed: ${file.mimetype}. Only PDF, DOC, DOCX, and TXT are accepted.`), false);
    }
};

const resumeUploader = multer({
    storage: resumeStorageEngine,
    fileFilter: resumeFileFilter,
    limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
});

// ─────────────────────────────────────────────────────────────
// TEXT EXTRACTION
// Handles PDF, DOCX, DOC, and TXT formats.
// Using require() inside the function (not at the top) so that if pdf-parse
// or mammoth isn't installed, the whole server doesn't crash on startup —
// it only fails when someone actually tries to upload that file type.
// ─────────────────────────────────────────────────────────────
async function extractTextFromResumeFile(filePath, mimeType) {
    const fileExt = path.extname(filePath).toLowerCase();

    console.log('extracting text from file ->', fileExt, mimeType);

    if (mimeType === 'application/pdf' || fileExt === '.pdf') {
        try {
            const pdfParse = require('pdf-parse');
            const rawPdfBuffer = fsSync.readFileSync(filePath);
            const parsedPdfData = await pdfParse(rawPdfBuffer);
            const extractedPdfText = (parsedPdfData.text || '').trim();

            console.log('pdf text length:', extractedPdfText.length);
            console.log('first 100 chars:', extractedPdfText.substring(0, 100));

            // Scanned / image-based PDFs return basically nothing — had a user
            // submit a scanned passport as their "resume" and we scored it 0 silently.
            // Now we fail fast with a clear message.
            if (extractedPdfText.length < 50) {
                throw new Error(
                    'Could not extract text from this PDF — it may be a scanned image. ' +
                    'Please upload a text-based PDF (export directly from Word/Google Docs).'
                );
            }

            return extractedPdfText;

        } catch (pdfParseErr) {
            console.error('[resume/pdf] pdf-parse failed:', pdfParseErr.message);
            throw pdfParseErr; // bubble up to the route handler
        }
    }

    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileExt === '.docx'
    ) {
        const mammoth = require('mammoth');
        const docxResult = await mammoth.extractRawText({ path: filePath });
        return docxResult.value || '';
    }

    if (mimeType === 'application/msword' || fileExt === '.doc') {
        // mammoth handles .doc files on a best-effort basis — it works most of the time
        // but older .doc formats from Office 97-2003 can come back empty.
        // We tried wordextract and word-extractor but both had worse cross-platform issues.
        try {
            const mammoth = require('mammoth');
            const docResult = await mammoth.extractRawText({ path: filePath });
            return docResult.value || '';
        } catch (docParseErr) {
            console.warn('[resume/doc] mammoth failed on .doc file, returning empty string:', docParseErr.message);
            return ''; // graceful fallback — better empty than crashing
        }
    }

    // Plain text — just read the file directly
    const rawTxtContent = await fs.readFile(filePath, 'utf8');
    return rawTxtContent;
}

// ─────────────────────────────────────────────────────────────
// ATS RESUME SCORING ENGINE
// ─────────────────────────────────────────────────────────────

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Master skill list — I keep adding to this whenever users complain a skill
// wasn't detected. The list is intentionally broad.
const ATS_TECH_SKILLS = [
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'rust',
    'kotlin', 'swift', 'php', 'scala', 'perl', 'r', 'matlab',
    'react', 'next.js', 'vue', 'angular', 'svelte', 'gatsby',
    'node', 'express', 'django', 'flask', 'fastapi', 'spring', 'laravel', 'rails',
    'mongodb', 'mysql', 'postgresql', 'sqlite', 'redis', 'firebase',
    'sql', 'nosql', 'graphql', 'rest api', 'grpc',
    'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'github actions',
    'aws', 'azure', 'gcp', 'heroku', 'vercel',
    'linux', 'bash', 'git', 'ci/cd', 'devops',
    'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'scikit-learn',
    'data science', 'pandas', 'numpy', 'matplotlib', 'tableau', 'power bi',
    'html', 'css', 'sass', 'tailwind', 'bootstrap', 'material ui',
    'figma', 'adobe xd', 'sketch',
    'blockchain', 'solidity', 'web3',
];

// Section heading detection — resume layout varies wildly, these capture most common formats
const SECTION_PATTERNS = {
    contact: /\b(contact|email|phone|mobile|address|linkedin|github|portfolio)\b/i,
    education: /\b(education|qualification|academics?|schooling|university|college|institute)\b/i,
    skills: /\b(skills?|technologies|technical|competencies|expertise|proficiencies)\b/i,
    experience: /\b(experience|employment|work history|professional|internship|career)\b/i,
    projects: /\b(projects?|portfolio|personal project|side project|open.?source)\b/i,
    summary: /\b(summary|objective|profile|about me|overview)\b/i,
};

const DEGREE_PATTERN = /\b(b\.?tech|b\.?e\.?|bca|mca|m\.?tech|bachelor|master|mba|ph\.?d|diploma|b\.?sc|m\.?sc|b\.?com|m\.?com|b\.?a\.?|m\.?a\.?)\b/i;

const ACTION_VERBS_PATTERN = /\b(developed|built|implemented|designed|optimized|led|created|delivered|improved|launched|architected|engineered|deployed|automated|integrated|managed|mentored|reduced|increased|streamlined)\b/gi;

const QUANTIFIED_IMPACT_PATTERN = /(\d+[\s]*%|\d+x|increased|decreased|reduced|improved|grew|saved|generated|led\s+\d+|team\s+of\s+\d+|revenue|growth|\$\d+)/gi;

// Buzzwords that look impressive but say nothing — penalise overuse
const EMPTY_BUZZWORDS = [
    'synergy', 'innovative', 'passionate', 'hardworking', 'team player',
    'go-getter', 'self-starter', 'thought leader', 'results-oriented', 'best practices',
    'dynamic', 'leverage', 'paradigm', 'proactive',
];

async function scoreResumeWithATS(resumePlainText, jobDescriptionText = '') {
    const textLower = resumePlainText.toLowerCase();
    const wordTokens = resumePlainText.split(/\s+/).filter(Boolean);
    const totalWordCount = wordTokens.length;

    console.log('[ATS] Resume word count:', totalWordCount);

    const detectedStrengths = [];
    const detectedWeaknesses = [];
    const improvementSuggestions = [];
    let rawScore = 0;
    let penaltyPoints = 0;

    // ── 1. CONTACT INFORMATION (max 10 pts) ──────────────────────────────────
    let contactSectionScore = 0;
    const hasEmailAddress = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(textLower);
    const hasPhoneNumber = /(\+?\d[\d\s\-().]{7,}\d)/.test(textLower);
    const hasLinkedIn = /linkedin/i.test(textLower);
    const hasGitHub = /github/i.test(textLower);

    if (hasEmailAddress) { contactSectionScore += 4; detectedStrengths.push('Email address detected'); }
    else { detectedWeaknesses.push('No email address found'); improvementSuggestions.push('Add your professional email at the top of the resume.'); }

    if (hasPhoneNumber) { contactSectionScore += 3; detectedStrengths.push('Phone number detected'); }
    else { detectedWeaknesses.push('No phone number found'); improvementSuggestions.push('Add a reachable phone number.'); }

    if (hasLinkedIn || hasGitHub) { contactSectionScore += 3; detectedStrengths.push('LinkedIn/GitHub profile detected'); }
    else { improvementSuggestions.push('Add your LinkedIn profile URL and/or GitHub handle.'); }

    console.log('[ATS] Contact section score:', contactSectionScore);
    rawScore += contactSectionScore;

    // ── 2. EDUCATION (max 15 pts) ─────────────────────────────────────────────
    let educationSectionScore = 0;
    const hasEducationSection = SECTION_PATTERNS.education.test(textLower);
    const hasDegreeKeyword = DEGREE_PATTERN.test(textLower);
    const hasInstitutionName = /\b(university|college|institute|iit|nit|bits|vit|manipal|amity)\b/i.test(textLower);
    const hasGraduationYear = /\b(20\d{2}|19\d{2})\b/.test(textLower);

    if (hasEducationSection) { educationSectionScore += 5; detectedStrengths.push('Education section present'); }
    else { detectedWeaknesses.push('Education section missing'); improvementSuggestions.push('Add an Education section with your degree and institution.'); }

    if (hasDegreeKeyword) { educationSectionScore += 5; detectedStrengths.push('Degree qualification detected'); }
    else { improvementSuggestions.push('Mention your degree explicitly (e.g. B.Tech, BCA, MBA).'); }

    if (hasInstitutionName || hasGraduationYear) { educationSectionScore += 5; }

    console.log('[ATS] Education section score:', educationSectionScore);
    rawScore += educationSectionScore;

    // ── 3. TECHNICAL SKILLS (2 pts per skill, max 20) ────────────────────────
    const discoveredSkills = [...new Set(ATS_TECH_SKILLS.filter(skillName => textLower.includes(skillName)))];
    const techSkillScore = Math.min(20, discoveredSkills.length * 2);
    rawScore += techSkillScore;

    console.log('[ATS] Skills detected:', discoveredSkills.join(', '));

    if (discoveredSkills.length >= 8) {
        detectedStrengths.push(`Strong skill set: ${discoveredSkills.slice(0, 7).join(', ')} +${Math.max(0, discoveredSkills.length - 7)} more`);
    } else if (discoveredSkills.length >= 4) {
        detectedStrengths.push(`Skills found: ${discoveredSkills.join(', ')}`);
        improvementSuggestions.push('Aim for 8–12 listed technical skills for better ATS visibility.');
    } else if (discoveredSkills.length > 0) {
        detectedWeaknesses.push(`Only ${discoveredSkills.length} technical skill(s) detected.`);
        improvementSuggestions.push('Add a dedicated Skills section listing all your technologies and tools.');
    } else {
        detectedWeaknesses.push('No recognizable technical skills found in the resume text.');
        improvementSuggestions.push('Add a Skills section — list every language, framework, and tool you know.');
    }

    // Keyword stuffing check — someone once listed "python" 12 times
    const keywordRepeatCounts = {};
    ATS_TECH_SKILLS.forEach(skillName => {
        try {
            const skillRegex = new RegExp(`\\b${escapeRegex(skillName)}\\b`, 'gi');
            const matchCount = (textLower.match(skillRegex) || []).length;
            if (matchCount > 4) keywordRepeatCounts[skillName] = matchCount;
        } catch (_) { /* skip regex compile errors — shouldn't happen with escapeRegex */ }
    });
    if (Object.keys(keywordRepeatCounts).length > 0) {
        penaltyPoints += 10;
        detectedWeaknesses.push(`Keyword stuffing detected (${Object.keys(keywordRepeatCounts).join(', ')} repeated too many times).`);
        improvementSuggestions.push('List each skill once — repeating keywords looks spammy to ATS scanners.');
    }

    // ── 4. PROJECTS (max 15 pts) ──────────────────────────────────────────────
    let projectSectionScore = 0;
    const hasProjectsSection = SECTION_PATTERNS.projects.test(textLower);
    const hasTechContextClues = discoveredSkills.length >= 2;
    const detectedActionVerbs = (resumePlainText.match(ACTION_VERBS_PATTERN) || []);
    const uniqueActionVerbs = [...new Set(detectedActionVerbs.map(v => v.toLowerCase()))];

    if (hasProjectsSection) { projectSectionScore += 5; detectedStrengths.push('Projects section found'); }
    else { detectedWeaknesses.push('No Projects section detected'); improvementSuggestions.push('Add 2–3 projects — academic, freelance, or personal all count.'); }

    if (hasTechContextClues) { projectSectionScore += 5; }

    if (uniqueActionVerbs.length >= 3) {
        projectSectionScore += 5;
        detectedStrengths.push(`Strong action vocabulary: ${uniqueActionVerbs.slice(0, 4).join(', ')}`);
    } else {
        improvementSuggestions.push('Use more action verbs: developed, implemented, optimized, architected, led...');
    }

    console.log('[ATS] Projects section score:', projectSectionScore);
    rawScore += projectSectionScore;

    // ── 5. WORK EXPERIENCE (max 20 pts) ──────────────────────────────────────
    let experienceSectionScore = 0;
    const hasExperienceSection = SECTION_PATTERNS.experience.test(textLower);
    const hasCompanyIndicator = /\b(pvt\.?\s*ltd\.?|llc|inc\.?|corp\.?|foundation|technologies|solutions|systems|services|consulting)\b/i.test(textLower);
    const hasRoleTitle = /\b(engineer|developer|analyst|designer|manager|intern|architect|consultant|lead|scientist|specialist)\b/i.test(textLower);
    const quantifiedImpactHits = (resumePlainText.match(QUANTIFIED_IMPACT_PATTERN) || []).length;

    if (hasExperienceSection) { experienceSectionScore += 5; detectedStrengths.push('Work experience / internship section found'); }
    else { detectedWeaknesses.push('No work experience section detected'); improvementSuggestions.push('Add internships, part-time roles, or freelance work.'); }

    if (hasCompanyIndicator) { experienceSectionScore += 5; detectedStrengths.push('Company name/type detected'); }
    if (hasRoleTitle) { experienceSectionScore += 5; detectedStrengths.push('Job role/title detected'); }

    if (quantifiedImpactHits >= 2) {
        experienceSectionScore += 5;
        detectedStrengths.push(`Quantified impact found (${quantifiedImpactHits} metrics detected)`);
    } else {
        improvementSuggestions.push('Add numbers: "Reduced load time by 40%", "Led team of 5", "Increased conversion by 20%".');
    }

    console.log('[ATS] Experience section score:', experienceSectionScore);
    rawScore += experienceSectionScore;

    // ── 6. CONTENT QUALITY / LENGTH (max 10 pts) ─────────────────────────────
    let contentQualityScore = 0;
    if (totalWordCount > 450) {
        contentQualityScore = 10;
        detectedStrengths.push(`Excellent resume length (${totalWordCount} words)`);
    } else if (totalWordCount > 250) {
        contentQualityScore = 5;
        detectedStrengths.push(`Adequate length (${totalWordCount} words)`);
        improvementSuggestions.push('Expand to 450+ words for a more detailed, ATS-friendly resume.');
    } else {
        detectedWeaknesses.push(`Resume too short (${totalWordCount} words).`);
        improvementSuggestions.push('A strong resume needs at least 300–500 words of substantive content.');
    }
    rawScore += contentQualityScore;

    // ── 7. STRUCTURE & FORMATTING (max 10 pts) ───────────────────────────────
    let structureScore = 0;
    const presentSections = Object.entries(SECTION_PATTERNS)
        .filter(([, sectionRegex]) => sectionRegex.test(textLower))
        .map(([sectionName]) => sectionName);
    const hasBulletPoints = /[•\-\*]\s+\w/.test(resumePlainText);

    if (presentSections.length >= 3) {
        structureScore += 5;
        detectedStrengths.push(`${presentSections.length} clear sections detected: ${presentSections.join(', ')}`);
    } else {
        detectedWeaknesses.push('Resume lacks clear section headings.');
        improvementSuggestions.push('Use clear section headers: Education, Skills, Experience, Projects.');
    }

    if (hasBulletPoints) {
        structureScore += 5;
        detectedStrengths.push('Bullet-point formatting detected');
    } else {
        improvementSuggestions.push('Use bullet points under each section — ATS scanners and recruiters prefer them.');
    }

    console.log('[ATS] Structure score:', structureScore, '| Sections found:', presentSections);
    rawScore += structureScore;

    // ── 8. ATS KEYWORD MATCH vs JD (bonus, max 10 pts) ────────────────────────
    let atsKeywordMatchPercent = null;
    if (jobDescriptionText && jobDescriptionText.trim().length > 30) {
        const jdUniqueWords = [...new Set(jobDescriptionText.match(/\b[a-z]{3,}\b/gi) || [])];
        const resumeWordSet = new Set(textLower.match(/\b[a-z]{3,}\b/gi) || []);
        const jdWordsFoundInResume = jdUniqueWords.filter(w => resumeWordSet.has(w.toLowerCase()));
        atsKeywordMatchPercent = Math.round((jdWordsFoundInResume.length / Math.max(1, jdUniqueWords.length)) * 100);

        if (atsKeywordMatchPercent >= 70) {
            rawScore += 10; detectedStrengths.push(`Excellent ATS keyword match with job description: ${atsKeywordMatchPercent}%`);
        } else if (atsKeywordMatchPercent >= 50) {
            rawScore += 7; detectedStrengths.push(`Good ATS keyword match: ${atsKeywordMatchPercent}%`);
        } else if (atsKeywordMatchPercent >= 30) {
            rawScore += 4; detectedWeaknesses.push(`Low ATS keyword match: ${atsKeywordMatchPercent}%`);
            improvementSuggestions.push('Mirror keywords from the job description more closely.');
        } else {
            detectedWeaknesses.push(`Very low ATS keyword match: ${atsKeywordMatchPercent}%`);
            improvementSuggestions.push('Rewrite your resume to align with the specific job posting language.');
        }
    }

    // ── 9. QUALITY PENALTIES ──────────────────────────────────────────────────
    const allCapsBlocks = (resumePlainText.match(/[A-Z]{8,}/g) || []).length;
    if (allCapsBlocks > 3) {
        penaltyPoints += 3;
        detectedWeaknesses.push('Excessive ALL-CAPS text — avoid large capital blocks in resume body.');
    }

    const overusedBuzzwords = EMPTY_BUZZWORDS.filter(bw => textLower.includes(bw));
    if (overusedBuzzwords.length >= 3) {
        penaltyPoints += 5;
        detectedWeaknesses.push(`Overuse of vague buzzwords: ${overusedBuzzwords.slice(0, 4).join(', ')}.`);
        improvementSuggestions.push('Replace buzzwords with concrete, quantified achievements.');
    }

    // Crude repetition check — same content-word appearing 15+ times
    const wordFrequencyMap = {};
    wordTokens.forEach(w => {
        const cleanWord = w.toLowerCase().replace(/[^a-z]/g, '');
        if (cleanWord.length > 4) wordFrequencyMap[cleanWord] = (wordFrequencyMap[cleanWord] || 0) + 1;
    });
    const overusedWords = Object.entries(wordFrequencyMap)
        .filter(([word, count]) => count > 15 && !['experience', 'skills', 'project', 'development'].includes(word));
    if (overusedWords.length > 0) {
        penaltyPoints += 5;
        detectedWeaknesses.push('Several content words appear excessively — vary your language.');
    }

    // ── FINAL SCORE CALCULATION ───────────────────────────────────────────────
    const adjustedRawScore = Math.max(0, rawScore - penaltyPoints);
    // Mapping raw scores to a realistic human range: weak resumes get 20-40, strong get 80-95.
    // Intentionally not allowing 100 — no resume is perfect.
    const finalAtsScore = Math.min(95, Math.max(20, Math.round(adjustedRawScore * 0.87 + 8)));

    const resumeCategory =
        finalAtsScore >= 80 ? 'Strong' :
            finalAtsScore >= 55 ? 'Moderate' :
                finalAtsScore >= 35 ? 'Weak' : 'Very Weak';

    console.log(`[ATS] Raw: ${rawScore} | Penalty: ${penaltyPoints} | Adjusted: ${adjustedRawScore} | Final: ${finalAtsScore} | Category: ${resumeCategory}`);

    if (improvementSuggestions.length === 0) {
        improvementSuggestions.push('Outstanding resume! Tailor it per job description with role-specific keywords for maximum ATS visibility.');
    }

    return {
        score: finalAtsScore,
        category: resumeCategory,
        detectedSkills: discoveredSkills.slice(0, 15),
        wordCount: totalWordCount,
        strengths: detectedStrengths,
        weaknesses: detectedWeaknesses,
        suggestions: improvementSuggestions,
        atsMatchPercentage: atsKeywordMatchPercent,
        _debug: { rawScore, penaltyPoints, adjustedRawScore, sectionsFound: presentSections },
    };
}

// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────

// POST /api/resume/upload
router.post('/upload', requireAuth, (req, res) => {
    // Using the callback form of upload.single() instead of middleware
    // so Multer errors (file too large, wrong type) can be caught and returned as JSON
    // rather than Express's default HTML error page
    resumeUploader.single('resume')(req, res, async (multerErr) => {

        if (multerErr instanceof multer.MulterError) {
            // e.g. LIMIT_FILE_SIZE
            return res.status(400).json({
                success: false,
                message: `File upload error: ${multerErr.message}. Max size is 5MB.`,
            });
        }
        if (multerErr) {
            // Custom fileFilter rejection
            return res.status(400).json({ success: false, message: multerErr.message });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file received — make sure the form field is named "resume".' });
        }

        console.log('file uploaded ->', req.file.originalname, req.file.size, 'bytes');

        try {
            // Step 1 — extract plain text from the uploaded file
            const extractedPlainText = await extractTextFromResumeFile(req.file.path, req.file.mimetype);

            // Step 2 — run the ATS scoring engine
            const atsReport = await scoreResumeWithATS(extractedPlainText || '');

            // Step 3 — save to DB. Using a nested try-catch here so a DB failure
            // doesn't block the user from seeing their results — we already did the hard work.
            try {
                await Resume.create({
                    userId: req.user.id,
                    filename: req.file.filename,
                    originalName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    fileSize: req.file.size,
                    atsScore: atsReport.score,
                    fullAnalysisData: atsReport,
                });
            } catch (dbSaveErr) {
                // db save failed but we still have the analysis result so its ok
                console.error('db save failed (non-critical):', dbSaveErr.message);
            }

            // Step 4 — return analysis to the frontend
            return res.status(200).json({
                success: true,
                message: `Resume "${req.file.originalname}" analyzed successfully`,
                fileName: req.file.originalname,
                analysis: atsReport,
            });

        } catch (extractionOrAnalysisErr) {
            console.error('[resume/upload] Text extraction or ATS scoring failed:', extractionOrAnalysisErr.message);
            return res.status(500).json({
                success: false,
                message: `Resume analysis failed: ${extractionOrAnalysisErr.message}`,
                analysis: null,
            });
        }
    });
});

// GET /api/resume/history
router.get('/history', requireAuth, async (req, res) => {
    try {
        const recentUploads = await Resume.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('-__v'); // __v is mongoose's internal version key, no need to send it

        return res.json({ success: true, resumes: recentUploads });

    } catch (historyFetchErr) {
        console.error('[resume/history] Failed to fetch history for user:', req.user?.id, '—', historyFetchErr.message);
        return res.status(500).json({
            success: false,
            message: 'Could not load scan history. Please try again.',
        });
    }
});

module.exports = router;
