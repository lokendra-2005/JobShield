'use strict';

/**
 * auditResumeArchitecture.js
 * Job Shield — Deep-Semantic Resume Auditor
 *
 * Three extreme heuristic layers:
 *   1. Tech-Stack Cohesion Matrix  — cluster skills, flag orphan claims
 *   2. S.T.A.R. Bullet Enforcer   — sentence-level triad detection
 *   3. Fluff Penalty Engine        — buzzword extraction + multiplicative penalty
 *
 * Scoring:
 *   Base score = 30 (assume mediocre candidate)
 *   +Additive bonuses  for cohesive stacks, STAR bullets, verified metrics
 *   ×Multiplicative penalties for fluff density, orphan stack claims, zero metrics
 *   Clamped to [0, 100] → logicCategory: Weak (<45) | Moderate (45-74) | Strong (≥75)
 */

// ══════════════════════════════════════════════════════════════════
// 1. TECH-STACK COHESION MATRIX
// ══════════════════════════════════════════════════════════════════

/**
 * Skill clusters. Each cluster has a canonical name, required "core" skills,
 * and optional "extended" skills that boost cohesion but are not mandatory.
 *
 * Logic:
 *  - If a candidate claims a role that implies cluster X, we verify presence of
 *    each sub-cluster (Frontend + Backend + DB for Full-Stack).
 *  - Missing sub-clusters → flagged as "Skill Orphan".
 */
const SKILL_CLUSTERS = {
    Frontend: {
        core:     [/\b(react|vue|angular|next\.?js|svelte|html5?|css3?|tailwind|sass|webpack|vite|typescript)\b/i],
        extended: [/\b(redux|zustand|framer.?motion|styled.?components|storybook|jest|vitest|cypress)\b/i],
    },
    Backend: {
        core:     [/\b(node\.?js|express|fastapi|django|flask|spring.?boot|rails|laravel|go.?lang|rust|nestjs|hapi)\b/i],
        extended: [/\b(rest.?api|graphql|grpc|websocket|microservice|serverless|lambda|redis|kafka|rabbitmq)\b/i],
    },
    Database: {
        core:     [/\b(mongodb|postgres|postgresql|mysql|sqlite|dynamo.?db|firestore|cassandra|redis|supabase|prisma|sequelize|mongoose)\b/i],
        extended: [/\b(sql|nosql|orm|migrations?|indexing|sharding|replication|query.?optimiz)\b/i],
    },
    Cloud: {
        core:     [/\b(aws|azure|gcp|heroku|vercel|netlify|digitalocean|cloudflare|firebase)\b/i],
        extended: [/\b(ec2|s3|lambda|ecs|eks|cloud.?formation|terraform|kubernetes|docker|ci.?cd|github.?actions|jenkins)\b/i],
    },
    'AI/ML': {
        core:     [/\b(pytorch|tensorflow|keras|scikit.?learn|pandas|numpy|transformers|hugging.?face|llm|openai)\b/i],
        extended: [/\b(mlops|model.?deploy|feature.?engineer|xgboost|lightgbm|rag|embedding|vector.?db|pinecone|faiss)\b/i],
    },
    Mobile: {
        core:     [/\b(react.?native|flutter|swift|kotlin|android|ios|expo|xcode)\b/i],
        extended: [/\b(firebase|push.?notif|app.?store|play.?store|fastlane|detox)\b/i],
    },
    'Data Engineering': {
        core:     [/\b(spark|hadoop|airflow|dbt|kafka|flink|hive|presto|snowflake|bigquery|redshift|etl|pipeline)\b/i],
        extended: [/\b(data.?lake|data.?warehouse|pyspark|databricks|glue|nifi|tableau|power.?bi|looker)\b/i],
    },
    DevSecOps: {
        core:     [/\b(kubernetes|docker|terraform|ansible|helm|prometheus|grafana|datadog|sentry|nginx|linux)\b/i],
        extended: [/\b(soc2|owasp|penetration|vault|secrets?.manager|iam|zero.?trust|waf|ddos)\b/i],
    },
};

