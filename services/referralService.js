const User = require('../models/User');
const Referral = require('../models/Referral');
const Channel = require('../models/Channel');
const logger = require('../utils/logger');
const { REFERRAL_COOLDOWN, REFERRAL_BONUS } = require('../config/constants');

class ReferralService {
    /**
     * Check if user is eligible for referral
     */
    async canRefer(userId) {
        const user = await User.findOne({ userId });
        if (!user) return { eligible: false, message: 'User not found' };

        // Check if user has used referral already
        if (user.usedReferral) {
            return { eligible: false, message: 'You have already used a referral code!' };
        }

        // Check cooldown
        if (user.lastReferralTime) {
            const timeDiff = (Date.now() - user.lastReferralTime) / 1000;
            if (timeDiff < REFERRAL_COOLDOWN) {
                const remaining = Math.ceil(REFERRAL_COOLDOWN - timeDiff);
                return { 
                    eligible: false, 
                    message: `Please wait ${remaining} second${remaining > 1 ? 's' : ''} between referrals!` 
                };
            }
        }

        return { eligible: true };
    }

    /**
     * Process referral
     */
    async processReferral(newUserId, referralCode) {
        try {
            // Find referrer by referral code
            const referrer = await User.findOne({ referralCode });
            if (!referrer) {
                return { success: false, message: 'Invalid referral code!' };
            }

            // Check if new user exists
            let newUser = await User.findOne({ userId: newUserId });
            if (!newUser) {
                return { success: false, message: 'User not found!' };
            }

            // Can't refer yourself
            if (referrer.userId === newUserId) {
                return { success: false, message: 'You cannot use your own referral code!' };
            }

            // Check if new user can refer
            const canRefer = await this.canRefer(newUserId);
            if (!canRefer.eligible) {
                return { success: false, message: canRefer.message };
            }

            // Check if referrer has joined required channels
            const channels = await Channel.find({ isActive: true });
            for (const channel of channels) {
                try {
                    // This would need bot instance - handled in command handler
                    // We'll check in the actual command
                } catch (error) {
                    logger.error('Channel check error:', error);
                }
            }

            // Process referral
            const referral = new Referral({
                referrerId: referrer.userId,
                refereeId: newUserId,
                referralCode: referralCode,
                bonusAmount: REFERRAL_BONUS
            });

            await referral.save();

            // Update referrer
            referrer.credits += REFERRAL_BONUS;
            await referrer.save();

            // Update new user
            newUser.credits += REFERRAL_BONUS;
            newUser.usedReferral = true;
            newUser.referredBy = referrer.userId;
            newUser.lastReferralTime = new Date();
            await newUser.save();

            logger.info(`✅ Referral successful: ${referrer.userId} -> ${newUserId}`);

            return {
                success: true,
                message: `🎉 Referral successful!\nBoth you and your friend got ${REFERRAL_BONUS} credits!`,
                referrer: referrer.userId,
                bonus: REFERRAL_BONUS
            };
        } catch (error) {
            logger.error('Referral processing error:', error);
            return { success: false, message: 'Error processing referral. Please try again.' };
        }
    }

    /**
     * Get referral stats
     */
    async getReferralStats(userId) {
        try {
            const user = await User.findOne({ userId });
            if (!user) return null;

            const totalReferrals = await Referral.countDocuments({ referrerId: userId });
            const totalBonus = await Referral.aggregate([
                { $match: { referrerId: userId, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$bonusAmount' } } }
            ]);

            const recentReferrals = await Referral.find({ referrerId: userId })
                .sort({ timestamp: -1 })
                .limit(5);

            return {
                totalReferrals,
                totalBonus: totalBonus.length > 0 ? totalBonus[0].total : 0,
                recentReferrals
            };
        } catch (error) {
            logger.error('Error getting referral stats:', error);
            return null;
        }
    }

    /**
     * Get top referrers
     */
    async getTopReferrers(limit = 5) {
        try {
            const topReferrers = await Referral.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: '$referrerId', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: limit }
            ]);

            const result = [];
            for (const ref of topReferrers) {
                const user = await User.findOne({ userId: ref._id });
                if (user) {
                    result.push({
                        userId: ref._id,
                        username: user.username || 'Unknown',
                        count: ref.count
                    });
                }
            }

            return result;
        } catch (error) {
            logger.error('Error getting top referrers:', error);
            return [];
        }
    }
}

module.exports = new ReferralService();
