const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, saveGuildConfig, archiveSeason } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { sincronizarRegistros } = require('../utils/syncManager'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('newseason')
        .setDescription('🚀 Inicia nueva season.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try { await interaction.deferReply(); } catch (e) { return; }
        
        const guild = interaction.guild;
        const config = loadGuildConfig(guild.id);
        if (!config) return interaction.editReply('❌ Falta /setup.');

        try {
            console.log(`\n=== 🚀 NEW SEASON ===`);
            const oldSeason = config.season || 0;
            const currentTribes = loadTribes(guild.id);
            
            // 1. ARCHIVAR
            archiveSeason(guild.id, oldSeason, currentTribes);
            saveTribes(guild.id, {}); 
            config.season = oldSeason + 1;
            saveGuildConfig(guild.id, config);

            await interaction.editReply(`🔥 **Limpiando mapa para Season ${config.season}...**`);
            
            // 2. BORRAR ROLES
            const safeIDs = [config.roles.unverified, config.roles.survivor, config.roles.leader, guild.id, ...(config.roles.protected || [])];
            const roles = await guild.roles.fetch();
            for (const r of roles.values()) {
                if (!safeIDs.includes(r.id) && !r.managed && !r.permissions.has(PermissionFlagsBits.Administrator)) {
                    await r.delete('New Season Wipe').catch(() => {});
                }
            }

            // ============================================================
            // 3. BORRADO DE CANALES (UNIVERSAL)
            // ============================================================
            const allChannels = await guild.channels.fetch();
            const systemChannelIds = Object.values(config.channels);

            for (const channel of allChannels.values()) {
                if (channel.type !== ChannelType.GuildText) continue;
                if (channel.id === interaction.channelId) continue;
                if (systemChannelIds.includes(channel.id)) continue;

                let shouldDelete = false;
                const name = channel.name.toLowerCase();

                // A. Nombre contiene registro-
                if (name.includes('registro-')) shouldDelete = true;

                // B. Topic contiene SYSTEM:REGISTRO
                if (channel.topic && channel.topic.includes('SYSTEM:REGISTRO')) shouldDelete = true;

                // C. Categoría de Tribus
                if (config.categories.tribes && channel.parentId === config.categories.tribes) {
                    if (channel.id !== config.channels.leader_channel) shouldDelete = true;
                }

                if (shouldDelete) {
                    console.log(`🗑️ Eliminando: ${channel.name}`);
                    await channel.delete('New Season').catch(()=>{});
                }
            }
            // ============================================================

            // 4. RESET MIEMBROS
            const ur = guild.roles.cache.get(config.roles.unverified);
            const members = await guild.members.fetch().catch(() => guild.members.cache);

            if (ur) {
                for (const m of members.values()) {
                    if (!m.user.bot && !m.permissions.has('Administrator')) await m.roles.set([ur]).catch(()=>{});
                }
            }

            await updateLog(guild, interaction.client);
            
            await interaction.editReply(`✅ **Season ${oldSeason} archivada.**\n✅ **Season ${config.season} iniciada.**`);
            
            // Mensaje público de Season Nueva
            const welcomeChan = guild.channels.cache.get(config.channels.welcome);
            if (welcomeChan) {
                welcomeChan.send({ embeds: [new EmbedBuilder()
                    .setTitle(`🚀 SEASON ${config.season} INICIADA`)
                    .setDescription(`Mapa reiniciado. ¡Registros abiertos!`)
                    .setColor('Green')
                ]}).catch(()=>{});
            }

            // 5. CREAR NUEVOS CANALES
            sincronizarRegistros(guild, config);

        } catch (e) {
            console.error(e);
            await interaction.editReply(`❌ Error: ${e.message}`);
        }
    }
};