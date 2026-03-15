'use strict';

/**
 * AdvancedATSResumeScorer.js
 * Job Shield — Hyper-Context ATS Engine v2
 *
 * Architecture:
 *  1. Skill Proximity Scoring — keyword only scores if within N tokens of
 *     an action verb OR a quantifiable metric.
 *  2. "So What" Impact Analysis — rewards specific numbers/metrics, penalises absence.
 *  3. Sectional Relevance — Experience/Projects sections weighted higher than Hobbies.
 *  4. Stuffing / Format Bypass Detection — keyword frequency without context = flag.
 *  5. Actionable Feedback Generator — produces 3 specific, personalised improvement tips.
 */

// ══════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════
const PROXIMITY_WINDOW     = 5;    // tokens left/right of keyword to check for context
const STUFFING_THRESHOLD   = 10;   // hits above this with low context ratio = stuffing
const STUFFING_CONTEXT_MIN = 0.25; // contextual hits / total hits must be ≥ this to pass
const STUFFING_PENALTY     = 0.25; // stuffed keyword's raw score multiplied by this

// ══════════════════════════════════════════════════════════════════
// ACTION VERB LEXICON  (past tense preferred — resume convention)
// ══════════════════════════════════════════════════════════════════
const ACTION_VERBS = new Set([
    // Engineering / Development
    'architected','engineered','developed','built','designed','created','implemented',
    'deployed','shipped','launched','released','prototyped','authored',
    // Optimisation
    'optimised','optimized','refactored','modernised','modernized','improved',
    'enhanced','overhauled','streamlined','automated','accelerated','reduced',
    'increased','eliminated','migrated','upgraded','scaled','integrated',
    // Data / Analysis
    'analysed','analyzed','modelled','modeled','predicted','evaluated','benchmarked',
    'visualised','visualized','trained','fine-tuned','researched',
    // Leadership / Collaboration
    'led','managed','coordinated','mentored','collaborated','established','drove',
    'directed','championed','presented','published','owned',
    // Security / Infra
    'secured','hardened','monitored','configured','administered','provisioned',
    'audited','remediiated','patched','replaced','containerised','containerized',
]);

// ══════════════════════════════════════════════════════════════════
// METRIC PATTERN  — quantifiable achievements
// ══════════════════════════════════════════════════════════════════
const METRIC_RE = /(\d+\.?\d*\s*(%|x\b|times?\b|ms\b|seconds?\b|minutes?\b|hours?\b|users?\b|customers?\b|requests?\b|rpm\b|rps\b|gb\b|tb\b|mb\b|k\b|m\b|million\b|billion\b|faster\b|reduction\b|improvement\b|latency\b|throughput\b|\$[\d.,]+))/i;

// ══════════════════════════════════════════════════════════════════
// SECTION WEIGHTS  — where in the resume the keyword appears
// ══════════════════════════════════════════════════════════════════
const SECTIONS = [
    { name: 'Experience',       multiplier: 1.5, re: /^(work\s+)?experience|employment\s+history|professional\s+background|career\s+history/im },
    { name: 'Projects',         multiplier: 1.4, re: /^(key\s+|notable\s+|personal\s+|selected\s+)?projects?(\s*&\s*achievements?)?/im },
    { name: 'Skills',           multiplier: 1.0, re: /^(technical\s+)?skills?(\s*&\s*competencies)?|core\s+competencies|technology\s+stack/im },
    { name: 'Certifications',   multiplier: 0.8, re: /^certifications?|licenses?\s*&\s*certs?|professional\s+certifications?/im },
    { name: 'Education',        multiplier: 0.6, re: /^education|academic\s+background|qualifications?|degrees?/im },
    { name: 'Summary',          multiplier: 0.6, re: /^(professional\s+)?summary|(?:career\s+)?objective|profile/im },
    { name: 'Awards',           multiplier: 0.5, re: /^awards?|honors?|achievements?|recognition/im },
    { name: 'Hobbies',          multiplier: 0.15,re: /^(hobbies|interests|activities|personal\s+interests|volunteer)/im },
];

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

