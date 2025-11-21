const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');
const { resetServerData, loadGuildConfig } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fullwipe')
        .setDescription('☢️ BORRADO TOTAL: Reinicia todo a CERO.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guild = interaction.guild;
        const currentChannelId = interaction.channelId; // Guardamos ID para protegerlo

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cancel_wipe').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('confirm_wipe').setLabel('SÍ, REINICIAR TODO').setStyle(ButtonStyle.Danger)
        );

        const warningEmbed = new EmbedBuilder()
            .setTitle('☢️ FULL WIPE DETECTED')
            .setDescription('Se borrarán tribus, historial y registros.')
            .setColor('DarkRed');

        // Usamos fetchReply para mantener la referencia
        const response = await interaction.reply({ embeds: [warningEmbed], components: [row], fetchReply: true });
        
        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: '❌', ephemeral: true });
            if (i.customId === 'cancel_wipe') return i.update({ content: '✅ Cancelado.', embeds: [], components: [] });

            if (i.customId === 'confirm_wipe') {
                try {
                    await i.update({ content: '☢️ **Ejecutando Full Wipe...** (Espere...)', embeds: [], components: [] });
                    
                    // 1. RESET DATOS
                    const newConfig = resetServerData(guild.id);
                    if (!newConfig) throw new Error("Error de configuración.");

                    const safeIDs = [
                        newConfig.roles.unverified, newConfig.roles.survivor, newConfig.roles.leader, 
                        guild.id, ...(newConfig.roles.protected || [])
                    ];
                    
                    // 2. RESET ROLES
                    const roles = Array.from(guild.roles.cache.values());
                    for (const role of roles) {
                        if (!safeIDs.includes(role.id) && !role.managed && !role.permissions.has(PermissionFlagsBits.Administrator)) {
                            await role.delete('Full Wipe').catch(() => {});
                        }
                    }

                    // 3. RESET CANALES TRIBUS
                    const tribeCat = guild.channels.cache.get(newConfig.categories.tribes);
                    if (tribeCat) {
                        for (const c of tribeCat.children.cache.values()) {
                            if (c.id !== newConfig.channels.leader_channel && c.id !== currentChannelId) {
                                await c.delete('Full Wipe').catch(() => {});
                            }
                        }
                    }

                    // 4. RESET CANALES REGISTRO
                    const catsToClean = [newConfig.categories.registration, newConfig.categories.private_registration];
                    for (const catId of catsToClean) {
                        if (!catId) continue;
                        const cat = guild.channels.cache.get(catId);
                        if (cat) {
                            for (const channel of cat.children.cache.values()) {
                                const systemChannels = Object.values(newConfig.channels);
                                // PROTECCIÓN: No borrar canales de sistema NI el canal actual
                                if (!systemChannels.includes(channel.id) && channel.id !== currentChannelId) {
                                    await channel.delete('Full Wipe Registry').catch(() => {});
                                }
                            }
                        }
                    }

                    await updateLog(guild, interaction.client);
                    
                    // Anuncio en Bienvenida (Más seguro)
                    const welcomeChan = guild.channels.cache.get(newConfig.channels.welcome);
                    if (welcomeChan) {
                        await welcomeChan.send({ 
                            embeds: [new EmbedBuilder().setTitle('🌍 MUNDO REINICIADO').setDescription('Season 0 iniciada.').setColor('Red')] 
                        }).catch(() => {});
                    }

                    // 5. CONFIRMACIÓN FINAL SEGURA
                    // Intentamos responder en el canal. Si falla (porque se borró), mandamos DM. Si falla, no hacemos nada.
                    try {
                        await interaction.followUp({ content: `✅ **Full Wipe Completado.**`, ephemeral: true });
                    } catch (e) {
                        // Si el canal murió, intentamos avisar al Admin por privado
                        await interaction.user.send(`✅ **Full Wipe Completado** en ${guild.name}. (El canal donde estabas fue eliminado)`).catch(()=>{});
                    }

                } catch (error) {
                    console.error("Error FullWipe:", error);
                    // Intento desesperado de reportar error
                    try { 
                        await interaction.followUp({ content: `❌ Error crítico: ${error.message}`, ephemeral: true }); 
                    } catch (e) {
                        console.log("No se pudo enviar el reporte de error al usuario.");
                    }
                }
            }
        });
    },
};