/**
 * Role → required cluster map.
 * If a candidate's targetRole implies these clusters, all must be partially present.
 */
const ROLE_CLUSTER_MAP = {
    'full-stack':        ['Frontend', 'Backend', 'Database'],
    'fullstack':         ['Frontend', 'Backend', 'Database'],
    'full stack':        ['Frontend', 'Backend', 'Database'],
    'mern':              ['Frontend', 'Backend', 'Database'],
    'mean':              ['Frontend', 'Backend', 'Database'],
    'frontend':          ['Frontend'],
    'front-end':         ['Frontend'],
    'backend':           ['Backend', 'Database'],
    'back-end':          ['Backend', 'Database'],
    'data scientist':    ['AI/ML', 'Database'],
    'data engineer':     ['Data Engineering', 'Database', 'Cloud'],
    'ml engineer':       ['AI/ML', 'Cloud'],
    'devops':            ['DevSecOps', 'Cloud'],
    'sre':               ['DevSecOps', 'Cloud'],
    'mobile':            ['Mobile'],
    'ios developer':     ['Mobile'],
    'android developer': ['Mobile'],
    'cloud engineer':    ['Cloud', 'DevSecOps'],
};

/** Detect which clusters are present in text (has ≥1 core skill). */
function detectPresentClusters(text) {
    const present = {};
    for (const [cluster, { core, extended }] of Object.entries(SKILL_CLUSTERS)) {
        const coreHits = core.filter(re => re.test(text)).length;
        const extHits  = extended.filter(re => re.test(text)).length;
        if (coreHits > 0) {
            present[cluster] = { coreHits, extHits, depth: coreHits + extHits * 0.4 };
        }
    }
    return present;
}

/** Given targetRole string, return the required clusters (if known). */
function getRequiredClusters(targetRole) {
    const role = targetRole.toLowerCase().trim();
    for (const [key, clusters] of Object.entries(ROLE_CLUSTER_MAP)) {
        if (role.includes(key)) return { roleKey: key, required: clusters };
    }
    return null;
}

/** Build cohesion analysis: what's present, what's missing, depth score. */
function buildCohesionAnalysis(text, targetRole) {
    const present  = detectPresentClusters(text);
    const required = getRequiredClusters(targetRole);

    const presentNames  = Object.keys(present);
    const missingClusters = [];
    let   orphanPenalty   = 0;
    let   cohesionBonus   = 0;
    const cohesionStrengths = [];
    const orphanFlags       = [];

    if (required) {
        for (const req of required.required) {
            if (present[req]) {
                cohesionBonus += 5 + Math.min(5, present[req].depth);    // up to +10 per matched cluster
                cohesionStrengths.push(`${req} skills confirmed (${present[req].coreHits} core signals)`);
            } else {
                missingClusters.push(req);
                orphanPenalty += 12;
                orphanFlags.push(
                    `You claim ${required.roleKey} experience but ${req} skills are absent from your bullets — ` +
                    `this is a critical gap ATS systems flag immediately`
                );
            }
        }
    }

    // Bonus for voluntarily deep stacks (e.g., Cloud + DevSecOps both present)
    if (presentNames.length >= 4) cohesionBonus += 8;
    else if (presentNames.length >= 3) cohesionBonus += 4;

    return { present, missingClusters, orphanPenalty, cohesionBonus, cohesionStrengths, orphanFlags };
}

// ══════════════════════════════════════════════════════════════════
// 2. S.T.A.R. BULLET ENFORCER
// ══════════════════════════════════════════════════════════════════

