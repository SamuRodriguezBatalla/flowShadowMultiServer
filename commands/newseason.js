const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, saveGuildConfig, archiveSeason } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { sincronizarRegistros } = require('../utils/syncManager'); 

// Helper para borrar canales de una categoría (MISMA FUNCIÓN DEL PASO ANTERIOR)
async function deleteChannelsInCategory(guild, categoryId) {
    if (!categoryId) return;
    const category = guild.channels.cache.get(categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) return;

    for (const [channelId, channel] of category.children.cache) {
        if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
            await channel.delete().catch(e => console.log(`Error borrando canal ${channel.name}: ${e.message}`));
        }
    }
    await category.delete().catch(e => console.log(`Error borrando categoría ${category.name}: ${e.message}`));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('newseason')
        .setDescription('🚀 Inicia nueva season.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try { await interaction.deferReply(); } catch (e) { return; }
        
        const guild = interaction.guild;
        let config = loadGuildConfig(guild.id);
        if (!config) return interaction.editReply('❌ Falta /setup.');

        try {
            const oldSeason = config.season || 0;
            const currentTribes = loadTribes(guild.id);
            
            // 1. ARCHIVAR
            archiveSeason(guild.id, oldSeason, currentTribes);
            saveTribes(guild.id, {}); 
            config.season = oldSeason + 1;
            
            await interaction.editReply(`🔥 **Cambiando a Season ${config.season}...**`);

            // 2. ELIMINAR CATEGORÍAS Y SU CONTENIDO (LIMPIEZA TOTAL)
            await deleteChannelsInCategory(guild, config.categories.private_registration);
            await deleteChannelsInCategory(guild, config.categories.tribes);

            // 3. RECREAR CATEGORÍAS
            const newPrivateCat = await guild.channels.create({
                name: '🔐 Rᴇɢɪsᴛʀᴏ-Pʀɪᴠᴀᴅᴏ', // CORRECCIÓN: 'Rᴇgistrᴏ' en lugar de 'Rᴇgistrᴏ'
                type: ChannelType.GuildCategory,
                position: 0,
                permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
            });
            
            const newTribesCat = await guild.channels.create({
                name: 'Tʀiʙuѕ',
                type: ChannelType.GuildCategory,
                position: 2,
            });

            config.categories.private_registration = newPrivateCat.id;
            config.categories.tribes = newTribesCat.id; 
            
            // 4. RECREACIÓN ROBUSTA DEL CANAL DE LÍDERES (ARREGLO DEL BUG DE NOMBRE)
            const leaderGlobalRole = guild.roles.cache.get(config.roles.leader);
            // CORRECCIÓN: Forzamos el nombre deseado.
            const LEADER_CHAN_NAME = '👑・sᴀʟᴀ-ᴅᴇ-lɪᴅᴇʀᴇs'; 
            
            if (leaderGlobalRole) {
                // RECREAR el canal con el nombre correcto y el nuevo Parent ID
                const leaderChan = await guild.channels.create({
                    name: LEADER_CHAN_NAME,
                    type: ChannelType.GuildText,
                    parent: config.categories.tribes, // Usar el ID de la nueva categoría
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: leaderGlobalRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                }).catch(e => console.error("Error creando canal líderes:", e.message));

                if(leaderChan) {
                    config.channels.leader_channel = leaderChan.id; // Guardar el nuevo ID VÁLIDO
                }
            }

            saveGuildConfig(guild.id, config);

            // 5. BORRAR ROLES Y RESETEAR MIEMBROS
            const safeIDs = [config.roles.unverified, config.roles.survivor, config.roles.leader, guild.id, ...(config.roles.protected || [])];
            const roles = await guild.roles.fetch();
            for (const r of roles.values()) {
                if (!safeIDs.includes(r.id) && !r.managed && !r.permissions.has(PermissionFlagsBits.Administrator)) {
                    await r.delete().catch(()=>{});
                }
            }

            let membersToProcess = guild.members.cache;
            try {
                membersToProcess = await guild.members.fetch({ time: 30000, force: true });
            } catch (e) {
                console.warn(`⚠️ GuildMembersTimeout durante fetch. Usando ${membersToProcess.size} miembros de caché.`);
            }

            const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
            if (unverifiedRole) {
                for (const m of membersToProcess.values()) {
                    if (!m.user.bot && !m.permissions.has(PermissionFlagsBits.Administrator)) {
                        await m.roles.set([unverifiedRole.id]).catch(e => console.error(`Error reseteando rol a ${m.user.tag}: ${e.message}`));
                        await new Promise(r => setTimeout(r, 100));
                    }
                }
            }
            
            await updateLog(guild, interaction.client);
            
            await interaction.editReply(`✅ **Season ${config.season} iniciada.**\nRegistros abiertos y servidor reseteado.`);
            
            // 6. INICIAR REGISTROS
            await sincronizarRegistros(guild, config);

        } catch (e) {
            console.error("Error FATAL en New Season:", e);
            await interaction.editReply(`❌ Error grave durante el cambio de Season: ${e.message}`);
        }
    }
};