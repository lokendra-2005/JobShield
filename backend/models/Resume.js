const mongoose = require('mongoose');

// Kept analysisResult as a loose Object type instead of defining a strict schema
// because the shape of the analysis output changed 4 times during development
// and each schema change required a migration. Loose object is pragmatic here —
// the data is only ever read back for display, never queried by field.
const resumeSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        filename: {
            // The generated filename on disk (e.g. 1710234567890-123456789.pdf)
            type: String,
            required: true,
        },
        originalName: {
            // What the user's file was actually called — displayed in the history panel
            type: String,
            required: true,
        },
        mimetype: {
            type: String,
        },
        size: {
            type: Number, // bytes
        },
        riskScore: {
            // Null means "analyzed but no risk score was computed" (e.g. plain text resumes)
            // vs undefined which means "not analyzed yet". Keeping null as the explicit default.
            type: Number,
            default: null,
        },
        analysisResult: {
            type: Object,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Resume', resumeSchema);
