const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, saveGuildConfig, archiveSeason } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('newseason')
        .setDescription('🚀 Inicia nueva season.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });
        const guild = interaction.guild;
        const config = loadGuildConfig(guild.id);
        const currentChannelId = interaction.channelId;

        if (!config) return interaction.editReply('❌ Ejecuta `/setup` primero.');

        const currentSeason = config.season || 0;
        const newSeason = currentSeason + 1;
        
        // 1. ARCHIVAR
        const currentTribes = loadTribes(guild.id);
        archiveSeason(guild.id, currentSeason, currentTribes);
        saveTribes(guild.id, {}); 
        config.season = newSeason;
        saveGuildConfig(guild.id, config);

        await interaction.editReply('🔥 Purgando roles y canales...');
        
        // 2. PURGA ROLES
        const safeIDs = [config.roles.unverified, config.roles.survivor, config.roles.leader, guild.id, ...(config.roles.protected || [])];
        guild.roles.cache.forEach(role => {
            if (!safeIDs.includes(role.id) && !role.managed && !role.permissions.has(PermissionFlagsBits.Administrator)) {
                role.delete('New Season Wipe').catch(() => {});
            }
        });

        // 3. PURGA CANALES REGISTRO (MEJORADO)
        const catsToClean = [config.categories.registration, config.categories.private_registration];
        const systemChannels = Object.values(config.channels);

        for (const catId of catsToClean) {
            if (!catId) continue;
            const cat = guild.channels.cache.get(catId);
            if (cat) {
                const channels = Array.from(cat.children.cache.values());
                for (const channel of channels) {
                    if (!systemChannels.includes(channel.id) && channel.id !== currentChannelId) {
                        await channel.delete('New Season Cleanup').catch(() => {});
                    }
                }
            }
        }

        await updateLog(guild, interaction.client);
        
        const welcomeChan = guild.channels.cache.get(config.channels.welcome);
        if (welcomeChan) welcomeChan.send({ embeds: [new EmbedBuilder().setTitle(`🚀 SEASON ${newSeason} INICIADA`).setDescription('Mapa reiniciado.').setColor('Green')] });

        await interaction.editReply(`✅ **Season ${newSeason} iniciada.**`).catch(() => {});
    },
};