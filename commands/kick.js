const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendRconCommand } = require('../utils/rconManager');
const { logAdminAction } = require('../utils/adminLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('👢 Expulsa a un jugador del servidor (RCON).')
        .addStringOption(o => o.setName('id_ark').setDescription('ID de Ark (SteamID/EOS)').setRequired(true))
        .addStringOption(o => o.setName('razon').setDescription('Motivo').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async execute(interaction) {
        await interaction.deferReply();
        const arkId = interaction.options.getString('id_ark');
        const reason = interaction.options.getString('razon');

        const result = await sendRconCommand(interaction.guild.id, `KickPlayer "${arkId}"`);

        if (result.success) {
            await interaction.editReply(`👢 **Jugador expulsado.**\nID: ${arkId}\nRazón: ${reason}`);
            await logAdminAction(interaction.guild, interaction.user, 'kick', `ID: ${arkId}\nRazón: ${reason}`);
        } else {
            await interaction.editReply(`❌ Error RCON: ${result.message}`);
        }
    },
};