/** Strong action verbs — past tense (resume convention). */
const ACTION_VERB_RE = /\b(architect(?:ed)?|engineer(?:ed)?|develop(?:ed)?|build|built|design(?:ed)?|deploy(?:ed)?|implement(?:ed)?|deliver(?:ed)?|optimis(?:ed)?|optimiz(?:ed)?|refactor(?:ed)?|automat(?:ed)?|creat(?:ed)?|launch(?:ed)?|lead|led|manag(?:ed)?|scal(?:ed)?|migrat(?:ed)?|integrat(?:ed)?|secur(?:ed)?|analys(?:ed)?|analyz(?:ed)?|reduc(?:ed)?|increas(?:ed)?|improv(?:ed)?|streamlin(?:ed)?|rewrite|rewrote|research(?:ed)?|train(?:ed)?|mentor(?:ed)?|replac(?:ed)?|coordinat(?:ed)?|establish(?:ed)?|transform(?:ed)?|accelerat(?:ed)?|own(?:ed)?|championed)\b/i;

/** Hard tech skill signals in a sentence. */
const TECH_SKILL_RE = /\b(react|node|python|java|go|rust|aws|gcp|azure|kubernetes|docker|postgres|mongodb|redis|kafka|spark|tensorflow|pytorch|typescript|graphql|next\.?js|flutter|swift|kotlin|django|fastapi|spring|rails|express|linux|terraform|ansible|nginx|jenkins|github\s+actions?|firebase|supabase|prisma|elasticsearch)\b/i;

/** Quantified result / metric patterns. */
const METRIC_RE = /(\d+\.?\d*\s*(%|x\b|×|times?\b|ms\b|sec\b|seconds?\b|minutes?\b|hours?\b|users?\b|customers?\b|req(?:uests?)?\b|rpm\b|rps\b|kb\b|mb\b|gb\b|tb\b|k\b|m\b|million\b|billion\b|\$[\d,.]+|uptime\b|f1\b|accuracy\b|latency\b|throughput\b|reduction[s]?\b|improvement[s]?\b|conversion\b|revenue\b|cost\b))/i;

/**
 * Split text into individual bullet-point / sentence candidates.
 * Handles • - * bullets, newlines, and periods.
 */
function extractBullets(text) {
    return text
        .split(/\n|•|–|—|\*\s+|-\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 20 && s.length < 800); // ignore headers/footers
}

/** Run STAR audit on all bullets. Returns { starBullets, weakBullets, score, strengths, suggestions }. */
function auditSTAR(text) {
    const bullets     = extractBullets(text);
    const starBullets = [];   // has all three — Action + Skill + Metric
    const weakBullets = [];   // missing one or more

    for (const bullet of bullets) {
        const hasVerb   = ACTION_VERB_RE.test(bullet);
        const hasTech   = TECH_SKILL_RE.test(bullet);
        const hasMetric = METRIC_RE.test(bullet);

        if (hasVerb && hasTech && hasMetric) {
            starBullets.push({ bullet: bullet.slice(0, 120), hasVerb, hasTech, hasMetric });
        } else if (hasVerb || hasTech) {
            // Partially STAR — captures what's missing
            weakBullets.push({
                bullet:   bullet.slice(0, 120),
                missing:  [!hasVerb && 'Action Verb', !hasTech && 'Tech Skill', !hasMetric && 'Metric'].filter(Boolean),
            });
        }
    }

    const total       = starBullets.length + weakBullets.length || 1;
    const starRatio   = starBullets.length / total;
    const starBonus   = Math.round(starRatio * 30);   // max +30 for perfect STAR rate

    const strengths    = [];
    const suggestions  = [];

    if (starBullets.length >= 3) {
        strengths.push(`${starBullets.length} bullet point${starBullets.length > 1 ? 's' : ''} satisfy the full S.T.A.R. triad (Action + Tech Skill + Metric) — strong signal for ATS and human reviewers`);
    }
    if (weakBullets.length > 0) {
        const sample = weakBullets[0];
        suggestions.push(
            `${weakBullets.length} bullet${weakBullets.length > 1 ? 's' : ''} lack: ${sample.missing.join(', ')}. ` +
            `Example — change "${sample.bullet.slice(0, 60)}..." ` +
            `to include a specific metric (e.g., "...reducing load time by 35% for 20k users")`
        );
    }
    if (starBullets.length === 0) {
        suggestions.push('Zero S.T.A.R. bullets detected. Every experience bullet must contain an Action Verb + Hard Tech Skill + Quantified Metric in the same sentence. This is the #1 ATS ranking factor.');
    }

    return { starBullets, weakBullets, starBonus, starRatio, strengths, suggestions };
}

