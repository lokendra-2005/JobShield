'use strict';

/**
 * contextualResumeScorer.js
 * Job Shield — Advanced ATS Context Engine
 *
 * Design principles:
 *  - Token-window analysis: a keyword scores only if found within N words of
 *    a contextual trigger (action verb OR metric), defeating keyword stuffing.
 *  - Keyword density penalty: frequency > threshold with low context → stuffing flag.
 *  - Sectional relevance: multiplier applied based on which resume section the
 *    keyword appears in (Experience/Projects beat Hobbies/Interests).
 *  - All scoring is additive with caps — no single factor can dominate.
 */

// ─── Constants ─────────────────────────────────────────────────────────────────
const PROXIMITY_WINDOW    = 5;   // token radius around a keyword to check for context
const STUFFING_FREQ_LIMIT = 12;  // occurrences above this with low context = penalty
const STUFFING_CONTEXT_RATIO = 0.25; // contextualHits / totalHits < 25% = stuffing

// ─── Action verb list ─────────────────────────────────────────────────────────
// Past tense preferred (resume convention) — present tense also included
const ACTION_VERBS = new Set([
    'architected','designed','built','developed','created','implemented','deployed',
    'optimised','optimized','reduced','increased','improved','automated','migrated',
    'refactored','scaled','integrated','maintained','delivered','shipped','launched',
    'led','managed','mentored','collaborated','researched','analysed','analyzed',
    'engineered','wrote','authored','published','presented','established','streamlined',
    'monitored','secured','tested','debugged','configured','administered','coordinated',
    'enhanced','modernised','modernized','overhauled','prototyped','evangelised',
]);

// ─── Metric / measurable result patterns ─────────────────────────────────────
// A metric near a keyword massively boosts confidence that it's genuine experience.
const METRIC_PATTERN = /(\d+\.?\d*\s*(%|x|times?|ms|seconds?|hours?|users?|requests?|rpm|rps|gb|mb|tb|k\b|m\b|million|billion|faster|slower|reduction|improvement))/i;

