

import bcrypt from 'bcrypt';
import knex from 'knex';
import knexConfig from '../../../knexfile.js';
const db = knex(knexConfig.development);
const SALT_ROUNDS = 10;

class OTPGenerator {
    static async generateOTP(userId, length = 6, validityInSeconds = 30) {
        const buffer = require('crypto').randomBytes(Math.ceil(length / 2));
        const otp = buffer.toString('hex').slice(0, length);
        const hashedOtp = await bcrypt.hash(otp, SALT_ROUNDS);
        const expiresAt = new Date(Date.now() + validityInSeconds * 1000);

        try {
            await db('otps').where({ user_id: userId }).del
            await db('otps').insert({
                user_id: userId,
                otp_hash: hashedOtp,
                expires_at: expiresAt,
            });

            console.log(`Successfully stored hashed OTP for user: ${userId}`);
            return otp;
        } catch (error) {
            console.error('Error storing OTP in the database:', error);
            throw error;
        }
    }

    static async verifyOTP(userId, userOTP) {
        try {
            const storedOtpData = await db('otps').where({ user_id: userId }).first();
            if (!storedOtpData) {
                console.error(`Verification failed: No OTP found for user ${userId}.`);
                return false;
            }

            const now = new Date();
            const expiresAt = new Date(storedOtpData.expires_at);
            if (now > expiresAt) {
                console.error(`Verification failed: OTP for user ${userId} has expired.`);
                await db('otps').where({ user_id: userId }).del();
                return false;
            }
            const isMatch = await bcrypt.compare(userOTP, storedOtpData.otp_hash);
            await db('otps').where({ user_id: userId }).del();

            if (isMatch) {
                console.log(`Verification successful for user ${userId}.`);
            } else {
                console.error(`Verification failed: Mismatch for user ${userId}.`);
            }

            return isMatch;
        } catch (error) {
            console.error('Error verifying OTP from the database:', error);
            throw error;
        }
    }
}


export default new OTPGenerator()