/** Lowercase-tokenise text into word/number tokens. */
function tokenise(text) {
    return text.toLowerCase().replace(/[^a-z0-9#+.\s-]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Build section boundary list from text.
 * Returns [{name, multiplier, start, end}] sorted by char offset.
 */
function buildSections(text) {
    const found = [];
    for (const sec of SECTIONS) {
        const re = new RegExp(sec.re.source, 'gim');
        let m;
        while ((m = re.exec(text)) !== null) {
            found.push({ name: sec.name, multiplier: sec.multiplier, start: m.index, end: text.length });
        }
    }
    found.sort((a, b) => a.start - b.start);
    for (let i = 0; i < found.length - 1; i++) found[i].end = found[i + 1].start;
    return found.length ? found : [{ name: 'Body', multiplier: 0.8, start: 0, end: text.length }];
}

/** Return multiplier for a given char offset. */
function getMultiplier(sections, charOffset) {
    for (let i = sections.length - 1; i >= 0; i--) {
        if (charOffset >= sections[i].start) return sections[i];
    }
    return sections[0];
}

/**
 * Find all token-index positions of `keyword` in `tokens`.
 * Allows tokens that START with each kw-token (handles "react.js" matching "react").
 */
function findKeywordPositions(tokens, keyword) {
    const kwTokens = tokenise(keyword);
    if (!kwTokens.length) return [];
    const hits = [];
    for (let i = 0; i <= tokens.length - kwTokens.length; i++) {
        if (kwTokens.every((kw, j) => tokens[i + j].startsWith(kw))) hits.push(i);
    }
    return hits;
}

/**
 * Within a token window around `center`, look for action verbs and metrics.
 * Returns { hasVerb, hasMetric, verb, metric }.
 */
function analyseContext(tokens, center, rawText, charOffsets, window = PROXIMITY_WINDOW) {
    const lo    = Math.max(0, center - window);
    const hi    = Math.min(tokens.length - 1, center + window);
    const slice = tokens.slice(lo, hi + 1);

    const verb  = slice.find(t => ACTION_VERBS.has(t)) || null;

    // For metric, use a substring of the raw text around the token's char offset
    const startChar = charOffsets[lo]  ?? 0;
    const endChar   = (charOffsets[hi] ?? startChar) + 50;
    const rawSlice  = rawText.slice(startChar, endChar);
    const metricM   = METRIC_RE.exec(rawSlice);
    const metric    = metricM ? metricM[0].trim() : null;

    return { hasVerb: !!verb, hasMetric: !!metric, verb, metric };
}

/**
 * Build approximate token→char offset map in one pass.
 */
function buildCharOffsets(text, tokens) {
    const offsets = [];
    let cursor = 0;
    for (const tok of tokens) {
        const idx = text.toLowerCase().indexOf(tok, cursor);
        if (idx === -1) { offsets.push(cursor); continue; }
        offsets.push(idx);
        cursor = idx + tok.length;
    }
    return offsets;
}

// ══════════════════════════════════════════════════════════════════
// FEEDBACK GENERATOR
// ══════════════════════════════════════════════════════════════════
/**
 * Generates up to 3 highly specific, actionable improvement tips
 * based on the per-skill analysis results.
 */
function generateFeedback(verifiedSkills, missingSkills, globalMetricCount, totalTokens) {
    const tips = [];

    // Tip 1: Skills with zero metrics → most impactful fix
    const noMetricSkills = verifiedSkills.filter(s => !s.bestMetric && s.hits >= 1 && !s.stuffingFlag);
    if (noMetricSkills.length > 0) {
        const names = noMetricSkills.slice(0, 3).map(s => s.skill).join(', ');
        tips.push(
            `Add quantified impact for: ${names}. ` +
            `Instead of "Used ${noMetricSkills[0].skill}", write ` +
            `"Deployed ${noMetricSkills[0].skill} app reducing load time by 35% for 10k+ users." ` +
            `Metrics are the #1 factor ATS software prioritises.`
        );
    }

    // Tip 2: Skills in wrong sections (only in Skills list, not Experience/Projects)
    const skillsOnlySkills = verifiedSkills.filter(
        s => s.topSection === 'Skills' && s.contextualHits === 0
    );
    if (skillsOnlySkills.length > 0) {
        const name = skillsOnlySkills[0].skill;
        tips.push(
            `"${name}" appears only as a bullet in the Skills section with no contextual usage. ` +
            `Move it into a bullet point under Experience or Projects: ` +
            `"Engineered a ${name} microservice that processed 1M+ events/day." ` +
            `Listing-only mentions contribute less than 15% of the contextual score.`
        );
    }

    // Tip 3: Missing skills
    if (missingSkills.length > 0) {
        const missing = missingSkills.slice(0, 3).join(', ');
        tips.push(
            `Required skill(s) not found: ${missing}. ` +
            `If you have experience with ${missingSkills[0]}, add a bullet under Projects: ` +
            `"Built a ${missingSkills[0]} integration that ..." — ` +
            `even a side-project entry raises the ATS match significantly.`
        );
    }

    // Tip 4: Stuffed keywords
    const stuffed = verifiedSkills.filter(s => s.stuffingFlag);
    if (stuffed.length > 0 && tips.length < 3) {
        const name = stuffed[0].skill;
        tips.push(
            `"${name}" appears ${stuffed[0].hits} times but ${Math.round((1 - stuffed[0].contextRatio / 100) * stuffed[0].hits)} of those are context-free repetitions, ` +
            `triggering the stuffing penalty (score reduced by 75%). ` +
            `Remove the dump and replace with 2-3 precise impact-driven bullet points.`
        );
    }

    // Tip 5 (fallback): Low overall metric density
    if (tips.length < 3) {
        const metricDensity = totalTokens > 0 ? globalMetricCount / totalTokens : 0;
        if (metricDensity < 0.01) {
            tips.push(
                `Your resume has very few numeric achievements (density: ${(metricDensity * 100).toFixed(2)}%). ` +
                `Top-tier resumes targeting ${Math.round(metricDensity * 100)}% ATS match have ≥1 metric per role bullet point. ` +
                `Add percentages, user counts, performance improvements, or revenue figures to every bullet.`
            );
        }
    }

    return tips.slice(0, 3);
}

// ══════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════
/**
 * AdvancedATSResumeScorer(resumeText, targetRole)
 *
 * @param {string}   resumeText      Full plain-text resume content
 * @param {string|string[]} targetRole  Job title string OR array of required skills
 * @returns {{ atsScore, verifiedSkills, missingSkills, stuffingWarning,
 *             actionableFeedback, flaggedManipulations, meta }}
 */
function AdvancedATSResumeScorer(resumeText = '', targetRole = []) {
    // ── Defensive coercion ────────────────────────────────────────
    const text   = typeof resumeText === 'string' ? resumeText : String(resumeText ?? '');
    // targetRole can be a skill array or a job-title string (we tokenise the title into keywords)
    let skills;
    if (Array.isArray(targetRole)) {
        skills = targetRole.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim());
    } else {
        // parse comma/slash/newline-separated skills from a string
        skills = String(targetRole).split(/[,/\n|]+/).map(s => s.trim()).filter(Boolean);
    }
    if (!skills.length || !text.length) {
        return { atsScore: 0, verifiedSkills: [], missingSkills: skills, stuffingWarning: false,
                 actionableFeedback: [], flaggedManipulations: [], meta: {} };
    }

    // ── Tokenise resume ───────────────────────────────────────────
    const tokens      = tokenise(text);
    const charOffsets = buildCharOffsets(text, tokens);
    const sections    = buildSections(text);

    // ── Global metric count (for density feedback) ────────────────
    let globalMetricCount = 0;
    let metricMatch;
    const metricSearchRe = new RegExp(METRIC_RE.source, 'gi');
    while ((metricMatch = metricSearchRe.exec(text)) !== null) globalMetricCount++;

    // ── Per-skill analysis ────────────────────────────────────────
    const verifiedSkills     = [];
    const missingSkills      = [];
    const flaggedManipulations = [];
    let   totalScore         = 0;
    const MAX_PER_SKILL      = 1.0;

    for (const skill of skills) {
        const positions = findKeywordPositions(tokens, skill);

        if (!positions.length) {
            missingSkills.push(skill);
            continue;
        }

        let contextualHits = 0;
        let rawSkillScore  = 0;
        let bestVerb       = null;
        let bestMetric     = null;
        const sectionBag   = {};

        for (const pos of positions) {
            const charOff  = charOffsets[pos] ?? 0;
            const sec      = getMultiplier(sections, charOff);
            const ctx      = analyseContext(tokens, pos, text, charOffsets, PROXIMITY_WINDOW);

            // Base contribution (raw mention)
            let hit = 0.12 * sec.multiplier;

            // Proximity boosts
            if (ctx.hasVerb) {
                hit += 0.38 * sec.multiplier;
                contextualHits++;
                if (ctx.verb)   bestVerb   = ctx.verb;
            }
            if (ctx.hasMetric) {
                hit += 0.50 * sec.multiplier;
                if (!ctx.hasVerb) contextualHits++;
                if (ctx.metric) bestMetric = ctx.metric;
            }

            rawSkillScore += hit;
            sectionBag[sec.name] = (sectionBag[sec.name] || 0) + 1;
        }

        // Stuffing check
        const contextRatio = positions.length > 0 ? contextualHits / positions.length : 0;
        const isStuffed    = positions.length > STUFFING_THRESHOLD && contextRatio < STUFFING_CONTEXT_MIN;
        if (isStuffed) {
            rawSkillScore *= STUFFING_PENALTY;
            flaggedManipulations.push(
                `"${skill}" repeated ${positions.length}× but only ${Math.round(contextRatio * 100)}% contextual — ` +
                `score penalised by 75% (possible keyword dump or white-text injection)`
            );
        }

        const cappedScore  = Math.min(MAX_PER_SKILL, rawSkillScore);
        const topSection   = Object.keys(sectionBag).sort((a, b) => sectionBag[b] - sectionBag[a])[0] ?? 'Unknown';

        totalScore += cappedScore;
        verifiedSkills.push({
            skill,
            hits:          positions.length,
            contextualHits,
            contextRatio:  +(contextRatio * 100).toFixed(1),
            score:         +(cappedScore * 100).toFixed(1),
            bestVerb,
            bestMetric,
            topSection,
            stuffingFlag:  isStuffed,
        });
    }

    // ── Final ATS score ───────────────────────────────────────────
    const rawAts   = skills.length > 0 ? (totalScore / skills.length) * 100 : 0;
    const atsScore = Math.min(100, Math.max(0, Math.round(rawAts)));

    // ── Sort by score desc ────────────────────────────────────────
    verifiedSkills.sort((a, b) => b.score - a.score);

    // ── Generate actionable feedback ──────────────────────────────
    const actionableFeedback = generateFeedback(
        verifiedSkills, missingSkills, globalMetricCount, tokens.length
    );

    return {
        atsScore,
        verifiedSkills,
        missingSkills,
        stuffingWarning:     flaggedManipulations.length > 0,
        actionableFeedback,
        flaggedManipulations,
        meta: {
            resumeTokens:     tokens.length,
            globalMetrics:    globalMetricCount,
            metricDensity:    +((globalMetricCount / (tokens.length || 1)) * 100).toFixed(2) + '%',
            requiredSkills:   skills.length,
            matchedSkills:    verifiedSkills.length,
            sectionsDetected: sections.map(s => s.name),
        },
    };
}

module.exports = { AdvancedATSResumeScorer };
