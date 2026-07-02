const Channel = require('../models/Channel');
const logger = require('../utils/logger');

class ChannelService {
    /**
     * Add channel
     */
    async addChannel(channelId, channelName, addedBy) {
        try {
            // Clean channel ID
            if (!channelId.startsWith('@')) {
                channelId = '@' + channelId;
            }

            const existing = await Channel.findOne({ channelId });
            if (existing) {
                return { success: false, message: 'Channel already exists!' };
            }

            const channel = new Channel({
                channelId,
                channelName,
                addedBy
            });

            await channel.save();
            logger.info(`📺 Channel added: ${channelId} by ${addedBy}`);
            return { success: true, message: `✅ Channel ${channelId} added successfully!` };
        } catch (error) {
            logger.error('Error adding channel:', error);
            return { success: false, message: 'Error adding channel!' };
        }
    }

    /**
     * Remove channel
     */
    async removeChannel(channelId) {
        try {
            if (!channelId.startsWith('@')) {
                channelId = '@' + channelId;
            }

            const result = await Channel.findOneAndDelete({ channelId });
            if (!result) {
                return { success: false, message: 'Channel not found!' };
            }

            logger.info(`📺 Channel removed: ${channelId}`);
            return { success: true, message: `✅ Channel ${channelId} removed successfully!` };
        } catch (error) {
            logger.error('Error removing channel:', error);
            return { success: false, message: 'Error removing channel!' };
        }
    }

    /**
     * Get all channels
     */
    async getChannels() {
        try {
            return await Channel.find({ isActive: true });
        } catch (error) {
            logger.error('Error getting channels:', error);
            return [];
        }
    }

    /**
     * Check if user joined all channels
     */
    async checkUserChannels(bot, userId) {
        try {
            const channels = await this.getChannels();
            if (!channels || channels.length === 0) {
                return { joined: true, missingChannels: [] };
            }

            const missingChannels = [];
            for (const channel of channels) {
                try {
                    const member = await bot.getChatMember(channel.channelId, userId);
                    if (!['member', 'administrator', 'creator'].includes(member.status)) {
                        missingChannels.push(channel);
                    }
                } catch (error) {
                    // Channel might be private or bot not admin
                    missingChannels.push(channel);
                }
            }

            return {
                joined: missingChannels.length === 0,
                missingChannels
            };
        } catch (error) {
            logger.error('Error checking user channels:', error);
            return { joined: false, missingChannels: [] };
        }
    }

    /**
     * Get channel list message
     */
    getChannelListMessage(channels) {
        if (!channels || channels.length === 0) {
            return '📭 No channels configured.';
        }
        return channels.map(ch => `• ${ch.channelId}`).join('\n');
    }
}

module.exports = new ChannelService();
