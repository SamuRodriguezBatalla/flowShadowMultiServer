const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, ChannelType } = require('discord.js');
const { resetServerData, loadGuildConfig, saveGuildConfig } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { sincronizarRegistros } = require('../utils/syncManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fullwipe')
        .setDescription('☢️ BORRADO TOTAL: Reinicia todo a CERO (Season 0).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try { await interaction.deferReply({ fetchReply: true }); } catch (e) { return; }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('confirm').setLabel('SÍ, REINICIAR A 0').setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ 
            embeds: [new EmbedBuilder().setTitle('☢️ FULL WIPE').setDescription('⚠️ Se eliminará la categoría de registros completa.\n⚠️ Se resetearán todos los usuarios.\n⚠️ Season 0.').setColor('DarkRed')],
            components: [row] 
        });

        const collector = interaction.channel.createMessageComponentCollector({ 
            filter: i => i.user.id === interaction.user.id, 
            time: 30000, max: 1 
        });

        collector.on('collect', async i => {
            if (i.customId === 'cancel') return i.update({ content: 'Cancelado.', embeds: [], components: [] });
            
            await i.update({ content: '☢️ **Ejecutando Demolición...**', embeds: [], components: [] });

            try {
                const guild = interaction.guild;
                
                // 1. RESET DB
                resetServerData(guild.id); 
                let config = loadGuildConfig(guild.id) || { roles: {}, channels: {}, categories: {} };
                config.season = 0;

                // 2. BORRAR CATEGORÍAS ENTERAS (Más rápido y limpio)
                const catsToDelete = [config.categories.private_registration, config.categories.tribes];
                
                for (const catId of catsToDelete) {
                    if (catId) {
                        const cat = guild.channels.cache.get(catId);
                        if (cat) {
                            console.log(`🗑️ Demoliendo categoría: ${cat.name}`);
                            // Esto borra la categoría y TODOS sus canales hijos automáticamente
                            await cat.delete('Full Wipe').catch(e => console.log(`Error borrando cat: ${e.message}`));
                        }
                    }
                }

                // 3. RECREAR CATEGORÍA PRIVADA (Posición 0)
                console.log(`🏗️ Reconstruyendo infraestructura...`);
                const newPrivateCat = await guild.channels.create({
                    name: '🔐 Rᴇɢɪsᴛʀᴏ-Pʀɪᴠᴀᴅᴏ',
                    type: ChannelType.GuildCategory,
                    position: 0, // ARRIBA DEL TODO
                    permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
                });
                
                // Guardar nuevo ID
                config.categories.private_registration = newPrivateCat.id;
                saveGuildConfig(guild.id, config);

                // 4. BORRAR ROLES ANTIGUOS
                const safeIDs = [config.roles.unverified, config.roles.survivor, config.roles.leader, guild.id, ...(config.roles.protected || [])];
                const roles = await guild.roles.fetch();
                for (const r of roles.values()) {
                    if (!safeIDs.includes(r.id) && !r.managed && !r.permissions.has('Administrator')) {
                        await r.delete().catch(()=>{});
                    }
                }

                await updateLog(guild, interaction.client);

                // 5. RESETEO DE MIEMBROS (Quitar todo, dar Unverified)
                const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
                const members = await guild.members.fetch().catch(() => guild.members.cache);
                
                if (unverifiedRole) {
                    for (const m of members.values()) {
                        if (!m.user.bot && !m.permissions.has('Administrator')) {
                            // .set() reemplaza todos los roles por el que le pasas
                            await m.roles.set([unverifiedRole]).catch(()=>{});
                        }
                    }
                }

                await interaction.editReply({ content: `✅ **Wipe Completado.**\nSeason 0 activa.\nInfraestructura reconstruida.`, components: [] });

                // 6. EL POLICÍA CREARÁ LOS CANALES EN LA NUEVA CATEGORÍA
                sincronizarRegistros(guild, config);

            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: `❌ Error: ${e.message}`, components: [] });
            }
        });
    }
};