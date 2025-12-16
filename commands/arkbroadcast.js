const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendRconCommand } = require('../utils/rconManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('arkbroadcast')
        .setDescription('📢 Envía un mensaje global a todos los jugadores en Ark.')
        .addStringOption(o => o.setName('mensaje').setDescription('El texto a mostrar en pantalla').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();
        const msg = interaction.options.getString('mensaje');

        // El comando de Ark es "Broadcast <mensaje>"
        const result = await sendRconCommand(interaction.guild.id, `Broadcast ${msg}`);

        if (result.success) {
            await interaction.editReply(`📢 **Mensaje enviado al servidor:**\n"${msg}"`);
        } else {
            await interaction.editReply(`❌ **Error:** ${result.message}`);
        }
    },
};
