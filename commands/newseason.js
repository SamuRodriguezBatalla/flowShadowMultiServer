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
            const oldSeason = config.season || 0;
            const currentTribes = loadTribes(guild.id);
            
            // 1. ARCHIVAR
            archiveSeason(guild.id, oldSeason, currentTribes);
            saveTribes(guild.id, {}); 
            config.season = oldSeason + 1;
            
            await interaction.editReply(`🔥 **Cambiando a Season ${config.season}...**`);

            // 2. DEMOLICIÓN DE CATEGORÍAS (Privada y Tribus)
            const catsToDelete = [config.categories.private_registration, config.categories.tribes];
            for (const catId of catsToDelete) {
                if (catId) {
                    const cat = guild.channels.cache.get(catId);
                    if (cat) await cat.delete('New Season').catch(()=>{});
                }
            }

            // 3. RECREAR CATEGORÍA PRIVADA (Posición 0)
            const newPrivateCat = await guild.channels.create({
                name: '🔐 Rᴇɢɪsᴛʀᴏ-Pʀɪᴠᴀᴅᴏ',
                type: ChannelType.GuildCategory,
                position: 0,
                permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
            });
            config.categories.private_registration = newPrivateCat.id;
            saveGuildConfig(guild.id, config); // Guardar cambios

            // 4. BORRAR ROLES
            const safeIDs = [config.roles.unverified, config.roles.survivor, config.roles.leader, guild.id, ...(config.roles.protected || [])];
            const roles = await guild.roles.fetch();
            for (const r of roles.values()) {
                if (!safeIDs.includes(r.id) && !r.managed && !r.permissions.has('Administrator')) {
                    await r.delete().catch(()=>{});
                }
            }

            // 5. RESET MIEMBROS
            const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
            const members = await guild.members.fetch().catch(() => guild.members.cache);

            if (unverifiedRole) {
                for (const m of members.values()) {
                    if (!m.user.bot && !m.permissions.has('Administrator')) {
                        await m.roles.set([unverifiedRole]).catch(()=>{});
                    }
                }
            }

            await updateLog(guild, interaction.client);
            
            await interaction.editReply(`✅ **Season ${config.season} iniciada.**\nCategoría de registros limpia y renovada.`);
            
            const welcomeChan = guild.channels.cache.get(config.channels.welcome);
            if (welcomeChan) {
                welcomeChan.send({ embeds: [new EmbedBuilder()
                    .setTitle(`🚀 SEASON ${config.season} INICIADA`)
                    .setDescription(`Mapa reiniciado. ¡Registros abiertos!`)
                    .setColor('Green')
                ]}).catch(()=>{});
            }

            // 6. CREAR CANALES
            sincronizarRegistros(guild, config);

        } catch (e) {
            console.error(e);
            await interaction.editReply(`❌ Error: ${e.message}`);
        }
    }
};