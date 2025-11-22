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
            new ButtonBuilder().setCustomId('confirm').setLabel('SÍ, REINICIAR A SEASON 0').setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ 
            embeds: [new EmbedBuilder().setTitle('☢️ FULL WIPE DETECTED').setDescription('⚠️ **PELIGRO**\nSe borrarán todas las tribus y canales de registro.\n**La Season volverá a 0.**').setColor('DarkRed')],
            components: [row] 
        });

        const collector = interaction.channel.createMessageComponentCollector({ 
            filter: i => i.user.id === interaction.user.id && i.message.interaction.id === interaction.id,
            time: 30000, max: 1
        });

        collector.on('collect', async i => {
            if (i.customId === 'cancel') return i.update({ content: 'Cancelado.', embeds: [], components: [] });
            
            await i.update({ content: '☢️ **Ejecutando Barrido Universal...**', embeds: [], components: [] });

            try {
                const guild = interaction.guild;
                console.log(`\n=== ☢️ FULLWIPE SEASON 0 ===`);
                
                // 1. RESETEO DE DATOS
                resetServerData(guild.id); 
                let config = loadGuildConfig(guild.id) || { roles: {}, channels: {}, categories: {} };
                config.season = 0; // FORCE 0
                saveGuildConfig(guild.id, config);

                // 2. BORRAR ROLES (Menos protegidos)
                const safeIDs = [config.roles.unverified, config.roles.survivor, config.roles.leader, guild.id, ...(config.roles.protected || [])];
                const roles = await guild.roles.fetch();
                for (const r of roles.values()) {
                    if (!safeIDs.includes(r.id) && !r.managed && !r.permissions.has('Administrator')) await r.delete().catch(()=>{});
                }

                // ============================================================
                // 3. BORRADO DE CANALES (UNIVERSAL POR NOMBRE Y TOPIC)
                // ============================================================
                const allChannels = await guild.channels.fetch();
                const systemChannelIds = Object.values(config.channels || {});

                for (const channel of allChannels.values()) {
                    if (channel.type !== ChannelType.GuildText) continue;
                    if (channel.id === interaction.channelId) continue;
                    if (systemChannelIds.includes(channel.id)) continue;

                    let shouldDelete = false;
                    const name = channel.name.toLowerCase();

                    // A. Por Nombre (Registros viejos y nuevos)
                    if (name.includes('registro-')) shouldDelete = true;

                    // B. Por Topic (Etiqueta de sistema)
                    if (channel.topic && channel.topic.includes('SYSTEM:REGISTRO')) shouldDelete = true;

                    // C. Por Categoría de Tribus
                    if (config.categories.tribes && channel.parentId === config.categories.tribes) {
                        if (channel.id !== config.channels.leader_channel) shouldDelete = true;
                    }

                    if (shouldDelete) {
                        console.log(`🗑️ Eliminando: ${channel.name}`);
                        await channel.delete('Full Wipe').catch(e => console.log(`   ❌ Error: ${e.message}`));
                    }
                }
                // ============================================================

                await updateLog(guild, interaction.client);

                // 4. RESET MIEMBROS (SIN TIMEOUT)
                const ur = guild.roles.cache.get(config.roles.unverified);
                // Fetch seguro
                const members = await guild.members.fetch().catch(() => guild.members.cache);
                
                if (ur) {
                    for (const m of members.values()) {
                        if (!m.user.bot && !m.permissions.has('Administrator')) {
                            // Reset total: Setear solo Unverified borra los demás
                            await m.roles.set([ur]).catch(()=>{});
                        }
                    }
                }

                await interaction.editReply({ content: `✅ **Full Wipe Completado.**\n📉 Season actual: **0**.\n♻️ Regenerando registros...`, components: [] });

                // 5. CREAR CANALES NUEVOS
                sincronizarRegistros(guild, config);

            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: `❌ Error: ${e.message}`, components: [] });
            }
        });
    }
};