// ─── Section header patterns & their relevance multipliers ────────────────────
// The multiplier scales the contribution of a keyword hit in that section.
const SECTION_WEIGHTS = [
    { name: 'Experience',  multiplier: 1.5, re: /^(work\s+)?experience|employment\s+history|professional\s+background/im },
    { name: 'Projects',    multiplier: 1.4, re: /^(personal\s+|key\s+|notable\s+)?projects?(\s+&\s+achievements?)?/im },
    { name: 'Skills',      multiplier: 1.0, re: /^(technical\s+)?skills?(\s+&\s+competencies)?|core\s+competencies/im },
    { name: 'Education',   multiplier: 0.6, re: /^education|academic\s+background|qualifications?/im },
    { name: 'Certifications', multiplier: 0.8, re: /^certifications?|licenses?\s+&\s+certifications?/im },
    { name: 'Summary',     multiplier: 0.7, re: /^(professional\s+)?summary|objective|profile/im },
    { name: 'Hobbies',     multiplier: 0.2, re: /^(hobbies|interests|activities|personal\s+interests)/im },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Tokenise text into lowercase word-tokens. */
function tokenise(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9.#+\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

/**
 * Find all character offsets of `keyword` in `text`.
 * Returns array of { charOffset, tokenIndex } objects.
 * Uses word-boundary matching to avoid partial-word false positives.
 */
function findKeywordOffsets(tokens, keyword) {
    const kwTokens = tokenise(keyword);
    if (kwTokens.length === 0) return [];

    const hits = [];
    for (let i = 0; i <= tokens.length - kwTokens.length; i++) {
        let match = true;
        for (let j = 0; j < kwTokens.length; j++) {
            // Allow prefix match for compound skills (e.g. "react" matches "react.js")
            if (!tokens[i + j].startsWith(kwTokens[j])) { match = false; break; }
        }
        if (match) hits.push(i);
    }
    return hits;
}

/**
 * Check if any token in [index - window, index + window] is an action verb
 * or metric pattern.  Returns { hasVerb, hasMetric, verbFound, metricFound }.
 */
function checkProximityContext(tokens, centerIndex, window = PROXIMITY_WINDOW) {
    const start = Math.max(0, centerIndex - window);
    const end   = Math.min(tokens.length - 1, centerIndex + window);
    const slice = tokens.slice(start, end + 1);
    const sliceStr = slice.join(' ');

    const verbFound   = slice.find(t => ACTION_VERBS.has(t)) || null;
    const metricMatch = METRIC_PATTERN.exec(sliceStr);
    const metricFound = metricMatch ? metricMatch[0] : null;

    return {
        hasVerb:   Boolean(verbFound),
        hasMetric: Boolean(metricFound),
        verbFound,
        metricFound,
    };
}

/**
 * Segment the resume text by section headers.
 * Returns array of { name, multiplier, startChar, endChar }.
 */
function segmentResume(text) {
    const segments  = [];
    const lastMatch = { name: 'Preamble', multiplier: 0.5, startChar: 0, endChar: text.length };

    SECTION_WEIGHTS.forEach(sec => {
        let match;
        const re = new RegExp(sec.re.source, 'gim');
        while ((match = re.exec(text)) !== null) {
            segments.push({
                name:        sec.name,
                multiplier:  sec.multiplier,
                startChar:   match.index,
                endChar:     text.length, // will be trimmed below
            });
        }
    });

    // Sort by start position and trim endChar to the next segment's start
    segments.sort((a, b) => a.startChar - b.startChar);
    for (let i = 0; i < segments.length - 1; i++) {
        segments[i].endChar = segments[i + 1].startChar;
    }

    // If no sections found, treat whole document as 'Skills' level
    if (segments.length === 0) segments.push(lastMatch);

    return segments;
}

/** Get the section multiplier for a given character offset in text. */
function getSectionMultiplier(segments, charOffset) {
    for (let i = segments.length - 1; i >= 0; i--) {
        if (charOffset >= segments[i].startChar) return segments[i];
    }
    return { name: 'Preamble', multiplier: 0.5 };
}

/**
 * Rebuild approximate char offset from token index.
 * (Used for section matching — exact precision not required.)
 */
function tokenIndexToCharOffset(text, tokens, tokenIdx) {
    let charPos = 0;
    let tIdx    = 0;
    for (const char of text) {
        if (tIdx >= tokenIdx) return charPos;
        if (/\S/.test(char)) {
            // crude: advance token counter on whitespace→nonwhitespace boundary
        }
        charPos++;
    }
    return charPos;
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
/**
 * contextualResumeScorer(resumeText, requiredSkillsArray)
 *
 * @param {string}   resumeText          - Full plain-text content of the resume
 * @param {string[]} requiredSkillsArray - Skills the job requires (e.g. ['React', 'Node.js'])
 * @returns {{ atsMatch: number, verifiedSkills: [], missingSkills: [], stuffingWarning: boolean, breakdown: {} }}
 */
function contextualResumeScorer(resumeText = '', requiredSkillsArray = []) {
    // ── Defensive input coercion ───────────────────────────────────────────────
    const text   = typeof resumeText === 'string' ? resumeText : String(resumeText ?? '');
    const skills = Array.isArray(requiredSkillsArray)
        ? requiredSkillsArray.filter(s => typeof s === 'string' && s.trim().length > 0).map(s => s.trim())
        : [];

    if (skills.length === 0 || text.length === 0) {
        return { atsMatch: 0, verifiedSkills: [], missingSkills: skills, stuffingWarning: false, breakdown: {} };
    }

    const tokens   = tokenise(text);
    const segments = segmentResume(text);

    // Reconstruct per-token character offset map (approximate)
    // We do a single pass counting chars to assign each token a rough char offset
    const tokenCharOffsets = (() => {
        const offsets = [];
        let idx = 0;
        for (const tok of tokens) {
            const pos = text.indexOf(tok, idx);
            offsets.push(pos >= 0 ? pos : idx);
            idx = pos >= 0 ? pos + tok.length : idx + tok.length;
        }
        return offsets;
    })();

    const verifiedSkills = [];
    const missingSkills  = [];
    const breakdown      = {};
    let   stuffingFlag   = false;
    let   totalScore     = 0;
    const MAX_SCORE_PER_SKILL = 1.0; // normalised contribution per skill

    for (const skill of skills) {
        const hitIndices = findKeywordOffsets(tokens, skill);
        const totalHits  = hitIndices.length;

        if (totalHits === 0) {
            missingSkills.push(skill);
            breakdown[skill] = { found: false, hits: 0, contextualHits: 0, score: 0, stuffing: false, sectionMatches: [] };
            continue;
        }

        // Analyse each occurrence for context
        let contextualHits = 0;
        let skillScore     = 0;
        let bestVerb       = null;
        let bestMetric     = null;
        const sectionHits  = {};

        for (const tokenIdx of hitIndices) {
            const ctx      = checkProximityContext(tokens, tokenIdx, PROXIMITY_WINDOW);
            const charOff  = tokenCharOffsets[tokenIdx] ?? 0;
            const section  = getSectionMultiplier(segments, charOff);

            // Base score for a raw mention
            let hitScore = 0.15 * section.multiplier;

            // Context boosts
            if (ctx.hasVerb) {
                hitScore += 0.40 * section.multiplier;
                contextualHits++;
                if (ctx.verbFound) bestVerb = ctx.verbFound;
            }
            if (ctx.hasMetric) {
                hitScore += 0.45 * section.multiplier;
                if (ctx.metricFound) bestMetric = ctx.metricFound;
                if (!ctx.hasVerb) contextualHits++; // metric alone counts as contextual
            }

            skillScore += hitScore;

            // Track which sections the skill appears in
            sectionHits[section.name] = (sectionHits[section.name] || 0) + 1;
        }

        // Cap per-skill score to MAX_SCORE_PER_SKILL (extra hits don't inflate score)
        skillScore = Math.min(MAX_SCORE_PER_SKILL, skillScore);

        // Stuffing detection: many mentions but almost no context = penalty
        const contextRatio = totalHits > 0 ? contextualHits / totalHits : 0;
        const isStuffed    = totalHits > STUFFING_FREQ_LIMIT && contextRatio < STUFFING_CONTEXT_RATIO;
        if (isStuffed) {
            skillScore   *= 0.30; // heavy penalty for stuffed keyword
            stuffingFlag  = true;
        }

        totalScore += skillScore;

        verifiedSkills.push({
            skill,
            hits:         totalHits,
            contextualHits,
            contextRatio: +(contextRatio * 100).toFixed(1),
            score:        +(skillScore * 100).toFixed(1),
            bestVerb,
            bestMetric,
            topSection:   Object.keys(sectionHits).sort((a, b) => sectionHits[b] - sectionHits[a])[0] ?? 'Unknown',
            stuffingFlag: isStuffed,
        });

        breakdown[skill] = {
            found: true, hits: totalHits, contextualHits,
            score: +(skillScore * 100).toFixed(1),
            stuffing: isStuffed, sectionMatches: sectionHits,
        };
    }

    // ATS match % = sum of capped skill scores / number of required skills × 100
    const rawAts   = skills.length > 0 ? (totalScore / skills.length) * 100 : 0;
    const atsMatch = Math.min(100, Math.max(0, Math.round(rawAts)));

    // Sort verified skills by score descending for readability
    verifiedSkills.sort((a, b) => b.score - a.score);

    return {
        atsMatch,
        verifiedSkills,
        missingSkills,
        stuffingWarning: stuffingFlag,
        breakdown,
        meta: {
            resumeTokens:    tokens.length,
            requiredSkills:  skills.length,
            matchedSkills:   verifiedSkills.length,
            sectionsDetected: segments.map(s => s.name),
        },
    };
}

module.exports = { contextualResumeScorer };
