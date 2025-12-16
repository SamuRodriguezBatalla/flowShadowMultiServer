const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { sendRconCommand } = require('../utils/rconManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('arkrestart')
        .setDescription('🔄 Reinicio Seguro (Guarda mundo y detiene el servidor).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // 1. Botón de confirmación para evitar accidentes
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_restart').setLabel('🔴 SÍ, REINICIAR AHORA').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_restart').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );

        const msg = await interaction.reply({ 
            content: '⚠️ **¿Estás seguro?**\nEsto ejecutará `SaveWorld` y luego `DoExit`.\nSi tu host tiene auto-reinicio, el servidor volverá en unos minutos.',
            components: [row],
            fetchReply: true
        });

        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 15000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'No puedes usar esto.', ephemeral: true });

            if (i.customId === 'cancel_restart') {
                await i.update({ content: '✅ Reinicio cancelado.', components: [] });
                return;
            }

            if (i.customId === 'confirm_restart') {
                await i.update({ content: '🔄 **Iniciando protocolo de reinicio...**', components: [] });

                // Paso 1: Guardar
                await interaction.followUp('💾 Ejecutando `SaveWorld`...');
                await sendRconCommand(interaction.guild.id, 'SaveWorld');

                // Paso 2: Esperar 3 segundos para asegurar guardado
                await new Promise(r => setTimeout(r, 3000));

                // Paso 3: Apagar
                const result = await sendRconCommand(interaction.guild.id, 'DoExit');

                if (result.success) {
                    await interaction.followUp('🛑 `DoExit` enviado. El servidor se está deteniendo/reiniciando.');
                } else {
                    await interaction.followUp(`❌ Error al enviar DoExit: ${result.message}`);
                }
            }
        });
    },
};
