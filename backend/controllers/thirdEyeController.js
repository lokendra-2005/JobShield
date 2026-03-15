'use strict';

/**
 * thirdEyeController.js
 * Express controller for THE THIRD EYE endpoint.
 * POST /api/third-eye   { "input": "hr@suspiciousco.com" }
 * GET  /api/third-eye?input=hr@suspiciousco.com
 */

const { analyzeThirdEye } = require('../services/thirdEye');

async function thirdEyeController(req, res) {
    // Accept both GET (query param) and POST (JSON body)
    const input = (req.body?.input ?? req.query?.input ?? '').toString().trim();

    if (!input) {
        return res.status(400).json({
            module:            'THE THIRD EYE',
            error:             'Missing input. Provide an email address or domain via POST body { "input": "..." } or GET ?input=...',
            actionRecommended: 'RETRY',
        });
    }

    try {
        const result = await analyzeThirdEye(input);
        // Map riskLevel to HTTP status for easy frontend handling
        const httpStatus = result.riskLevel === 'CRITICAL' ? 200   // always 200 — client decides what to do
                         : result.riskLevel === 'ELEVATED' ? 200
                         : 200;
        return res.status(httpStatus).json(result);
    } catch (err) {
        // Final safety net — the service itself should never throw, but just in case
        console.error('[ThirdEye] Unexpected error:', err.message);
        return res.status(200).json({
            module:            'THE THIRD EYE',
            target:            input,
            creationDate:      null,
            domainAgeDays:     null,
            riskLevel:         'UNKNOWN',
            verdict:           'Internal analysis error — server safe, result inconclusive.',
            actionRecommended: 'MANUAL_REVIEW',
            analyzedAt:        new Date().toISOString().slice(0, 10),
            error:             err.message,
        });
    }
}

module.exports = { thirdEyeController };