// ══════════════════════════════════════════════════════════════════
// 3. FLUFF PENALTY ENGINE
// ══════════════════════════════════════════════════════════════════

/** Corporate buzzwords that signal vague, unsubstantiated claims. */
const FLUFF_TERMS = [
    /\b(synergy|synergies)\b/i,
    /\b(go[\s-]?getter)\b/i,
    /\b(out[\s-]?of[\s-]?the[\s-]?box\s+thinker)\b/i,
    /\b(results?[\s-]?driven)\b/i,
    /\b(highly\s+motivated)\b/i,
    /\b(passionate\s+about\s+(?:technology|tech|coding|software))\b/i,
    /\b(team\s+player)\b/i,
    /\b(self[\s-]?starter)\b/i,
    /\b(dynamic\s+(?:professional|individual|person))\b/i,
    /\b(strong\s+(?:communication|interpersonal|leadership)\s+skills?\s+(?:with|and)?)\b/i,
    /\b(detail[\s-]?oriented)\b/i,
    /\b(fast\s+learner)\b/i,
    /\b(think\s+outside\s+the\s+box)\b/i,
    /\b(value[\s-]?add(?:er)?)\b/i,
    /\b(proactive\s+(?:individual|person|approach))\b/i,
    /\b(excellent\s+(?:verbal|written)\s+communication)\b/i,
    /\b(multi[\s-]?tasker)\b/i,
    /\b(visionary)\b/i,
    /\b(next[\s-]?level\s+performance)\b/i,
    /\b(strategic\s+thinker)\b/i,
];

/** Extract all fluff hits and return penalty + list of flagged terms. */
function extractFluff(text) {
    const found = [];
    for (const re of FLUFF_TERMS) {
        const m = text.match(re);
        if (m) found.push(m[0].trim());
    }
    const uniqueFluff = [...new Set(found)];
    // Multiplicative penalty: each unique fluff term reduces score by 8%, max 40% total
    const multiplier  = Math.max(0.60, 1 - uniqueFluff.length * 0.08);
    return { uniqueFluff, multiplier };
}

// ══════════════════════════════════════════════════════════════════
// STRENGTH & SUGGESTION ASSEMBLER
// ══════════════════════════════════════════════════════════════════
function buildStrengths(cohesion, star, present, wordCount) {
    const all = [...cohesion.cohesionStrengths, ...star.strengths];

    if (Object.keys(present).length >= 3) {
        const clusterList = Object.keys(present).slice(0, 4).join(', ');
        all.push(`Demonstrated multi-domain tech breadth across: ${clusterList}`);
    }
    if (wordCount >= 350 && wordCount <= 700) {
        all.push('Resume length is within the optimal 350–700 word ATS range — avoids both under-description and padding');
    }
    if (star.starRatio >= 0.7) {
        all.push(`High S.T.A.R. completion rate (${Math.round(star.starRatio * 100)}%) — signals quantitative, impact-driven thinking`);
    }
    // Return top 5 most specific
    return all.filter(Boolean).slice(0, 5);
}

function buildSuggestions(cohesion, star, fluff) {
    const all = [...cohesion.orphanFlags, ...star.suggestions];

    if (fluff.uniqueFluff.length > 0) {
        all.push(
            `Fluff penalty triggered by: "${fluff.uniqueFluff.join('", "')}". ` +
            `Replace with achievement-backed language — every claim must be tied to a measurable outcome. ` +
            `Example: replace "highly motivated team player" with "Collaborated across 3 teams to ship X feature in Y weeks."`
        );
    }
    return all.filter(Boolean).slice(0, 3);
}

