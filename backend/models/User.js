const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: [true, 'Username is required'],
            trim: true,
            minlength: [3, 'Username must be at least 3 characters'],
            unique: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            lowercase: true,
            trim: true,
            unique: true,
            match: [/^\S+@\S+\.\S+$/, 'Email format looks invalid'],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters'],
        },
    },
    { timestamps: true }
);

// Using 12 salt rounds — 10 is widely recommended but on a small VPS
// the extra 2 rounds add ~80ms per hash which is acceptable for a login flow.
// Don't go lower than 10 or the hashes become trivially brute-force-able.
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const saltRounds = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Using toJSON() override instead of calling .select('-password') on every query
// because I kept forgetting to add the select() in new routes and leaking hashes.
// One override here is safer than remembering it in 4+ places.
userSchema.methods.toJSON = function () {
    const rawUserObj = this.toObject();
    delete rawUserObj.password;
    return rawUserObj;
};

module.exports = mongoose.model('User', userSchema);
