const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, ChannelType } = require('discord.js');
const { resetServerData, loadGuildConfig, saveGuildConfig } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { sincronizarRegistros } = require('../utils/syncManager');

// Helper para borrar canales de una categoría (NUEVO)
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
        .setName('fullwipe')
        .setDescription('☢️ BORRADO TOTAL: Reinicia todo a CERO (Season 0).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try { await interaction.deferReply({ fetchReply: true }); } catch (e) { return; }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cancel_fullwipe').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('confirm_fullwipe').setLabel('SÍ, REINICIAR A 0').setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ 
            embeds: [new EmbedBuilder().setTitle('☢️ FULL WIPE').setDescription('⚠️ Se eliminarán todas las categorías de registros y tribus.\n⚠️ Se resetearán todos los usuarios.\n⚠️ Season 0.').setColor('DarkRed')],
            components: [row] 
        });

        const collector = interaction.channel.createMessageComponentCollector({ 
            filter: i => i.user.id === interaction.user.id, 
            time: 30000, max: 1 
        });

        collector.on('collect', async i => {
            if (i.customId === 'cancel_fullwipe') return i.update({ content: 'Full Wipe cancelado.', embeds: [], components: [] });
            
            await i.update({ content: '☢️ **Ejecutando Demolición...**', embeds: [], components: [] });

            try {
                const guild = interaction.guild;
                let config = loadGuildConfig(guild.id) || { roles: {}, channels: {}, categories: {} };
                
                // 1. ELIMINAR CATEGORÍAS Y SU CONTENIDO PRIMERO (CORRECCIÓN)
                await deleteChannelsInCategory(guild, config.categories.private_registration);
                await deleteChannelsInCategory(guild, config.categories.tribes);
                
                // 2. RESET DB
                resetServerData(guild.id); 
                config = loadGuildConfig(guild.id) || { roles: {}, channels: {}, categories: {} }; 
                config.season = 0;

                // 3. RECREAR CATEGORÍAS NUEVAS
                const newPrivateCat = await guild.channels.create({
                    name: '🔐 Rᴇgistrᴏ-Pʀiᴠᴀdᴏ',
                    type: ChannelType.GuildCategory,
                    position: 0,
                    permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
                });
                config.categories.private_registration = newPrivateCat.id;
                
                const newTribesCat = await guild.channels.create({ 
                    name: 'Tʀiʙuѕ', 
                    type: ChannelType.GuildCategory, 
                    position: 2 
                });
                config.categories.tribes = newTribesCat.id;
                
                // 4. REUBICAR/RECREAR CANAL DE LÍDERES
                let leaderGlobalRole = guild.roles.cache.get(config.roles.leader);
                
                if (leaderGlobalRole) {
                    const LEADER_CHAN_NAME = config.channels.leader_channel || '👑・Sᴀʟᴀ-ᴅᴇ-Lɪᴅᴇʀᴇs'; 
                    
                    const leaderChan = await guild.channels.create({
                        name: LEADER_CHAN_NAME,
                        type: ChannelType.GuildText,
                        parent: config.categories.tribes,
                        permissionOverwrites: [
                            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: leaderGlobalRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                        ]
                    }).catch(e => console.error("Error creando canal líderes:", e.message));
                    
                    if(leaderChan) config.channels.leader_channel = leaderChan.id; 
                }
                
                saveGuildConfig(guild.id, config);
                await updateLog(guild, interaction.client);

                // 5. BORRAR ROLES ANTIGUOS (No protegidos)
                const safeIDs = [config.roles.unverified, config.roles.survivor, config.roles.leader, guild.id, ...(config.roles.protected || [])];
                const roles = await guild.roles.fetch();
                for (const r of roles.values()) {
                    if (!safeIDs.includes(r.id) && !r.managed && !r.permissions.has('Administrator')) {
                        await r.delete().catch(()=>{});
                    }
                }

                // 6. RESETEO DE ROLES DE MIEMBROS (CORRECCIÓN GuildMembersTimeout)
                const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
                
                let membersToProcess = guild.members.cache; 
                try {
                    // Intentamos un fetch completo, pero con un timeout de 30s
                    const fetchedMembers = await guild.members.fetch({ time: 30000, force: true });
                    membersToProcess = fetchedMembers; 
                    console.log(`✅ Fetched ${membersToProcess.size} members for Full Wipe.`);
                } catch (e) {
                    console.warn(`⚠️ GuildMembersTimeout durante fetch en Full Wipe. Usando ${membersToProcess.size} miembros de caché.`);
                }
                
                if (unverifiedRole) {
                    for (const m of membersToProcess.values()) {
                        if (!m.user.bot && !m.permissions.has('Administrator')) {
                            await m.roles.set([unverifiedRole.id]).catch(e => console.error(`Error reseteando rol a ${m.user.tag}: ${e.message}`));
                            await new Promise(r => setTimeout(r, 100));
                        }
                    }
                }

                await interaction.editReply({ content: `✅ **Wipe Completado.**\nSeason 0 activa.\nUsuarios reseteados.`, components: [] });

                // 7. INICIAR REGISTROS
                await sincronizarRegistros(guild, config);

            } catch (e) {
                console.error("Error FATAL en Full Wipe:", e);
                await interaction.editReply({ content: `❌ Error grave durante el Wipe: ${e.message}`, components: [] });
            }
        });
    }
};