// ══════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════
/**
 * auditResumeArchitecture(resumeText, targetRole)
 *
 * @param {string} resumeText   Full plain-text resume
 * @param {string} targetRole   e.g. "Full-Stack Developer", "Data Scientist"
 * @returns {{
 *   finalScore: number,
 *   wordCount: number,
 *   logicCategory: 'Weak'|'Moderate'|'Strong',
 *   strengths: string[],
 *   topSuggestions: string[],
 *   flaggedAnomalies: string[],
 *   breakdown: object
 * }}
 */
function auditResumeArchitecture(resumeText = '', targetRole = 'Software Engineer') {
    // ── Defensive coercion ───────────────────────────────────────
    const text = typeof resumeText  === 'string' ? resumeText  : String(resumeText  ?? '');
    const role = typeof targetRole  === 'string' ? targetRole  : String(targetRole  ?? 'Software Engineer');

    if (!text.trim()) {
        return { finalScore: 0, wordCount: 0, logicCategory: 'Weak',
                 strengths: [], topSuggestions: ['Resume text is empty.'],
                 flaggedAnomalies: [], breakdown: {} };
    }

    const wordCount = (text.match(/\b\w+\b/g) || []).length;

    // ── 1. Cohesion Matrix ───────────────────────────────────────
    const cohesion = buildCohesionAnalysis(text, role);

    // ── 2. STAR Audit ────────────────────────────────────────────
    const star = auditSTAR(text);

    // ── 3. Fluff Penalty ─────────────────────────────────────────
    const fluff = extractFluff(text);

    // ── 4. Compose Score ─────────────────────────────────────────
    let score = 30;                               // base

    // Additive bonuses
    score += cohesion.cohesionBonus;              // up to +28 for deep, complete stack
    score += star.starBonus;                      // up to +30 for high STAR rate

    // Word count bonus (well-scoped resume)
    if (wordCount >= 300 && wordCount <= 750) score += 5;
    else if (wordCount < 150)                 score -= 8;

    // Subtractive penalties
    score -= cohesion.orphanPenalty;              // -12 per missing required cluster

    // Multiplicative fluff penalty applied last
    score = score * fluff.multiplier;

    // Clamp
    const finalScore    = Math.min(100, Math.max(0, Math.round(score)));
    const logicCategory = finalScore >= 75 ? 'Strong' : finalScore >= 45 ? 'Moderate' : 'Weak';

    // ── 5. flaggedAnomalies ───────────────────────────────────────
    const flaggedAnomalies = [
        ...cohesion.orphanFlags,
        ...fluff.uniqueFluff.map(f => `Fluff buzzword detected: "${f}"`),
        ...star.weakBullets.slice(0, 3).map(b => `Incomplete bullet (missing ${b.missing.join(' + ')}): "${b.bullet.slice(0, 80)}..."`),
    ];

    // ── 6. Strengths & Suggestions ───────────────────────────────
    const strengths      = buildStrengths(cohesion, star, cohesion.present, wordCount);
    const topSuggestions = buildSuggestions(cohesion, star, fluff);

    return {
        finalScore,
        wordCount,
        logicCategory,
        strengths,
        topSuggestions,
        flaggedAnomalies,
        breakdown: {
            cohesionBonus:   cohesion.cohesionBonus,
            orphanPenalty:   cohesion.orphanPenalty,
            starBonus:       star.starBonus,
            starBullets:     star.starBullets.length,
            weakBullets:     star.weakBullets.length,
            fluffMultiplier: +fluff.multiplier.toFixed(2),
            uniqueFluff:     fluff.uniqueFluff,
            clustersFound:   Object.keys(cohesion.present),
            missingClusters: cohesion.missingClusters,
        },
    };
}

module.exports = { auditResumeArchitecture };
